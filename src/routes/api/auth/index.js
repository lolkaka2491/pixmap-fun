import express from 'express';

import logger from '../../../core/logger';
import { getHostFromRequest } from '../../../utils/ip';
import passport from '../../../core/passport';
import { authRateLimit, registrationRateLimit, passwordRateLimit, sensitiveOperationRateLimit } from '../../../middleware/rateLimitMiddleware';

import register from './register';
import verify from './verify';
import logout from './logout';
// eslint-disable-next-line camelcase
import resend_verify from './resend_verify';
// eslint-disable-next-line camelcase
import change_passwd from './change_passwd';
// eslint-disable-next-line camelcase
import delete_account from './delete_account';
// eslint-disable-next-line camelcase
import change_name from './change_name';
// eslint-disable-next-line camelcase
import change_mail from './change_mail';
// eslint-disable-next-line camelcase
import restore_password from './restore_password';

import getHtml from '../../../ssr/RedirectionPage';

import getMe from '../../../core/me';

const router = express.Router();

/*
 * third party logon
 */

router.get('/facebook', passport.authenticate('facebook',
  { scope: ['email'] }));
router.get('/facebook/return', passport.authenticate('facebook', {
  successRedirect: '/',
}));

router.get('/discord', passport.authenticate('discord',
  { scope: ['identify', 'email'] }));
router.get('/discord/return', passport.authenticate('discord', {
  successRedirect: '/',
}));

router.get('/google', passport.authenticate('google',
  { scope: ['email', 'profile'] }));
router.get('/google/return', passport.authenticate('google', {
  successRedirect: '/',
}));

router.get('/vk', passport.authenticate('vkontakte',
  { scope: ['email'] }));
router.get('/vk/return', passport.authenticate('vkontakte', {
  successRedirect: '/',
}));

router.get('/reddit', passport.authenticate('reddit',
  { duration: 'temporary', state: 'foo' }));
router.get('/reddit/return', passport.authenticate('reddit', {
  successRedirect: '/',
}));

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  const host = getHostFromRequest(req);
  logger.info(`Authentication error: ${err.message}`);
  const index = getHtml(
    'OAuth Authentication',
    err.message, host, req.lang,
  );
  res.status(400).send(index);
});

router.get('/verify', verify);

/*
 * JSON APIs
 */

router.get('/logout', logout);

router.get('/resend_verify', passwordRateLimit, resend_verify);

// Apply rate limits to sensitive endpoints
router.post('/change_passwd', passwordRateLimit, change_passwd);

router.post('/change_name', sensitiveOperationRateLimit, change_name);

router.post('/change_mail', sensitiveOperationRateLimit, change_mail);

router.post('/delete_account', sensitiveOperationRateLimit, delete_account);

router.post('/restore_password', passwordRateLimit, restore_password);

router.post('/register', registrationRateLimit, register);

// Apply strict auth rate limit to login endpoint
router.post('/local', authRateLimit, (req, res, next) => {
  passport.authenticate('json', { session: false }, (err, user, info) => {
    if (err) {
      console.error('Passport encountered an error:', err);
      return res.status(500).json({
        success: false,
        message: 'Internal authentication error',
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: info?.message || 'Authentication failed',
      });
    }

    req.logIn(user, { session: true }, async (loginErr) => {
      if (loginErr) {
        console.error('req.logIn error:', loginErr);
        return res.status(500).json({
          success: false,
          message: 'Failed to establish session',
        });
      }

      try {
        // During immediate login, do not include canvases; client will fetch /api/me with token
        const me = await getMe(user, req.lang || 'en', { includeCanvases: false });
        logger.info(`User ${user.id} logged in with email/password and session initialized.`);
        return res.json({
          success: true,
          me,
        });
      } catch (profileErr) {
        console.error('Error fetching user profile:', profileErr);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch user data after login',
        });
      }
    });
  })(req, res, next);
});

export default router;
