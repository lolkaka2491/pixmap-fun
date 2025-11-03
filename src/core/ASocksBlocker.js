import { getInfoToIp } from '../data/sql/IPInfo';
import { banIP } from '../data/sql/Ban';
import { proxyLogger as logger } from './logger';
import { getIPv6Subnet } from '../utils/ip';

class ASocksBlocker {
  constructor() {
    // ASOCKS known indicators
    this.ASOCKS_PATTERNS = [
      // Organization patterns
      /asocks/i,
      /residential.*proxy/i,
      /proxy.*residential/i,
      
      // Common ASOCKS ASN patterns
      /AS.*[0-9]{4,6}.*ASOCKS/i,
      
      // Known ASOCKS hosting providers they use
      /hostkey/i,
      /digital.*ocean/i,
      /vultr/i,
      /linode/i,
      /ovh/i,
      
      // Description patterns common in ASOCKS
      /residential/i,
      /dynamic/i,
      /pool/i,
      /rotation/i,
    ];

    // ASOCKS behavioral patterns
    this.ASOCKS_BEHAVIORAL_PATTERNS = {
      // Port patterns (ASOCKS commonly uses these ranges)
      commonPorts: [9999, 8000, 8080, 3128, 1080, 8888, 7777],
      
      // User-agent patterns from ASOCKS traffic
      suspiciousUA: [
        /python/i,
        /curl/i,
        /wget/i,
        /bot/i,
        /script/i,
        /automation/i,
      ],
      
      // Connection patterns
      rapidConnections: true,
      shortSessions: true,
    };

    // Track suspicious IPs for pattern analysis
    this.suspiciousActivity = new Map();
    
    // ASOCKS known ASN ranges (you'll need to populate these)
    this.ASOCKS_ASNS = new Set([
      // Add known ASOCKS ASNs here
      // Example: 'AS12345', 'AS67890'
    ]);

    // Track connection patterns
    this.connectionPatterns = new Map();
  }

  /**
   * Check if an IP is likely from ASOCKS
   * @param {string} ip - IP address to check
   * @param {object} headers - Request headers
   * @returns {Promise<object>} Detection result
   */
  async detectASocks(ip, headers = {}) {
    const ipKey = getIPv6Subnet(ip);
    let score = 0;
    const reasons = [];

    try {
      // Get IP information
      const ipInfo = await getInfoToIp(ip);
      
      if (!ipInfo) {
        return { isASocks: false, score: 0, reasons: [] };
      }

      // Check organization patterns
      if (ipInfo.org) {
        for (const pattern of this.ASOCKS_PATTERNS) {
          if (pattern.test(ipInfo.org)) {
            score += 30;
            reasons.push(`Organization matches ASOCKS pattern: ${ipInfo.org}`);
            break;
          }
        }
      }

      // Check description patterns
      if (ipInfo.descr) {
        for (const pattern of this.ASOCKS_PATTERNS) {
          if (pattern.test(ipInfo.descr)) {
            score += 25;
            reasons.push(`Description matches ASOCKS pattern: ${ipInfo.descr}`);
            break;
          }
        }
      }

      // Check ASN
      if (ipInfo.asn && this.ASOCKS_ASNS.has(ipInfo.asn)) {
        score += 40;
        reasons.push(`Known ASOCKS ASN: ${ipInfo.asn}`);
      }

      // Check if already marked as proxy
      if (ipInfo.isProxy) {
        score += 20;
        reasons.push('Already detected as proxy');
      }

      // Check behavioral patterns
      const behavioralScore = this.analyzeBehavioralPatterns(ip, headers);
      score += behavioralScore.score;
      reasons.push(...behavioralScore.reasons);

      // Check connection patterns
      const connectionScore = this.analyzeConnectionPatterns(ip);
      score += connectionScore.score;
      reasons.push(...connectionScore.reasons);

      // CIDR analysis for residential proxy ranges
      if (ipInfo.cidr && ipInfo.cidr !== 'N/A') {
        const cidrScore = this.analyzeCIDRPattern(ipInfo.cidr, ipInfo.org);
        score += cidrScore.score;
        reasons.push(...cidrScore.reasons);
      }

      const isASocks = score >= 50;
      
      return {
        isASocks,
        score,
        reasons,
        ipInfo,
        confidence: Math.min(100, score)
      };

    } catch (error) {
      logger.error(`Error detecting ASOCKS for ${ip}: ${error.message}`);
      return { isASocks: false, score: 0, reasons: ['Detection error'] };
    }
  }

