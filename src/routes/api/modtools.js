/**
 * basic mod api
 * is used by ../components/Modtools
 *
 */

import express from 'express';
import multer from 'multer';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';

import CanvasCleaner from '../../core/CanvasCleaner';
import chatProvider from '../../core/ChatProvider';
import { getIPFromRequest, maskIPForModerators } from '../../utils/ip';
import { escapeMd } from '../../core/utils';
import logger, { modtoolsLogger } from '../../core/logger';
import {
  executeIPAction,
  executeIIDAction,
  executeImageAction,
  executeProtAction,
  executeRollback,
  executeCleanerAction,
  executeWatchAction,
  getModList,
  removeMod,
  makeMod,
  executeIDAction,
  getUserFlags, 
  getIIDsById,
  getIdsByIID,
} from '../../core/adminfunctions';
import ipIntelligence from '../../core/IPIntelligence';
import userCorrelation from '../../core/UserCorrelation';
import userChecker from '../../core/UserChecker';
import userTracking from '../../core/UserTracking';
import hardwareDetection from '../../core/HardwareDetection';
import { getIIDofIP, getIPofIID } from '../../data/sql/IPInfo';
import { RegUser } from '../../data/sql';
import { usersocket as socketServer } from '../../server';
import { logModerationCommands } from '../../core/discord-webhook.js';
import socketEvents from '../../socket/socketEvents';
import { reloadCanvases, updateCanvasConfig } from '../../core/canvases';
import { reloadLocalizedCanvases } from '../../canvasesDesc';

const router = express.Router();

/*
 * multer middleware for getting POST parameters
 * into req.file (if file) and req.body for text
 */
router.use(express.urlencoded({ extended: true }));
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});


/*
 * make sure User is logged in and mod or mod
 */
router.use(async (req, res, next) => {
  const ip = getIPFromRequest(req);
  if (!req.user) {
    logger.warn(
      `MODTOOLS: ${ip} tried to access modtools without login`,
    );

    const iid = await getIIDofIP(ip);
    logModerationCommands({
      executorId: 'N/A',
      executorName: iid,
      command: 'forbidden',
      commandDescription: 'login',
      timestamp: new Date()
    });

    const { t } = req.ttag;
    res.status(403).send(t`You are not logged in`);
    return;
  }
  /*
   * 1 = Admin
   * 2 = Mod
   */
  if (!req.user.userlvl) {
    logger.warn(
      `MODTOOLS: ${ip} / ${req.user.id} tried to access modtools`,
    );

    const iid = await getIIDofIP(ip);
    logModerationCommands({
      executorId: req.user.id,
      executorName: iid,
      command: 'forbidden',
      commandDescription: 'userlvl',
      timestamp: new Date()
    });

    const { t } = req.ttag;
    res.status(403).send(t`You are not allowed to access this page`);
    return;
  }

  next();
});


/*
 * Post for mod + admin
 */
