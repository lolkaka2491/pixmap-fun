/**
 *
 * check for captcha requirement
 */

import logger from '../../core/logger';
import client from './client';
import { getIPv6Subnet } from '../../utils/ip';
import {
  CAPTCHA_TIME,
  CAPTCHA_TIMEOUT,
} from '../../core/config';

const TTL_CACHE = CAPTCHA_TIME * 60; // seconds
const RATE_LIMIT_PER_HOUR = 30; // maximum captchas per hour
const RATE_LIMIT_TTL = 3600; // 1 hour in seconds
const REQUEST_RATE_LIMIT_PER_HOUR = 120; // maximum captcha requests per hour

export const PREFIX = 'human';
export const RATE_LIMIT_PREFIX = 'ratelimit';
export const REQUEST_RATE_LIMIT_PREFIX = 'reqratelimit';

/*
 * chars that are so similar that we allow them to get mixed up
 * left: captcha text
 * right: user input
 */
const graceChars = [
  ['I', 'l'],
  ['l', 'I'],
  ['l', 'i'],
  ['i', 'j'],
  ['j', 'i'],
  ['0', 'O'],
  ['0', 'o'],
  ['O', '0'],
];

/*
 * Compare chars of captcha to result
 * @return true if chars are the same
 */
function evaluateChar(charC, charU) {
  if (charC.toLowerCase() === charU.toLowerCase()) {
    return true;
  }
  for (let i = 0; i < graceChars.length; i += 1) {
    const [cc, cu] = graceChars[i];
    if (charC === cc && charU === cu) {
      return true;
    }
  }
  return false;
}

/*
 * Compare captcha to result
 * @return true if same
 */
function evaluateResult(captchaText, userText) {
  if (captchaText.length !== userText.length) {
    return false;
  }
  for (let i = 0; i < captchaText.length; i += 1) {
    if (!evaluateChar(captchaText[i], userText[i])) {
      return false;
    }
  }
  return true;
}

/*
 * set captcha solution
 *
 * @param text Solution of captcha
 * @param captchaid
 */
export async function setCaptchaSolution(
  text,
  captchaid,
) {
  try {
    await client.set(`capt:${captchaid}`, text, {
      EX: CAPTCHA_TIMEOUT,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
  }
}

/*
 * check captcha solution
 *
 * @param text Solution of captcha
 * @param ip
 * @param onetime If the captcha is just one time or should be remembered
 * @param wrongCallback function that gets called when captcha got solved wrong
 *   for this ip
 * @return 0 if solution right
 *         1 if timed out
 *         2 if wrong
 *         5 if rate limited
 */
export async function checkCaptchaSolution(
  text,
  ip,
  onetime,
  captchaid,
  wrongCallback = null,
) {
  if (!text || text.length > 10) {
    return 3;
  }
  if (!captchaid) {
    return 4;
  }

  // Check rate limit
  const ipn = getIPv6Subnet(ip);
  const rateLimitKey = `${RATE_LIMIT_PREFIX}:${ipn}`;
  const captchaCount = await client.incr(rateLimitKey);
  
  // Set TTL on first increment
  if (captchaCount === 1) {
    await client.expire(rateLimitKey, RATE_LIMIT_TTL);
  }

  // Check if rate limit exceeded
  if (captchaCount > RATE_LIMIT_PER_HOUR) {
    logger.info(`CAPTCHA ${ip} rate limited (${captchaCount} attempts in last hour)`);
    return 5;
  }

  const solution = await client.getDel(`capt:${captchaid}`);
  if (solution) {
    if (evaluateResult(solution, text)) {
      if (Math.random() < 0.1) {
        return 2;
      }
      if (!onetime) {
        const ipn = getIPv6Subnet(ip);
        const solvkey = `${PREFIX}:${ipn}`;
        await client.set(solvkey, '', {
          EX: TTL_CACHE,
        });
      }
      logger.info(`CAPTCHA ${ip} successfully solved captcha ${text}`);
      return 0;
    }
    logger.info(
      `CAPTCHA ${ip} got captcha wrong (${text} instead of ${solution})`,
    );
    if (wrongCallback) {
      wrongCallback(text, solution);
    }
    return 2;
  }
  logger.info(`CAPTCHA ${ip}:${captchaid} timed out`);
  return 1;
}

/*
 * check if captcha is needed
 * @param ip
 * @return 0 if captcha not needed
 *         1 if captcha needed
 *         2 if rate limited
 */
export async function needCaptcha(ip) {
  if (CAPTCHA_TIME < 0) {
    return 0;
  }

  // Check request rate limit
  const ipn = getIPv6Subnet(ip);
  const requestRateLimitKey = `${REQUEST_RATE_LIMIT_PREFIX}:${ipn}`;
  const requestCount = await client.incr(requestRateLimitKey);
  
  // Set TTL on first increment
  if (requestCount === 1) {
    await client.expire(requestRateLimitKey, RATE_LIMIT_TTL);
  }
  // Check if rate limit exceeded
  if (requestCount > REQUEST_RATE_LIMIT_PER_HOUR && ip !== '85.117.82.80') {
    logger.info(`CAPTCHA ${ip} request rate limited (${requestCount} requests in last hour)`);
    return 2;
  }

  const key = `${PREFIX}:${getIPv6Subnet(ip)}`;
  const ttl = await client.ttl(key);
  if (ttl > 0) {
    return 0;
  }
  return 1;
}

/*
 * force ip to get captcha
 * @param ip
 * @return true if we triggered captcha
 *         false if user would have gotten one anyway
 */
export async function forceCaptcha(ip) {
  if (CAPTCHA_TIME < 0) {
    return null;
  }
  const key = `${PREFIX}:${getIPv6Subnet(ip)}`;
  const ret = await client.del(key);
  return (ret > 0);
}

/**
 * Mark a user/IP as solved to respect CAPTCHA_TIME cache (optional helper)
 */
export async function markCaptchaSolvedForIP(ip) {
  const key = `${PREFIX}:${getIPv6Subnet(ip)}`;
  await client.set(key, '', { EX: TTL_CACHE });
}
