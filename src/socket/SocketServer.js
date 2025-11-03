/*
 * main websocket server
 */
import WebSocket from 'ws';

import logger from '../core/logger';
import canvases from '../core/canvases';
// import MassRateLimiter from '../utils/MassRateLimiter';
import Counter from '../utils/Counter';
import { getIPFromRequest, getHostFromRequest, getIPv6Subnet } from '../utils/ip';
import {
  REG_CANVAS_OP,
  PIXEL_UPDATE_OP,
  REG_CHUNK_OP,
  REG_MCHUNKS_OP,
  DEREG_CHUNK_OP,
  DEREG_MCHUNKS_OP,
} from './packets/op';
import {
  hydrateRegCanvas,
  hydrateRegChunk,
  hydrateDeRegChunk,
  hydrateRegMChunks,
  hydrateDeRegMChunks,
  hydratePixelUpdate,
  dehydrateChangeMe,
  dehydrateOnlineCounter,
  dehydrateCoolDown,
  dehydratePixelReturn,
  dehydrateCaptchaReturn,
  dehydrateCanvasToken,
} from './packets/server';
import socketEvents from './socketEvents';
import chatProvider, { ChatProvider } from '../core/ChatProvider';
import authenticateClient from './authenticateClient';
import drawByOffsets from '../core/draw';
import isIPAllowed from '../core/isAllowed';
import { HOUR } from '../core/constants';
import { checkCaptchaSolution, markCaptchaSolvedForIP } from '../data/redis/captcha';
import { USE_CFCAPTCHA } from '../core/config';
import { verifyTurnstileToken } from '../core/cfturnstile';
import blacklistManager from '../core/blacklistManager';
import { getInfoToIp, getIIDofIP } from '../data/sql/IPInfo';
import { LoginLog, RegUser } from '../data/sql';
import userTracking from '../core/UserTracking';
import { generateCanvasToken } from '../core/canvasToken';


const ipCounter = new Counter();
// const rateLimiter = new MassRateLimiter(HOUR);

class SocketServer {
  // WebSocket.Server
  wss;
  // Map<number, Array>
  CHUNK_CLIENTS;
  KNOWN_BOT_SIGNATURES;
  BOT_PATTERNS;
  blacklistedUsers;
  blacklistedIPs;
  // New connection tracking maps
  connectionsByIP;
  connectionsByID;
  connectionsByIID;
  connectionAttempts;
  // Typing indicators: Map<channelId, Map<userId, { userName, timeout }>>
  typingUsers;
  // Add new property for bot behavior tracking
  BOT_BEHAVIOR;