router.post('/', upload.single('image'), async (req, res, next) => {
  const aLogger = (text) => {
    const timeString = new Date().toLocaleTimeString();
    const logText = `@[${escapeMd(req.user.regUser.name)}](${req.user.id}) ${text}`;
    modtoolsLogger.info(
      `${timeString} | MODTOOLS> ${logText}`,
    );
    chatProvider.broadcastChatMessage(
      'info',
      logText,
      chatProvider.enChannelId,
      chatProvider.infoUserId,
    );
  };

  const bLogger = (text) => {
    logger.info(`IID> ${req.user.regUser.name}[${req.user.id}]> ${text}`);
  };

  try {
    // Connection tracking endpoint
    if (req.body.connectionaction) {
      const { connectionaction: type, value } = req.body;
      if (!value) {
        res.status(400).send('No value provided');
        return;
      }

      const isAdmin = req.user.userlvl === 1;
      let count;
      switch (type) {
        case 'ip':
          count = socketServer.getConnectionsByIP(value);
          const maskedInputIP = maskIPForModerators(value, isAdmin);
          res.status(200).send(`IP ${maskedInputIP} has ${count} active connections`);
          break;
        
        case 'id':
          // First get the IID for this user ID
          const userId = parseInt(value, 10);
          if (Number.isNaN(userId)) {
            res.status(400).send('Invalid user ID');
            return;
          }
          // Get the IP for this user ID from the socket server
          const userIPs = Array.from(socketServer.connectionsByID.get(userId) || [])
            .map(ws => ws.user.ip);
          if (userIPs.length === 0) {
            res.status(404).send('No active connections found for this user ID');
            return;
          }
          // Get IIDs for all IPs
          const iids = await Promise.all(userIPs.map(ip => getIIDofIP(ip)));
          const validIids = iids.filter(iid => iid);
          if (validIids.length === 0) {
            res.status(404).send('No IIDs found for this user ID');
            return;
          }
          // Get total connections across all IIDs
          count = validIids.reduce((total, iid) => total + socketServer.getConnectionsByIID(iid), 0);
          res.status(200).send(`User ID ${value} has ${count} active connections across ${validIids.length} IIDs`);
          break;
        
        case 'iid':
          // First get the IP for this IID
          const ip = await getIPofIID(value);
          if (!ip) {
            res.status(404).send('No IP found for this IID');
            return;
          }
          count = socketServer.getConnectionsByIP(ip);
          const maskedIP = maskIPForModerators(ip, isAdmin);
          res.status(200).send(`IID ${value} (IP: ${maskedIP}) has ${count} active connections`);
          break;
        
        default:
          res.status(400).send('Invalid type. Use ip, id, or iid');
      }
      return;
    }

    // New enhanced IP intelligence endpoint
    if (req.body.ipintel) {
      const ip = req.body.ip;
      if (!ip) {
        res.status(400).send('No IP provided');
        return;
      }
      const info = await ipIntelligence.getEnhancedIPInfo(ip);
      res.status(200).json(info);
      return;
    }

    // New proxy quality check endpoint
    if (req.body.proxyquality) {
      const ip = req.body.ip;
      if (!ip) {
        res.status(400).send('No IP provided');
        return;
      }

      try {
        const results = await Promise.all([
          // ProxyCheck.io - Reliable, no rate limits with registration
          fetch(`http://proxycheck.io/v2/${ip}?risk=1&vpn=1&asn=1&port=1&seen=1&days=7`)
            .then(async (r) => {
              if (!r.ok) {
                const text = await r.text();
                throw new Error(`ProxyCheck.io error: ${text}`);
              }
              return r.json();
            })
            .catch((err) => ({ 
              status: 'error', 
              message: err.message || 'ProxyCheck.io failed',
              proxy: 'unknown',
              type: 'error'
            })),
          
          // IP-API.com - Keep this one, reliable with good limits
          fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting`)
            .then(async (r) => {
              if (!r.ok) {
                const text = await r.text();
                throw new Error(`IP-API.com error: ${text}`);
              }
              return r.json();
            })
            .catch((err) => ({ 
              status: 'fail', 
              message: err.message || 'IP-API.com failed',
              proxy: false
            })),

          // GetIPIntel - Free, very reliable, machine learning based
          fetch(`http://check.getipintel.net/check.php?ip=${ip}&contact=admin@example.com&flags=m`)
            .then(async (r) => {
              if (!r.ok) {
                const text = await r.text();
                throw new Error(`GetIPIntel error: ${text}`);
              }
              const text = await r.text();
              const score = parseFloat(text);
              return {
                success: !isNaN(score) && score >= 0,
                score: isNaN(score) ? 0 : score,
                proxy: !isNaN(score) && score > 0.8,
                message: isNaN(score) ? `Error: ${text}` : 'Success'
              };
            })
            .catch((err) => ({ 
              success: false,
              score: 0,
              proxy: false,
              message: err.message || 'GetIPIntel failed'
            })),

          // VPNAPI.io proxy detection - Free tier available
          fetch(`https://vpnapi.io/api/${ip}?key=free`)
            .then(async (r) => {
              if (!r.ok) {
                const text = await r.text();
                throw new Error(`VPNAPI.io error: ${text}`);
              }
              return r.json();
            })
            .catch((err) => ({ 
              security: { proxy: false, vpn: false, tor: false },
              message: err.message || 'VPNAPI.io failed'
            })),

          // IsProxyIP - Free 1000 requests/day
          fetch(`https://api.isproxyip.com/v1/check.php?key=demo&ip=${ip}&format=json`)
            .then(async (r) => {
              if (!r.ok) {
                const text = await r.text();
                throw new Error(`IsProxyIP error: ${text}`);
              }
              return r.json();
            })
            .catch((err) => ({ 
              status: 'error',
              proxy: 0,
              message: err.message || 'IsProxyIP failed'
            })),

          // IP-API.co - Remove this one as requested
          // Replacing with FreeGeoIP
          fetch(`http://freegeoip.app/json/${ip}`)
            .then(async (r) => {
              if (!r.ok) {
                const text = await r.text();
                throw new Error(`FreeGeoIP error: ${text}`);
              }
              const data = await r.json();
              return {
                success: true,
                ip: data.ip,
                country_code: data.country_code,
                country_name: data.country_name,
                region_code: data.region_code,
                region_name: data.region_name,
                city: data.city,
                zip_code: data.zip_code,
                time_zone: data.time_zone,
                latitude: data.latitude,
                longitude: data.longitude,
                // Basic proxy detection based on known hosting providers
                proxy: data.isp && (
                  data.isp.toLowerCase().includes('hosting') ||
                  data.isp.toLowerCase().includes('cloud') ||
                  data.isp.toLowerCase().includes('datacenter') ||
                  data.isp.toLowerCase().includes('server')
                )
              };
            })
            .catch((err) => ({ 
              success: false,
              proxy: false, 
              message: err.message || 'FreeGeoIP failed'
            })),

          // IPQualityScore - Keep with enhanced error handling
          fetch(`https://ipqualityscore.com/api/json/ip/${process.env.IPQUALITYSCORE_KEY || 'demo'}/${ip}?strictness=1&allow_public_access_points=true&fast=true&lighter_penalties=true&mobile=true`)
            .then(async (r) => {
              if (!r.ok) {
                const text = await r.text();
                throw new Error(`IPQualityScore error: ${text}`);
              }
              return r.json();
            })
            .catch((err) => ({ 
              success: false,
              message: err.message || 'IPQualityScore failed',
              proxy: false
            })),

          // IPInfo.io - Keep with token
          fetch(`https://ipinfo.io/${ip}/json?token=${process.env.IPINFO_TOKEN || ''}`)
            .then(async (r) => {
              if (!r.ok) {
                const text = await r.text();
                throw new Error(`IPInfo.io error: ${text}`);
              }
              return r.json();
            })
            .catch((err) => ({ 
              error: true,
              message: err.message || 'IPInfo.io failed'
            })),

          // IPWhois - Keep for additional data
          fetch(`https://ipwhois.app/json/${ip}?objects=connection,timezone,security`)
            .then(async (r) => {
              if (!r.ok) {
                const text = await r.text();
                throw new Error(`IPWhois error: ${text}`);
              }
              return r.json();
            })
            .catch((err) => ({ 
              success: false,
              message: err.message || 'IPWhois failed'
            })),

          // AbuseIPDB - Keep for abuse detection
          fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`, {
            headers: {
              'Key': process.env.ABUSEIPDB_KEY || '',
              'Accept': 'application/json',
            }
          })
            .then(async (r) => {
              if (!r.ok) {
                const text = await r.text();
                throw new Error(`AbuseIPDB error: ${text}`);
              }
              return r.json();
            })
            .catch((err) => ({ 
              success: false,
              message: err.message || 'AbuseIPDB failed'
            })),

          // IP2Location - Additional free provider
          fetch(`https://api.ip2location.com/v2/?ip=${ip}&key=${process.env.IP2LOCATION_KEY || 'demo'}&package=WS24`)
            .then(async (r) => {
              if (!r.ok) {
                const text = await r.text();
                throw new Error(`IP2Location error: ${text}`);
              }
              return r.json();
            })
            .catch((err) => ({ 
              response: 'INVALID',
              message: err.message || 'IP2Location failed'
            })),

          // Shodan API for additional intelligence
          fetch(`https://api.shodan.io/shodan/host/${ip}?key=${process.env.SHODAN_KEY || ''}`)
            .then(async (r) => {
              if (!r.ok) {
                const text = await r.text();
                throw new Error(`Shodan error: ${text}`);
              }
              return r.json();
            })
            .catch((err) => ({ 
              success: false,
              message: err.message || 'Shodan failed'
            }))
        ]);
        
        const quality = {
          providers: results.length,
          proxycheck: results[0][ip] || { proxy: 'no', type: 'unknown' },
          ip_api: results[1] || { status: 'fail' },
          getipintel: results[2] || { success: false },
          vpnapi: results[3] || { security: { proxy: false, vpn: false, tor: false } },
          isproxyip: results[4] || { status: 'error', proxy: 0 },
          freegeoip: results[5] || { success: false },
          ipqualityscore: results[6] || { success: false },
          ipinfo: results[7] || { error: true },
          ipwhois: results[8] || { success: false },
          abuseipdb: results[9] || { success: false },
          ip2location: results[10] || { response: 'INVALID' },
          shodan: results[11] || { success: false },
          scamalytics: { success: false, message: 'Scamalytics not implemented' }
        };

        // Deep analysis classification
        const classification = {
          isResidential: false,
          isDatacenter: false,
          isMobile: false,
          isHosting: false,
          isVPN: false,
          isTor: false,
          isProxy: false,
          isPublicProxy: false,
          isPrivateProxy: false,
          isOrganization: false,
          abuseScore: 0,
          riskLevel: 'low',
          proxyType: 'none',
          details: []
        };

        // Analyze ProxyCheck.io data
        if (quality.proxycheck.proxy === 'yes') {
          classification.isProxy = true;
          if (quality.proxycheck.type) {
            const type = quality.proxycheck.type.toLowerCase();
            classification.proxyType = type;
            if (type.includes('vpn')) classification.isVPN = true;
            if (type.includes('tor')) classification.isTor = true;
            if (type.includes('hosting')) classification.isHosting = true;
            if (type.includes('residential')) classification.isResidential = true;
            if (type.includes('datacenter')) classification.isDatacenter = true;
            if (type.includes('mobile')) classification.isMobile = true;
          }
        }

        // Analyze IP-API.com data
        if (quality.ip_api.status === 'success') {
          if (quality.ip_api.proxy) classification.isProxy = true;
          if (quality.ip_api.hosting) classification.isHosting = true;
          if (quality.ip_api.mobile) classification.isMobile = true;
          if (quality.ip_api.org && !quality.ip_api.org.toLowerCase().includes('isp')) {
            classification.isOrganization = true;
          }
        }

        // Analyze GetIPIntel data (machine learning based)
        if (quality.getipintel.success) {
          if (quality.getipintel.proxy || quality.getipintel.score > 0.8) {
            classification.isProxy = true;
          }
          if (quality.getipintel.score > 0.95) {
            classification.isVPN = true; // Very high confidence
          }
        }

        // Analyze VPNAPI.io data
        if (quality.vpnapi.security) {
          if (quality.vpnapi.security.proxy) classification.isProxy = true;
          if (quality.vpnapi.security.vpn) classification.isVPN = true;
          if (quality.vpnapi.security.tor) classification.isTor = true;
        }

        // Analyze IsProxyIP data
        if (quality.isproxyip.status === 'success' && quality.isproxyip.proxy === 1) {
          classification.isProxy = true;
        }

        // Analyze FreeGeoIP data (hosting detection)
        if (quality.freegeoip.success && quality.freegeoip.proxy) {
          classification.isHosting = true;
          classification.isDatacenter = true;
        }

        // Analyze IPQualityScore data
        if (quality.ipqualityscore.success) {
          if (quality.ipqualityscore.proxy) classification.isProxy = true;
          if (quality.ipqualityscore.vpn) classification.isVPN = true;
          if (quality.ipqualityscore.tor) classification.isTor = true;
          if (quality.ipqualityscore.mobile) classification.isMobile = true;
          if (quality.ipqualityscore.fraud_score > 70) {
            classification.abuseScore += quality.ipqualityscore.fraud_score;
          }
        }

        // Analyze IPInfo.io data
        if (!quality.ipinfo.error) {
          if (quality.ipinfo.privacy?.proxy) classification.isProxy = true;
          if (quality.ipinfo.privacy?.vpn) classification.isVPN = true;
          if (quality.ipinfo.privacy?.tor) classification.isTor = true;
          if (quality.ipinfo.company?.type === 'hosting') classification.isHosting = true;
          if (quality.ipinfo.company?.type === 'isp') classification.isResidential = true;
        }

        // Analyze IPWhois data
        if (quality.ipwhois.success) {
          if (quality.ipwhois.type === 'hosting') classification.isHosting = true;
          if (quality.ipwhois.connection?.isp?.toLowerCase().includes('mobile')) {
            classification.isMobile = true;
          }
          if (quality.ipwhois.connection?.isp?.toLowerCase().includes('proxy')) {
            classification.isProxy = true;
            if (quality.ipwhois.connection.isp.toLowerCase().includes('public')) {
              classification.isPublicProxy = true;
            } else {
              classification.isPrivateProxy = true;
            }
          }
        }

        // Analyze AbuseIPDB data
        if (quality.abuseipdb.success && quality.abuseipdb.data) {
          classification.abuseScore += quality.abuseipdb.data.abuseConfidenceScore || 0;
        }

        // Analyze IP2Location data
        if (quality.ip2location.response === 'OK') {
          if (quality.ip2location.is_proxy === 'true') classification.isProxy = true;
          if (quality.ip2location.proxy_type) {
            const type = quality.ip2location.proxy_type.toLowerCase();
            if (type.includes('vpn')) classification.isVPN = true;
            if (type.includes('tor')) classification.isTor = true;
            if (type.includes('hosting')) classification.isHosting = true;
          }
        }

        // Analyze Shodan data for hosting/datacenter detection
        if (quality.shodan.success !== false && quality.shodan.org) {
          const org = quality.shodan.org.toLowerCase();
          if (org.includes('hosting') || org.includes('datacenter') || org.includes('cloud')) {
            classification.isHosting = true;
            classification.isDatacenter = true;
          }
        }

        // Calculate risk level based on all factors
        let riskScore = 0;
        if (classification.isProxy) riskScore += 30;
        if (classification.isVPN) riskScore += 20;
        if (classification.isTor) riskScore += 25;
        if (classification.isPublicProxy) riskScore += 15;
        if (classification.isHosting) riskScore += 10;
        if (classification.abuseScore > 50) riskScore += 20;

        // Determine risk level
        if (riskScore >= 80) classification.riskLevel = 'critical';
        else if (riskScore >= 60) classification.riskLevel = 'high';
        else if (riskScore >= 40) classification.riskLevel = 'medium';
        else if (riskScore >= 20) classification.riskLevel = 'low';
        else classification.riskLevel = 'minimal';

        // Add classification details
        if (classification.isProxy) {
          classification.details.push('Proxy detected');
          if (classification.isPublicProxy) classification.details.push('Public proxy service');
          if (classification.isPrivateProxy) classification.details.push('Private proxy service');
        }
        if (classification.isVPN) classification.details.push('VPN detected');
        if (classification.isTor) classification.details.push('Tor exit node');
        if (classification.isResidential) classification.details.push('Residential IP');
        if (classification.isDatacenter) classification.details.push('Datacenter IP');
        if (classification.isHosting) classification.details.push('Hosting provider');
        if (classification.isMobile) classification.details.push('Mobile carrier');
        if (classification.isOrganization) classification.details.push('Organization network');
        if (classification.abuseScore > 0) {
          classification.details.push(`Abuse score: ${classification.abuseScore.toFixed(1)}%`);
        }

        // Add classification to quality object
        quality.classification = classification;
        
        // Calculate comprehensive danger score with new providers
        let dangerScore = 0;
        let totalWeight = 0;
        
        // ProxyCheck.io (weight: 4) - Most reliable
        if (quality.proxycheck.proxy === 'yes') {
          dangerScore += 4;
          if (quality.proxycheck.type) {
            switch(quality.proxycheck.type.toLowerCase()) {
              case 'vpn': dangerScore += 1; break;
              case 'tor': dangerScore += 2; break;
              case 'hosting': dangerScore += 0.5; break;
              case 'residential': dangerScore += 0.3; break;
              case 'datacenter': dangerScore += 0.7; break;
            }
          }
        }
        totalWeight += 4;
        
        // IP-API.com (weight: 3)
        if (quality.ip_api.status === 'success') {
          if (quality.ip_api.proxy) dangerScore += 3;
          if (quality.ip_api.hosting) dangerScore += 0.5;
          if (quality.ip_api.mobile) dangerScore += 0.3;
        }
        totalWeight += 3;
        
        // GetIPIntel (weight: 3) - Machine learning based, very reliable
        if (quality.getipintel.success) {
          dangerScore += quality.getipintel.score * 3; // Score is 0-1
          if (quality.getipintel.score > 0.95) dangerScore += 1; // Bonus for high confidence
        }
        totalWeight += 3;
        
        // VPNAPI.io (weight: 2)
        if (quality.vpnapi.security) {
          if (quality.vpnapi.security.proxy) dangerScore += 2;
          if (quality.vpnapi.security.vpn) dangerScore += 1.5;
          if (quality.vpnapi.security.tor) dangerScore += 2;
        }
        totalWeight += 2;
        
        // IsProxyIP (weight: 2)
        if (quality.isproxyip.status === 'success' && quality.isproxyip.proxy === 1) {
          dangerScore += 2;
        }
        totalWeight += 2;
        
        // FreeGeoIP (weight: 1) - Basic hosting detection
        if (quality.freegeoip.success && quality.freegeoip.proxy) {
          dangerScore += 1;
        }
        totalWeight += 1;
        
        // IPQualityScore (weight: 2)
        if (quality.ipqualityscore.success) {
          if (quality.ipqualityscore.proxy) dangerScore += 2;
          if (quality.ipqualityscore.vpn) dangerScore += 1;
          if (quality.ipqualityscore.tor) dangerScore += 2;
          if (quality.ipqualityscore.fraud_score > 70) dangerScore += 1;
        }
        totalWeight += 2;
        
        // IPInfo.io (weight: 1.5)
        if (!quality.ipinfo.error) {
          if (quality.ipinfo.privacy?.proxy) dangerScore += 1.5;
          if (quality.ipinfo.privacy?.vpn) dangerScore += 1;
          if (quality.ipinfo.privacy?.tor) dangerScore += 1.5;
        }
        totalWeight += 1.5;
        
        // IPWhois (weight: 1)
        if (quality.ipwhois.success) {
          if (quality.ipwhois.type === 'hosting') dangerScore += 0.5;
          if (quality.ipwhois.connection?.isp?.toLowerCase().includes('proxy')) dangerScore += 1;
        }
        totalWeight += 1;

        // IP2Location (weight: 2)
        if (quality.ip2location.response === 'OK') {
          if (quality.ip2location.is_proxy === 'true') dangerScore += 2;
        }
        totalWeight += 2;

        // Shodan (weight: 0.5) - Just for hosting detection
        if (quality.shodan.success !== false && quality.shodan.org) {
          const org = quality.shodan.org.toLowerCase();
          if (org.includes('hosting') || org.includes('datacenter') || org.includes('cloud')) {
            dangerScore += 0.5;
          }
        }
        totalWeight += 0.5;
        
        // Scamalytics (weight: 2)
        if (quality.scamalytics.success) {
          if (quality.scamalytics.fraud_score > 70) dangerScore += 2;
        }
        totalWeight += 2;
        
        // Calculate final scores
        quality.dangerScore = (dangerScore / totalWeight) * 100;
        quality.overall = 100 - quality.dangerScore; // Convert danger score to safety score
        
        // Add error messages if any provider failed
        quality.errors = [];
        if (quality.proxycheck.message) quality.errors.push(quality.proxycheck.message);
        if (quality.ip_api.message) quality.errors.push(quality.ip_api.message);
        if (quality.getipintel.message) quality.errors.push(quality.getipintel.message);
        if (quality.vpnapi.message) quality.errors.push(quality.vpnapi.message);
        if (quality.isproxyip.message) quality.errors.push(quality.isproxyip.message);
        if (quality.freegeoip.message) quality.errors.push(quality.freegeoip.message);
        if (quality.ipqualityscore.message) quality.errors.push(quality.ipqualityscore.message);
        if (quality.ipinfo.message) quality.errors.push(quality.ipinfo.message);
        if (quality.ipwhois.message) quality.errors.push(quality.ipwhois.message);
        if (quality.abuseipdb.message) quality.errors.push(quality.abuseipdb.message);
        if (quality.ip2location.message) quality.errors.push(quality.ip2location.message);
        if (quality.shodan.message) quality.errors.push(quality.shodan.message);
        if (quality.scamalytics.message) quality.errors.push(quality.scamalytics.message);
        
        res.status(200).json(quality);
      } catch (error) {
        res.status(500).json({
          error: 'Failed to check proxy quality',
          message: error.message,
          quality: {
            providers: 0,
            overall: 0,
            dangerScore: 100,
            errors: [error.message]
          }
        });
      }
      return;
    }

    // New user correlation endpoint
    if (req.body.usercorr) {
      const userId = parseInt(req.body.userId, 10);
      if (Number.isNaN(userId)) {
        res.status(400).send('Invalid user ID');
        return;
      }
      const info = await userCorrelation.getUserDevices(userId);
      if (!info) {
        res.status(404).send('User not found');
        return;
      }
      res.status(200).json(info);
      return;
    }

    // New bulk IP analysis endpoint
    if (req.body.bulkip) {
      const ips = req.body.ips.split('\n').map(ip => ip.trim()).filter(ip => ip);
      if (!ips.length) {
        res.status(400).send('No IPs provided');
        return;
      }
      const results = await Promise.all(ips.map(ip => ipIntelligence.getEnhancedIPInfo(ip)));
      res.status(200).json(results);
      return;
    }

    // New device tracking endpoint
    if (req.body.devices) {
      const iid = req.body.iid;
      if (!iid) {
        res.status(400).send('No IID provided');
        return;
      }
      const userId = await userCorrelation.getUserIdFromIID(iid);
      if (!userId) {
        res.status(404).send('User not found for this IID');
        return;
      }
      const info = await userCorrelation.getUserDevices(userId);
      res.status(200).json(info);
      return;
    }

    // Comprehensive user checking endpoint
    if (req.body.usercheck) {
      const { userId, userName } = req.body;
      const isAdmin = req.user.userlvl === 1;
      
      if (!userId && !userName) {
        res.status(400).send('No user ID or username provided');
        return;
      }

      let targetUserId = userId;
      
      // If userName provided, get userId first
      if (!targetUserId && userName) {
        try {
          const userResult = await RegUser.findOne({ 
            where: { name: userName },
            attributes: ['id']
          });
          if (!userResult) {
            res.status(404).send('User not found');
            return;
          }
          targetUserId = userResult.id;
        } catch (error) {
          res.status(500).send('Error finding user');
          return;
        }
      }

      const numericUserId = parseInt(targetUserId, 10);
      if (Number.isNaN(numericUserId)) {
        res.status(400).send('Invalid user ID');
        return;
      }

      try {
        const includeIPs = isAdmin; // Only admins can see IP data
        const userInfo = await userChecker.getCompleteUserInfo(numericUserId, includeIPs);
        res.status(200).json(userInfo);
      } catch (error) {
        console.error('Error in user check:', error);
        res.status(500).send('Internal server error');
      }
      return;
    }

    // User risk assessment endpoint
    if (req.body.userrisk) {
      const { userId } = req.body;
      const isAdmin = req.user.userlvl === 1;
      
      if (!userId) {
        res.status(400).send('No user ID provided');
        return;
      }

      const numericUserId = parseInt(userId, 10);
      if (Number.isNaN(numericUserId)) {
        res.status(400).send('Invalid user ID');
        return;
      }

      try {
        const includeIPs = isAdmin; // Only admins can see IP data
        const riskAssessment = await userChecker.getRiskAssessment(numericUserId, includeIPs);
        res.status(200).json(riskAssessment);
      } catch (error) {
        console.error('Error in risk assessment:', error);
        res.status(500).send('Internal server error');
      }
      return;
    }

    // Populate tracking data from existing data (admin only)
    if (req.body.populatetracking) {
      const isAdmin = req.user.userlvl === 1;
      if (!isAdmin) {
        res.status(403).send('Admin access required');
        return;
      }

      try {
        await userTracking.populateFromExistingData();
        const stats = await userTracking.getTrackingStats();
        res.status(200).json({
          message: 'Successfully populated tracking data',
          stats
        });
      } catch (error) {
        console.error('Error populating tracking data:', error);
        res.status(500).send('Internal server error');
      }
      return;
    }

    if (req.body.cleanerstat) {
      const ret = CanvasCleaner.reportStatus();
      res.status(200);
      res.json(ret);
      return;
    }
    if (req.body.cleanercancel) {
      const ret = CanvasCleaner.stop();
      res.status(200).send(ret);
      return;
    }
    if (req.body.watchaction) {
      const {
        watchaction, ulcoor, brcoor, time, iid, canvasid,
      } = req.body;
      const ret = await executeWatchAction(
        watchaction,
        ulcoor,
        brcoor,
        time,
        iid,
        canvasid,
      );
      res.status(200).json(ret);
      return;
    }
    if (req.body.iidaction) {
      const {
        iidaction, iid, reason, time,
      } = req.body;
      let ret;
      if (iidaction === 'banid' || iidaction === 'unbanid') {
        ret = await executeIDAction(
          iidaction,
          iid,
          reason,
          time,
          req.user.id,
          req.user.regUser.name,
          bLogger,
        );
      } else {
        ret = await executeIIDAction(
          iidaction,
          iid,
          reason,
          time,
          req.user.id,
          req.user.regUser.name,
          bLogger,
        );
      }
      res.status(200).send(ret);
      return;
    }
    if (req.body.cleaneraction) {
      const {
        cleaneraction, ulcoor, brcoor, canvasid, sourcecolor, targetcolor,
      } = req.body;
      const [ret, msg] = await executeCleanerAction(
        cleaneraction,
        ulcoor,
        brcoor,
        canvasid,
        aLogger,
        sourcecolor,
        targetcolor,
        req.user.id,
        req.user.regUser.name,
      );
      res.status(ret).send(msg);
      return;
    }
    if (req.body.imageaction) {
      const { imageaction, coords, canvasid } = req.body;
      const [ret, msg] = await executeImageAction(
        imageaction,
        req.file,
        coords,
        canvasid,
        aLogger,
        req.user.id,
        req.user.regUser.name,
      );
      res.status(ret).send(msg);
      return;
    }
    if (req.body.protaction) {
      const {
        protaction, ulcoor, brcoor, canvasid,
      } = req.body;
      const [ret, msg] = await executeProtAction(
        protaction,
        ulcoor,
        brcoor,
        canvasid,
        aLogger,
        req.user.id,
        req.user.regUser.name,
      );
      res.status(ret).send(msg);
      return;
    }
    if (req.body.rollback) {
      // rollback is date as YYYYMMdd
      const {
        rollback, ulcoor, brcoor, canvasid, rollbacktime,
      } = req.body;
      const [ret, msg] = await executeRollback(
        rollback,
        ulcoor,
        brcoor,
        canvasid,
        aLogger,
        (req.user.userlvl === 1),
        rollbacktime,
        req.user.id,
        req.user.regUser.name,
      );
      res.status(ret).send(msg);
      return;
    }
    if (req.body.getflags) {
      const idParam = req.body.userId || req.body.id;
      const parsed = parseInt(idParam, 10);
      if (Number.isNaN(parsed)) {
        res.status(400).send('Invalid user ID for flags');
        return;
      }
      try {
        const flags = await getUserFlags(parsed);
        res.status(200).json({ userId: parsed, flags });
      } catch (err) {
        res.status(500).send(`Error fetching flags: ${err.message}`);
      }
      return;
    }

    if (req.body.getIIDsById) {
      const idParam = req.body.userId || req.body.id;
      const parsed = parseInt(idParam, 10);
      if (Number.isNaN(parsed)) {
        res.status(400).send('Invalid user ID for IIDs lookup');
        return;
      }
      try {
        const iids = await getIIDsById(parsed);
        res.status(200).json({ userId: parsed, iids });
      } catch (err) {
        res.status(500).send('Error fetching IIDs: ' + err.message);
      }
      return;
    }

    if (req.body.getIdsByIID) {
      const iidParam = req.body.iid;
      if (!iidParam) {
        res.status(400).send('IID not provided');
        return;
      }
      try {
        const userIds = await getIdsByIID(iidParam);
        res.status(200).json({ iid: iidParam, userIds });
      } catch (err) {
        res.status(500).send('Error fetching user IDs: ' + err.message);
      }
      return;
    }

    if (req.body.getHardwareByUser) {
      const idParam = req.body.userId || req.body.id;
      const parsed = parseInt(idParam, 10);
      if (Number.isNaN(parsed)) {
        res.status(400).send('Invalid user ID for hardware lookup');
        return;
      }
      try {
        const hardwareInfo = await userChecker.getUserHardwareInfo(parsed);
        res.status(200).json({ userId: parsed, hardwareInfo });
      } catch (err) {
        res.status(500).send('Error fetching hardware info: ' + err.message);
      }
      return;
    }

    if (req.body.getUsersByHardware) {
      const hardwareHash = req.body.hardwareHash;
      if (!hardwareHash) {
        res.status(400).send('Hardware hash not provided');
        return;
      }
      try {
        const users = await userChecker.getUsersByHardware(hardwareHash);
        res.status(200).json({ hardwareHash, users });
      } catch (err) {
        res.status(500).send('Error fetching users by hardware: ' + err.message);
      }
      return;
    }

    if (req.body.getSuspiciousHardware) {
      const limit = parseInt(req.body.limit) || 50;
      try {
        const suspiciousHardware = await userChecker.getSuspiciousHardware(limit);
        res.status(200).json({ suspiciousHardware });
      } catch (err) {
        res.status(500).send('Error fetching suspicious hardware: ' + err.message);
      }
      return;
    }

    if (req.body.getDetailedHardwareData) {
      const idParam = req.body.userId || req.body.id;
      const hardwareHash = req.body.hardwareHash;
      const parsed = parseInt(idParam, 10);
      if (Number.isNaN(parsed)) {
        res.status(400).send('Invalid user ID for detailed hardware lookup');
        return;
      }
      try {
        const detailedData = await hardwareDetection.getDetailedHardwareData(parsed, hardwareHash);
        res.status(200).json({ userId: parsed, detailedData });
      } catch (err) {
        res.status(500).send('Error fetching detailed hardware data: ' + err.message);
      }
      return;
    }
    
    if (req.body.makemod) {
      const ret = await makeMod(
        req.body.makemod,
        req.user.id,
        req.user.regUser.name,
      );
      res.status(200);
      res.json(ret);
      return;
    }
    
    next();
  } catch (err) {
    next(err);
  }
});


