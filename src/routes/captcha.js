/*
 * route providing captcha
 */
import logger from '../core/logger';
import requestCaptcha from '../core/captchaserver';
import { getIPFromRequest } from '../utils/ip';
import { setCaptchaSolution, needCaptcha } from '../data/redis/captcha';
import { USE_CFCAPTCHA } from '../core/config';

export default async (req, res) => {
  res.set({
    'Access-Control-Expose-Headers': 'captcha-id',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });

  if (USE_CFCAPTCHA) {
    // When Cloudflare captcha is enabled, this route is unused by clients
    res.status(503);
    res.send('<html><body><h1>Captcha disabled</h1>Cloudflare Turnstile is enabled</body></html>');
    return;
  }

  const ip = getIPFromRequest(req);
  const captchaStatus = await needCaptcha(ip);

  if (captchaStatus === 2) {
    res.status(429);
    res.json({
      error: 'You have been temporarily banned from requesting captchas',
    });
    return;
  }

  requestCaptcha((err, text, data, id) => {
    if (res.writableEnded) {
      throw new Error('ENOR');
    }

    if (err) {
      res.status(503);
      res.send(
        // eslint-disable-next-line max-len
        '<html><body><h1>Captchaserver: 503 Server Error</h1>Captchas are accessible via *.png paths</body></html>',
      );
      return;
    }

    const ip = getIPFromRequest(req);
    setCaptchaSolution(text, id);
    logger.info(`Captchas: ${ip} got captcha with text: ${text}`);

    res.set({
      'Content-Type': 'image/png',
      'Captcha-Id': id,
    });
    res.end(data);
  });
};
