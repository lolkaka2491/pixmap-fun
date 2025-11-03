import { RegUser } from '../data/sql';
import { getIPofIID, getIIDofIP } from '../data/sql/IPInfo';
import { getBanInfo } from '../data/sql/Ban';
import { isWhitelisted } from '../data/sql/Whitelist';
import ipIntelligence from './IPIntelligence';
import sequelize from '../data/sql/sequelize';
import fs from 'fs';
import readline from 'readline';
import { PIXELLOGGER_PREFIX } from './logger';
import { getIPv6Subnet } from '../utils/ip';

class UserCorrelationService {
  async getUserDevices(userId) {
    // Get all IIDs associated with this user's IPs
    const user = await RegUser.findByPk(userId);
    if (!user) return null;

    const devices = new Map(); // Map of device fingerprints to details
    const ipHistory = new Set(); // Set of IPs used by this user
    const accountLinks = new Map(); // Map of related accounts

    // Get all IIDs for this user
    const userIIDs = await this.getUserIIDs(userId);
    
    for (const iid of userIIDs) {
      const ip = await getIPofIID(iid);
      if (!ip) continue;

      ipHistory.add(ip);
      
      // Get device fingerprint from IID
      const deviceId = this.extractDeviceId(iid);
      if (!deviceId) continue;

      if (!devices.has(deviceId)) {
        devices.set(deviceId, {
          id: deviceId,
          firstSeen: iid.split('-')[1],
          lastSeen: iid.split('-')[2],
          ips: new Set(),
          iids: new Set(),
          accounts: new Set(),
        });
      }

      const device = devices.get(deviceId);
      device.ips.add(ip);
      device.iids.add(iid);

      // Find other accounts using this IP
      const relatedIIDs = await getIIDofIP(ip);
      for (const relatedIID of relatedIIDs) {
        const relatedUserId = await this.getUserIdFromIID(relatedIID);
        if (relatedUserId && relatedUserId !== userId) {
          device.accounts.add(relatedUserId);
          if (!accountLinks.has(relatedUserId)) {
            accountLinks.set(relatedUserId, {
              userId: relatedUserId,
              connectionType: 'IP_SHARED',
              sharedIPs: new Set([ip]),
              sharedDevices: new Set([deviceId]),
              firstSeen: iid.split('-')[1],
              lastSeen: iid.split('-')[2],
            });
          } else {
            const link = accountLinks.get(relatedUserId);
            link.sharedIPs.add(ip);
            link.sharedDevices.add(deviceId);
            if (iid.split('-')[1] < link.firstSeen) link.firstSeen = iid.split('-')[1];
            if (iid.split('-')[2] > link.lastSeen) link.lastSeen = iid.split('-')[2];
          }
        }
      }
    }

    // Get IP intelligence for all IPs
    const ipDetails = new Map();
    for (const ip of ipHistory) {
      const details = await ipIntelligence.getEnhancedIPInfo(ip);
      ipDetails.set(ip, details);
    }

    // Convert Sets to Arrays for JSON serialization
    const result = {
      userId,
      username: user.name,
      devices: Array.from(devices.values()).map(d => ({
        ...d,
        ips: Array.from(d.ips),
        iids: Array.from(d.iids),
        accounts: Array.from(d.accounts),
      })),
      ipHistory: await Promise.all(Array.from(ipHistory).map(async ip => ({
        ip,
        details: ipDetails.get(ip),
        banInfo: await getBanInfo(ip),
        whitelisted: await isWhitelisted(ip),
      }))),
      relatedAccounts: Array.from(accountLinks.values()).map(a => ({
        ...a,
        sharedIPs: Array.from(a.sharedIPs),
        sharedDevices: Array.from(a.sharedDevices),
      })),
    };

    return result;
  }

  async getUserIIDs(userId) {
    const iids = new Set();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Check both today's and yesterday's logs
    const dates = [today, yesterday];
    
    for (const date of dates) {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const filename = `${PIXELLOGGER_PREFIX}${year}-${month}-${day}.log`;

      try {
        if (!fs.existsSync(filename)) continue;

        const fileStream = fs.createReadStream(filename);
        const rl = readline.createInterface({
          input: fileStream,
        });

        for await (const line of rl) {
          const [timestamp, ip, uid, canvasId, x, y, z, color] = line.split(' ');
          if (parseInt(uid, 10) === userId) {
            const iid = getIPv6Subnet(ip);
            iids.add(iid);
          }
        }
      } catch (err) {
        console.error(`Error reading log file ${filename}:`, err);
      }
    }

    return Array.from(iids);
  }

