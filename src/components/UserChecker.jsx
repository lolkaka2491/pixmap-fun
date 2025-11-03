/*
 * Comprehensive User Checker Component
 * Entry point: User ID or Username
 * Displays all user information including flags, IIDs, bans, IPs, and risk assessment
 */

import React, { useState, useEffect } from 'react';
import { t } from 'ttag';
import { shardOrigin } from '../store/actions/fetch';

const UserChecker = () => {
  const [searchInput, setSearchInput] = useState('');
  const [userInfo, setUserInfo] = useState(null);
  const [riskAssessment, setRiskAssessment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showNerdsData, setShowNerdsData] = useState(false);

  const handleUserCheck = async () => {
    if (!searchInput.trim()) {
      setError('Please enter a user ID or username');
      return;
    }

    setLoading(true);
    setError(null);
    setUserInfo(null);
    setRiskAssessment(null);

    try {
      // Check if input is numeric (user ID) or text (username)
      const isNumeric = /^\d+$/.test(searchInput.trim());
      const requestData = isNumeric 
        ? { usercheck: true, userId: searchInput.trim() }
        : { usercheck: true, userName: searchInput.trim() };

      const response = await fetch(`${shardOrigin}/api/modtools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: new URLSearchParams(requestData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      setUserInfo(data);

      // Get risk assessment
      if (data.userInfo && data.userInfo.id) {
        const riskResponse = await fetch(`${shardOrigin}/api/modtools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          credentials: 'include',
          body: new URLSearchParams({ userrisk: true, userId: data.userInfo.id }),
        });

        if (riskResponse.ok) {
          const riskData = await riskResponse.json();
          setRiskAssessment(riskData);
        }
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleUserCheck();
    }
  };

  const handlePopulateData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${shardOrigin}/api/modtools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: new URLSearchParams({ populatetracking: true }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const data = await response.json();
      setError(`Success: ${data.message}\nStats: ${JSON.stringify(data.stats, null, 2)}`);
    } catch (err) {
      setError(`Population failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (minutes) => {
    if (!minutes) return 'N/A';
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const getRiskColor = (level) => {
    switch (level) {
      case 'HIGH': return '#ff4444';
      case 'MEDIUM': return '#ff8800';
      case 'LOW': return '#ffaa00';
      default: return '#44aa44';
    }
  };

  const renderOverview = () => {
    if (!userInfo) return null;

    const { userInfo: user, flagHistory, iidHistory, banHistory } = userInfo;

    return (
      <div style={{ padding: '15px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          {/* Basic User Info */}
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#fff' }}>User Information</h3>
            <div><strong>ID:</strong> {user.id}</div>
            <div><strong>Name:</strong> {user.name}</div>
            <div><strong>Current Flag:</strong> {user.flag}</div>
            <div><strong>Created:</strong> {formatDate(user.createdAt)}</div>
            <div><strong>Last Login:</strong> {formatDate(user.lastLogIn)}</div>
            <div><strong>Verified:</strong> {user.verified ? 'Yes' : 'No'}</div>
            {user.isVIP && <div><strong>VIP:</strong> Until {formatDate(user.vipExpiry)}</div>}
          </div>

          {/* Risk Assessment */}
          {riskAssessment && (
            <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#fff' }}>Risk Assessment</h3>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: 'bold', 
                color: getRiskColor(riskAssessment.riskLevel),
                marginBottom: '10px'
              }}>
                {riskAssessment.riskLevel} RISK
              </div>
              <div><strong>Score:</strong> {riskAssessment.riskScore}/100</div>
              <div style={{ marginTop: '10px' }}>
                <strong>Risk Factors:</strong>
                <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                  {riskAssessment.riskFactors.map((factor, index) => (
                    <li key={index}>{factor}</li>
                  ))}
                </ul>
              </div>
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#ccc' }}>
                {riskAssessment.recommendation}
              </div>
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px' }}>
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4CAF50' }}>
              {flagHistory.totalFlags}
            </div>
            <div>Total Flags</div>
          </div>
          
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2196F3' }}>
              {iidHistory.totalIIDs}
            </div>
            <div>Total IIDs</div>
          </div>
          
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#FF9800' }}>
              {banHistory.totalBans}
            </div>
            <div>Total Bans</div>
          </div>
          
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: banHistory.activeBans.length > 0 ? '#f44336' : '#4CAF50' }}>
              {banHistory.activeBans.length}
            </div>
            <div>Active Bans</div>
          </div>

          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: userInfo?.hardwareData?.summary?.riskLevel === 'HIGH' ? '#f44336' : userInfo?.hardwareData?.summary?.riskLevel === 'MEDIUM' ? '#FF9800' : '#4CAF50' }}>
              {userInfo?.hardwareData?.summary?.totalHardware || 0}
            </div>
            <div>Hardware</div>
          </div>
        </div>
      </div>
    );
  };

  const renderFlagHistory = () => {
    if (!userInfo?.flagHistory) return null;

    const { flagHistory } = userInfo;

    return (
      <div style={{ padding: '15px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#fff' }}>Flag Summary</h3>
            <div><strong>Unique Countries:</strong> {flagHistory.flagSummary.uniqueCountries}</div>
            <div><strong>Recently Active:</strong> {flagHistory.flagSummary.recentlyActiveFlags}</div>
            <div><strong>Most Used:</strong> {flagHistory.flagSummary.mostUsedFlag}</div>
            <div><strong>Suspicious Activity:</strong> {flagHistory.flagSummary.suspiciousActivity ? 'Yes' : 'No'}</div>
          </div>
        </div>

        <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#fff' }}>Flag History</h3>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#333' }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Flag</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>First Seen</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Last Seen</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Occurrences</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Days Active</th>
                </tr>
              </thead>
              <tbody>
                {flagHistory.history.map((flag, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #444' }}>
                    <td style={{ padding: '8px' }}>{flag.flag}</td>
                    <td style={{ padding: '8px' }}>{formatDate(flag.firstSeen)}</td>
                    <td style={{ padding: '8px' }}>{formatDate(flag.lastSeen)}</td>
                    <td style={{ padding: '8px' }}>{flag.occurrenceCount}</td>
                    <td style={{ padding: '8px' }}>{flag.daysActive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderIIDHistory = () => {
    if (!userInfo?.iidHistory) return null;

    const { iidHistory } = userInfo;

    return (
      <div style={{ padding: '15px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#fff' }}>IID Summary</h3>
            <div><strong>Total IIDs:</strong> {iidHistory.totalIIDs}</div>
            <div><strong>Current IIDs:</strong> {iidHistory.currentIIDs.length}</div>
            <div><strong>Unique Countries:</strong> {iidHistory.iidSummary.uniqueCountries}</div>
            <div><strong>Total Logins:</strong> {iidHistory.iidSummary.totalLogins}</div>
            <div><strong>Suspicious Activity:</strong> {iidHistory.iidSummary.suspiciousActivity ? 'Yes' : 'No'}</div>
          </div>
        </div>

        <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#fff' }}>IID History</h3>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#333' }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>IID</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Country</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>First Seen</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Last Seen</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Logins</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Current</th>
                </tr>
              </thead>
              <tbody>
                {iidHistory.history.map((iid, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #444' }}>
                    <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '12px' }}>
                      {iid.iid.length > 30 ? `${iid.iid.substring(0, 30)}...` : iid.iid}
                    </td>
                    <td style={{ padding: '8px' }}>{iid.country}</td>
                    <td style={{ padding: '8px' }}>{formatDate(iid.firstSeen)}</td>
                    <td style={{ padding: '8px' }}>{formatDate(iid.lastSeen)}</td>
                    <td style={{ padding: '8px' }}>{iid.loginCount}</td>
                    <td style={{ padding: '8px' }}>{iid.isCurrent ? '✓' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderBanHistory = () => {
    if (!userInfo?.banHistory) return null;

    const { banHistory } = userInfo;

    return (
      <div style={{ padding: '15px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#fff' }}>Ban Summary</h3>
            <div><strong>Total Bans:</strong> {banHistory.totalBans}</div>
            <div><strong>Active Bans:</strong> {banHistory.activeBans.length}</div>
            <div><strong>Automatic Bans:</strong> {banHistory.banSummary.automaticBans}</div>
            <div><strong>Manual Bans:</strong> {banHistory.banSummary.manualBans}</div>
            <div><strong>Average Duration:</strong> {formatDuration(banHistory.banSummary.averageDuration)}</div>
          </div>
        </div>

        <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#fff' }}>Ban History</h3>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#333' }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Type</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Start</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Duration</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Auto</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Moderator</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {banHistory.history.map((ban, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #444' }}>
                    <td style={{ padding: '8px' }}>{ban.banType}</td>
                    <td style={{ padding: '8px' }}>{formatDate(ban.startDate)}</td>
                    <td style={{ padding: '8px' }}>{formatDuration(ban.initialDuration)}</td>
                    <td style={{ padding: '8px', color: ban.status === 'Active' ? '#f44336' : '#4CAF50' }}>
                      {ban.status}
                    </td>
                    <td style={{ padding: '8px' }}>{ban.automatic ? 'Yes' : 'No'}</td>
                    <td style={{ padding: '8px' }}>{ban.moderator_name || ban.moderator_id}</td>
                    <td style={{ padding: '8px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ban.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderIPData = () => {
    if (!userInfo?.ipData) return null;

    const { ipData } = userInfo;

    if (ipData.message) {
      return (
        <div style={{ padding: '15px', textAlign: 'center', color: '#ccc' }}>
          {ipData.message}
        </div>
      );
    }

    return (
      <div style={{ padding: '15px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#fff' }}>IP Summary</h3>
            <div><strong>Total IPs:</strong> {ipData.totalIPs}</div>
            <div><strong>Proxy IPs:</strong> {ipData.proxyIPs.length}</div>
            <div><strong>High Threat IPs:</strong> {ipData.highThreatIPs.length}</div>
            <div><strong>Proxy Percentage:</strong> {ipData.ipSummary.proxyPercentage}%</div>
            <div><strong>Suspicious Activity:</strong> {ipData.ipSummary.suspiciousActivity ? 'Yes' : 'No'}</div>
          </div>
        </div>

        <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#fff' }}>IP History</h3>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#333' }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>IP</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Country</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Organization</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Proxy</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Threat</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>First Seen</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {ipData.history.map((ip, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #444' }}>
                    <td style={{ padding: '8px', fontFamily: 'monospace' }}>{ip.ip}</td>
                    <td style={{ padding: '8px' }}>{ip.country}</td>
                    <td style={{ padding: '8px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ip.org}
                    </td>
                    <td style={{ padding: '8px', color: ip.proxy > 0 ? '#f44336' : '#4CAF50' }}>
                      {ip.proxy > 0 ? 'Yes' : 'No'}
                    </td>
                    <td style={{ padding: '8px', color: ip.threatLevel === 'high' ? '#f44336' : '#4CAF50' }}>
                      {ip.threatLevel}
                    </td>
                    <td style={{ padding: '8px' }}>{formatDate(ip.firstSeen)}</td>
                    <td style={{ padding: '8px' }}>{formatDate(ip.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderHardwareData = () => {
    if (!userInfo?.hardwareData) return null;

    const { hardwareData } = userInfo;

    if (hardwareData.message) {
      return (
        <div style={{ padding: '15px', textAlign: 'center', color: '#ccc' }}>
          {hardwareData.message}
        </div>
      );
    }

    if (hardwareData.error) {
      return (
        <div style={{ padding: '15px', textAlign: 'center', color: '#f44336' }}>
          Error loading hardware data: {hardwareData.error}
        </div>
      );
    }

    const { summary, hardwareHistory, hardwareCorrelations, vpnProxyLogs } = hardwareData;

    return (
      <div style={{ padding: '15px' }}>
        {/* Hardware Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4CAF50' }}>
              {summary.totalHardware}
            </div>
            <div>Total Hardware</div>
          </div>
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: summary.suspiciousHardware > 0 ? '#FF9800' : '#4CAF50' }}>
              {summary.suspiciousHardware}
            </div>
            <div>Suspicious Hardware</div>
          </div>
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: summary.vpnDetections > 0 ? '#f44336' : '#4CAF50' }}>
              {summary.vpnDetections}
            </div>
            <div>VPN Detections</div>
          </div>
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: summary.proxyDetections > 0 ? '#f44336' : '#4CAF50' }}>
              {summary.proxyDetections}
            </div>
            <div>Proxy Detections</div>
          </div>
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: summary.multipleUsersHardware > 0 ? '#f44336' : '#4CAF50' }}>
              {summary.multipleUsersHardware}
            </div>
            <div>Multi-User Hardware</div>
          </div>
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: summary.riskLevel === 'HIGH' ? '#f44336' : summary.riskLevel === 'MEDIUM' ? '#FF9800' : '#4CAF50' }}>
              {summary.riskLevel}
            </div>
            <div>Risk Level</div>
          </div>
        </div>

        {/* Hardware History */}
        <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: '0', color: '#fff' }}>Hardware History</h3>
            <button
              onClick={() => setShowNerdsData(!showNerdsData)}
              style={{
                padding: '8px 16px',
                background: showNerdsData ? '#FF9800' : '#2196F3',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
            >
              {showNerdsData ? 'Hide Nerds Data' : 'For Nerds'}
            </button>
          </div>
          
          {showNerdsData ? (
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ color: '#FF9800', marginBottom: '10px' }}>🔬 Detailed Hardware Analysis</h4>
              {hardwareHistory.map((hw, index) => (
                <div key={index} style={{ 
                  background: '#333', 
                  padding: '15px', 
                  borderRadius: '6px', 
                  marginBottom: '10px',
                  border: '1px solid #555'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div>
                      <h5 style={{ color: '#4CAF50', margin: '0 0 8px 0' }}>Hardware Fingerprint</h5>
                      <div style={{ fontFamily: 'monospace', fontSize: '11px', background: '#222', padding: '8px', borderRadius: '4px', wordBreak: 'break-all' }}>
                        {hw.hardware_fingerprint}
                      </div>
                    </div>
                    <div>
                      <h5 style={{ color: '#2196F3', margin: '0 0 8px 0' }}>Network Info</h5>
                      <div><strong>IP:</strong> <span style={{ fontFamily: 'monospace' }}>{hw.ip_address}</span></div>
                      <div><strong>Country:</strong> {hw.country}</div>
                      <div><strong>VPN Detected:</strong> <span style={{ color: hw.vpn_detected ? '#f44336' : '#4CAF50' }}>{hw.vpn_detected ? 'Yes' : 'No'}</span></div>
                      <div><strong>Proxy Detected:</strong> <span style={{ color: hw.proxy_detected ? '#f44336' : '#4CAF50' }}>{hw.proxy_detected ? 'Yes' : 'No'}</span></div>
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '15px' }}>
                    <h5 style={{ color: '#FF9800', margin: '0 0 8px 0' }}>Usage Statistics</h5>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                      <div><strong>First Seen:</strong> {formatDate(hw.firstSeen)}</div>
                      <div><strong>Last Seen:</strong> {formatDate(hw.lastSeen)}</div>
                      <div><strong>Total Logins:</strong> {hw.loginCount}</div>
                      <div><strong>Current:</strong> {hw.isCurrent ? '✓ Active' : '✗ Inactive'}</div>
                    </div>
                  </div>
                  
                  {hw.user_agent && (
                    <div style={{ marginTop: '15px' }}>
                      <h5 style={{ color: '#9C27B0', margin: '0 0 8px 0' }}>User Agent Analysis</h5>
                      <div style={{ fontFamily: 'monospace', fontSize: '11px', background: '#222', padding: '8px', borderRadius: '4px', wordBreak: 'break-all' }}>
                        {hw.user_agent}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#333' }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Hardware Hash</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>IP Address</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Country</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>First Seen</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Last Seen</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Logins</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Current</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>VPN</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Proxy</th>
                  </tr>
                </thead>
                <tbody>
                  {hardwareHistory.map((hw, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #444' }}>
                      <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '12px' }}>
                        {hw.hardware_fingerprint.substring(0, 16)}...
                      </td>
                      <td style={{ padding: '8px', fontFamily: 'monospace' }}>{hw.ip_address}</td>
                      <td style={{ padding: '8px' }}>{hw.country}</td>
                      <td style={{ padding: '8px' }}>{formatDate(hw.firstSeen)}</td>
                      <td style={{ padding: '8px' }}>{formatDate(hw.lastSeen)}</td>
                      <td style={{ padding: '8px' }}>{hw.loginCount}</td>
                      <td style={{ padding: '8px' }}>{hw.isCurrent ? '✓' : ''}</td>
                      <td style={{ padding: '8px', color: hw.vpn_detected ? '#f44336' : '#4CAF50' }}>
                        {hw.vpn_detected ? 'Yes' : 'No'}
                      </td>
                      <td style={{ padding: '8px', color: hw.proxy_detected ? '#f44336' : '#4CAF50' }}>
                        {hw.proxy_detected ? 'Yes' : 'No'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Hardware Correlations */}
        {hardwareCorrelations.length > 0 && (
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#fff' }}>Hardware Correlations</h3>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#333' }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Hardware Hash</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Users</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Total Logins</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Suspicious Score</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>First Seen</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {hardwareCorrelations.map((corr, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #444' }}>
                      <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '12px' }}>
                        {corr.hardware_hash.substring(0, 16)}...
                      </td>
                      <td style={{ padding: '8px' }}>{corr.user_count}</td>
                      <td style={{ padding: '8px' }}>{corr.total_logins}</td>
                      <td style={{ padding: '8px', color: corr.suspicious_score > 0 ? '#f44336' : '#4CAF50' }}>
                        {corr.suspicious_score}
                      </td>
                      <td style={{ padding: '8px' }}>{formatDate(corr.first_seen)}</td>
                      <td style={{ padding: '8px' }}>{formatDate(corr.last_seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VPN/Proxy Logs */}
        {vpnProxyLogs.length > 0 && (
          <div style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#fff' }}>VPN/Proxy Detection Logs</h3>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#333' }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>IP Address</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Type</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Confidence</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Country</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Provider</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>First Detected</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Last Detected</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {vpnProxyLogs.map((log, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #444' }}>
                      <td style={{ padding: '8px', fontFamily: 'monospace' }}>{log.ip_address}</td>
                      <td style={{ padding: '8px', color: log.detection_type === 'vpn' ? '#f44336' : '#FF9800' }}>
                        {log.detection_type.toUpperCase()}
                      </td>
                      <td style={{ padding: '8px' }}>{(log.confidence_score * 100).toFixed(0)}%</td>
                      <td style={{ padding: '8px' }}>{log.country_code}</td>
                      <td style={{ padding: '8px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {log.provider_name || 'Unknown'}
                      </td>
                      <td style={{ padding: '8px' }}>{formatDate(log.first_detected)}</td>
                      <td style={{ padding: '8px' }}>{formatDate(log.last_detected)}</td>
                      <td style={{ padding: '8px' }}>{log.detection_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
        </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview': return renderOverview();
              case 'flags': return renderFlagHistory();
        case 'iids': return renderIIDHistory();
        case 'bans': return renderBanHistory();
        case 'ips': return renderIPData();
        case 'hardware': return renderHardwareData();
        default: return renderOverview();
    }
  };

  return (
    <div style={{ 
      background: '#1a1a1a', 
      color: '#fff', 
      padding: '20px', 
      borderRadius: '10px',
      maxWidth: '1200px',
      margin: '0 auto'
    }}>
      <h2 style={{ margin: '0 0 20px 0', textAlign: 'center' }}>
        Comprehensive User Checker
      </h2>

      {/* Search Interface */}
      <div style={{ 
        background: '#2a2a2a', 
        padding: '20px', 
        borderRadius: '8px', 
        marginBottom: '20px',
        display: 'flex',
        gap: '10px',
        alignItems: 'center'
      }}>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Enter User ID or Username..."
          style={{
            flex: 1,
            padding: '10px',
            background: '#333',
            border: '1px solid #555',
            borderRadius: '4px',
            color: '#fff'
          }}
        />
        <button
          onClick={handleUserCheck}
          disabled={loading}
          style={{
            padding: '10px 20px',
            background: '#4CAF50',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Checking...' : 'Check User'}
        </button>
        <button
          onClick={handlePopulateData}
          disabled={loading}
          style={{
            padding: '10px 20px',
            background: '#FF5722',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Populating...' : 'Populate Data (Admin)'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{ 
          background: '#f44336', 
          color: '#fff', 
          padding: '15px', 
          borderRadius: '8px', 
          marginBottom: '20px' 
        }}>
          {error}
        </div>
      )}

      {/* Results */}
      {userInfo && !userInfo.error && (
        <>
          {/* Tab Navigation */}
          <div style={{ 
            display: 'flex', 
            background: '#2a2a2a', 
            borderRadius: '8px', 
            marginBottom: '20px',
            overflow: 'hidden'
          }}>
            {[
              { key: 'overview', label: 'Overview' },
                      { key: 'flags', label: 'Flags' },
        { key: 'iids', label: 'IIDs' },
        { key: 'bans', label: 'Bans' },
        { key: 'ips', label: 'IPs' },
        { key: 'hardware', label: 'Hardware' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: 1,
                  padding: '15px',
                  background: activeTab === tab.key ? '#4CAF50' : 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  borderRight: '1px solid #444'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{ background: '#1a1a1a', borderRadius: '8px' }}>
            {renderContent()}
          </div>
        </>
      )}
    </div>
  );
};

export default UserChecker;
