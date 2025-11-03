import axios from 'axios';
import { getInfoToIp } from '../data/sql/IPInfo';
import { proxyLogger as logger } from './logger';

class IPIntelligenceService {
  async getEnhancedIPInfo(ip) {
    const baseInfo = await getInfoToIp(ip);
    const results = {
      base: baseInfo,
      reputation: {},
      proxy: {},
      location: {},
      risk: {},
      related: {},
    };

    // IP-API.com (free, no key required)
    try {
      const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,mobile,proxy,hosting`, {
        timeout: 5000
      });
      if (response.data.status === 'success') {
        results.location.ipapi = {
          country: response.data.country,
          countryCode: response.data.countryCode,
          region: response.data.regionName,
          city: response.data.city,
          zip: response.data.zip,
          lat: response.data.lat,
          lon: response.data.lon,
          timezone: response.data.timezone,
          isp: response.data.isp,
          org: response.data.org,
          as: response.data.as,
          asname: response.data.asname,
          mobile: response.data.mobile,
          proxy: response.data.proxy,
          hosting: response.data.hosting,
        };
      }
    } catch (error) {
      logger.error(`IP-API error for ${ip}:`, error.message);
    }

    // GetIPIntel (free, requires email)
    try {
      const email = 'pixelplanet@example.com'; // Replace with your contact email
      const response = await axios.get(`http://check.getipintel.net/check.php?ip=${ip}&contact=${email}&flags=m`, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const proxyScore = parseFloat(response.data);
      if (!isNaN(proxyScore)) {
        results.proxy.getipintel = {
          score: proxyScore,
          isProxy: proxyScore > 0.95,
          confidence: proxyScore * 100
        };
      }
    } catch (error) {
      logger.error(`GetIPIntel error for ${ip}:`, error.message);
    }

    // ProxyCheck.io (free tier)
    try {
      const response = await axios.get(`http://proxycheck.io/v2/${ip}?vpn=1&risk=1&asn=1`, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      if (response.data.status === 'ok' && response.data[ip]) {
        const data = response.data[ip];
        results.proxy.proxycheck = {
          isProxy: data.proxy === 'yes',
          type: data.type || 'Unknown',
          risk: data.risk || 0,
          provider: data.provider || 'Unknown',
          country: data.country || 'Unknown',
          city: data.city || 'Unknown',
          isVPN: data.type?.toLowerCase().includes('vpn') || false,
          isTor: data.type?.toLowerCase().includes('tor') || false
        };
      }
    } catch (error) {
      logger.error(`ProxyCheck error for ${ip}:`, error.message);
    }

    // Calculate overall risk score
    results.risk = this.calculateRiskScore(results);

    return results;
  }

  calculateRiskScore(results) {
    let score = 0;
    let factors = [];

    // IP-API factors
    if (results.location.ipapi) {
      const ipapi = results.location.ipapi;
      if (ipapi.proxy) {
        score += 30;
        factors.push('Detected as proxy by IP-API');
      }
      if (ipapi.hosting) {
        score += 20;
        factors.push('Hosting provider');
      }
      if (ipapi.mobile) {
        score += 10;
        factors.push('Mobile carrier');
      }
    }

    // GetIPIntel factors
    if (results.proxy.getipintel) {
      const getipintel = results.proxy.getipintel;
      if (getipintel.isProxy) {
        score += 35;
        factors.push(`Detected as proxy by GetIPIntel (${getipintel.confidence.toFixed(1)}% confidence)`);
      }
    }

    // ProxyCheck factors
    if (results.proxy.proxycheck) {
      const proxycheck = results.proxy.proxycheck;
      if (proxycheck.isProxy) {
        score += 35;
        factors.push(`Detected as proxy by ProxyCheck (${proxycheck.type})`);
      }
      if (proxycheck.isVPN) {
        score += 25;
        factors.push('Detected as VPN');
      }
      if (proxycheck.isTor) {
        score += 40;
        factors.push('Detected as Tor exit node');
      }
      if (proxycheck.risk > 75) {
        score += 20;
        factors.push('High risk score from ProxyCheck');
      }
    }

    // Normalize score to 0-100
    score = Math.min(100, Math.max(0, score));

    return {
      score,
      factors,
      level: this.getRiskLevel(score),
      proxyDetected: factors.some(f => f.toLowerCase().includes('proxy') || f.toLowerCase().includes('vpn') || f.toLowerCase().includes('tor')),
      confidence: this.calculateConfidence(results)
    };
  }

  getRiskLevel(score) {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'LOW';
    return 'SAFE';
  }

  calculateConfidence(results) {
    let confidence = 0;
    let totalChecks = 0;

    if (results.proxy.getipintel) {
      confidence += results.proxy.getipintel.confidence;
      totalChecks++;
    }

    if (results.proxy.proxycheck) {
      confidence += results.proxy.proxycheck.isProxy ? 100 : 0;
      totalChecks++;
    }

    if (results.location.ipapi?.proxy) {
      confidence += 100;
      totalChecks++;
    }

    return totalChecks > 0 ? Math.round(confidence / totalChecks) : 0;
  }
}

export default new IPIntelligenceService(); 