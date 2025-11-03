/*
 * set CORS Headers
 */
import { CORS_HOSTS } from '../core/config';
import logger from '../core/logger';

export default (req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }
  const host = origin.slice(origin.indexOf('//') + 2);

  let isAllowed = false;
  if (CORS_HOSTS && CORS_HOSTS.length) {
    /*
     * Allow exact host matches and subdomains of configured hosts.
     * Example entries:
     *  - ".pixmap.fun"  => allows pixmap.fun and any *.pixmap.fun
     *  - "pixmap.fun"   => allows pixmap.fun and any *.pixmap.fun
     */
    isAllowed = CORS_HOSTS.some((c) => {
      if (!c) return false;
      if (c.startsWith('.')) return host === c.slice(1) || host.endsWith(c);
      return host === c || host.endsWith(`.${c}`);
    });
  } else if (req.headers.host) {
    // Fallback: allow same base domain (eTLD+1 heuristic) as server host
    const srvHost = req.headers.host.split(':')[0];
    const srvParts = srvHost.split('.');
    if (srvParts.length >= 2) {
      const base = srvParts.slice(-2).join('.');
      isAllowed = host === base || host.endsWith(`.${base}`);
    }
  }

  if (!isAllowed) {
    next();
    return;
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Canvas-Token',
    Vary: 'Origin',
  };

  res.set(corsHeaders);

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
};
