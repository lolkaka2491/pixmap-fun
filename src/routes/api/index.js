import express from 'express';

import session from '../../core/session';
import passport from '../../core/passport';
import logger from '../../core/logger';
import User from '../../data/User';
import { getIPFromRequest } from '../../utils/ip';
import { Faction } from '../../data/sql/index.js';
import { Op } from 'sequelize';
import { apiRateLimit, sensitiveOperationRateLimit } from '../../middleware/rateLimitMiddleware';

import me from './me';
import auth from './auth';
import chatHistory from './chathistory';
import startDm from './startdm';
import leaveChan from './leavechan';
import block from './block';
import blockdm from './blockdm';
import privatize from './privatize';
import modtools from './modtools';
import baninfo from './baninfo';
import idbaninfo from './idbaninfo';
import getiid from './getiid';
import shards from './shards';
import banme from './banme';
import getData from './data';
import {
  createFaction,
  joinFaction,
  leaveFaction,
  updateFaction,
  deleteFaction,
  kickMember,
  getFactions,
  transferOwnership,
  updateWelcomeTemplate,
  updateTheme,
} from './faction';
import announcement from './announcement';
import { getRankings } from './faction';

const router = express.Router();

// API Rate limiting - applied to all API routes
router.use(apiRateLimit);

// CORS handling
router.use((req, res, next) => {
  const origin = req.headers.origin;
  const reqHeaders = req.headers['access-control-request-headers'];
  
  res.set({
    'Access-Control-Allow-Origin': origin || 'https://pixmap.fun',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': reqHeaders || 'Content-Type, Authorization, X-Requested-With, X-Canvas-Token',
    'Vary': 'Origin'
  });

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// set cache-control
router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Expires: '0',
  });
  next();
});

router.use(express.json());

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  logger.warn(`Got invalid json from ${req.trueIp} on ${req.originalUrl}`);
  res.status(400).json({
    errors: [{ msg: 'Invalid Request' }],
  });
});

// routes that don't need a user
router.get('/baninfo', baninfo);
router.get('/getiid', getiid);
router.get('/shards', shards);

/*
 * get user session
 */
router.use(session);

/*
 * at this point we could use the session id to get
 * stuff without having to verify the whole user,
 * which would avoid SQL requests and it got used previously
 * when we set pixels via api/pixel (new removed)
*/

/*
 * passport authenticate
 * and deserialize
 * (makes that sql request to map req.user.regUser)
 * After this point it is assumes that user.regUser is set if user.id is too
 */
router.use(passport.initialize());
router.use(passport.session());

/*
 * modtools
 * (does not json bodies, but urlencoded)
 */
router.use('/modtools', modtools);

/*
 * create dummy user with just ip if not
 * logged in
 */
router.use(async (req, res, next) => {
  if (!req.user) {
    req.user = new User();
    await req.user.initialize(null, getIPFromRequest(req));
  }
  next();
});

// Apply rate limits to sensitive user operations
router.post('/startdm', sensitiveOperationRateLimit, startDm);

router.post('/leavechan', sensitiveOperationRateLimit, leaveChan);

router.post('/block', sensitiveOperationRateLimit, block);

router.post('/blockdm', sensitiveOperationRateLimit, blockdm);

router.post('/privatize', sensitiveOperationRateLimit, privatize);

router.get('/chathistory', chatHistory);

router.get('/me', me);

router.post('/banme', sensitiveOperationRateLimit, banme);

router.use('/auth', auth);

router.get('/data', getData);

router.get('/idbaninfo', idbaninfo);

// Faction routes
router.post('/faction/create', createFaction);
router.post('/faction/join', joinFaction);
router.post('/faction/leave', leaveFaction);
router.post('/faction/update', updateFaction);
router.post('/faction/delete', deleteFaction);
router.post('/faction/kick', kickMember);
router.get('/faction/list', getFactions);
router.post('/faction/transfer', transferOwnership);
router.post('/faction/welcome/update', updateWelcomeTemplate);
router.post('/faction/theme/update', updateTheme);
router.get('/faction/rankings', getRankings);

// Brush key validation endpoint
router.post('/validate-brush-key', (req, res) => {
  const { key } = req.body;
  if (typeof key === 'string' && key === process.env.SECRET_BRUSH_KEY) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// Add proper error handling middleware
router.use((err, req, res, next) => {
  logger.error(`API Error: ${err.message}`);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

router.use('/announcement', announcement);

export default router;