/*
 * just admins past here, no Mods
 */
router.use(async (req, res, next) => {
  if (req.user.userlvl !== 1) {
    const { t } = req.ttag;
    res.status(403).send(t`Just admins can do that`);
    return;
  }
  next();
});

/*
 * Post just for admin
 */
router.post('/', async (req, res, next) => {
  const aLogger = (text) => {
    logger.info(`ADMIN> ${req.user.regUser.name}[${req.user.id}]> ${text}`);
  };

  try {
    // Canvas configuration management (ADMIN ONLY)
    if (req.body.canvasconfig) {
      const { action, canvasId, config } = req.body;
      
      // Validate action
      if (!['get', 'update'].includes(action)) {
        res.status(400).send('Invalid canvas config action');
        return;
      }
      
      if (action === 'get') {
        // Get current canvas configurations
        try {
          const srcCanvasPath = '/root/pixelplanet/src/canvases.json';
          const canvasData = JSON.parse(fs.readFileSync(srcCanvasPath, 'utf8'));
          res.status(200).json(canvasData);
          return;
        } catch (err) {
          res.status(500).send(`Error reading canvas config: ${err.message}`);
          return;
        }
      }
      
      if (action === 'update') {
        // CRITICAL SECURITY VALIDATION
        if (!canvasId || !config) {
          res.status(400).send('Canvas ID and configuration are required');
          return;
        }
        
        // Validate canvas ID is numeric and exists
        const numericCanvasId = parseInt(canvasId, 10);
        if (Number.isNaN(numericCanvasId) || numericCanvasId < 0) {
          res.status(400).send('Invalid canvas ID');
          return;
        }
        
        // SECURITY: Validate all configuration fields to prevent injection
        const validationErrors = validateCanvasConfig(config);
        if (validationErrors.length > 0) {
          res.status(400).send(`Configuration validation failed: ${validationErrors.join(', ')}`);
          return;
        }
        
        try {
          const srcCanvasPath = '/root/pixelplanet/src/canvases.json';
          const distCanvasPath = '/root/pixelplanet/dist/canvases.json';
          
          // Read current config with error handling
          let currentCanvases;
          try {
            currentCanvases = JSON.parse(fs.readFileSync(srcCanvasPath, 'utf8'));
          } catch (err) {
            res.status(500).send(`Error reading canvas config: ${err.message}`);
            return;
          }
          
          // Update configuration
          currentCanvases[canvasId] = {
            ...currentCanvases[canvasId],
            ...config
          };
          
          const configJson = JSON.stringify(currentCanvases, null, 2);
          
          // Write updated config atomically to both source and dist
          const srcTempPath = `${srcCanvasPath}.tmp`;
          fs.writeFileSync(srcTempPath, configJson);
          fs.renameSync(srcTempPath, srcCanvasPath);
          
          // Also update dist file if it exists
          try {
            if (fs.existsSync(path.dirname(distCanvasPath))) {
              const distTempPath = `${distCanvasPath}.tmp`;
              fs.writeFileSync(distTempPath, configJson);
              fs.renameSync(distTempPath, distCanvasPath);
            }
          } catch (distErr) {
            logger.warn(`Could not update dist canvas config: ${distErr.message}`);
          }
          
          // Log the change
          aLogger(`Updated canvas ${canvasId} configuration`);
          
          // CRITICAL: Reload canvas configuration in memory
          const reloadSuccess = reloadCanvases();
          if (!reloadSuccess) {
            logger.warn('Failed to reload canvas configuration in memory');
          }
          
          // Also update the specific canvas in memory for immediate effect
          updateCanvasConfig(canvasId, config);
          
          // Reload localized canvases for /api/me endpoint
          reloadLocalizedCanvases();
          
          // Broadcast canvas configuration update to all clients
          socketEvents.broadcastCanvasConfigUpdate(numericCanvasId, currentCanvases[canvasId]);
          
          res.status(200).json({ 
            success: true, 
            message: 'Canvas configuration updated successfully',
            canvasId: numericCanvasId,
            updatedFiles: [srcCanvasPath, distCanvasPath],
            reloadSuccess
          });
          return;
          
        } catch (err) {
          logger.error(`Canvas config update error: ${err.message}`);
          res.status(500).send(`Error updating canvas config: ${err.message}`);
          return;
        }
      }
    }
    
    if (req.body.ipaction) {
      const ret = await executeIPAction(
        req.body.ipaction,
        req.body.ip,
        aLogger,
      );
      res.status(200).send(ret);
      return;
    }
    if (req.body.modlist) {
      const ret = await getModList();
      res.status(200);
      res.json(ret);
      return;
    }
    if (req.body.remmod) {
      const ret = await removeMod(req.body.remmod, req.user.id, req.user.regUser.name);
      res.status(200).send(ret);
      return;
    }
    if (req.body.makemod) {
      const ret = await makeMod(req.body.makemod, req.user.id, req.user.regUser.name);
      res.status(200);
      res.json(ret);
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
});

/**
 * SECURITY: Comprehensive canvas configuration validation
 * Prevents injection attacks and ensures data integrity
 */
function validateCanvasConfig(config) {
  const errors = [];
  
  // Required fields validation
  if (!config.ident || typeof config.ident !== 'string') {
    errors.push('Canvas identifier is required and must be a string');
  } else if (config.ident.length === 0 || config.ident.length > 2) {
    errors.push('Canvas identifier must be 1-2 characters long');
  } else if (!/^[a-zA-Z0-9]+$/.test(config.ident)) {
    errors.push('Canvas identifier must contain only alphanumeric characters');
  }
  
  // Size validation - CRITICAL for memory safety
  if (!config.size || typeof config.size !== 'number') {
    errors.push('Canvas size is required and must be a number');
  } else if (config.size < 256 || config.size > 65536) {
    errors.push('Canvas size must be between 256 and 65536');
  } else if ((config.size & (config.size - 1)) !== 0) {
    errors.push('Canvas size must be a power of 2');
  }
  
  // Cooldown validation - prevent DoS
  if (!config.bcd || typeof config.bcd !== 'number' || config.bcd < 0) {
    errors.push('Base cooldown must be a positive number');
  } else if (config.bcd > 86400000) { // 24 hours max
    errors.push('Base cooldown cannot exceed 24 hours');
  }
  
  if (!config.cds || typeof config.cds !== 'number' || config.cds < 0) {
    errors.push('Cooldown stack time must be a positive number');
  } else if (config.cds > 86400000) { // 24 hours max
    errors.push('Cooldown stack time cannot exceed 24 hours');
  }
  
  // Optional placed pixel cooldown
  if (config.pcd !== undefined) {
    if (typeof config.pcd !== 'number' || config.pcd < 0) {
      errors.push('Placed pixel cooldown must be a positive number');
    } else if (config.pcd > 86400000) {
      errors.push('Placed pixel cooldown cannot exceed 24 hours');
    }
  }
  
  // Colors validation - CRITICAL for security
  if (!config.colors || !Array.isArray(config.colors)) {
    errors.push('Colors must be an array');
  } else if (config.colors.length === 0) {
    errors.push('At least one color is required');
  } else if (config.colors.length > 256) {
    errors.push('Maximum 256 colors allowed');
  } else {
    for (let i = 0; i < config.colors.length; i++) {
      const color = config.colors[i];
      if (!Array.isArray(color) || color.length !== 3) {
        errors.push(`Color ${i} must be an array of 3 RGB values`);
        continue;
      }
      for (let j = 0; j < 3; j++) {
        const val = color[j];
        if (typeof val !== 'number' || val < 0 || val > 255 || !Number.isInteger(val)) {
          errors.push(`Color ${i} RGB value ${j} must be an integer between 0-255`);
        }
      }
    }
  }
  
  // Optional fields validation
  if (config.cli !== undefined) {
    if (typeof config.cli !== 'number' || config.cli < 0 || !Number.isInteger(config.cli)) {
      errors.push('Colors to ignore must be a non-negative integer');
    } else if (config.cli >= config.colors?.length) {
      errors.push('Colors to ignore cannot exceed total colors');
    }
  }
  
  if (config.req !== undefined) {
    if (typeof config.req !== 'string' && typeof config.req !== 'number') {
      errors.push('Requirement must be a string or number');
    } else if (typeof config.req === 'string' && config.req.length > 50) {
      errors.push('Requirement string too long');
    } else if (typeof config.req === 'number' && (config.req < 0 || config.req > 10000000)) {
      errors.push('Requirement number out of valid range');
    }
  }
  
  // Boolean fields validation
  ['ranked', 'v', 'hid'].forEach(field => {
    if (config[field] !== undefined && typeof config[field] !== 'boolean') {
      errors.push(`${field} must be a boolean`);
    }
  });
  
  // Date validation
  ['sd', 'ed'].forEach(field => {
    if (config[field] !== undefined) {
      if (typeof config[field] !== 'string') {
        errors.push(`${field} must be a string`);
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(config[field])) {
        errors.push(`${field} must be in YYYY-MM-DD format`);
      } else {
        const date = new Date(config[field]);
        if (isNaN(date.getTime())) {
          errors.push(`${field} must be a valid date`);
        }
      }
    }
  });
  
  // Historical sizes validation
  if (config.historicalSizes !== undefined) {
    if (!Array.isArray(config.historicalSizes)) {
      errors.push('Historical sizes must be an array');
    } else {
      for (let i = 0; i < config.historicalSizes.length; i++) {
        const entry = config.historicalSizes[i];
        if (!Array.isArray(entry) || entry.length !== 2) {
          errors.push(`Historical size entry ${i} must be [date, size] array`);
          continue;
        }
        if (typeof entry[0] !== 'string' || !/^\d{8}$/.test(entry[0])) {
          errors.push(`Historical size entry ${i} date must be YYYYMMDD format`);
        }
        if (typeof entry[1] !== 'number' || entry[1] < 256 || entry[1] > 65536) {
          errors.push(`Historical size entry ${i} size must be between 256-65536`);
        }
      }
    }
  }
  
  return errors;
}

router.use(async (req, res) => {
  res.status(400).send('Invalid request');
});

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  res.status(400).send(err.message);
});

export default router;