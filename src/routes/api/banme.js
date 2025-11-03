/*
 * report that user should be banned
 */

import logger from '../../core/logger';
import { banIP } from '../../data/sql/Ban';
import { getIPv6Subnet, getIPFromRequest } from '../../utils/ip';

async function banme(req, res) {
  const { code } = req.body;

  const ip = getIPFromRequest(req);
  // eslint-disable-next-line max-len
  logger.info(`AUTOBAN ${code} - ${ip} of user ${req.user.id} with ua "${req.headers['user-agent']}"`);

  let reason = 'AUTOBAN';
  let expires = 0;
  if (code === 1) {
    reason = 'Userscript Bot';
    expires = Date.now() + 1000 * 3600 * 24 * 14;
  /*
   * ignore it for now to collect data manually
   *
  } else if (code === 2) {
    const ua = req.headers['user-agent'];
    if (ua && (ua.includes('Android') || ua.includes('iPhone'))) {
      res.json({
        status: 'nope',
      });
      return;
    }
    reason = 'Captcha Solving Script';
    expires = Date.now() + 1000 * 3600 * 24 * 3;
  */
  } else if (code === 3) {
    reason = 'You were detected for using Dolphin, Tuxler or a malicious script on your device, Remove any automated scripts you might be using to place pixels and contact administrators.';
    expires = Date.now() + 1000 * 3600 * 24 * 14;
  } else if (code === 4) {
    reason = 'Stop using malware bots';
    expires = Date.now() + 1000 * 3600 * 24 * 7; // 1 week ban
  } else if (code === 2024) {
    reason = 'Your IP was detected as a VPN or proxy. Please open a ticket if you think we are wrong.';
    expires = Date.now() + 1000 * 3600 * 24 * 365 * 10;
  } else {
    res.json({
      status: 'nope',
    });
    return;
  }
  await banIP(
    getIPv6Subnet(ip),
    reason,
    expires,
    1,
  );
  res.json({
    status: 'ok',
  });
}

export default banme;
