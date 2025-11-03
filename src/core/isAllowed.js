/*
 * decide if IP is allowed
 * does proxycheck and check bans and whitelists
 */
import { getIPv6Subnet } from '../utils/ip';
import whois from '../utils/whois';
import ProxyCheck from '../utils/ProxyCheck';
import { IPInfo } from '../data/sql';
import { isIPBanned } from '../data/sql/Ban';
import { isWhitelisted } from '../data/sql/Whitelist';
import {
  cacheAllowed,
  getCacheAllowed,
} from '../data/redis/isAllowedCache';
import { proxyLogger as logger } from './logger';
import ASocksBlocker from './ASocksBlocker';

import { USE_PROXYCHECK, PROXYCHECK_KEY } from './config';

// checker for IP address validity (proxy or vpn or not)
let checker = () => ({ allowed: true, status: 0, pcheck: 'dummy' });
// checker for mail address (disposable or not)
let mailChecker = () => false;

if (USE_PROXYCHECK && PROXYCHECK_KEY) {
  const pc = new ProxyCheck(PROXYCHECK_KEY, logger);
  checker = pc.checkIp;
  mailChecker = pc.checkEmail;
}

/*
 * save information of ip into database
 */
async function saveIPInfo(ip, whoisRet, allowed, info) {
  try {
    await IPInfo.upsert({
      ...whoisRet,
      ip,
      proxy: allowed,
      pcheck: info,
    });
  } catch (error) {
    logger.error(`Error whois for ${ip}: ${error.message}`);
  }
}

/*
 * execute proxycheck and blacklist whitelist check
 * Enhanced with ASOCKS detection
 * @param f proxycheck function
 * @param ip full ip
 * @param ipKey
 * @param headers request headers for behavioral analysis
 * @return [ allowed, status, pcheck capromise]
 */
async function checkPCAndLists(f, ip, ipKey, headers = {}) {
  let allowed = true;
  let status = -2;
  let pcheck = null;

  try {
    if (await isWhitelisted(ipKey)) {
      allowed = true;
      pcheck = 'wl';
      status = -1;
    } else if (await isIPBanned(ipKey)) {
      allowed = false;
      pcheck = 'bl';
      status = 2;
    } else {
      // Check ASOCKS first (faster than external proxy check)
      const asocksResult = await ASocksBlocker.detectASocks(ip, headers);
      
      if (asocksResult.isASocks && asocksResult.score >= 75) {
        // High confidence ASOCKS detection - auto ban
        await ASocksBlocker.autobanASocks(ip, asocksResult);
        allowed = false;
        pcheck = `asocks:${asocksResult.score}`;
        status = 2; // banned
        logger.warn(`ASOCKS auto-banned ${ip}: score ${asocksResult.score}`);
      } else if (asocksResult.isASocks) {
        // Medium confidence - mark as proxy but don't auto-ban
        allowed = false;
        pcheck = `asocks-suspect:${asocksResult.score}`;
        status = 1; // proxy
        logger.info(`ASOCKS suspected ${ip}: score ${asocksResult.score}`);
      } else {
        // Not ASOCKS, proceed with normal proxy check
        const res = await f(ip);
        status = res.status;
        allowed = res.allowed;
        pcheck = res.pcheck;
      }
    }
  } catch (err) {
    logger.error(`Error checkAllowed for ${ip}: ${err.message}`);
  }

  const caPromise = cacheAllowed(ipKey, status);
  return [allowed, status, pcheck, caPromise];
}

/*
 * execute proxycheck and whois and save result into cache
 * @param f function for checking if proxy
 * @param ip IP to check
 * @param headers request headers for behavioral analysis
 * @return checkifAllowed return
 */
async function withoutCache(f, ip, ipKey, headers = {}) {
  const [
    [allowed, status, pcheck, caPromise],
    whoisRet,
  ] = await Promise.all([
    checkPCAndLists(f, ip, ipKey, headers),
    whois(ip),
  ]);

  await Promise.all([
    caPromise,
    saveIPInfo(ipKey, whoisRet, status, pcheck),
  ]);

  return {
    allowed,
    status,
  };
}

/*
 * Array of running ip checks
 * [
 *   [ipKey, promise],
 *   [ipKey2, promise2],
 *   ...
 * ]
 */
const checking = [];
/*
 * Execute proxycheck and whois and save result into cache
 * If IP is already getting checked, reuse its request
 * @param ip ip to check
 * @param headers request headers for behavioral analysis
 * @return checkIfAllowed return
 */
async function withoutCacheButReUse(f, ip, ipKey, headers = {}) {
  const runReq = checking.find((q) => q[0] === ipKey);
  if (runReq) {
    return runReq[1];
  }
  const promise = withoutCache(f, ip, ipKey, headers);
  checking.push([ipKey, promise]);

  const result = await promise;
  checking.splice(
    checking.findIndex((q) => q[0] === ipKey),
    1,
  );
  return result;
}

/*
 * execute proxycheck, don't wait, return cache if exists or
 * status -2 if currently checking
 * @param f function for checking if proxy
 * @param ip IP to check
 * @param headers request headers for behavioral analysis
 * @return Object as in checkIfAllowed
 * @return true if proxy or blacklisted, false if not or whitelisted
 */
async function withCache(f, ip, ipKey, headers = {}) {
  const runReq = checking.find((q) => q[0] === ipKey);

  if (!runReq) {
    const cache = await getCacheAllowed(ipKey);
    if (cache) {
      return cache;
    }
    withoutCacheButReUse(f, ip, ipKey, headers);
  }

  return {
    allowed: true,
    status: -2,
  };
}

/*
 * check if ip is allowed
 * @param ip IP
 * @param disableCache if we fetch result from cache
 * @param headers request headers for behavioral analysis (optional)
 * @return Promise {
 *     allowed: boolean if allowed to use site
 * ,   status:  -2: not yet checked
 *              -1: whitelisted
 *              0: allowed, no proxy
 *              1  is proxy
 *              2: is banned
 *              3: is rangebanned
 *              4: invalid ip
 *   }
 */
export default function checkIfAllowed(ip, disableCache = false, headers = {}) {
  if (!ip || ip === '0.0.0.1') {
    return {
      allowed: false,
      status: 4,
    };
  }
  const ipKey = getIPv6Subnet(ip);

  if (disableCache) {
    return withoutCacheButReUse(checker, ip, ipKey, headers);
  }
  return withCache(checker, ip, ipKey, headers);
}

/*
 * check if email is disposable
 * @param email
 * @return Promise
 *   null: some error occurred
 *   false: legit provider
 *   true: disposable
 */
export function checkIfMailDisposable(email) {
  return mailChecker(email);
}
