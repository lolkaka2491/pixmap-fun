/*
 * User Tracking System
 * Populates UserFlagHistory, UserIIDHistory, and BanHistory tables
 */

import { query } from '../data/sql/database';
import logger from './logger';
import hardwareDetection from './HardwareDetection';

class UserTrackingService {
  /**
   * Track user IID when they login
   * @param {number} userId - User ID
   * @param {string} iid - Device fingerprint
   * @param {string} country - Country code
   */
  async trackUserIID(userId, iid, country = null) {
    try {
      await query(`
        INSERT INTO UserIIDHistory (userId, iid, country, firstSeen, lastSeen, loginCount, isCurrent)
        VALUES (?, ?, ?, NOW(), NOW(), 1, 1)
        ON DUPLICATE KEY UPDATE
          lastSeen = NOW(),
          loginCount = loginCount + 1,
          isCurrent = 1,
          country = COALESCE(?, country)
      `, [userId, iid, country, country]);

      // Mark other IIDs as not current for this user
      await query(`
        UPDATE UserIIDHistory 
        SET isCurrent = 0 
        WHERE userId = ? AND iid != ?
      `, [userId, iid]);

      logger.info(`UserTracking: Updated IID history for user ${userId}, iid ${iid}`);
    } catch (error) {
      logger.error(`Error tracking user IID: ${error.message}`);
    }
  }

  /**
   * Track user flag changes
   * @param {number} userId - User ID
   * @param {string} newFlag - New flag/country code
   * @param {string} oldFlag - Previous flag (optional)
   */
  async trackUserFlag(userId, newFlag, oldFlag = null) {
    try {
      if (!newFlag || newFlag === 'xx') return; // Skip default flags

      await query(`
        INSERT INTO UserFlagHistory (userId, flag, firstSeen, lastSeen, occurrenceCount)
        VALUES (?, ?, NOW(), NOW(), 1)
        ON DUPLICATE KEY UPDATE
          lastSeen = NOW(),
          occurrenceCount = occurrenceCount + 1
      `, [userId, newFlag]);

      logger.info(`UserTracking: Updated flag history for user ${userId}, flag ${newFlag}`);
    } catch (error) {
      logger.error(`Error tracking user flag: ${error.message}`);
    }
  }

