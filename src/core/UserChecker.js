/*
 * Comprehensive User Checking System
 * Entry point: User ID
 * Provides complete visibility into user behavior, flags, IIDs, bans, and IPs
 */

import { query } from '../data/sql/database';
import { RegUser } from '../data/sql';
import userCorrelation from './UserCorrelation';
import ipIntelligence from './IPIntelligence';
import hardwareDetection from './HardwareDetection';

class UserCheckerService {
  /**
   * Main entry point - get comprehensive user information by user ID
   * @param {number} userId - The user ID to check
   * @param {boolean} includeIPs - Include IP information (admin only)
   * @returns {Object} Complete user information
   */
  async getCompleteUserInfo(userId, includeIPs = false) {
    try {
      const userInfo = await this.getBasicUserInfo(userId);
      if (!userInfo) {
        return { error: 'User not found' };
      }

      const [
        flagHistory,
        iidHistory,
        banHistory,
        ipData,
        proxyInfo,
        correlationData,
        hardwareData
      ] = await Promise.all([
        this.getUserFlagHistory(userId),
        this.getUserIIDHistory(userId),
        this.getComprehensiveBanHistory(userId),
        includeIPs ? this.getUserIPHistory(userId) : null,
        includeIPs ? this.getUserProxyDetectionHistory(userId) : null,
        this.getUserCorrelationData(userId),
        this.getUserHardwareInfo(userId)
      ]);

      return {
        userInfo,
        flagHistory,
        iidHistory,
        banHistory,
        ipData: includeIPs ? ipData : { message: 'IP data restricted to admins' },
        proxyInfo: includeIPs ? proxyInfo : { message: 'Proxy data restricted to admins' },
        correlationData,
        hardwareData: includeIPs ? hardwareData : { message: 'Hardware data restricted to admins' },
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error in getCompleteUserInfo:', error);
      return { error: `Failed to get user info: ${error.message}` };
    }
  }

  /**
   * Get basic user information
   */
  async getBasicUserInfo(userId) {
    const result = await query(`
      SELECT 
        id, name, email, flag, roles, verified, blocks, discordid, redditid,
        lastLogIn, createdAt, bio, banned, ban_expiration, ban_reason, 
        ban_date, moderator, isVIP, vipExpiry
      FROM Users 
      WHERE id = ?
    `, [userId]);

    return result.length > 0 ? result[0] : null;
  }

  /**
   * Get comprehensive flag history with first/last seen timestamps
   */
  async getUserFlagHistory(userId) {
    const flagHistory = await query(`
      SELECT 
        flag,
        firstSeen,
        lastSeen,
        occurrenceCount,
        TIMESTAMPDIFF(DAY, firstSeen, COALESCE(lastSeen, NOW())) as daysActive
      FROM UserFlagHistory 
      WHERE userId = ?
      ORDER BY firstSeen DESC
    `, [userId]);

    // Get current flag from Users table
    const currentFlag = await query(`
      SELECT flag 
      FROM Users 
      WHERE id = ?
    `, [userId]);

    return {
      currentFlag: currentFlag.length > 0 ? currentFlag[0].flag : 'xx',
      history: flagHistory,
      totalFlags: flagHistory.length,
      flagSummary: this.summarizeFlagData(flagHistory)
    };
  }

  /**
   * Get comprehensive IID history with first/last seen timestamps
   */
  async getUserIIDHistory(userId) {
    const iidHistory = await query(`
      SELECT 
        iid,
        country,
        firstSeen,
        lastSeen,
        loginCount,
        isCurrent,
        TIMESTAMPDIFF(DAY, firstSeen, COALESCE(lastSeen, NOW())) as daysActive
      FROM UserIIDHistory 
      WHERE userId = ?
      ORDER BY lastSeen DESC
    `, [userId]);

    return {
      history: iidHistory,
      totalIIDs: iidHistory.length,
      currentIIDs: iidHistory.filter(h => h.isCurrent),
      iidSummary: this.summarizeIIDData(iidHistory)
    };
  }

  /**
   * Get comprehensive ban history
   */
  async getComprehensiveBanHistory(userId) {
    const banHistory = await query(`
      SELECT 
        bh.id,
        bh.userId,
        bh.ip,
        bh.iid,
        bh.banType,
        bh.reason,
        bh.startDate,
        bh.initialDuration,
        bh.actualEnd,
        bh.effectiveDuration,
        bh.automatic,
        bh.moderator_id,
        bh.moderator_name,
        CASE 
          WHEN bh.actualEnd IS NULL AND bh.initialDuration IS NOT NULL THEN 'Active'
          WHEN bh.actualEnd IS NULL AND bh.initialDuration IS NULL THEN 'Permanent'
          WHEN bh.actualEnd <= NOW() THEN 'Expired'
          ELSE 'Ended'
        END as status
      FROM BanHistory bh
      WHERE bh.userId = ?
      ORDER BY bh.startDate DESC
    `, [userId]);

    return {
      history: banHistory,
      totalBans: banHistory.length,
      activeBans: banHistory.filter(b => b.status === 'Active' || b.status === 'Permanent'),
      banSummary: this.summarizeBanData(banHistory)
    };
  }

  /**
   * Get user IP history with first/last seen timestamps (admin only)
   */
  async getUserIPHistory(userId) {
    try {
      // Get IPs from UserIIDHistory and cross-reference with IPInfos
      const ipHistory = await query(`
        SELECT DISTINCT
          ii.ip,
          ii.country,
          ii.org,
          ii.descr,
          ii.asn,
          ii.proxy,
          ii.pcheck,
          ii.createdAt as firstSeen,
          ii.updatedAt as lastSeen,
          COALESCE(intel.threatLevel, 'low') as threatLevel,
          COALESCE(intel.confidence, 0) as proxyConfidence
        FROM UserIIDHistory uih
        JOIN IPInfos ii ON ii.uuid = (
          SELECT uuid FROM IPInfos WHERE ip = (
            SELECT ip FROM IPInfos WHERE uuid = SUBSTRING_INDEX(uih.iid, '-', 1)
          ) LIMIT 1
        )
        LEFT JOIN IPIntelligence intel ON intel.ipSubnet = ii.ip
        WHERE uih.userId = ?
        ORDER BY ii.updatedAt DESC
      `, [userId]);

      return {
        history: ipHistory,
        totalIPs: ipHistory.length,
        proxyIPs: ipHistory.filter(ip => ip.proxy > 0),
        highThreatIPs: ipHistory.filter(ip => ip.threatLevel === 'high'),
        ipSummary: this.summarizeIPData(ipHistory)
      };
    } catch (error) {
      console.error('Error getting IP history:', error);
      return { error: 'Failed to retrieve IP history' };
    }
  }

  /**
   * Get proxy detection history for user (admin only)
   */
  async getUserProxyDetectionHistory(userId) {
    const proxyHistory = await query(`
      SELECT 
        ipSubnet,
        proxyType,
        confidence,
        detectionData,
        firstDetected,
        lastDetected,
        detectionCount
      FROM ProxyDetectionLog 
      WHERE userId = ?
      ORDER BY lastDetected DESC
    `, [userId]);

    return {
      history: proxyHistory,
      totalDetections: proxyHistory.length,
      uniqueProxyTypes: [...new Set(proxyHistory.map(p => p.proxyType))],
      proxySummary: this.summarizeProxyData(proxyHistory)
    };
  }

  /**
   * Get user correlation data using existing UserCorrelation service
   */
  async getUserCorrelationData(userId) {
    try {
      const devices = await userCorrelation.getUserDevices(userId);
      return {
        devices: devices || {},
        relatedAccounts: devices?.accountLinks ? Array.from(devices.accountLinks.values()) : [],
        correlationSummary: this.summarizeCorrelationData(devices)
      };
    } catch (error) {
      console.error('Error getting correlation data:', error);
      return { error: 'Failed to retrieve correlation data' };
    }
  }

  /**
   * Summarize flag data for quick analysis
   */
  summarizeFlagData(flagHistory) {
    const countries = [...new Set(flagHistory.map(f => f.flag))];
    const recentFlags = flagHistory.filter(f => 
      new Date() - new Date(f.lastSeen) < 30 * 24 * 60 * 60 * 1000 // Last 30 days
    );

    return {
      uniqueCountries: countries.length,
      recentlyActiveFlags: recentFlags.length,
      mostUsedFlag: this.getMostFrequent(flagHistory, 'flag'),
      flagChanges: flagHistory.length > 1,
      suspiciousActivity: countries.length > 5 // More than 5 countries might be suspicious
    };
  }

  /**
   * Summarize IID data for quick analysis
   */
  summarizeIIDData(iidHistory) {
    const countries = [...new Set(iidHistory.map(i => i.country).filter(Boolean))];
    const recentIIDs = iidHistory.filter(i => 
      new Date() - new Date(i.lastSeen) < 7 * 24 * 60 * 60 * 1000 // Last 7 days
    );

    return {
      uniqueCountries: countries.length,
      recentlyActiveIIDs: recentIIDs.length,
      totalLogins: iidHistory.reduce((sum, i) => sum + (i.loginCount || 0), 0),
      deviceSwitching: iidHistory.length > 3,
      suspiciousActivity: recentIIDs.length > 2 // Multiple recent IIDs might indicate IP reset/VPN
    };
  }

  /**
   * Summarize ban data for quick analysis
   */
  summarizeBanData(banHistory) {
    const automaticBans = banHistory.filter(b => b.automatic);
    const manualBans = banHistory.filter(b => !b.automatic);
    const recentBans = banHistory.filter(b => 
      new Date() - new Date(b.startDate) < 30 * 24 * 60 * 60 * 1000 // Last 30 days
    );

    return {
      automaticBans: automaticBans.length,
      manualBans: manualBans.length,
      recentBans: recentBans.length,
      banTypes: [...new Set(banHistory.map(b => b.banType))],
      averageDuration: this.calculateAverageBanDuration(banHistory),
      recurringOffender: banHistory.length > 2
    };
  }

  /**
   * Summarize IP data for quick analysis
   */
  summarizeIPData(ipHistory) {
    const proxyIPs = ipHistory.filter(ip => ip.proxy > 0);
    const countries = [...new Set(ipHistory.map(ip => ip.country).filter(Boolean))];
    const organizations = [...new Set(ipHistory.map(ip => ip.org).filter(Boolean))];

    return {
      uniqueCountries: countries.length,
      uniqueOrganizations: organizations.length,
      proxyDetections: proxyIPs.length,
      proxyPercentage: ipHistory.length > 0 ? (proxyIPs.length / ipHistory.length * 100).toFixed(1) : 0,
      suspiciousActivity: proxyIPs.length > 0 || countries.length > 3
    };
  }

  /**
   * Summarize proxy detection data
   */
  summarizeProxyData(proxyHistory) {
    const proxyTypes = [...new Set(proxyHistory.map(p => p.proxyType).filter(t => t !== 'none'))];
    const highConfidence = proxyHistory.filter(p => p.confidence > 80);

    return {
      uniqueProxyTypes: proxyTypes.length,
      highConfidenceDetections: highConfidence.length,
      totalDetections: proxyHistory.reduce((sum, p) => sum + (p.detectionCount || 0), 0),
      proxyUser: proxyTypes.length > 0
    };
  }

  /**
   * Summarize correlation data
   */
  summarizeCorrelationData(devices) {
    if (!devices || !devices.devices) return { error: 'No correlation data available' };

    const deviceCount = devices.devices.size || 0;
    const relatedAccounts = devices.accountLinks ? devices.accountLinks.size : 0;

    return {
      uniqueDevices: deviceCount,
      relatedAccounts: relatedAccounts,
      multiAccounting: relatedAccounts > 0,
      deviceSharing: deviceCount > 0 && relatedAccounts > 0
    };
  }

  /**
   * Helper function to get most frequent value from array of objects
   */
  getMostFrequent(array, key) {
    const frequency = {};
    array.forEach(item => {
      const value = item[key];
      frequency[value] = (frequency[value] || 0) + 1;
    });

    return Object.keys(frequency).reduce((a, b) => 
      frequency[a] > frequency[b] ? a : b, null
    );
  }

  /**
   * Helper function to calculate average ban duration
   */
  calculateAverageBanDuration(banHistory) {
    const banDurations = banHistory
      .filter(b => b.effectiveDuration)
      .map(b => b.effectiveDuration);

    if (banDurations.length === 0) return 0;

    const total = banDurations.reduce((sum, duration) => sum + duration, 0);
    return Math.round(total / banDurations.length);
  }

  /**
   * Risk assessment based on all collected data
   */
  async getRiskAssessment(userId, includeIPs = false) {
    const userInfo = await this.getCompleteUserInfo(userId, includeIPs);
    if (userInfo.error) return userInfo;

    const riskFactors = [];
    let riskScore = 0;

    // Flag-based risk factors
    if (userInfo.flagHistory.flagSummary.suspiciousActivity) {
      riskFactors.push('Multiple country flags (5+)');
      riskScore += 20;
    }

    // IID-based risk factors
    if (userInfo.iidHistory.iidSummary.suspiciousActivity) {
      riskFactors.push('Multiple recent IID changes');
      riskScore += 30;
    }

    // Ban history risk factors
    if (userInfo.banHistory.banSummary.recurringOffender) {
      riskFactors.push('Recurring offender (3+ bans)');
      riskScore += 40;
    }

    if (userInfo.banHistory.banSummary.recentBans > 0) {
      riskFactors.push('Recent ban activity');
      riskScore += 25;
    }

    // IP-based risk factors (if available)
    if (includeIPs && userInfo.ipData && !userInfo.ipData.error) {
      if (userInfo.ipData.ipSummary.suspiciousActivity) {
        riskFactors.push('Proxy/VPN usage detected');
        riskScore += 35;
      }
    }

    // Correlation-based risk factors
    if (userInfo.correlationData.correlationSummary.multiAccounting) {
      riskFactors.push('Potential multi-accounting');
      riskScore += 45;
    }

    // Determine risk level
    let riskLevel;
    if (riskScore >= 80) riskLevel = 'HIGH';
    else if (riskScore >= 40) riskLevel = 'MEDIUM';
    else if (riskScore >= 20) riskLevel = 'LOW';
    else riskLevel = 'MINIMAL';

    return {
      riskLevel,
      riskScore,
      riskFactors,
      recommendation: this.getRiskRecommendation(riskLevel, riskFactors)
    };
  }

  /**
   * Get recommendation based on risk assessment
   */
  getRiskRecommendation(riskLevel, riskFactors) {
    switch (riskLevel) {
      case 'HIGH':
        return 'Immediate attention required. Consider temporary restrictions and thorough investigation.';
      case 'MEDIUM':
        return 'Enhanced monitoring recommended. Review recent activity and patterns.';
      case 'LOW':
        return 'Standard monitoring. Minor flags detected but not immediately concerning.';
      default:
        return 'Normal user profile. Standard monitoring protocols apply.';
    }
  }

  /**
   * Get comprehensive hardware information for a user
   */
  async getUserHardwareInfo(userId) {
    try {
      return await hardwareDetection.getUserHardwareInfo(userId);
    } catch (error) {
      console.error('Error getting user hardware info:', error);
      return { error: `Failed to get hardware info: ${error.message}` };
    }
  }

  /**
   * Get users by hardware fingerprint
   */
  async getUsersByHardware(hardwareHash) {
    try {
      return await hardwareDetection.getUsersByHardware(hardwareHash);
    } catch (error) {
      console.error('Error getting users by hardware:', error);
      return [];
    }
  }

  /**
   * Get suspicious hardware patterns
   */
  async getSuspiciousHardware(limit = 50) {
    try {
      return await hardwareDetection.getSuspiciousHardware(limit);
    } catch (error) {
      console.error('Error getting suspicious hardware:', error);
      return [];
    }
  }
}

export default new UserCheckerService();
