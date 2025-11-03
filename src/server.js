/*
 * Entrypoint for main server script
 */

import url from 'url';
import compression from 'compression';
import express from 'express';
import http from 'http';
import path from 'path';

import forceGC from './core/forceGC';
import logger from './core/logger';
import rankings from './core/Ranks';
import sequelize from './data/sql/sequelize';
import { connect as connectRedis } from './data/redis/client';
import routes from './routes';
import chatProvider from './core/ChatProvider';
import rpgEvent from './core/RpgEvent';
import canvasCleaner from './core/CanvasCleaner';
import userRoutes from './routes/user';
import idbaninfo from './routes/api/idbaninfo';
import { generalRateLimit } from './middleware/rateLimitMiddleware';

import socketEvents from './socket/socketEvents';
import SocketServer from './socket/SocketServer';
import APISocketServer from './socket/APISocketServer';

import {
  PORT, HOST, HOURLY_EVENT,
} from './core/config';
import { SECOND } from './core/constants';

import startAllCanvasLoops from './core/tileserver';
import { Announcement } from './data/sql';

const app = express();
app.disable('x-powered-by');

// Trust proxy - needed for rate limiting behind reverse proxy (nginx)
app.set('trust proxy', true);

// Call Garbage Collector every 30 seconds
setInterval(forceGC, 10 * 60 * SECOND);

// create http server
const server = http.createServer(app);

//
// websockets
// -----------------------------------------------------------------------------
const usersocket = new SocketServer();
const apisocket = new APISocketServer();

export { usersocket };

async function wsupgrade(request, socket, head) {
  const { pathname } = url.parse(request.url);
  try {
    if (pathname === '/ws') {
      await usersocket.handleUpgrade(request, socket, head);
    } else if (pathname === '/mcws') {
      apisocket.handleUpgrade(request, socket, head);
    } else {
      socket.write('HTTP/1.1 404 Not found\r\n\r\n');
      socket.destroy();
    }
  } catch (err) {
    logger.error(`WebSocket upgrade error: ${err.message}`);
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    socket.destroy();
  }
}
server.on('upgrade', wsupgrade);

/*
 * use gzip compression for following calls
 * level from -1 (default, 6) to 0 (no) from 1 (fastest) to 9 (best)
 *
 * Set custom filter to make sure that .bmp files get compressed
 */
app.use(compression({
  level: 3,
  filter: (req, res) => {
    if (res.getHeader('Content-Type') === 'application/octet-stream') {
      return true;
    }
    return compression.filter(req, res);
  },
}));

// Apply general rate limiting to all requests
app.use(generalRateLimit);

// Serve static assets (CSS, JS, source maps, etc.)
app.use('/assets', express.static(path.join(process.cwd(), 'dist/assets'), {
  maxAge: 12 * 60 * 60 * 1000, // 12 hours
}));

// Serve faction flags as static files
app.use('/factions', express.static(path.join(process.cwd(), 'public', 'factions'), {
  maxAge: 12 * 60 * 60 * 1000, // 12 hours
}));

// Serve public avatars
app.use('/public/avatars', express.static(path.join(process.cwd(), 'dist/avatars'), {
  maxAge: 12 * 60 * 60 * 1000, // 12 hours
}));

// Serve public rule images for rule tab
app.use('/public/rule-images', express.static(path.join(process.cwd(), 'dist/rule-images'), {
  maxAge: 12 * 60 * 60 * 1000, // 12 hours
}));

// Mount specific API routes before the main routes to prevent 404 handler from catching them
app.use('/api/user', userRoutes);

// Mount main routes (includes 404 handler at the end)
app.use(routes);

//
// ip config
// -----------------------------------------------------------------------------
// connect to redis
connectRedis()
  .then(async () => {
    // Sync all database models - only create missing tables, never modify existing ones
    await sequelize.sync({ alter: false });
    
    chatProvider.initialize();
    startAllCanvasLoops();
    usersocket.initialize();
    apisocket.initialize();
    canvasCleaner.initialize();
    // start http server
    const startServer = () => {
      server.listen(PORT, HOST, () => {
        console.log(`Factions server listening on ${HOST}:${PORT}`);
      });
    };
    startServer();
    // catch errors of server
    server.on('error', (e) => {
      logger.error(
        `HTTP Server Error ${e.code} occurred, trying again in 5s...`,
      );
      setTimeout(() => {
        server.close();
        startServer();
      }, 5000);
    });
  })
  .then(async () => {
    await socketEvents.initialize();
  })
  .then(async () => {
    /*
     * initializers that rely on the cluster being fully established
     * i.e. to know if it is the shard that runs the event
     */
    if (socketEvents.isCluster && socketEvents.amIImportant()) {
      logger.info('I am the main shard');
    }
    await rankings.initialize();
    if (HOURLY_EVENT) {
      rpgEvent.initialize();
    }
  })
  .then(async () => {
    await Announcement.sync();
  });