  /**
   * Track ban events
   * @param {Object} banData - Ban information
   */
  async trackBan(banData) {
    try {
      const {
        userId = null,
        ip = null,
        iid = null,
        banType = 'user',
        reason,
        startDate = new Date(),
        initialDuration = null,
        actualEnd = null,
        automatic = false,
        moderatorId = null,
        moderatorName = null
      } = banData;

      const effectiveDuration = actualEnd && startDate 
        ? Math.floor((new Date(actualEnd) - new Date(startDate)) / (1000 * 60)) // minutes
        : null;

      await query(`
        INSERT INTO BanHistory (
          userId, ip, iid, banType, reason, startDate, initialDuration,
          actualEnd, effectiveDuration, automatic, moderator_id, moderator_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId, ip, iid, banType, reason, startDate, initialDuration,
        actualEnd, effectiveDuration, automatic, moderatorId, moderatorName
      ]);

      logger.info(`UserTracking: Recorded ban history for ${banType} ${userId || ip || iid}`);
    } catch (error) {
      logger.error(`Error tracking ban: ${error.message}`);
    }
  }

  /**
   * Track user hardware fingerprint
   * @param {number} userId - User ID
   * @param {Object} req - Express request object
   * @param {string} ip - User's IP address
   * @param {string} country - Country code
   */
  async trackUserHardware(userId, req, ip, country = null) {
    try {
      // Collect hardware fingerprint
      const hardwareHash = await hardwareDetection.collectHardwareFingerprint(req, userId, ip, country);
      
      if (hardwareHash) {
        logger.info(`UserTracking: Hardware fingerprint collected for user ${userId}: ${hardwareHash}`);
      }
      
      return hardwareHash;
    } catch (error) {
      logger.error(`Error tracking user hardware: ${error.message}`);
      return null;
    }
  }

  /**
   * Populate tracking tables from existing data
   */
  async populateFromExistingData() {
    try {
      logger.info('UserTracking: Starting population from existing data...');

      // Populate UserIIDHistory from LoginLogs
      await query(`
        INSERT IGNORE INTO UserIIDHistory (userId, iid, country, firstSeen, lastSeen, loginCount, isCurrent)
        SELECT 
          userId,
          iid,
          flag as country,
          MIN(createdAt) as firstSeen,
          MAX(createdAt) as lastSeen,
          COUNT(*) as loginCount,
          0 as isCurrent
        FROM LoginLogs 
        WHERE iid IS NOT NULL
        GROUP BY userId, iid
      `);

      // Mark the most recent IID as current for each user
      await query(`
        UPDATE UserIIDHistory uih1 
        SET isCurrent = 1 
        WHERE lastSeen = (
          SELECT MAX(lastSeen) 
          FROM (SELECT * FROM UserIIDHistory) uih2 
          WHERE uih2.userId = uih1.userId
        )
      `);

      // Populate UserFlagHistory from current Users table
      await query(`
        INSERT IGNORE INTO UserFlagHistory (userId, flag, firstSeen, lastSeen, occurrenceCount)
        SELECT 
          id as userId,
          flag,
          createdAt as firstSeen,
          COALESCE(lastLogIn, createdAt) as lastSeen,
          1 as occurrenceCount
        FROM Users 
        WHERE flag IS NOT NULL AND flag != 'xx'
      `);

      // Populate BanHistory from existing ban data in Users table
      await query(`
        INSERT IGNORE INTO BanHistory (
          userId, banType, reason, startDate, actualEnd, automatic, moderator_id
        )
        SELECT 
          id as userId,
          'user' as banType,
          ban_reason as reason,
          COALESCE(ban_date, createdAt) as startDate,
          ban_expiration as actualEnd,
          CASE WHEN moderator IS NULL THEN 1 ELSE 0 END as automatic,
          moderator as moderator_id
        FROM Users 
        WHERE banned = 1 AND ban_reason IS NOT NULL
      `);

      // Populate BanHistory from IP bans
      await query(`
        INSERT IGNORE INTO BanHistory (
          ip, banType, reason, startDate, actualEnd, automatic, moderator_id
        )
        SELECT 
          ip,
          'ip' as banType,
          reason,
          createdAt as startDate,
          expires as actualEnd,
          0 as automatic,
          muid as moderator_id
        FROM Bans
      `);

      // Populate basic hardware data from existing LoginLogs
      await query(`
        INSERT IGNORE INTO UserHardwareHistory (
          userId, hardware_fingerprint, user_agent, ip_address, country, 
          firstSeen, lastSeen, loginCount, isCurrent
        )
        SELECT 
          userId,
          SHA2(CONCAT(COALESCE(userAgent, ''), COALESCE(flag, 'xx'), COALESCE(iid, '')), 256) as hardware_fingerprint,
          userAgent,
          ipSubnet as ip_address,
          flag as country,
          MIN(createdAt) as firstSeen,
          MAX(createdAt) as lastSeen,
          COUNT(*) as loginCount,
          0 as isCurrent
        FROM LoginLogs 
        WHERE iid IS NOT NULL AND userAgent IS NOT NULL
        GROUP BY userId, SHA2(CONCAT(COALESCE(userAgent, ''), COALESCE(flag, 'xx'), COALESCE(iid, ''), 256)), userAgent, ipSubnet, flag
      `);

      // Mark the most recent hardware as current for each user
      await query(`
        UPDATE UserHardwareHistory uhh1 
        SET isCurrent = 1 
        WHERE lastSeen = (
          SELECT MAX(lastSeen) 
          FROM (SELECT * FROM UserHardwareHistory) uhh2 
          WHERE uhh2.userId = uhh1.userId
        )
      `);

      logger.info('UserTracking: Completed population from existing data');
    } catch (error) {
      logger.error(`Error populating from existing data: ${error.message}`);
    }
  }

  /**
   * Get tracking statistics
   */
  async getTrackingStats() {
    try {
      const flagCount = await query('SELECT COUNT(*) as count FROM UserFlagHistory');
      const iidCount = await query('SELECT COUNT(*) as count FROM UserIIDHistory');
      const banCount = await query('SELECT COUNT(*) as count FROM BanHistory');
      const userCount = await query('SELECT COUNT(*) as count FROM Users');
      const loginLogCount = await query('SELECT COUNT(*) as count FROM LoginLogs');

      return {
        userCount: userCount && userCount.length > 0 ? userCount[0].count : 0,
        loginLogCount: loginLogCount && loginLogCount.length > 0 ? loginLogCount[0].count : 0,
        flagHistoryCount: flagCount && flagCount.length > 0 ? flagCount[0].count : 0,
        iidHistoryCount: iidCount && iidCount.length > 0 ? iidCount[0].count : 0,
        banHistoryCount: banCount && banCount.length > 0 ? banCount[0].count : 0
      };
    } catch (error) {
      logger.error(`Error getting tracking stats: ${error.message}`);
      return {
        userCount: 0,
        loginLogCount: 0,
        flagHistoryCount: 0,
        iidHistoryCount: 0,
        banHistoryCount: 0
      };
    }
  }
}

export default new UserTrackingService();