  /**
   * Analyze behavioral patterns
   */
  analyzeBehavioralPatterns(ip, headers) {
    let score = 0;
    const reasons = [];

    const userAgent = headers['user-agent'] || '';
    const referer = headers.referer || '';

    // Check user agent patterns
    for (const pattern of this.ASOCKS_BEHAVIORAL_PATTERNS.suspiciousUA) {
      if (pattern.test(userAgent)) {
        score += 15;
        reasons.push(`Suspicious user agent: ${userAgent}`);
        break;
      }
    }

    // Check for missing common headers (automation detection)
    const commonHeaders = ['accept', 'accept-language', 'accept-encoding'];
    const missingHeaders = commonHeaders.filter(h => !headers[h]);
    
    if (missingHeaders.length >= 2) {
      score += 10;
      reasons.push(`Missing common headers: ${missingHeaders.join(', ')}`);
    }

    // Check for automation patterns
    if (!referer && !headers.origin) {
      score += 5;
      reasons.push('No referer or origin (automation indicator)');
    }

    return { score, reasons };
  }

  /**
   * Analyze connection patterns
   */
  analyzeConnectionPatterns(ip) {
    let score = 0;
    const reasons = [];

    const now = Date.now();
    const pattern = this.connectionPatterns.get(ip) || {
      firstSeen: now,
      lastSeen: now,
      connections: 0,
      shortSessions: 0
    };

    pattern.connections++;
    pattern.lastSeen = now;

    // Rapid connections pattern
    const timespan = pattern.lastSeen - pattern.firstSeen;
    if (timespan > 0) {
      const connectionsPerMinute = (pattern.connections / timespan) * 60000;
      
      if (connectionsPerMinute > 10) {
        score += 20;
        reasons.push(`High connection rate: ${connectionsPerMinute.toFixed(1)}/min`);
      }
    }

    this.connectionPatterns.set(ip, pattern);

    // Clean old patterns (older than 1 hour)
    if (pattern.connections % 100 === 0) {
      this.cleanOldPatterns();
    }

    return { score, reasons };
  }

  /**
   * Analyze CIDR patterns for residential proxy detection
   */
  analyzeCIDRPattern(cidr, org) {
    let score = 0;
    const reasons = [];

    // Large CIDR blocks often indicate residential proxy pools
    const cidrMatch = cidr.match(/\/(\d+)$/);
    if (cidrMatch) {
      const mask = parseInt(cidrMatch[1]);
      
      // Very large blocks (/16, /17, /18) with hosting orgs are suspicious
      if (mask <= 18 && org) {
        const suspiciousOrgPatterns = [
          /hosting/i,
          /cloud/i,
          /server/i,
          /datacenter/i,
          /digital/i,
        ];

        if (suspiciousOrgPatterns.some(p => p.test(org))) {
          score += 15;
          reasons.push(`Large CIDR block (/${mask}) with hosting organization`);
        }
      }
    }

    return { score, reasons };
  }

  /**
   * Automatically ban detected ASOCKS IPs
   */
  async autobanASocks(ip, detectionResult) {
    try {
      const ipKey = getIPv6Subnet(ip);
      const reason = `ASOCKS Residential Proxy Detected (Score: ${detectionResult.score}/100) - ${detectionResult.reasons.slice(0, 2).join(', ')}`;
      const expires = Date.now() + (1000 * 3600 * 24 * 30); // 30 days

      await banIP(ipKey, reason, expires, 1); // System ban (user ID 1)
      
      logger.warn(`Auto-banned ASOCKS proxy ${ip}: ${reason}`);
      
      return true;
    } catch (error) {
      logger.error(`Error auto-banning ASOCKS IP ${ip}: ${error.message}`);
      return false;
    }
  }

  /**
   * Add known ASOCKS ASN
   */
  addASocksASN(asn) {
    this.ASOCKS_ASNS.add(asn);
    logger.info(`Added ASOCKS ASN: ${asn}`);
  }

  /**
   * Bulk add ASOCKS ASNs
   */
  addASocksASNs(asns) {
    asns.forEach(asn => this.ASOCKS_ASNS.add(asn));
    logger.info(`Added ${asns.length} ASOCKS ASNs`);
  }

  /**
   * Clean old connection patterns
   */
  cleanOldPatterns() {
    const now = Date.now();
    const oneHour = 3600000;

    for (const [ip, pattern] of this.connectionPatterns.entries()) {
      if (now - pattern.lastSeen > oneHour) {
        this.connectionPatterns.delete(ip);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      knownASNs: this.ASOCKS_ASNS.size,
      trackedConnections: this.connectionPatterns.size,
      patterns: this.ASOCKS_PATTERNS.length
    };
  }
}

// Export singleton instance
export default new ASocksBlocker(); 