  async getUserIdFromIID(iid) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Check both today's and yesterday's logs
    const dates = [today, yesterday];
    
    for (const date of dates) {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const filename = `${PIXELLOGGER_PREFIX}${year}-${month}-${day}.log`;

      try {
        if (!fs.existsSync(filename)) continue;

        const fileStream = fs.createReadStream(filename);
        const rl = readline.createInterface({
          input: fileStream,
        });

        for await (const line of rl) {
          const [timestamp, ip, uid, canvasId, x, y, z, color] = line.split(' ');
          if (getIPv6Subnet(ip) === iid) {
            return parseInt(uid, 10);
          }
        }
      } catch (err) {
        console.error(`Error reading log file ${filename}:`, err);
      }
    }

    return null;
  }

  extractDeviceId(iid) {
    // Extract device fingerprint from IID
    // Format: deviceId-timestamp-random
    const parts = iid.split('-');
    if (parts.length < 3) return null;
    
    // Validate timestamp part
    const timestamp = parseInt(parts[1], 10);
    if (Number.isNaN(timestamp) || timestamp < 0) return null;
    
    // Validate random part
    const random = parts[2];
    if (!/^[a-zA-Z0-9]{8,}$/.test(random)) return null;
    
    return parts[0];
  }

  async getRelatedUsers(userId, maxDepth = 2) {
    const visited = new Set();
    const related = new Map();
    
    const processUser = async (currentUserId, depth = 0) => {
      if (depth > maxDepth || visited.has(currentUserId)) return;
      visited.add(currentUserId);
      
      const userInfo = await this.getUserDevices(currentUserId);
      if (!userInfo) return;
      
      for (const account of userInfo.relatedAccounts) {
        if (!related.has(account.userId)) {
          related.set(account.userId, {
            ...account,
            depth,
            connectionPath: [currentUserId],
          });
        } else {
          const existing = related.get(account.userId);
          if (depth < existing.depth) {
            existing.depth = depth;
            existing.connectionPath = [currentUserId];
          }
        }
        
        await processUser(account.userId, depth + 1);
      }
    };
    
    await processUser(userId);
    return Array.from(related.values());
  }

  async getIPCluster(ip) {
    const users = new Map();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Check both today's and yesterday's logs
    const dates = [today, yesterday];
    
    for (const date of dates) {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const filename = `${PIXELLOGGER_PREFIX}${year}-${month}-${day}.log`;

      try {
        if (!fs.existsSync(filename)) continue;

        const fileStream = fs.createReadStream(filename);
        const rl = readline.createInterface({
          input: fileStream,
        });

        for await (const line of rl) {
          const [timestamp, ipFull, uid, canvasId, x, y, z, color] = line.split(' ');
          if (getIPv6Subnet(ipFull) === ip) {
            const userId = parseInt(uid, 10);
            const timestampNum = parseInt(timestamp, 10);

            if (!users.has(userId)) {
              users.set(userId, {
                userId,
                firstSeen: timestampNum,
                lastSeen: timestampNum,
                iids: new Set([ip]),
              });
            } else {
              const user = users.get(userId);
              user.iids.add(ip);
              if (timestampNum < user.firstSeen) user.firstSeen = timestampNum;
              if (timestampNum > user.lastSeen) user.lastSeen = timestampNum;
            }
          }
        }
      } catch (err) {
        console.error(`Error reading log file ${filename}:`, err);
      }
    }

    // Get user details
    const userDetails = await Promise.all(
      Array.from(users.values()).map(async (user) => {
        const regUser = await RegUser.findByPk(user.userId);
        return {
          ...user,
          username: regUser?.name || 'Unknown',
          iids: Array.from(user.iids),
        };
      })
    );

    return {
      ip,
      details: await ipIntelligence.getEnhancedIPInfo(ip),
      users: userDetails,
    };
  }
}

export default new UserCorrelationService(); 