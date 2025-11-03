/*
 * Hardware Detection System
 * Collects and tracks hardware fingerprints to detect multiple accounts, VPNs, and IP resetting
 */

import { query } from '../data/sql/database';
import { RegUser } from '../data/sql';
import crypto from 'crypto';
import logger from './logger';

class HardwareDetectionService {
  constructor() {
    this.suspiciousThresholds = {
      multipleUsersPerHardware: 3,
      rapidIPChanges: 5, // within 24 hours
      vpnConfidence: 0.8,
      proxyConfidence: 0.7
    };
  }

  /**
   * Generate hardware fingerprint hash from collected data
   */
  generateHardwareHash(hardwareData) {
    const dataString = JSON.stringify(hardwareData);
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Collect comprehensive hardware fingerprint from client
   */
  async collectHardwareFingerprint(req, userId, ip, country) {
    try {
      const userAgent = req.headers['user-agent'] || '';
      const acceptLanguage = req.headers['accept-language'] || '';
      const acceptEncoding = req.headers['accept-encoding'] || '';
      const secChUa = req.headers['sec-ch-ua'] || '';
      const secChUaPlatform = req.headers['sec-ch-ua-platform'] || '';
      const secChUaMobile = req.headers['sec-ch-ua-mobile'] || '';
      
      // Extract additional headers that can help with fingerprinting
      const dnt = req.headers['dnt'] || '0';
      const upgradeInsecureRequests = req.headers['upgrade-insecure-requests'] || '0';
      const secFetchDest = req.headers['sec-fetch-dest'] || '';
      const secFetchMode = req.headers['sec-fetch-mode'] || '';
      const secFetchSite = req.headers['sec-fetch-site'] || '';
      
      // Additional detailed headers
      const secChUaArch = req.headers['sec-ch-ua-arch'] || '';
      const secChUaBitness = req.headers['sec-ch-ua-bitness'] || '';
      const secChUaFullVersion = req.headers['sec-ch-ua-full-version'] || '';
      const secChUaFullVersionList = req.headers['sec-ch-ua-full-version-list'] || '';
      const secChUaModel = req.headers['sec-ch-ua-model'] || '';
      const secChUaWoW64 = req.headers['sec-ch-ua-wow64'] || '';
      
      // Connection and performance headers
      const accept = req.headers['accept'] || '';
      const acceptCharset = req.headers['accept-charset'] || '';
      const cacheControl = req.headers['cache-control'] || '';
      const connection = req.headers['connection'] || '';
      const host = req.headers['host'] || '';
      const origin = req.headers['origin'] || '';
      const referer = req.headers['referer'] || '';
      const secGpc = req.headers['sec-gpc'] || '';
      const te = req.headers['te'] || '';
      const upgrade = req.headers['upgrade'] || '';
      const via = req.headers['via'] || '';
      const xForwardedFor = req.headers['x-forwarded-for'] || '';
      const xForwardedProto = req.headers['x-forwarded-proto'] || '';
      const xRealIp = req.headers['x-real-ip'] || '';

      // Create comprehensive hardware fingerprint object
      const hardwareData = {
        // Basic browser info
        userAgent: userAgent,
        acceptLanguage: acceptLanguage,
        acceptEncoding: acceptEncoding,
        accept: accept,
        acceptCharset: acceptCharset,
        
        // Security headers
        secChUa: secChUa,
        secChUaPlatform: secChUaPlatform,
        secChUaMobile: secChUaMobile,
        secChUaArch: secChUaArch,
        secChUaBitness: secChUaBitness,
        secChUaFullVersion: secChUaFullVersion,
        secChUaFullVersionList: secChUaFullVersionList,
        secChUaModel: secChUaModel,
        secChUaWoW64: secChUaWoW64,
        
        // Privacy and security
        dnt: dnt,
        secGpc: secGpc,
        upgradeInsecureRequests: upgradeInsecureRequests,
        
        // Fetch metadata
        secFetchDest: secFetchDest,
        secFetchMode: secFetchMode,
        secFetchSite: secFetchSite,
        
        // Connection info
        connection: connection,
        upgrade: upgrade,
        te: te,
        via: via,
        
        // Proxy and forwarding
        xForwardedFor: xForwardedFor,
        xForwardedProto: xForwardedProto,
        xRealIp: xRealIp,
        
        // Request context
        host: host,
        origin: origin,
        referer: referer,
        cacheControl: cacheControl,
        
        // Network info
        ip: ip,
        country: country,
        timestamp: new Date().toISOString()
      };

      // Generate hardware hash
      const hardwareHash = this.generateHardwareHash(hardwareData);

      // Store hardware fingerprint in Users table
      await this.updateUserHardwareFingerprint(userId, hardwareHash);

      // Track hardware history
      await this.trackHardwareHistory(userId, hardwareHash, hardwareData, ip, country);

      // Check for suspicious patterns
      await this.analyzeSuspiciousPatterns(hardwareHash, userId, ip, country);

      return hardwareHash;
    } catch (error) {
      logger.error(`Error collecting hardware fingerprint: ${error.message}`);
      return null;
    }
  }

  /**
   * Update hardware fingerprint in Users table
   */
  async updateUserHardwareFingerprint(userId, hardwareHash) {
    try {
      await query(`
        UPDATE Users 
        SET hardware_fingerprint = ? 
        WHERE id = ?
      `, [hardwareHash, userId]);
    } catch (error) {
      logger.error(`Error updating user hardware fingerprint: ${error.message}`);
    }
  }

  /**
   * Track hardware history
   */
  async trackHardwareHistory(userId, hardwareHash, hardwareData, ip, country) {
    try {
      // Check if this hardware is already tracked for this user
      const existing = await query(`
        SELECT id, loginCount FROM UserHardwareHistory 
        WHERE userId = ? AND hardware_fingerprint = ?
      `, [userId, hardwareHash]);

      if (existing.length > 0) {
        // Update existing record
        await query(`
          UPDATE UserHardwareHistory 
          SET lastSeen = NOW(), 
              loginCount = loginCount + 1,
              ip_address = ?,
              country = ?
          WHERE id = ?
        `, [ip, country, existing[0].id]);
      } else {
        // Create new record
        await query(`
          INSERT INTO UserHardwareHistory (
            userId, hardware_fingerprint, user_agent, ip_address, country,
            firstSeen, lastSeen, loginCount, isCurrent
          ) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), 1, 1)
        `, [userId, hardwareHash, hardwareData.userAgent, ip, country]);

        // Mark other hardware as not current for this user
        await query(`
          UPDATE UserHardwareHistory 
          SET isCurrent = 0 
          WHERE userId = ? AND hardware_fingerprint != ?
        `, [userId, hardwareHash]);
      }

      // Update hardware correlation
      await this.updateHardwareCorrelation(hardwareHash, userId);
    } catch (error) {
      logger.error(`Error tracking hardware history: ${error.message}`);
    }
  }

  /**
   * Update hardware correlation data
   */
  async updateHardwareCorrelation(hardwareHash, userId) {
    try {
      const existing = await query(`
        SELECT id, user_count, total_logins FROM HardwareCorrelation 
        WHERE hardware_hash = ?
      `, [hardwareHash]);

      if (existing.length > 0) {
        // Check if this user is already counted
        const userExists = await query(`
          SELECT id FROM UserHardwareHistory 
          WHERE hardware_hash = ? AND userId = ?
        `, [hardwareHash, userId]);

        if (userExists.length === 0) {
          // New user for this hardware
          await query(`
            UPDATE HardwareCorrelation 
            SET user_count = user_count + 1,
                last_seen = NOW(),
                total_logins = total_logins + 1
            WHERE hardware_hash = ?
          `, [hardwareHash]);
        } else {
          // Existing user, just update login count
          await query(`
            UPDATE HardwareCorrelation 
            SET total_logins = total_logins + 1,
                last_seen = NOW()
            WHERE hardware_hash = ?
          `, [hardwareHash]);
        }
      } else {
        // First time seeing this hardware
        await query(`
          INSERT INTO HardwareCorrelation (
            hardware_hash, user_count, total_logins, first_seen, last_seen
          ) VALUES (?, 1, 1, NOW(), NOW())
        `, [hardwareHash]);
      }
    } catch (error) {
      logger.error(`Error updating hardware correlation: ${error.message}`);
    }
  }

  /**
   * Analyze suspicious patterns
   */
  async analyzeSuspiciousPatterns(hardwareHash, userId, ip, country) {
    try {
      // Check for multiple users per hardware
      const multipleUsers = await query(`
        SELECT user_count FROM HardwareCorrelation 
        WHERE hardware_hash = ?
      `, [hardwareHash]);

      if (multipleUsers.length > 0 && multipleUsers[0].user_count >= this.suspiciousThresholds.multipleUsersPerHardware) {
        logger.warn(`Suspicious: Hardware ${hardwareHash} used by ${multipleUsers[0].user_count} users`);
        
        // Update suspicious score
        await query(`
          UPDATE HardwareCorrelation 
          SET suspicious_score = suspicious_score + 10 
          WHERE hardware_hash = ?
        `, [hardwareHash]);
      }

      // Check for rapid IP changes
      const rapidIPChanges = await query(`
        SELECT COUNT(DISTINCT ip_address) as ip_count 
        FROM UserHardwareHistory 
        WHERE userId = ? 
        AND lastSeen >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      `, [userId]);

      if (rapidIPChanges.length > 0 && rapidIPChanges[0].ip_count >= this.suspiciousThresholds.rapidIPChanges) {
        logger.warn(`Suspicious: User ${userId} changed IP ${rapidIPChanges[0].ip_count} times in 24 hours`);
      }

      // Check for VPN/Proxy patterns
      await this.detectVPNProxy(ip, userId, hardwareHash, country);

    } catch (error) {
      logger.error(`Error analyzing suspicious patterns: ${error.message}`);
    }
  }

  /**
   * Detect VPN/Proxy usage
   */
  async detectVPNProxy(ip, userId, hardwareHash, country) {
    try {
      // Check if IP is already in VPN/Proxy log
      const existing = await query(`
        SELECT detection_type, confidence_score, detection_count 
        FROM VPNProxyLog 
        WHERE ip_address = ?
      `, [ip]);

      if (existing.length > 0) {
        // Update existing detection
        await query(`
          UPDATE VPNProxyLog 
          SET last_detected = NOW(),
              detection_count = detection_count + 1,
              user_id = COALESCE(user_id, ?),
              hardware_hash = COALESCE(hardware_hash, ?)
          WHERE ip_address = ?
        `, [userId, hardwareHash, ip]);

        // Mark hardware as suspicious if VPN/Proxy detected
        if (existing[0].confidence_score >= this.suspiciousThresholds.vpnConfidence) {
          await query(`
            UPDATE UserHardwareHistory 
            SET vpn_detected = 1 
            WHERE hardware_fingerprint = ? AND ip_address = ?
          `, [hardwareHash, ip]);
        }

        if (existing[0].confidence_score >= this.suspiciousThresholds.proxyConfidence) {
          await query(`
            UPDATE UserHardwareHistory 
            SET proxy_detected = 1 
            WHERE hardware_fingerprint = ? AND ip_address = ?
          `, [hardwareHash, ip]);
        }
      } else {
        // Enhanced VPN/Proxy detection based on multiple factors
        const detectionResult = await this.analyzeIPForVPNProxy(ip, country);
        
        if (detectionResult.isSuspicious) {
          await query(`
            INSERT INTO VPNProxyLog (
              ip_address, user_id, hardware_hash, detection_type, 
              confidence_score, country_code, provider_name, first_detected, last_detected
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
          `, [ip, userId, hardwareHash, detectionResult.type, detectionResult.confidence, country, detectionResult.provider]);
          
          // Mark hardware as suspicious
          if (detectionResult.confidence >= this.suspiciousThresholds.proxyConfidence) {
            await query(`
              UPDATE UserHardwareHistory 
              SET proxy_detected = 1 
              WHERE hardware_fingerprint = ? AND ip_address = ?
            `, [hardwareHash, ip]);
          }
          
          if (detectionResult.confidence >= this.suspiciousThresholds.vpnConfidence) {
            await query(`
              UPDATE UserHardwareHistory 
              SET vpn_detected = 1 
              WHERE hardware_fingerprint = ? AND ip_address = ?
            `, [hardwareHash, ip]);
          }
        }
      }
    } catch (error) {
      logger.error(`Error detecting VPN/Proxy: ${error.message}`);
    }
  }

  /**
   * Enhanced IP analysis for VPN/Proxy detection
   */
  async analyzeIPForVPNProxy(ip, country) {
    try {
      // Check for known datacenter/VPN ranges
      const isDatacenter = this.isDatacenterIP(ip);
      const isVPNRange = this.isVPNRange(ip);
      const isProxyRange = this.isProxyRange(ip);
      const isTorExit = await this.isTorExitNode(ip);
      
      let confidence = 0;
      let type = 'proxy';
      let provider = 'Unknown';
      
      // Datacenter detection
      if (isDatacenter) {
        confidence += 0.3;
        type = 'datacenter';
        provider = 'Datacenter';
      }
      
      // VPN range detection
      if (isVPNRange) {
        confidence += 0.4;
        type = 'vpn';
        provider = 'VPN Provider';
      }
      
      // Proxy range detection
      if (isProxyRange) {
        confidence += 0.35;
        type = 'proxy';
        provider = 'Proxy Service';
      }
      
      // Tor exit node
      if (isTorExit) {
        confidence += 0.8;
        type = 'tor';
        provider = 'Tor Network';
      }
      
      // Check for rapid IP changes (if we have user context)
      const rapidChanges = await this.checkRapidIPChanges(ip);
      if (rapidChanges) {
        confidence += 0.2;
      }
      
      // Check for suspicious patterns
      const suspiciousPatterns = this.checkSuspiciousPatterns(ip);
      if (suspiciousPatterns.length > 0) {
        confidence += 0.15;
      }
      
      return {
        isSuspicious: confidence >= 0.3,
        type,
        confidence: Math.min(confidence, 1.0),
        provider,
        patterns: suspiciousPatterns
      };
    } catch (error) {
      logger.error(`Error analyzing IP for VPN/Proxy: ${error.message}`);
      return { isSuspicious: false, type: 'unknown', confidence: 0, provider: 'Unknown' };
    }
  }

  /**
   * Check if IP is in known datacenter ranges
   */
  isDatacenterIP(ip) {
    // Known datacenter IP ranges
    const datacenterRanges = [
      /^10\./, // Private IP
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private IP
      /^192\.168\./, // Private IP
      /^127\./, // Loopback
      /^169\.254\./, // Link-local
      /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./, // Shared address space
      /^203\.0\.113\./, // Documentation
      /^198\.51\.100\./, // Documentation
      /^198\.18\./, // Device benchmark
      /^198\.19\./, // Device benchmark
    ];
    
    return datacenterRanges.some(range => range.test(ip));
  }

  /**
   * Check if IP is in known VPN ranges
   */
  isVPNRange(ip) {
    // Known VPN provider IP ranges (partial list)
    const vpnRanges = [
      /^103\.21\.244\./, // Cloudflare
      /^103\.22\.200\./, // Cloudflare
      /^104\.16\./, // Cloudflare
      /^141\.101\./, // Cloudflare
      /^162\.158\./, // Cloudflare
      /^172\.64\./, // Cloudflare
      /^172\.65\./, // Cloudflare
      /^188\.114\./, // Cloudflare
      /^190\.93\./, // Cloudflare
      /^199\.27\./, // Cloudflare
    ];
    
    return vpnRanges.some(range => range.test(ip));
  }

  /**
   * Check if IP is in known proxy ranges
   */
  isProxyRange(ip) {
    // Known proxy service IP ranges
    const proxyRanges = [
      /^45\.67\./, // Some proxy services
      /^185\.199\./, // GitHub Pages (often used as proxy)
      /^140\.82\./, // GitHub
      /^192\.30\./, // GitHub
      /^52\.192\./, // AWS (often used for proxies)
      /^54\.240\./, // AWS
      /^35\.180\./, // AWS
    ];
    
    return proxyRanges.some(range => range.test(ip));
  }

  /**
   * Check if IP is a Tor exit node
   */
  async isTorExitNode(ip) {
    try {
      // This would ideally call a Tor exit node API
      // For now, we'll check some known patterns
      const torPatterns = [
        /^176\.10\./, // Some Tor exit nodes
        /^185\.220\./, // Some Tor exit nodes
        /^195\.176\./, // Some Tor exit nodes
      ];
      
      return torPatterns.some(pattern => pattern.test(ip));
    } catch (error) {
      return false;
    }
  }

  /**
   * Check for rapid IP changes
   */
  async checkRapidIPChanges(ip) {
    try {
      // This would check if this IP has been used by multiple users recently
      // For now, return false
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check for suspicious IP patterns
   */
  checkSuspiciousPatterns(ip) {
    const patterns = [];
    
    // Check for sequential IPs
    const parts = ip.split('.');
    if (parts.length === 4) {
      const lastOctet = parseInt(parts[3]);
      if (lastOctet === 0 || lastOctet === 255) {
        patterns.push('Network/Broadcast address');
      }
    }
    
    // Check for known suspicious ranges
    if (ip.startsWith('0.') || ip.startsWith('255.')) {
      patterns.push('Reserved range');
    }
    
    return patterns;
  }



  /**
   * Get comprehensive hardware info for a user
   */
  async getUserHardwareInfo(userId) {
    try {
      const hardwareHistory = await query(`
        SELECT 
          h.*,
          TIMESTAMPDIFF(DAY, h.firstSeen, h.lastSeen) as daysActive,
          TIMESTAMPDIFF(HOUR, h.lastSeen, NOW()) as hoursSinceLastSeen
        FROM UserHardwareHistory h
        WHERE h.userId = ?
        ORDER BY h.lastSeen DESC
      `, [userId]);

      const currentHardware = await query(`
        SELECT hardware_fingerprint FROM Users WHERE id = ?
      `, [userId]);

      const hardwareCorrelations = await query(`
        SELECT 
          hc.hardware_hash,
          hc.user_count,
          hc.total_logins,
          hc.suspicious_score,
          hc.first_seen,
          hc.last_seen,
          COUNT(DISTINCT uhh.userId) as unique_users,
          GROUP_CONCAT(DISTINCT uhh.userId) as user_ids
        FROM HardwareCorrelation hc
        LEFT JOIN UserHardwareHistory uhh ON hc.hardware_hash = uhh.hardware_fingerprint
        WHERE hc.hardware_hash IN (
          SELECT hardware_fingerprint FROM UserHardwareHistory WHERE userId = ?
        )
        GROUP BY hc.hardware_hash, hc.user_count, hc.total_logins, hc.suspicious_score, hc.first_seen, hc.last_seen
        ORDER BY hc.suspicious_score DESC
      `, [userId]);

      const vpnProxyLogs = await query(`
        SELECT * FROM VPNProxyLog 
        WHERE user_id = ? OR hardware_hash IN (
          SELECT hardware_fingerprint FROM UserHardwareHistory WHERE userId = ?
        )
        ORDER BY last_detected DESC
      `, [userId, userId]);

      return {
        currentHardware: currentHardware.length > 0 ? currentHardware[0].hardware_fingerprint : null,
        hardwareHistory,
        hardwareCorrelations,
        vpnProxyLogs,
        summary: this.generateHardwareSummary(hardwareHistory, hardwareCorrelations, vpnProxyLogs)
      };
    } catch (error) {
      logger.error(`Error getting user hardware info: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Generate hardware summary
   */
  generateHardwareSummary(hardwareHistory, correlations, vpnLogs) {
    const totalHardware = hardwareHistory.length;
    const suspiciousHardware = correlations.filter(c => c.suspicious_score > 0).length;
    const vpnDetections = vpnLogs.filter(l => l.detection_type === 'vpn').length;
    const proxyDetections = vpnLogs.filter(l => l.detection_type === 'proxy').length;
    const multipleUsersHardware = correlations.filter(c => c.user_count > 1).length;

    return {
      totalHardware,
      suspiciousHardware,
      vpnDetections,
      proxyDetections,
      multipleUsersHardware,
      riskLevel: this.calculateRiskLevel(suspiciousHardware, vpnDetections, proxyDetections, multipleUsersHardware)
    };
  }

  /**
   * Calculate risk level
   */
  calculateRiskLevel(suspicious, vpn, proxy, multipleUsers) {
    let score = 0;
    if (suspicious > 0) score += 2;
    if (vpn > 0) score += 3;
    if (proxy > 0) score += 2;
    if (multipleUsers > 0) score += 4;

    if (score >= 8) return 'HIGH';
    if (score >= 4) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get users by hardware fingerprint
   */
  async getUsersByHardware(hardwareHash) {
    try {
      return await query(`
        SELECT 
          uhh.userId,
          u.name,
          uhh.firstSeen,
          uhh.lastSeen,
          uhh.loginCount,
          uhh.ip_address,
          uhh.country
        FROM UserHardwareHistory uhh
        JOIN Users u ON uhh.userId = u.id
        WHERE uhh.hardware_fingerprint = ?
        ORDER BY uhh.lastSeen DESC
      `, [hardwareHash]);
    } catch (error) {
      logger.error(`Error getting users by hardware: ${error.message}`);
      return [];
    }
  }

  /**
   * Get suspicious hardware patterns
   */
  async getSuspiciousHardware(limit = 50) {
    try {
      return await query(`
        SELECT 
          hc.hardware_hash,
          hc.user_count,
          hc.total_logins,
          hc.suspicious_score,
          hc.first_seen,
          hc.last_seen,
          COUNT(DISTINCT uhh.userId) as unique_users,
          GROUP_CONCAT(DISTINCT u.name) as user_names
        FROM HardwareCorrelation hc
        LEFT JOIN UserHardwareHistory uhh ON hc.hardware_hash = uhh.hardware_fingerprint
        LEFT JOIN Users u ON uhh.userId = u.id
        WHERE hc.suspicious_score > 0 OR hc.user_count > 1
        GROUP BY hc.hardware_hash, hc.user_count, hc.total_logins, hc.suspicious_score, hc.first_seen, hc.last_seen
        ORDER BY hc.suspicious_score DESC, hc.user_count DESC
        LIMIT ?
      `, [limit]);
    } catch (error) {
      logger.error(`Error getting suspicious hardware: ${error.message}`);
      return [];
    }
  }

  /**
   * Get detailed hardware data for "For Nerds" section
   */
  async getDetailedHardwareData(userId, hardwareHash = null) {
    try {
      let queryCondition = 'WHERE h.userId = ?';
      let queryParams = [userId];
      
      if (hardwareHash) {
        queryCondition = 'WHERE h.hardware_fingerprint = ?';
        queryParams = [hardwareHash];
      }

      const detailedData = await query(`
        SELECT 
          h.*,
          u.name as userName,
          u.email as userEmail,
          u.createdAt as userCreatedAt,
          u.lastLogIn as userLastLogin,
          TIMESTAMPDIFF(DAY, h.firstSeen, h.lastSeen) as daysActive,
          TIMESTAMPDIFF(HOUR, h.lastSeen, NOW()) as hoursSinceLastSeen,
          TIMESTAMPDIFF(MINUTE, h.lastSeen, NOW()) as minutesSinceLastSeen
        FROM UserHardwareHistory h
        LEFT JOIN Users u ON h.userId = u.id
        ${queryCondition}
        ORDER BY h.lastSeen DESC
      `, queryParams);

      // Parse hardware fingerprint data for detailed view
      const enhancedData = detailedData.map(record => {
        try {
          // Try to parse the hardware_fingerprint if it's JSON
          let parsedFingerprint = {};
          if (record.hardware_fingerprint && record.hardware_fingerprint.startsWith('{')) {
            parsedFingerprint = JSON.parse(record.hardware_fingerprint);
          }
          
          return {
            ...record,
            parsedFingerprint,
            // Extract browser info from user agent
            browserInfo: this.parseUserAgent(record.user_agent || ''),
            // Extract platform info
            platformInfo: this.parsePlatformInfo(record.user_agent || ''),
            // Calculate activity patterns
            activityPattern: this.calculateActivityPattern(record.firstSeen, record.lastSeen, record.loginCount)
          };
        } catch (error) {
          return record;
        }
      });

      return enhancedData;
    } catch (error) {
      logger.error(`Error getting detailed hardware data: ${error.message}`);
      return [];
    }
  }

  /**
   * Parse user agent string to extract browser information
   */
  parseUserAgent(userAgent) {
    if (!userAgent) return {};
    
    const browserInfo = {};
    
    // Chrome/Chromium
    if (userAgent.includes('Chrome')) {
      browserInfo.browser = 'Chrome';
      const match = userAgent.match(/Chrome\/(\d+\.\d+)/);
      if (match) browserInfo.version = match[1];
    }
    // Firefox
    else if (userAgent.includes('Firefox')) {
      browserInfo.browser = 'Firefox';
      const match = userAgent.match(/Firefox\/(\d+\.\d+)/);
      if (match) browserInfo.version = match[1];
    }
    // Safari
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      browserInfo.browser = 'Safari';
      const match = userAgent.match(/Version\/(\d+\.\d+)/);
      if (match) browserInfo.version = match[1];
    }
    // Edge
    else if (userAgent.includes('Edg')) {
      browserInfo.browser = 'Edge';
      const match = userAgent.match(/Edg\/(\d+\.\d+)/);
      if (match) browserInfo.version = match[1];
    }
    // Opera
    else if (userAgent.includes('OPR') || userAgent.includes('Opera')) {
      browserInfo.browser = 'Opera';
      const match = userAgent.match(/(?:OPR|Opera)\/(\d+\.\d+)/);
      if (match) browserInfo.version = match[1];
    }
    
    // Mobile detection
    browserInfo.isMobile = userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone');
    
    return browserInfo;
  }

  /**
   * Parse platform information from user agent
   */
  parsePlatformInfo(userAgent) {
    if (!userAgent) return {};
    
    const platformInfo = {};
    
    // Windows
    if (userAgent.includes('Windows')) {
      platformInfo.os = 'Windows';
      if (userAgent.includes('Windows NT 10.0')) platformInfo.version = '10/11';
      else if (userAgent.includes('Windows NT 6.3')) platformInfo.version = '8.1';
      else if (userAgent.includes('Windows NT 6.2')) platformInfo.version = '8';
      else if (userAgent.includes('Windows NT 6.1')) platformInfo.version = '7';
      else if (userAgent.includes('Windows NT 6.0')) platformInfo.version = 'Vista';
      else if (userAgent.includes('Windows NT 5.1')) platformInfo.version = 'XP';
    }
    // macOS
    else if (userAgent.includes('Mac OS X')) {
      platformInfo.os = 'macOS';
      const match = userAgent.match(/Mac OS X (\d+[._]\d+)/);
      if (match) platformInfo.version = match[1].replace('_', '.');
    }
    // Linux
    else if (userAgent.includes('Linux')) {
      platformInfo.os = 'Linux';
      if (userAgent.includes('Ubuntu')) platformInfo.distribution = 'Ubuntu';
      else if (userAgent.includes('Fedora')) platformInfo.distribution = 'Fedora';
      else if (userAgent.includes('Debian')) platformInfo.distribution = 'Debora';
      else if (userAgent.includes('CentOS')) platformInfo.distribution = 'CentOS';
    }
    // Android
    else if (userAgent.includes('Android')) {
      platformInfo.os = 'Android';
      const match = userAgent.match(/Android (\d+\.\d+)/);
      if (match) platformInfo.version = match[1];
    }
    // iOS
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      platformInfo.os = 'iOS';
      const match = userAgent.match(/OS (\d+_\d+)/);
      if (match) platformInfo.version = match[1].replace('_', '.');
    }
    
    // Architecture detection
    if (userAgent.includes('x86_64') || userAgent.includes('Win64')) platformInfo.architecture = 'x64';
    else if (userAgent.includes('x86') || userAgent.includes('WOW64')) platformInfo.architecture = 'x86';
    else if (userAgent.includes('ARM')) platformInfo.architecture = 'ARM';
    
    return platformInfo;
  }

  /**
   * Calculate activity pattern based on usage data
   */
  calculateActivityPattern(firstSeen, lastSeen, loginCount) {
    if (!firstSeen || !lastSeen || !loginCount) return {};
    
    const first = new Date(firstSeen);
    const last = new Date(lastSeen);
    const totalDays = Math.max(1, Math.floor((last - first) / (1000 * 60 * 60 * 24)));
    const avgLoginsPerDay = loginCount / totalDays;
    
    let pattern = 'Normal';
    if (avgLoginsPerDay > 10) pattern = 'Very Active';
    else if (avgLoginsPerDay > 5) pattern = 'Active';
    else if (avgLoginsPerDay < 0.5) pattern = 'Inactive';
    
    return {
      totalDays,
      avgLoginsPerDay: Math.round(avgLoginsPerDay * 100) / 100,
      pattern,
      frequency: avgLoginsPerDay > 2 ? 'Frequent' : 'Occasional'
    };
  }
}

export default new HardwareDetectionService();
