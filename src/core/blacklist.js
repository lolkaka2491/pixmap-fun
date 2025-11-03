import redis from '../data/redis';
import logger from './logger';

class BlacklistManager {
  constructor() {
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
  }

  async isBlacklisted(userId, ip) {
    try {
      const isUserBlacklisted = await redis.get(`blacklist:user:${userId}`);
      const isIPBlacklisted = await redis.get(`blacklist:ip:${ip}`);
      return isUserBlacklisted || isIPBlacklisted;
    } catch (err) {
      logger.error(`Error checking blacklist: ${err.message}`);
      return false;
    }
  }

  async addToBlacklist(userId, ip) {
    try {
      await redis.set(`blacklist:user:${userId}`, '1');
      await redis.set(`blacklist:ip:${ip}`, '1');
      logger.warn(`Permanently blacklisted user ${userId} (${ip}) for using LiteDonkey`);
    } catch (err) {
      logger.error(`Error adding to blacklist: ${err.message}`);
    }
  }

  isBot(headers) {
    const userAgent = headers['user-agent'] || '';
    const origin = headers['origin'] || '';
    const allHeaders = JSON.stringify(headers).toLowerCase();
    const html = headers['sec-websocket-protocol'] || '';

    return this.KNOWN_BOT_SIGNATURES.some(signature => 
      userAgent.includes(signature) || 
      origin.includes(signature) || 
      allHeaders.includes(signature.toLowerCase()) ||
      html.includes(signature)
    );
  }

  getBanPage() {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Account Banned</title>
        <style>
          body {
            background-color: #1a1a1a;
            color: #ff3333;
            font-family: 'Arial', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            text-align: center;
          }
          .ban-container {
            background-color: #2a2a2a;
            padding: 2rem;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(255, 0, 0, 0.3);
            max-width: 600px;
            animation: pulse 2s infinite;
          }
          h1 {
            font-size: 2.5rem;
            margin-bottom: 1rem;
            text-transform: uppercase;
            letter-spacing: 2px;
          }
          p {
            font-size: 1.2rem;
            line-height: 1.6;
            margin-bottom: 1rem;
          }
          .warning {
            color: #ff6666;
            font-weight: bold;
            font-size: 1.4rem;
            margin-top: 1rem;
          }
          @keyframes pulse {
            0% { box-shadow: 0 0 20px rgba(255, 0, 0, 0.3); }
            50% { box-shadow: 0 0 30px rgba(255, 0, 0, 0.5); }
            100% { box-shadow: 0 0 20px rgba(255, 0, 0, 0.3); }
          }
        </style>
      </head>
      <body>
        <div class="ban-container">
          <h1>⚠️ Account Banned ⚠️</h1>
          <p>You have been detected for using an illegal bot.</p>
          <p class="warning">You are permanently banned and you can never appeal.</p>
        </div>
      </body>
      </html>
    `;
  }
}

export default new BlacklistManager(); 