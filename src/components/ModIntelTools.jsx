import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { t } from 'ttag';
import { shardOrigin } from '../store/actions/fetch';

function ModIntelTools() {
  const userState = useSelector((state) => state.user);
  const userlvl = userState?.userlvl || 0;
  const currentUserId = userState?.id;
  const userName = userState?.name;

  // Debug logging
  useEffect(() => {
    console.log('User State:', {
      userlvl,
      currentUserId,
      userName,
      fullState: userState
    });
  }, [userState, userlvl, currentUserId, userName]);

  const [ip, setIp] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [iid, setIid] = useState('');
  const [bulkIps, setBulkIps] = useState('');
  const [ipInfo, setIpInfo] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [bulkResults, setBulkResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // If user level is not sufficient, show access denied message
  if (!currentUserId || userlvl <= 0) {
    return (
      <div className="mod-intel-tools">
        <div className="access-denied" style={{ 
          padding: '20px', 
          textAlign: 'center', 
          color: '#ff4444',
          border: '1px solid #ff4444',
          borderRadius: '3px',
          margin: '10px'
        }}>
          {!currentUserId ? t`Please log in to use Mod Intel Tools.` : t`Access Denied: You do not have permission to use Mod Intel Tools. Required level: 1 or higher.`}
        </div>
      </div>
    );
  }

  const handleIPCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${shardOrigin}/api/modtools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: new URLSearchParams({ ipintel: true, ip }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      setIpInfo(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUserCorrelation = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${shardOrigin}/api/modtools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: new URLSearchParams({ usercorr: true, userId: targetUserId }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      setUserInfo(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkIPCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${shardOrigin}/api/modtools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: new URLSearchParams({ bulkip: true, ips: bulkIps }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      setBulkResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${shardOrigin}/api/modtools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: new URLSearchParams({ devices: true, iid }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      setUserInfo(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderIPInfo = () => {
    if (!ipInfo) return null;
    return (
      <div className="ip-info">
        <h3>IP Intelligence Report</h3>
        <div className="risk-level" style={{ 
          backgroundColor: 
            ipInfo.risk.level === 'CRITICAL' ? '#ff4444' :
            ipInfo.risk.level === 'HIGH' ? '#ffaa00' :
            ipInfo.risk.level === 'MEDIUM' ? '#ffff00' :
            ipInfo.risk.level === 'LOW' ? '#00ff00' : '#00aaff',
          padding: '5px',
          margin: '5px 0',
          borderRadius: '3px',
        }}>
          Risk Level: {ipInfo.risk.level} ({ipInfo.risk.score}/100)
        </div>
        {ipInfo.risk.factors.length > 0 && (
          <div className="risk-factors">
            <h4>Risk Factors:</h4>
            <ul>
              {ipInfo.risk.factors.map((factor, i) => (
                <li key={i}>{factor}</li>
              ))}
            </ul>
          </div>
        )}
        {ipInfo.proxy.ipqualityscore && (
          <div className="proxy-info">
            <h4>Proxy/VPN Detection:</h4>
            <ul>
              <li>Is Proxy: {ipInfo.proxy.ipqualityscore.isProxy ? 'Yes' : 'No'}</li>
              <li>Is VPN: {ipInfo.proxy.ipqualityscore.isVPN ? 'Yes' : 'No'}</li>
              <li>Is Tor: {ipInfo.proxy.ipqualityscore.isTor ? 'Yes' : 'No'}</li>
              <li>Is Bot: {ipInfo.proxy.ipqualityscore.isBot ? 'Yes' : 'No'}</li>
              <li>Connection Type: {ipInfo.proxy.ipqualityscore.connectionType}</li>
              <li>ISP: {ipInfo.proxy.ipqualityscore.isp}</li>
              <li>Organization: {ipInfo.proxy.ipqualityscore.organization}</li>
            </ul>
          </div>
        )}
        {ipInfo.location.maxmind && (
          <div className="location-info">
            <h4>Location:</h4>
            <ul>
              <li>City: {ipInfo.location.maxmind.city}</li>
              <li>Country: {ipInfo.location.maxmind.country}</li>
              <li>Continent: {ipInfo.location.maxmind.continent}</li>
              <li>Postal Code: {ipInfo.location.maxmind.postal}</li>
              <li>Coordinates: {ipInfo.location.maxmind.latitude}, {ipInfo.location.maxmind.longitude}</li>
              <li>Timezone: {ipInfo.location.maxmind.timezone}</li>
            </ul>
          </div>
        )}
        {ipInfo.reputation.abuseipdb && (
          <div className="reputation-info">
            <h4>AbuseIPDB Reputation:</h4>
            <ul>
              <li>Abuse Score: {ipInfo.reputation.abuseipdb.score}/100</li>
              <li>Total Reports: {ipInfo.reputation.abuseipdb.totalReports}</li>
              <li>Last Reported: {new Date(ipInfo.reputation.abuseipdb.lastReported).toLocaleString()}</li>
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderUserInfo = () => {
    if (!userInfo) return null;
    return (
      <div className="user-info">
        <h3>User Correlation Report</h3>
        <div className="user-header">
          <h4>User: {userInfo.username} (ID: {userInfo.userId})</h4>
        </div>
        
        <div className="devices">
          <h4>Devices ({userInfo.devices.length}):</h4>
          {userInfo.devices.map((device, i) => (
            <div key={i} className="device">
              <h5>Device {i + 1} (ID: {device.id})</h5>
              <ul>
                <li>First Seen: {new Date(device.firstSeen).toLocaleString()}</li>
                <li>Last Seen: {new Date(device.lastSeen).toLocaleString()}</li>
                <li>IPs Used: {device.ips.length}</li>
                <li>IIDs: {device.iids.length}</li>
                <li>Related Accounts: {device.accounts.length}</li>
              </ul>
            </div>
          ))}
        </div>

        <div className="ip-history">
          <h4>IP History ({userInfo.ipHistory.length}):</h4>
          {userInfo.ipHistory.map((ip, i) => (
            <div key={i} className="ip-entry">
              <h5>IP: {ip.ip}</h5>
              <ul>
                <li>Risk Level: {ip.details.risk.level}</li>
                <li>Country: {ip.details.location.maxmind?.country}</li>
                <li>ISP: {ip.details.proxy.ipqualityscore?.isp}</li>
                <li>Is Proxy: {ip.details.proxy.ipqualityscore?.isProxy ? 'Yes' : 'No'}</li>
                <li>Is VPN: {ip.details.proxy.ipqualityscore?.isVPN ? 'Yes' : 'No'}</li>
                <li>Ban Status: {ip.banInfo ? 'Banned' : 'Not Banned'}</li>
                <li>Whitelisted: {ip.whitelisted ? 'Yes' : 'No'}</li>
              </ul>
            </div>
          ))}
        </div>

        <div className="related-accounts">
          <h4>Related Accounts ({userInfo.relatedAccounts.length}):</h4>
          {userInfo.relatedAccounts.map((account, i) => (
            <div key={i} className="related-account">
              <h5>Account ID: {account.userId}</h5>
              <ul>
                <li>Connection Type: {account.connectionType}</li>
                <li>Shared IPs: {account.sharedIPs.length}</li>
                <li>Shared Devices: {account.sharedDevices.length}</li>
                <li>First Seen: {new Date(account.firstSeen).toLocaleString()}</li>
                <li>Last Seen: {new Date(account.lastSeen).toLocaleString()}</li>
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderBulkResults = () => {
    if (!bulkResults) return null;
    return (
      <div className="bulk-results">
        <h3>Bulk IP Analysis Results</h3>
        {bulkResults.map((result, i) => (
          <div key={i} className="ip-result">
            <h4>IP: {result.base.ip}</h4>
            <div className="risk-level" style={{ 
              backgroundColor: 
                result.risk.level === 'CRITICAL' ? '#ff4444' :
                result.risk.level === 'HIGH' ? '#ffaa00' :
                result.risk.level === 'MEDIUM' ? '#ffff00' :
                result.risk.level === 'LOW' ? '#00ff00' : '#00aaff',
              padding: '5px',
              margin: '5px 0',
              borderRadius: '3px',
            }}>
              Risk Level: {result.risk.level} ({result.risk.score}/100)
            </div>
            <ul>
              <li>Country: {result.location.maxmind?.country}</li>
              <li>ISP: {result.proxy.ipqualityscore?.isp}</li>
              <li>Is Proxy: {result.proxy.ipqualityscore?.isProxy ? 'Yes' : 'No'}</li>
              <li>Is VPN: {result.proxy.ipqualityscore?.isVPN ? 'Yes' : 'No'}</li>
            </ul>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="mod-intel-tools">
      <div className="tools-section">
        <h3>IP Intelligence</h3>
        <div className="input-group">
          <input
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="Enter IP address"
          />
          <button
            type="button"
            onClick={handleIPCheck}
            disabled={loading || !ip}
          >
            Check IP
          </button>
        </div>

        <h3>User Correlation</h3>
        <div className="input-group">
          <input
            type="text"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            placeholder="Enter user ID"
          />
          <button
            type="button"
            onClick={handleUserCorrelation}
            disabled={loading || !targetUserId}
          >
            Get User Info
          </button>
        </div>

        <h3>Device Tracking</h3>
        <div className="input-group">
          <input
            type="text"
            value={iid}
            onChange={(e) => setIid(e.target.value)}
            placeholder="Enter IID"
          />
          <button
            type="button"
            onClick={handleDeviceCheck}
            disabled={loading || !iid}
          >
            Track Device
          </button>
        </div>

        <h3>Bulk IP Analysis</h3>
        <div className="input-group">
          <textarea
            value={bulkIps}
            onChange={(e) => setBulkIps(e.target.value)}
            placeholder="Enter IPs (one per line)"
            rows={5}
          />
          <button
            type="button"
            onClick={handleBulkIPCheck}
            disabled={loading || !bulkIps}
          >
            Analyze IPs
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message" style={{ color: 'red', margin: '10px 0' }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="loading" style={{ margin: '10px 0' }}>
          Loading...
        </div>
      )}

      {renderIPInfo()}
      {renderUserInfo()}
      {renderBulkResults()}

      <style jsx>{`
        .mod-intel-tools {
          padding: 10px;
        }
        .tools-section {
          margin-bottom: 20px;
        }
        .input-group {
          margin: 10px 0;
          display: flex;
          gap: 10px;
        }
        input, textarea {
          flex: 1;
          padding: 5px;
          border: 1px solid #ccc;
          border-radius: 3px;
        }
        button {
          padding: 5px 10px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
        }
        button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .ip-info, .user-info, .bulk-results {
          margin-top: 20px;
          padding: 10px;
          border: 1px solid #ccc;
          border-radius: 3px;
        }
        .device, .ip-entry, .related-account {
          margin: 10px 0;
          padding: 10px;
          border: 1px solid #eee;
          border-radius: 3px;
        }
        ul {
          margin: 5px 0;
          padding-left: 20px;
        }
        h3, h4, h5 {
          margin: 10px 0;
        }
      `}</style>
    </div>
  );
}

export default React.memo(ModIntelTools); 