  constructor() {
    this.CHUNK_CLIENTS = new Map();
    this.KNOWN_BOT_SIGNATURES = [
      'LiteDonkey',
      'BIFJHBEABDEECFDDA',
      'CDBAJEIJBGJGHFAFA',
      'EDBCJGGEECAAFFI',
      'humanLines',
      'bsp',
      'snake',
      'spiral',
      'circle',
      'chess',
      'zipper',
      'rhombLine',
      'alien',
      'complex',
      'binary',
      'near'
    ];

    // Add patterns for detecting obfuscated bot code
    this.BOT_PATTERNS = [
      /function\(\w+,\w+\)\{const\s+\w+=a0_\w+,/i,  // Specific obfuscation pattern with a0_ prefix
      /while\(!!\[\]\)\{try\{const\s+\w+=-parseInt/i,  // Specific while loop with parseInt pattern
      /catch\(\w+\)\{\w+\[\'push\'\]\(\w+\[\'shift\'\]\(\)\)\}/i,  // Specific catch pattern
      /_0x[a-f0-9]{4,}/i,  // Obfuscated variable pattern
      /kappa\.lol/i,  // Domain pattern
      /GM_xmlhttpRequest/i,  // Tampermonkey specific
      /unsafeWindow/i,  // Tampermonkey specific
      /@require/i,  // Tampermonkey specific
      /@grant/i,  // Tampermonkey specific
      /@match/i,  // Tampermonkey specific
      /@namespace/i,  // Tampermonkey specific
      /@version/i,  // Tampermonkey specific
      /@description/i,  // Tampermonkey specific
      /@author/i,  // Tampermonkey specific
      /@icon/i,  // Tampermonkey specific
      /@exclude/i,  // Tampermonkey specific
      /id="[A-F]{10,}"/i,  // Random ID pattern
      /class="[A-F]{10,}"/i,  // Random class pattern
      /bis_skin_checked="1"/i,  // Bot UI element marker
      /TemplateCoords/i,  // Bot UI element
      /strategy/i,  // Bot UI element
      /optimizer/i,  // Bot UI element
      /reverse/i,  // Bot UI element
      /shufflePixels/i,  // Bot UI element
      /nonIdealEdges/i,  // Bot UI element
      /zeroCd/i,  // Bot UI element
      /Pick image/i,  // Bot UI element
      /on\/off/i,  // Bot UI element
      /online:/i,  // Bot UI element
      /canvas:/i,  // Bot UI element
      /info:/i,  // Bot UI element
      /cd:/i,  // Bot UI element
      /alr:/i,  // Bot UI element
      /end:/i,  // Bot UI element
      /last:/i,  // Bot UI element
      /teleport/i  // Bot UI element
    ];

    this.blacklistedUsers = new Set();
    this.blacklistedIPs = new Set();
    this.connectionsByIP = new Map();
    this.connectionsByID = new Map();
    this.connectionsByIID = new Map();
    this.connectionAttempts = new Map();

    // Typing indicators: Map<channelId, Map<userId, { userName, timeout }>>
    this.typingUsers = new Map();

    this.broadcastPixelBuffer = this.broadcastPixelBuffer.bind(this);
    this.reloadUser = this.reloadUser.bind(this);
    this.onlineCounterBroadcast = this.onlineCounterBroadcast.bind(this);
    this.checkHealth = this.checkHealth.bind(this);
  }

  initialize() {
    logger.info('Starting websocket server');

    const wss = new WebSocket.Server({
      perMessageDeflate: false,
      clientTracking: true,
      maxPayload: 65536,
      // path: "/ws",
      // server,
      noServer: true,
    });
    this.wss = wss;

    wss.on('error', (e) => {
      logger.error(`WebSocket Server Error ${e.message}`);
    });

    wss.on('connection', async (ws, req) => {
      const ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
      
      ws.timeLastMsg = Date.now();
      ws.connectedTs = ws.timeLastMsg;
      ws.canvasId = null;
      const { user } = req;
      ws.user = user;
      ws.chunkCnt = 0;

      // DIRECT TRACKING IMPLEMENTATION - DO IT HERE NOW
      if (user && user.id) {
        logger.info(`[TRACKING] WebSocket connection: user=${user.id} ip=${ip}`);
        
        // TRACK IID, FLAG, AND IP DIRECTLY HERE
        try {
          // 1. Get IP geolocation
          const ipSubnet = getIPv6Subnet(ip);
          let info = await getInfoToIp(ipSubnet);
          if (!info) {
            await getInfoToIp(ipSubnet);
            info = await getInfoToIp(ipSubnet);
          }
          const country = info?.country?.toLowerCase() || 'xx';
          
          // 2. Get IID for this IP
          const iid = await getIIDofIP(ip);
          logger.info(`[TRACKING] User ${user.id}: IP=${ip}, Country=${country}, IID=${iid}`);
          
          if (iid) {
            // 3. TRACK IID HISTORY
            await userTracking.trackUserIID(user.id, iid, country);
            logger.info(`[TRACKING] IID tracked for user ${user.id}`);
            
            // 4. Get current flag and track changes
            const currentUser = await RegUser.findByPk(user.id, { attributes: ['flag'] });
            const oldFlag = currentUser?.flag || 'xx';
            
            // 5. Update and track flag if changed
            if (country !== 'xx' && country !== oldFlag) {
              await RegUser.update({ flag: country }, { where: { id: user.id } });
              await userTracking.trackUserFlag(user.id, country, oldFlag);
              logger.info(`[TRACKING] Flag changed: ${oldFlag} -> ${country} for user ${user.id}`);
            } else if (country !== 'xx') {
              await userTracking.trackUserFlag(user.id, country, oldFlag);
              logger.info(`[TRACKING] Flag tracked: ${country} for user ${user.id}`);
            }
            
            // 6. Create LoginLog for compatibility
            const existingLog = await LoginLog.findOne({ where: { userId: user.id, iid } });
            if (!existingLog) {
              await LoginLog.create({ userId: user.id, flag: country, iid });
              logger.info(`[TRACKING] LoginLog created for user ${user.id}`);
            }
            
            logger.info(`[TRACKING] IID tracking complete for user ${user.id}`);
          } else {
            logger.warn(`[TRACKING] NO IID FOUND for IP ${ip}, but continuing with other tracking`);
          }
          
          // 4. Get current flag and track changes
          const currentUser = await RegUser.findByPk(user.id, { attributes: ['flag'] });
          const oldFlag = currentUser?.flag || 'xx';
          
          // 5. Update and track flag if changed
          if (country !== 'xx' && country !== oldFlag) {
            await RegUser.update({ flag: country }, { where: { id: user.id } });
            await userTracking.trackUserFlag(user.id, country, oldFlag);
            logger.info(`[TRACKING] Flag changed: ${oldFlag} -> ${country} for user ${user.id}`);
          } else if (country !== 'xx') {
            await RegUser.update({ flag: country }, { where: { id: user.id } });
            await userTracking.trackUserFlag(user.id, country, oldFlag);
            logger.info(`[TRACKING] Flag tracked: ${country} for user ${user.id}`);
          }
          
          // 6. TRACK HARDWARE FINGERPRINT (ALWAYS - this is the key!)
          await userTracking.trackUserHardware(user.id, req, ip, country);
          logger.info(`[TRACKING] Hardware tracked for user ${user.id}`);
          
          logger.info(`[TRACKING] ALL TRACKING COMPLETE for user ${user.id}`);
        } catch (trackingError) {
          logger.error(`[TRACKING] TRACKING FAILED: ${trackingError.message}`);
          logger.error(`[TRACKING] Stack: ${trackingError.stack}`);
        }
      }

      // Check if user or IP is blacklisted
      blacklistManager.isBlacklisted(user.id, ip).then(isBlacklisted => {
        if (isBlacklisted) {
          logger.warn(`Blacklisted user ${user.name} / ${user.id} tried to connect`);
          ws.close(1008, 'Your country is blacklisted');
          return;
        }

        // Check for known bot signatures using blacklistManager
        if (this.isBot(req.headers, ip)) {
          // Add user and IP to blacklist and ban them
          blacklistManager.addToBlacklist(user.id, ip, user.name, user.iid);
          logger.warn(`Banned bot user ${user.id} (${ip})`);
          
          // Kill all connections from this IP
          const killedConnections = this.killAllWsByUerIp(ip);
          logger.warn(`Killed ${killedConnections} connections for banned bot`);
          
          // Close this connection
          ws.close(1008, 'You have been detected for using Litedonkey, You wont be able to appeal');
          return;
        }

        ws.send(dehydrateOnlineCounter(socketEvents.onlineCounter));

        ws.on('error', (e) => {
          logger.error(`WebSocket error for ${ws.user.name}: ${e.message}`);
        });

        ws.on('close', () => {
          ipCounter.delete(ip);
          this.deleteAllChunks(ws);
          this.untrackConnection(ws);
          this.cleanupUserTyping(ws.user.id);
        });

        ws.on('message', (data, isBinary) => {
          ws.timeLastMsg = Date.now();
          if (isBinary) {
            this.onBinaryMessage(data, ws);
          } else {
            const message = data.toString();
            this.onTextMessage(message, ws);
          }
        });

        // Send a short-lived canvas token to the client for protected API access
        try {
          const token = generateCanvasToken(ws.user?.id || 0);
          ws.send(dehydrateCanvasToken(token));
        } catch (e) {
          logger.warn(`Failed to generate/send canvas token: ${e.message}`);
        }
      });
    });

    socketEvents.on('onlineCounter', (online) => {
      const onlineBuffer = dehydrateOnlineCounter(online);
      this.broadcast(onlineBuffer);
    });
    socketEvents.on('pixelUpdate', this.broadcastPixelBuffer);
    socketEvents.on('reloadUser', this.reloadUser);

    socketEvents.on('suChatMessage', (
      userId,
      name,
      message,
      channelId,
      id,
      country,
      factionTag,
    ) => {
      const text = `cm,${JSON.stringify(
        [name, message, country, channelId, id, factionTag, null],
      )}`;
      this.findAllWsByUerId(userId).forEach((ws) => {
        ws.send(text);
      });
    });

    socketEvents.on('chatMessage', (
      name,
      message,
      channelId,
      id,
      country,
      sendapi,
      factionTag,
      messageId,
    ) => {
      const text = `cm,${JSON.stringify(
        [name, message, country, channelId, id, factionTag, messageId],
      )}`;
      const clientArray = [];
      this.wss.clients.forEach((ws) => {
        if (ws.user && chatProvider.userHasChannelAccess(ws.user, channelId)) {
          clientArray.push(ws);
        }
      });
      SocketServer.broadcastSelected(clientArray, text);
    });

    socketEvents.on('addChatChannel', (userId, channelId, channelArray) => {
      this.findAllWsByUerId(userId).forEach((ws) => {
        ws.user.addChannel(channelId, channelArray);
        const text = `ac,${JSON.stringify({
          [channelId]: channelArray,
        })}`;
        ws.send(text);
      });
    });

    socketEvents.on('remChatChannel', (userId, channelId) => {
      this.findAllWsByUerId(userId).forEach((ws) => {
        ws.user.removeChannel(channelId);
        const text = `rc,${JSON.stringify(channelId)}`;
        ws.send(text);
      });
    });

    socketEvents.on('announcement', ({ message, username, type, createdAt }) => {
      // Broadcast announcement to all connected clients
      const data = JSON.stringify({ type: 'announcement', message, username, announceType: type, createdAt });
      this.wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    });

    socketEvents.on('chatRefresh', (channelId, purgedMessageIds) => {
      const text = `cr,${JSON.stringify([channelId, purgedMessageIds])}`;
      this.wss.clients.forEach((ws) => {
        if (ws.user && chatProvider.userHasChannelAccess(ws.user, channelId)) {
          ws.send(text);
        }
      });
    });

    socketEvents.on('canvasConfigUpdate', ({ canvasId, config }) => {
      // Broadcast canvas configuration update to all connected clients
      const data = JSON.stringify({ 
        type: 'canvasConfigUpdate', 
        canvasId, 
        config 
      });
      this.wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    });

    socketEvents.on('chatReaction', (messageId, emoji, userId, userName, channelId, action) => {
      const text = `cr_react,${JSON.stringify([messageId, emoji, userId, userName, action])}`;
      const clientArray = [];
      this.wss.clients.forEach((ws) => {
        if (ws.user && chatProvider.userHasChannelAccess(ws.user, channelId)) {
          clientArray.push(ws);
        }
      });
      SocketServer.broadcastSelected(clientArray, text);
    });

 //   socketEvents.on('rateLimitTrigger', (ip, blockTime) => {
 //     rateLimiter.forceTrigger(ip, blockTime);
 //     const amount = this.killAllWsByUerIp(ip);
 //     if (amount) {
 //       logger.warn(`Killed ${amount} connections for RateLimit`);
 //     }
 //   });

    // when changing interval, remember that online counter gets used as ping
    // for binary sharded channels in MessageBroker.js
    setInterval(this.onlineCounterBroadcast, 20 * 1000);
    setInterval(this.checkHealth, 15 * 1000);
  }

  static async onRateLimitTrigger(ip, blockTime, reason) {
    logger.warn(
      `Client ${ip} triggered Socket-RateLimit by ${reason}.`,
    );
    socketEvents.broadcastRateLimitTrigger(ip, blockTime);
  }

  async handleUpgrade(request, socket, head) {
    const { headers } = request;
    const ip = getIPFromRequest(request);

    // Check for bot patterns
    if (this.isBot(headers, ip)) {
      logger.warn(`Blocked bot connection from ${ip}`);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    // trigger proxycheck
    isIPAllowed(ip);
    /*
     * rate limit 
     */
//    const isLimited = rateLimiter.tick(
//      ip,
//      3000,
//      'connection attempts',
//    );
//    if (isLimited) {
//      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
//      socket.destroy();
//      return;
//    }
    /*
     * enforce CORS
     */
    const { origin } = headers;
    const host = getHostFromRequest(request, false, true);
    if (!origin
      || !`.${origin.slice(origin.indexOf('//') + 2)}`.endsWith(host)
    ) {
      // eslint-disable-next-line max-len
      logger.info(`Rejected CORS request on websocket from ${ip} via ${headers.origin}, expected ${getHostFromRequest(request, false, true)}`);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const user = await authenticateClient(request);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // ===== COMPREHENSIVE USER TRACKING IN HANDLUPGRADE =====
    if (user && user.id) {
      logger.info(`[HANDLEUPGRADE] User ${user.id} authenticating via WebSocket from IP ${ip}`);
      
      try {
        // Track here too for redundancy
        const ipSubnet = getIPv6Subnet(ip);
        let info = await getInfoToIp(ipSubnet);
        if (!info) {
          await getInfoToIp(ipSubnet);
          info = await getInfoToIp(ipSubnet);
        }
        const country = info?.country?.toLowerCase() || 'xx';
        const iid = await getIIDofIP(ip);
        
        if (iid) {
          logger.info(`[HANDLEUPGRADE] Pre-tracking: User ${user.id}, IP=${ip}, Country=${country}, IID=${iid}`);
          
          // Track in UserIIDHistory
          await userTracking.trackUserIID(user.id, iid, country);
          
          // Track flag changes
          const currentUser = await RegUser.findByPk(user.id, { attributes: ['flag'] });
          const oldFlag = currentUser?.flag || 'xx';
          
          if (country !== 'xx') {
            if (country !== oldFlag) {
              await RegUser.update({ flag: country }, { where: { id: user.id } });
            }
            await userTracking.trackUserFlag(user.id, country, oldFlag);
          }
          
          logger.info(`[HANDLEUPGRADE] Pre-tracking complete for user ${user.id}`);
        }
      } catch (error) {
        logger.error(`[HANDLEUPGRADE] Pre-tracking failed: ${error.message}`);
      }
    }

    // Check IP connection limit
    if (ipCounter.get(ip) > 50 && user.id !== 1) {
      logger.warn(`User ${user.name} / ${user.id} tried to use more than 50 connections`);
      ws.close(1008, 'Too many connections');
      return;
    }
    ipCounter.add(ip);

    // Check if user or IP is blacklisted
    const isBlacklisted = await blacklistManager.isBlacklisted(user.id, ip);
    if (isBlacklisted && user.id !== 1) {
      logger.warn(`Blacklisted user ${user.name} / ${user.id} tried to connect`);
      ws.close(1008, 'Your country is blacklisted');
      return;
    }

    request.user = user;
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit('connection', ws, request);
    });
  }

  /**
   * https://github.com/websockets/ws/issues/617
   * @param data
   */
  static broadcastSelected(clients, data) {
    let frames;

    if (typeof data === 'string') {
      frames = WebSocket.Sender.frame(Buffer.from(data), {
        readOnly: false,
        mask: false,
        rsv1: false,
        opcode: 1,
        fin: true,
      });
    } else {
      frames = WebSocket.Sender.frame(data, {
        readOnly: false,
        mask: false,
        rsv1: false,
        opcode: 2,
        fin: true,
      });
    }

    return clients.map((ws) => new Promise((resolve) => {
      if (ws.readyState === WebSocket.OPEN) {
        // eslint-disable-next-line no-underscore-dangle
        ws._sender.sendFrame(frames, (err) => {
          if (err) {
            logger.error(
              // eslint-disable-next-line max-len
              `WebSocket broadcast error on ${ws.user && ws.user.ip} : ${err.message}`,
            );
          }
        });
      }
      resolve();s
    }));
  }

  broadcast(data) {
    const clientArray = [];
    this.wss.clients.forEach((ws) => {
      clientArray.push(ws);
    });
    SocketServer.broadcastSelected(clientArray, data);
  }

  /*
   * keep in mind that a user could
   * be connected from multiple devices
   */
  findWsByUserId(userId) {
    const it = this.wss.clients.keys();
    let client = it.next();
    while (!client.done) {
      const ws = client.value;
      if (ws.readyState === WebSocket.OPEN
        && ws.user
        && ws.user.id === userId
      ) {
        return ws;
      }
      client = it.next();
    }
    return null;
  }

  findAllWsByUerId(userId) {
    const clients = [];
    const it = this.wss.clients.keys();
    let client = it.next();
    while (!client.done) {
      const ws = client.value;
      if (ws.readyState === WebSocket.OPEN
        && ws.user
        && ws.user.id === userId
      ) {
        clients.push(ws);
      }
      client = it.next();
    }
    return clients;
  }

  killAllWsByUerIp(ip) {
    let amount = ipCounter.get(ip);
    if (!amount) return 0;

    for (const [chunkid, clients] of this.CHUNK_CLIENTS.entries()) {
      const newClients = clients.filter((ws) => ws.user.ip !== ip);
      if (clients.length !== newClients.length) {
        this.CHUNK_CLIENTS.set(chunkid, newClients);
      }
    }

    const it = this.wss.clients.keys();
    amount = 0;
    let client = it.next();
    while (!client.done) {
      const ws = client.value;
      if (ws.readyState === WebSocket.OPEN
        && ws.user?.ip === ip
      ) {
        /*
         * we deleted all registered chunks above
         * have to reset it to avoid onClose to
         * do it again.
         */
        ws.chunkCnt = 0;
        ws.terminate();
        amount += 1;
      }
      client = it.next();
    }
    return amount;
  }

  broadcastPixelBuffer(canvasId, chunkid, data) {
    if (this.CHUNK_CLIENTS.has(chunkid)) {
      const clients = this.CHUNK_CLIENTS.get(chunkid)
        .filter((ws) => ws.canvasId === canvasId);
      SocketServer.broadcastSelected(clients, data);
    }
  }

  reloadUser(name) {
    this.wss.clients.forEach(async (ws) => {
      if (ws.user.name === name) {
        await ws.user.reload();
        const buffer = dehydrateChangeMe();
        ws.send(buffer);
      }
    });
  }

  checkHealth() {
    const ts = Date.now() - 120 * 1000;
    const promises = [];
    this.wss.clients.forEach((ws) => {
      promises.push(new Promise((resolve) => {
        if (
          ws.readyState === WebSocket.OPEN
          && ts > ws.timeLastMsg
        ) {
          logger.info(`Killing dead websocket from ${ws.user.ip}`);
          ws.terminate();
          resolve();
        }
      }),
      );
    });
    return promises;
  }

  onlineCounterBroadcast() {
    try {
      const online = {};
      const ipsPerCanvas = {};
      const uniqueIPs = new Set(); // Track unique IPs across all canvases
      const it = this.wss.clients.keys();
      let client = it.next();
      while (!client.done) {
        const ws = client.value;
        if (ws.readyState === WebSocket.OPEN
          && ws.user && ws.canvasId !== null
        ) {
          const { canvasId } = ws;
          const { ip } = ws.user;
          
          // Track unique IPs across all canvases
          uniqueIPs.add(ip);
          
          // Track per canvas
          if (!ipsPerCanvas[canvasId]) {
            ipsPerCanvas[canvasId] = new Set();
          }
          ipsPerCanvas[canvasId].add(ip);
        }
        client = it.next();
      }

      // Set total to actual unique IPs
      online.total = uniqueIPs.size;

      // Set per canvas counts
      Object.keys(ipsPerCanvas).forEach((canvasId) => {
        online[canvasId] = ipsPerCanvas[canvasId].size;
      });

      socketEvents.broadcastOnlineCounter(online);
    } catch (err) {
      logger.error(`WebSocket online broadcast error: ${err.message}`);
    }
  }

  async onTextMessage(text, ws) {
    const { ip } = ws.user;
    // rate limit
   // const isLimited = rateLimiter.tick(
   //   ip,
   //   1000,
   //   'text message spam',
   //   SocketServer.onRateLimitTrigger,
   // );
   // if (isLimited) {
   //   return;
   // }
    // ---
    try {
      const comma = text.indexOf(',');
      if (comma === -1) {
        throw new Error('No comma');
      }
      const key = text.slice(0, comma);
      const val = JSON.parse(text.slice(comma + 1));
      const { user } = ws;
      switch (key) {
        case 'cm': {
          // chat message
          const message = val[0].trim();
          if (!user.isRegistered || !message) {
            return;
          }
          const channelId = val[1];
          /*
           * if DM channel, make sure that other user has DM open
           * (needed because we allow user to leave one-sided
           *  and auto-join on message)
           */
          const dmUserId = chatProvider.checkIfDm(user, channelId);
          if (dmUserId) {
            const dmWs = this.findWsByUserId(dmUserId);
            if (!dmWs
              || !chatProvider.userHasChannelAccess(dmWs.user, channelId)
            ) {
              // TODO this is really ugly
              // DMS have to be rethought
              if (!user.addedDM) user.addedDM = [];
              if (!user.addedDM.includes(dmUserId)) {
                await ChatProvider.addUserToChannel(
                  dmUserId,
                  channelId,
                  [user.name, 1, Date.now(), user.id],
                );
                user.addedDM.push(dmUserId);
              }
            }
          }
          socketEvents.recvChatMessage(user, message, channelId);
          break;
        }
        case 'react': {
          // chat reaction
          if (!user.isRegistered) {
            return;
          }
          const [messageId, emoji, channelId] = val;
          socketEvents.recvChatReaction(user, messageId, emoji, channelId);
          break;
        }
        case 'cs': {
          // captcha solution
          const [solution, captchaid] = val;
          let ret = 2;
          if (USE_CFCAPTCHA) {
            // solution is Turnstile token
            const ok = await verifyTurnstileToken(solution, ip);
            if (ok) {
              // cache captcha pass to avoid immediate re-prompt
              try { await markCaptchaSolvedForIP(ip); } catch (_) {}
            }
            ret = ok ? 0 : 2;
          } else {
            ret = await checkCaptchaSolution(
              solution,
              ip,
              false,
              captchaid,
            );
          }
          ws.send(dehydrateCaptchaReturn(ret));
          break;
        }
        case 'ty': {
          // typing indicator
          if (!user.isRegistered) {
            return;
          }
          const [channelId, isTyping] = val;
          
          // Check if user has access to the channel
          if (!chatProvider.userHasChannelAccess(user, channelId)) {
            return;
          }
          
          this.handleTyping(user, channelId, isTyping);
          break;
        }
        default:
          throw new Error('Unknown key');
      }
    } catch (err) {
      // eslint-disable-next-line max-len
      logger.error(`Got invalid ws text message ${text} from ${ws.user.ip}, with error: ${err.message}`);
    }
  }

  // Add method to check for bot patterns
  isBot(headers, ip) {
    const userAgent = headers['user-agent'] || '';
    const referer = headers.referer || '';
    const origin = headers.origin || '';
    
    // Check for known bot signatures
    if (this.KNOWN_BOT_SIGNATURES.some(sig => 
      userAgent.includes(sig) || 
      referer.includes(sig) || 
      origin.includes(sig)
    )) {
      return true;
    }

    // Check for obfuscated code patterns
    const allHeaders = `${userAgent} ${referer} ${origin}`;
    if (this.BOT_PATTERNS.some(pattern => pattern.test(allHeaders))) {
      return true;
    }

    // Check for bot UI elements in page content
    try {
      // Get the page content from the request
      const pageContent = headers['sec-websocket-protocol'] || '';
      
      // Check for bot UI elements
      if (this.BOT_PATTERNS.some(pattern => pattern.test(pageContent))) {
        logger.warn(`Detected bot UI elements from ${ip}`);
        return true;
      }

      // Check for random ID/class patterns
      const randomIdPattern = /id="[A-F]{10,}"/i;
      const randomClassPattern = /class="[A-F]{10,}"/i;
      if (randomIdPattern.test(pageContent) && randomClassPattern.test(pageContent)) {
        logger.warn(`Detected bot UI with random IDs from ${ip}`);
        return true;
      }

      // Check for bot UI markers
      const botMarkers = [
        'bis_skin_checked="1"',
        'TemplateCoords',
        'strategy',
        'optimizer',
        'reverse',
        'shufflePixels',
        'nonIdealEdges',
        'zeroCd',
        'Pick image',
        'on/off',
        'online:',
        'canvas:',
        'info:',
        'cd:',
        'alr:',
        'end:',
        'last:',
        'teleport'
      ];

      // If we find multiple bot UI markers, it's likely a bot
      const foundMarkers = botMarkers.filter(marker => pageContent.includes(marker));
      if (foundMarkers.length >= 3) {
        logger.warn(`Detected multiple bot UI elements from ${ip}: ${foundMarkers.join(', ')}`);
        return true;
      }
    } catch (err) {
      logger.error(`Error checking page content for bot: ${err.message}`);
    }

    return false;
  }

  async onBinaryMessage(buffer, ws) {
    try {
      const { ip } = ws.user;
      const opcode = buffer[0];

      // rate limit
      let limiterDeltaTime = 200;
      let reason = 'socket spam';
      if (opcode === REG_CHUNK_OP) {
        limiterDeltaTime = 40;
        reason = 'register chunk spam';
      } else if (opcode === DEREG_CHUNK_OP) {
        limiterDeltaTime = 10;
        reason = 'deregister chunk spam';
      }
      // Note: actual rate limiting implementation would go here if enabled
      // Skip rate limiting for user ID 1
      if (ws.user.id !== 1) {
        // Rate limiting logic would go here
      }

      switch (opcode) {
        case PIXEL_UPDATE_OP: {
          const { canvasId, connectedTs } = ws;

          if (canvasId === null) {
            logger.info(`Closing websocket without canvas from ${ip}`);
            ws.close();
            return;
          }

          const {
            i, j, pixels,
          } = hydratePixelUpdate(buffer);
          const {
            wait,
            coolDown,
            pxlCnt,
            rankedPxlCnt,
            retCode,
          } = await drawByOffsets(
            ws.user,
            canvasId,
            i, j,
            pixels,
            connectedTs,
          );

     //     if (retCode > 9 && retCode !== 13) {
     //       rateLimiter.add(ip, 800);
     //     }

          ws.send(dehydratePixelReturn(
            retCode,
            wait,
            coolDown,
            pxlCnt,
            rankedPxlCnt,
          ));
          break;
        }
        case REG_CANVAS_OP: {
          const canvasId = hydrateRegCanvas(buffer);
          if (!canvases[canvasId]) return;
          if (ws.canvasId !== canvasId) {
            this.deleteAllChunks(ws);
          }
          ws.canvasId = canvasId;
          if (canvases[canvasId].ed) return;
          const wait = await ws.user.getWait(canvasId);
          ws.send(dehydrateCoolDown(wait));
          break;
        }
        case REG_CHUNK_OP: {
          const chunkid = hydrateRegChunk(buffer);
          this.pushChunk(chunkid, ws);
          break;
        }
        case REG_MCHUNKS_OP: {
          this.deleteAllChunks(ws);
          hydrateRegMChunks(buffer, (chunkid) => {
            this.pushChunk(chunkid, ws);
          });
          break;
        }
        case DEREG_CHUNK_OP: {
          const chunkid = hydrateDeRegChunk(buffer);
          this.deleteChunk(chunkid, ws);
          break;
        }
        case DEREG_MCHUNKS_OP: {
          hydrateDeRegMChunks(buffer, (chunkid) => {
            this.deleteChunk(chunkid, ws);
          });
          break;
        }
        default:
          break;
      }
    } catch (e) {
      logger.error(`WebSocket Client Binary Message Error: ${e.message}`);
    }
  }

  pushChunk(chunkid, ws) {
    if (ws.chunkCnt === 20000 && ws.user.id !== 1) {
      logger.warn(
        `User ${ws.user.name} / ${ws.user.id} tried to subscribe to more than 20000 chunks`,
      );
      return;
    }
    ws.chunkCnt += 1;
    let clients = this.CHUNK_CLIENTS.get(chunkid);
    if (!clients) {
      clients = [];
      this.CHUNK_CLIENTS.set(chunkid, clients);
    }
    const pos = clients.indexOf(ws);
    if (~pos) return;
    clients.push(ws);
  }

  deleteChunk(chunkid, ws) {
    if (!this.CHUNK_CLIENTS.has(chunkid)) return;
    const clients = this.CHUNK_CLIENTS.get(chunkid);
    const pos = clients.indexOf(ws);
    if (~pos) {
      clients.splice(pos, 1);
      ws.chunkCnt -= 1;
    }
  }

  deleteAllChunks(ws) {
    if (!ws.chunkCnt) {
      return;
    }
    for (const client of this.CHUNK_CLIENTS.values()) {
      const pos = client.indexOf(ws);
      if (~pos) {
        client.splice(pos, 1);
        ws.chunkCnt -= 1;
        if (!ws.chunkCnt) return;
      }
    }
  }

  // Add new methods for connection tracking
  trackConnection(ws) {
    const { ip } = ws.user;
    const { id, iid } = ws.user;

    if (!this.connectionsByIP.has(ip)) {
      this.connectionsByIP.set(ip, new Set());
    }
    this.connectionsByIP.get(ip).add(ws);

    if (id) {
      if (!this.connectionsByID.has(id)) {
        this.connectionsByID.set(id, new Set());
      }
      this.connectionsByID.get(id).add(ws);
    }

    if (iid) {
      if (!this.connectionsByIID.has(iid)) {
        this.connectionsByIID.set(iid, new Set());
      }
      this.connectionsByIID.get(iid).add(ws);
    }
  }

  untrackConnection(ws) {
    const { ip } = ws.user;
    const { id, iid } = ws.user;

    if (this.connectionsByIP.has(ip)) {
      this.connectionsByIP.get(ip).delete(ws);
      if (this.connectionsByIP.get(ip).size === 0) {
        this.connectionsByIP.delete(ip);
      }
    }

    if (id && this.connectionsByID.has(id)) {
      this.connectionsByID.get(id).delete(ws);
      if (this.connectionsByID.get(id).size === 0) {
        this.connectionsByID.delete(id);
      }
    }

    if (iid && this.connectionsByIID.has(iid)) {
      this.connectionsByIID.get(iid).delete(ws);
      if (this.connectionsByIID.get(iid).size === 0) {
        this.connectionsByIID.delete(iid);
      }
    }
  }

  getConnectionsByIP(ip) {
    return this.connectionsByIP.get(ip)?.size || 0;
  }

  getConnectionsByID(id) {
    return this.connectionsByID.get(id)?.size || 0;
  }

  getConnectionsByIID(iid) {
    return this.connectionsByIID.get(iid)?.size || 0;
  }

  cleanupOldConnections(ip) {
    // Implementation of cleanupOldConnections method
    const connections = this.connectionsByIP.get(ip);
    if (connections && connections.size > 5) {
      const connectionsArray = Array.from(connections);
      connectionsArray.slice(0, 2).forEach(ws => ws.close());
    }
  }

  handleTyping(user, channelId, isTyping) {
    const userId = user.id;
    const userName = user.name;

    if (!this.typingUsers.has(channelId)) {
      this.typingUsers.set(channelId, new Map());
    }

    const channelTyping = this.typingUsers.get(channelId);

    if (isTyping) {
      // Clear existing timeout if user was already typing
      if (channelTyping.has(userId)) {
        clearTimeout(channelTyping.get(userId).timeout);
      }

      // Set new timeout for 3 seconds
      const timeout = setTimeout(() => {
        this.stopUserTyping(userId, channelId);
      }, 3000);

      channelTyping.set(userId, { userName, timeout });
    } else {
      // User stopped typing
      if (channelTyping.has(userId)) {
        clearTimeout(channelTyping.get(userId).timeout);
        channelTyping.delete(userId);
      }
    }

    // Broadcast updated typing list
    this.broadcastTypingUpdate(channelId);
  }

  stopUserTyping(userId, channelId) {
    if (this.typingUsers.has(channelId)) {
      const channelTyping = this.typingUsers.get(channelId);
      if (channelTyping.has(userId)) {
        clearTimeout(channelTyping.get(userId).timeout);
        channelTyping.delete(userId);
        this.broadcastTypingUpdate(channelId);
      }
    }
  }

  broadcastTypingUpdate(channelId) {
    if (!this.typingUsers.has(channelId)) {
      return;
    }

    const channelTyping = this.typingUsers.get(channelId);
    const typingUsernames = Array.from(channelTyping.values()).map(entry => entry.userName);

    // Clean up empty channel
    if (typingUsernames.length === 0) {
      this.typingUsers.delete(channelId);
    }

    const text = `ty,${JSON.stringify([typingUsernames, channelId])}`;
    
    // Send to all users who have access to this channel
    const clientArray = [];
    this.wss.clients.forEach((ws) => {
      if (ws.user && chatProvider.userHasChannelAccess(ws.user, channelId)) {
        clientArray.push(ws);
      }
    });
    
    SocketServer.broadcastSelected(clientArray, text);
  }

  /**
   * Comprehensive user connection tracking
   * This is where we track IIDs, flags, and IPs for every websocket connection
   */
  async trackUserConnection(userId, ip) {
    try {
      logger.info(`[UserTracking] Tracking connection for user ${userId} from IP ${ip}`);
      
      // 1. Get IP geolocation info
      const ipSubnet = getIPv6Subnet(ip);
      let info = await getInfoToIp(ipSubnet);
      if (!info) {
        try { 
          await getInfoToIp(ipSubnet); 
        } catch (error) {
          logger.warn(`Failed to get IP info for ${ipSubnet}: ${error.message}`);
        }
        info = await getInfoToIp(ipSubnet);
      }
      const country = info?.country?.toLowerCase() || 'xx';
      
      // 2. Get IID for this IP
      const iid = await getIIDofIP(ip);
      if (!iid) {
        logger.warn(`[UserTracking] Could not resolve IID for IP ${ip}`);
        return;
      }
      
      logger.info(`[UserTracking] User ${userId}: IP=${ip}, Country=${country}, IID=${iid}`);
      
      // 3. Track IID history (this is the core tracking)
      await userTracking.trackUserIID(userId, iid, country);
      logger.info(`[UserTracking] Tracked IID for user ${userId}`);
      
      // 4. Get current user flag to detect changes
      const currentUser = await RegUser.findByPk(userId, { attributes: ['flag'] });
      const oldFlag = currentUser?.flag || 'xx';
      
      // 5. Update flag if country detected and different
      if (country !== 'xx' && country !== oldFlag) {
        await RegUser.update(
          { flag: country },
          { where: { id: userId } }
        );
        
        // Track flag change
        await userTracking.trackUserFlag(userId, country, oldFlag);
        logger.info(`[UserTracking] Flag changed for user ${userId}: ${oldFlag} -> ${country}`);
      }
      
      // 6. Track current flag even if no change (updates lastSeen)
      if (country !== 'xx') {
        await userTracking.trackUserFlag(userId, country, oldFlag);
        logger.info(`[UserTracking] Tracked flag for user ${userId}: ${country}`);
      }
      
      // 7. Create/update LoginLog entry for compatibility
      const alreadyLogged = await LoginLog.findOne({
        where: { userId, iid },
      });
      
      if (!alreadyLogged) {
        await LoginLog.create({ userId, flag: country, iid });
        logger.info(`[UserTracking] Created LoginLog entry: user=${userId}, flag=${country}, iid=${iid}`);
      }
      
      logger.info(`[UserTracking] Successfully tracked connection for user ${userId}`);
      
    } catch (error) {
      logger.error(`[UserTracking] Error in trackUserConnection: ${error.message}`);
      logger.error(`[UserTracking] Stack trace: ${error.stack}`);
    }
  }

  cleanupUserTyping(userId) {
    this.typingUsers.forEach((channelTyping, channelId) => {
      if (channelTyping.has(userId)) {
        clearTimeout(channelTyping.get(userId).timeout);
        channelTyping.delete(userId);
        this.broadcastTypingUpdate(channelId);
      }
    });
  }
}

export default SocketServer;
