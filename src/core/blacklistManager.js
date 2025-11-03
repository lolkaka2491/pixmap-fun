import fs from 'fs';
import path from 'path';
import logger from './logger';

class BlacklistManager {
  constructor() {
    this.KNOWN_BOT_SIGNATURES = [
      'LiteDonkey',
      'HFEHGGEGHCJEJIF',  // Bot container ID
      'JEJACGHIDCBDAFAC', // Bot UI class
      'CCFJHICDGIGFDBGFA', // Bot teleport class
      'humanLines',
      'humanLines1',
      'humanLines2',
      'bsp',
      'bsp2',
      'bsp2chess',
      'borders',
      'snake',
      'snake_napravo',
      'snake_nalevo',
      'snake_vniz',
      'snake_vverh',
      'random',
      'randomDumbLines',
      'line_Vniz',
      'line_Vverh',
      'line_Nalevo',
      'line_Napravo',
      'circle1',
      'circle2',
      'circle3',
      'circle4',
      'circleCenter',
      'throughLine',
      'chess_1x1',
      'chess_2x2',
      'chess_3x3',
      'chessCorner_1x1',
      'woyken',
      'colorByColorChessVverh',
      'colorByColorNapravo',
      'colorByColorNalevo',
      'colorByColorZipper',
      'colorByColorZipper2',
      'colorByColorVverh',
      'colorByColorVniz',
      'colorByColorCircle',
      'colorByColorRandom',
      'squareBySquare',
      'zipper1',
      'zipper2',
      'zipper3',
      'zipper4',
      'rhombLine',
      'rhombLine2',
      'alienRandom',
      'alien1',
      'alien2',
      'alien3',
      'alien4',
      'complex',
      'binary',
      'near'
    ];

    // Initialize bot log directory
    this.BOT_LOG_DIR = path.join(process.cwd(), 'log', 'moderation', 'bot');
    this.BOT_LOG_FILE = path.join(this.BOT_LOG_DIR, 'bots.log');
    this.ensureLogDirectory();

    // Track connection attempts and suspicious patterns
    this.connectionAttempts = new Map(); // ip -> { count: number, firstSeen: timestamp, lastSeen: timestamp, suspiciousHeaders: Set }
    this.suspiciousPatterns = new Map(); // ip -> Set of suspicious patterns seen
    this.CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
    this.MAX_ATTEMPTS = 10; // Number of attempts before considering suspicious
    this.ATTEMPT_WINDOW = 5 * 60 * 1000; // 5 minutes window

    // Start cleanup interval
    setInterval(() => this.cleanupOldAttempts(), this.CLEANUP_INTERVAL);
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.BOT_LOG_DIR)) {
      fs.mkdirSync(this.BOT_LOG_DIR, { recursive: true });
    }
  }

  logBotDetection(userId, ip, name, iid, reason = 'Using LiteDonkey bot') {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      userId,
      ip,
      name,
      iid,
      reason
    };

    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(this.BOT_LOG_FILE, logLine);
    logger.warn(`Bot detected and logged: ${JSON.stringify(logEntry)}`);
  }

  async isBlacklisted(userId, ip) {
    try {
      // Check in-memory blacklist
      return this.blacklistedUsers.has(userId) || this.blacklistedIPs.has(ip);
    } catch (error) {
      logger.error(`Error checking blacklist: ${error.message}`);
      return false;
    }
  }

  async addToBlacklist(userId, ip, name, iid, reason = 'Detected for using Litedonkey') {
    try {
      // Add to in-memory blacklist
      this.blacklistedUsers.add(userId);
      this.blacklistedIPs.add(ip);
      
      // Log the bot detection
      this.logBotDetection(userId, ip, name, iid, reason);
      
      // Ban the user using the same system as ID 1
      const banData = {
        userId,
        name,
        iid,
        ip,
        reason,
        bannedBy: 1, // System ban
        timestamp: new Date().toISOString()
      };

      // Log the ban
      logger.warn(`User banned for bot usage: ${JSON.stringify(banData)}`);
      
      // Add to blacklist log
      const logEntry = JSON.stringify(banData) + '\n';
      fs.appendFileSync(this.BOT_LOG_FILE, logEntry);
    } catch (error) {
      logger.error(`Error adding to blacklist: ${error.message}`);
    }
  }

  cleanupOldAttempts() {
    const now = Date.now();
    for (const [ip, data] of this.connectionAttempts.entries()) {
      if (now - data.lastSeen > this.ATTEMPT_WINDOW) {
        this.connectionAttempts.delete(ip);
        this.suspiciousPatterns.delete(ip);
      }
    }
  }

  trackConnection(ip, headers) {
    const now = Date.now();
    let data = this.connectionAttempts.get(ip);
    
    if (!data) {
      data = {
        count: 0,
        firstSeen: now,
        lastSeen: now,
        suspiciousHeaders: new Set()
      };
      this.connectionAttempts.set(ip, data);
    }

    data.count++;
    data.lastSeen = now;

    // Track suspicious patterns
    const patterns = this.getSuspiciousPatterns(headers);
    if (!this.suspiciousPatterns.has(ip)) {
      this.suspiciousPatterns.set(ip, new Set());
    }
    patterns.forEach(pattern => this.suspiciousPatterns.get(ip).add(pattern));

    return {
      isSuspicious: data.count >= this.MAX_ATTEMPTS,
      suspiciousPatterns: Array.from(this.suspiciousPatterns.get(ip) || []),
      attemptCount: data.count
    };
  }

  getSuspiciousPatterns(headers) {
    const patterns = new Set();
    const headersStr = JSON.stringify(headers).toLowerCase();
    
    // Check for bot-specific patterns
    this.KNOWN_BOT_SIGNATURES.forEach(signature => {
      if (headersStr.includes(signature.toLowerCase())) {
        patterns.add(signature);
      }
    });

    // Check for suspicious header combinations
    const accept = headers['accept'] || '';
    const acceptLanguage = headers['accept-language'] || '';
    const acceptEncoding = headers['accept-encoding'] || '';
    const cacheControl = headers['cache-control'] || '';
    const connection = headers['connection'] || '';
    const upgrade = headers['upgrade'] || '';

    if (accept.includes('*/*') && !acceptLanguage) patterns.add('missing_language_header');
    if (acceptEncoding.includes('gzip') && !cacheControl) patterns.add('missing_cache_control');
    if (connection.includes('Upgrade') && !upgrade.includes('websocket')) patterns.add('incorrect_upgrade');

    return patterns;
  }

  isBot(headers, ip) {
    // Track this connection attempt
    const { isSuspicious, suspiciousPatterns, attemptCount } = this.trackConnection(ip, headers);

    // Check for bot UI patterns
    const html = headers['sec-websocket-protocol'] || '';
    const headersStr = JSON.stringify(headers).toLowerCase();

    // Check for randomized ID pattern (12-14 character alphanumeric)
    const hasRandomId = /[A-Z]{12,14}/.test(html);
    
    // Check for bot initialization patterns
    const botInitPatterns = [
      'document.addEventListener',
      'document.readyState',
      'document.body',
      'document.createElement',
      'document.getElementById',
      'document.querySelector',
      'document.querySelectorAll',
      'window.onload',
      'window.addEventListener',
      'setInterval',
      'setTimeout',
      'requestAnimationFrame',
      // Add Cloudflare bypass patterns
      'contentDocument',
      'contentWindow.document',
      'cdn-cgi/challenge-platform',
      '__CF$cv$params',
      'challenge-platform/scripts/jsd',
      'getElementsByTagName(\'head\')',
      'appendChild(a)',
      'iframe',
      'createElement(\'script\')'
    ];

    // Check for bot initialization code
    const hasBotInit = botInitPatterns.some(pattern => 
      headersStr.includes(pattern.toLowerCase())
    );

    // Check for specific Cloudflare bypass patterns
    const cfBypassPatterns = [
      'contentDocument',
      'contentWindow.document',
      'cdn-cgi/challenge-platform',
      '__CF$cv$params'
    ];

    const hasCFBypass = cfBypassPatterns.some(pattern =>
      headersStr.includes(pattern.toLowerCase())
    );

    // Check for bot UI elements
    const botUIElements = [
      'bis_skin_checked',
      'templatecoords',
      'strategy',
      'optimizer',
      'reverse',
      'shufflepixels',
      'nonidealedges',
      'zerocd',
      'pick image',
      'on/off',
      'online:',
      'canvas:',
      'info:',
      'cd:',
      'alr:',
      'end:',
      'last:',
      'teleport',
      '♛',  // Crown emoji used in bot title
      'litedonkey',
      'input-file',
      'float: left',
      'float: right'
    ];  

    // Check for bot UI patterns
    const hasBotUI = botUIElements.some(element => 
      headersStr.includes(element.toLowerCase())
    );

    // Check for suspicious header combinations
    const accept = headers['accept'] || '';
    const acceptLanguage = headers['accept-language'] || '';
    const acceptEncoding = headers['accept-encoding'] || '';
    const cacheControl = headers['cache-control'] || '';
    const connection = headers['connection'] || '';
    const upgrade = headers['upgrade'] || '';

    const hasSuspiciousHeaders = 
      (accept.includes('*/*') && !acceptLanguage) || // Missing language header
      (acceptEncoding.includes('gzip') && !cacheControl) || // Missing cache control
      (connection.includes('Upgrade') && !upgrade.includes('websocket')); // Incorrect upgrade header

    // Only block if we have multiple indicators
    const isDefinitelyBot = (hasRandomId && hasBotUI) || // Random ID + bot UI elements
                          (hasBotUI && hasSuspiciousHeaders) || // Bot UI + suspicious headers
                          (hasRandomId && hasSuspiciousHeaders) || // Random ID + suspicious headers
                          (hasBotInit && (hasRandomId || hasBotUI)) || // Bot init code + other indicators
                          (hasCFBypass && (hasRandomId || hasBotUI || hasBotInit)); // Cloudflare bypass + other indicators

    // Log detailed detection info
    if (hasRandomId || hasBotUI || hasSuspiciousHeaders || hasBotInit || hasCFBypass) {
      logger.warn(`Bot detection details:
        Random ID found: ${hasRandomId}
        Bot UI elements found: ${hasBotUI}
        Bot init code found: ${hasBotInit}
        Cloudflare bypass attempt: ${hasCFBypass}
        Suspicious headers: ${hasSuspiciousHeaders}
        Is definitely bot: ${isDefinitelyBot}
        HTML content: ${html.substring(0, 100)}...`);
    }

    return isDefinitelyBot;
  }

  getBanPage() {
    return `      <!DOCTYPE html>
      <html>
        <head>
          <title>Access Denied</title>
          <style>
            body {
              background-color: #1a1a1a;
              color: #ffffff;
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
            }
            .container {
              text-align: center;
              padding: 2rem;
              border: 2px solid #ff0000;
              border-radius: 10px;
              max-width: 600px;
              animation: pulse 2s infinite;
            }
            h1 {
              color: #ff0000;
              margin-bottom: 1rem;
            }
            p {
              margin: 1rem 0;
              line-height: 1.5;
            }
            @keyframes pulse {
              0% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.4); }
              70% { box-shadow: 0 0 0 10px rgba(255, 0, 0, 0); }
              100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⚠️ Access Denied</h1>
            <p>You have been permanently banned for using illegal bots (LiteDonkey).</p>
            <p>This ban is permanent and cannot be appealed.</p>
          </div>
        </body>
      </html>
    `;
  }

  // Method to load bot logs for watchtools
  getBotLogs() {
    try {
      if (!fs.existsSync(this.BOT_LOG_FILE)) {
        return [];
      }
      const logs = fs.readFileSync(this.BOT_LOG_FILE, 'utf8')
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
      return logs;
    } catch (error) {
      logger.error(`Error reading bot logs: ${error.message}`);
      return [];
    }
  }
}

// Initialize in-memory blacklists
const blacklistManager = new BlacklistManager();
blacklistManager.blacklistedUsers = new Set();
blacklistManager.blacklistedIPs = new Set();

export default blacklistManager;

