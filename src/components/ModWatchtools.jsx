/*
 * ModWatchtools
 * Tools to check who placed what where
 */

import React, { useState, useEffect, useRef } from 'react';
import { useSelector, shallowEqual } from 'react-redux';
import { t } from 'ttag';

import copyTextToClipboard from '../utils/clipboard';
import { parseInterval, coordsFromString } from '../core/utils';
import { shardOrigin } from '../store/actions/fetch';

const keepState = {
  tlcoords: '',
  brcoords: '',
  interval: '15m',
  iid: '',
};

/*
 * sorting function for array sort
 */
function compare(a, b, asc) {
  if (a instanceof Date && b instanceof Date) {
    return asc ? a - b : b - a;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    if (a === b) return 0;
    return asc ? (a ? 1 : -1) : (a ? -1 : 1);
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return asc ? a - b : b - a;
  }
  const sa = String(a), sb = String(b);
  const ret = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
  return asc ? ret : -ret;
}

async function submitWatchAction(
  action,
  canvas,
  tlcoords,
  brcoords,
  interval,
  iid,
  callback,
) {
  let time = parseInterval(interval);
  if (!time) {
    callback({ info: t`Interval is invalid` });
    return;
  }
  time = Date.now() - time;
  const data = new FormData();
  data.append('watchaction', action);
  data.append('canvasid', canvas);
  data.append('ulcoor', tlcoords);
  data.append('brcoor', brcoords);
  data.append('time', time);
  data.append('iid', iid);
  try {
    const resp = await fetch(`${shardOrigin}/api/modtools`, {
      credentials: 'include',
      method: 'POST',
      body: data,
    });
    let ret;
    try {
      ret = await resp.json();
    } catch {
      throw new Error(await resp.text());
    }
    callback(await ret);
  } catch (err) {
    callback({
      info: `Error: ${err.message}`,
    });
  }
}

function ModWatchtools() {
  const [selectedCanvas, selectCanvas] = useState(0);
  const [sortAsc, setSortAsc] = useState(true);
  const [sortBy, setSortBy] = useState(0);
  const [sortSub, setSortSub] = useState(null);
  const [table, setTable] = useState({});
  const [resp, setResp] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [proxyQuality, setProxyQuality] = useState(null);
  const [proxyResults, setProxyResults] = useState({}); // Store proxy results per IP
  const [checkingProxies, setCheckingProxies] = useState({}); // Track which IPs are being checked
  const [detailModal, setDetailModal] = useState(null); // For detailed provider results

  const [
    canvasId,
    canvases,
  ] = useSelector((state) => [
    state.canvas.canvasId,
    state.canvas.canvases,
  ], shallowEqual);

  useEffect(() => {
    selectCanvas(canvasId);
  }, [canvasId]);

  const {
    columns, types, rows, ts,
  } = table;
  const cidColumn = (types) ? (types.indexOf('cid')) : -1;

  const getSortValue = row => {
    const val = row[sortBy];
    if (types[sortBy] === 'user') {
      const parts = (val || '').split(',');
      if (sortSub === 'faction') return parts[2] || '';
      if (sortSub === 'username') return parts[0] || '';
      if (sortSub === 'userId') return parts[1] || '';
      return parts[0] || '';
    }
    return val;
  };
  const onHeaderClick = (colIndex, sub = null) => {
    if (sortBy === colIndex && sortSub === sub) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(colIndex);
      setSortSub(sub);
      setSortAsc(true);
    }
  };

  // Function to export table data as CSV
  const exportToCSV = () => {
    if (!rows || !columns || !types) return;
    
    // Create array for CSV data
    const csvData = [];
    
    // Build a comprehensive header row that includes all possible columns
    let headerRow = ['#', 'IID', 'ct', 'cidr', 'org', 'pc', 'Faction', 'Username', 'User ID', 'last', 'clr', 'time', 'Proxy'];
    
    // Properly escape CSV values
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return 'N/A';
      const stringValue = String(value);
      
      // Clean up multiline values (like org)
      const cleanedValue = stringValue.replace(/\n/g, ' ');
      
      // If the value contains quotes, commas, or newlines, wrap in quotes and escape internal quotes
      if (cleanedValue.includes('"') || cleanedValue.includes(',')) {
        return `"${cleanedValue.replace(/"/g, '""')}"`;
      }
      return cleanedValue;
    };
    
    // Add header row to CSV data
    csvData.push(headerRow.join(','));
    
    // Process each row
    rows.forEach((row) => {
      // Create a mapping of column types to values for this row
      const rowData = {};
      
      // Add row number
      rowData['#'] = row[0];
      
      // Process each column in the row
      row.slice(1).forEach((val, idx) => {
        const type = types[idx + 1];
        const colName = columns[idx + 1];
        
        if (type === 'user') {
          // Handle user column - split into faction, username, user ID
          if (val === null) {
            rowData['Faction'] = 'N/A';
            rowData['Username'] = 'N/A';
            rowData['User ID'] = 'N/A';
          } else {
            const parts = val.split(',');
            if (parts.length < 2) {
              rowData['Faction'] = 'N/A';
              rowData['Username'] = val || 'N/A';
              rowData['User ID'] = 'N/A';
            } else {
              rowData['Username'] = parts[0] || 'N/A';
              rowData['User ID'] = parts[1] || 'N/A';
              rowData['Faction'] = parts.length > 2 ? parts[2] : 'N/A';
            }
          }
        } else if (type === 'cidr') {
          // Handle CIDR column
          rowData['cidr'] = val || 'N/A';
          
          // Add proxy data
          if (val && val.includes('/')) {
            const ip = val.slice(0, val.indexOf('/'));
            const result = proxyResults[ip];
            if (result && !result.error) {
              const proxyPercentage = result.overall ? (100 - result.overall) : 0;
              rowData['Proxy'] = `${proxyPercentage.toFixed(1)}%`;
            } else {
              rowData['Proxy'] = 'N/A';
            }
          } else {
            rowData['Proxy'] = 'N/A';
          }
        } else if (type === 'ts') {
          // Handle timestamp column - format as HH:MM:SS.sss
          if (val === null) {
            rowData['time'] = 'N/A';
          } else {
            const date = new Date(val);
            const hours = date.getHours();
            const minutes = `0${date.getMinutes()}`.slice(-2);
            const seconds = `0${date.getSeconds()}`.slice(-2);
            const ms = `00${date.getMilliseconds()}`.slice(-3);
            rowData['time'] = `${hours}:${minutes}:${seconds}.${ms}`;
          }
        } else if (colName === 'last') {
          // Handle 'last' column (coordinates)
          rowData['last'] = val || 'N/A';
        } else {
          // Handle all other column types
          rowData[colName] = val !== null ? val : 'N/A';
        }
      });
      
      // Build the CSV row in the exact order of the header
      const csvRow = headerRow.map(header => {
        return escapeCSV(rowData[header] || 'N/A');
      });
      
      csvData.push(csvRow.join(','));
    });
    
    // Create and download the CSV file with proper line breaks and BOM for Excel
    const BOM = '\uFEFF'; // UTF-8 BOM for proper Excel encoding
    const csvContent = BOM + csvData.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    
    // Format date for filename: YYYY-MM-DDThh_mm_ss
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 19).replace(/:/g, '_').replace('T', 'T');
    link.setAttribute('download', `pixmap-data-${dateStr}.csv`);
    
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleProxyQualityCheck = async (ip) => {
    // Mark this IP as being checked
    setCheckingProxies(prev => ({
      ...prev,
      [ip]: true
    }));

    try {
      const data = new FormData();
      data.append('proxyquality', true);
      data.append('ip', ip);
      const resp = await fetch(`${shardOrigin}/api/modtools`, {
        credentials: 'include',
        method: 'POST',
        body: data,
      });
      const result = await resp.json();
      
      // Store the result for this IP
      setProxyResults(prev => ({
        ...prev,
        [ip]: result
      }));
    } catch (err) {
      setResp(`Error: ${err.message}`);
      // Store error state for this IP
      setProxyResults(prev => ({
        ...prev,
        [ip]: { error: err.message }
      }));
    } finally {
      // Remove from checking state
      setCheckingProxies(prev => {
        const newState = { ...prev };
        delete newState[ip];
        return newState;
      });
    }
  };

  const getProxyConsensus = (result) => {
    let proxyCount = 0;
    let totalValid = 0;
    let confidence = 0;
    const risks = [];

    // ProxyCheck.io
    if (result.proxycheck?.proxy === 'yes') {
      proxyCount++;
      confidence += 25;
      risks.push(`ProxyCheck: ${result.proxycheck.type}`);
    }
    if (result.proxycheck) totalValid++;

    // GetIPIntel (weighted more heavily due to ML)
    if (result.getipintel?.success && result.getipintel?.score > 0.8) {
      proxyCount++;
      confidence += 30;
      risks.push(`GetIPIntel: ${(result.getipintel.score * 100).toFixed(1)}% confidence`);
    }
    if (result.getipintel?.success) totalValid++;

    // VPNAPI.io
    if (result.vpnapi?.security?.proxy || result.vpnapi?.security?.vpn) {
      proxyCount++;
      confidence += 20;
      if (result.vpnapi.security.vpn) risks.push('VPNAPI: VPN detected');
      if (result.vpnapi.security.proxy) risks.push('VPNAPI: Proxy detected');
      if (result.vpnapi.security.tor) risks.push('VPNAPI: TOR detected');
    }
    if (result.vpnapi?.security) totalValid++;

    // IsProxyIP
    if (result.isproxyip?.proxy === 1) {
      proxyCount++;
      confidence += 15;
      risks.push('IsProxyIP: Proxy detected');
    }
    if (result.isproxyip?.status === 'success') totalValid++;

    // IP-API hosting detection
    if (result.ip_api?.hosting) {
      proxyCount++;
      confidence += 10;
      risks.push('IP-API: Hosting provider');
    }
    if (result.ip_api?.status === 'success') totalValid++;

    const consensusRatio = totalValid > 0 ? (proxyCount / totalValid) : 0;
    
    return {
      isProxy: consensusRatio >= 0.4, // 40% or more providers agree
      confidence: Math.min(confidence, 100),
      consensusRatio: (consensusRatio * 100).toFixed(1),
      risks,
      agreementCount: `${proxyCount}/${totalValid}`,
      level: consensusRatio >= 0.6 ? 'HIGH' : consensusRatio >= 0.4 ? 'MEDIUM' : 'LOW'
    };
  };

  const showProxyDetails = (ip, username, userId) => {
    const result = proxyResults[ip];
    if (!result || result.error) return;

    const consensus = getProxyConsensus(result);

    const providers = [
      {
        name: 'ProxyCheck.io',
        result: result.proxycheck?.proxy === 'yes' ? 'PROXY' : 'NO PROXY',
        details: result.proxycheck?.type || 'N/A',
        reliability: 'High',
        weight: 25
      },
      {
        name: 'GetIPIntel (ML)',
        result: result.getipintel?.success 
          ? (result.getipintel?.proxy || result.getipintel?.score > 0.8 ? 'PROXY' : 'NO PROXY')
          : 'FAILED',
        details: result.getipintel?.success 
          ? `Score: ${(result.getipintel?.score * 100 || 0).toFixed(1)}%`
          : result.getipintel?.message || 'N/A',
        reliability: 'Very High',
        weight: 30
      },
      {
        name: 'VPNAPI.io',
        result: result.vpnapi?.security?.proxy || result.vpnapi?.security?.vpn 
          ? 'PROXY/VPN' : 'NO PROXY',
        details: result.vpnapi?.security 
          ? `VPN: ${result.vpnapi.security.vpn ? 'Yes' : 'No'}, TOR: ${result.vpnapi.security.tor ? 'Yes' : 'No'}`
          : result.vpnapi?.message || 'N/A',
        reliability: 'High',
        weight: 20
      },
      {
        name: 'IsProxyIP',
        result: result.isproxyip?.status === 'success'
          ? (result.isproxyip?.proxy === 1 ? 'PROXY' : 'NO PROXY')
          : 'FAILED',
        details: result.isproxyip?.status === 'error' 
          ? (result.isproxyip?.message || 'Invalid API key')
          : (result.isproxyip?.message || 'N/A'),
        reliability: 'Medium',
        weight: 15
      },
      {
        name: 'IP-API.com',
        result: result.ip_api?.status === 'success' 
          ? (result.ip_api?.proxy || result.ip_api?.hosting ? 'HOSTING/PROXY' : 'NO PROXY') 
          : 'FAILED',
        details: result.ip_api?.message || result.ip_api?.isp || 'N/A',
        reliability: 'Medium',
        weight: 10
      },
      {
        name: 'FreeGeoIP',
        result: result.freegeoip?.success
          ? (result.freegeoip?.proxy ? 'HOSTING/PROXY' : 'NO PROXY')
          : 'FAILED',
        details: result.freegeoip?.country_name || result.freegeoip?.message || 'N/A',
        reliability: 'Low',
        weight: 5
      }
    ];

    // Add additional providers if available
    if (result.ipqualityscore?.success) {
      providers.push({
        name: 'IPQualityScore',
        result: result.ipqualityscore?.proxy ? 'PROXY' : 'NO PROXY',
        details: `Fraud Score: ${result.ipqualityscore?.fraud_score || 0}%`
      });
    }

    if (!result.ipinfo?.error) {
      providers.push({
        name: 'IPInfo.io',
        result: result.ipinfo?.privacy?.proxy ? 'PROXY' : 'NO PROXY',
        details: result.ipinfo?.company?.name || result.ipinfo?.org || 'N/A'
      });
    }

    if (result.ipwhois?.success) {
      providers.push({
        name: 'IPWhois',
        result: result.ipwhois?.connection?.isp?.toLowerCase().includes('proxy') ? 'PROXY' : 'NO PROXY',
        details: result.ipwhois?.connection?.isp || 'N/A'
      });
    }

    if (result.abuseipdb?.success) {
      providers.push({
        name: 'AbuseIPDB',
        result: result.abuseipdb?.data?.abuseConfidenceScore > 50 ? 'SUSPICIOUS' : 'CLEAN',
        details: `Abuse Score: ${result.abuseipdb?.data?.abuseConfidenceScore || 0}%`
      });
    }

    if (result.ip2location?.response === 'OK') {
      providers.push({
        name: 'IP2Location',
        result: result.ip2location?.is_proxy === 'true' ? 'PROXY' : 'NO PROXY',
        details: result.ip2location?.proxy_type || result.ip2location?.country_name || 'N/A'
      });
    }

    if (result.shodan && result.shodan.success !== false) {
      providers.push({
        name: 'Shodan',
        result: result.shodan?.org?.toLowerCase().includes('hosting') || 
                result.shodan?.org?.toLowerCase().includes('datacenter') || 
                result.shodan?.org?.toLowerCase().includes('cloud') ? 'HOSTING' : 'RESIDENTIAL',
        details: result.shodan?.org || result.shodan?.isp || 'N/A'
      });
    }

    setDetailModal({
      ip,
      username,
      userId,
      providers,
      consensus,
      averageScore: consensus.confidence,
      conclusion: consensus.isProxy ? 'PROXY' : 'NO PROXY',
      showIP: false // Initially hide IP
    });
  };

  const getProxyDisplayText = (ip) => {
    const result = proxyResults[ip];
    if (!result) return null;
    if (result.error) return 'Error';
    
    const consensus = getProxyConsensus(result);
    return `${consensus.confidence}% (${consensus.agreementCount})`;
  };

  const getProxyColor = (ip) => {
    const result = proxyResults[ip];
    if (!result || result.error) return '#ccc';

    const consensus = getProxyConsensus(result);
    if (consensus.level === 'HIGH') return '#ff4444'; // High confidence - red
    if (consensus.level === 'MEDIUM') return '#ffaa00'; // Medium confidence - orange  
    return '#00aa00'; // Low confidence - green
  };

  return (
    <>
      <div className="content">

        {resp && (
          <div className="respbox">
            {resp.split('\n').map((line) => (
              <p key={line.slice(0, 3)}>
                {line}
              </p>
            ))}
            <span
              role="button"
              tabIndex={-1}
              className="modallink"
              onClick={() => setResp(null)}
            >
              {t`Close`}
            </span>
          </div>
        )}
        {detailModal && (
          <div className="respbox">
            <h3>
              Proxy Analysis Details for {detailModal.username && detailModal.userId 
                ? `${detailModal.username} (ID: ${detailModal.userId})` 
                : detailModal.ip}
            </h3>
            {detailModal.username && detailModal.userId && (
              <div style={{ marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={() => setDetailModal(prev => ({ ...prev, showIP: !prev.showIP }))}
                  style={{
                    fontSize: '12px',
                    padding: '3px 8px',
                    border: '1px solid #666',
                    borderRadius: '3px',
                    backgroundColor: '#f0f0f0',
                    cursor: 'pointer',
                    marginRight: '10px'
                  }}
                >
                  {detailModal.showIP ? 'Hide IP' : 'Show IP'}
                </button>
                {detailModal.showIP && (
                  <span style={{ color: '#666', fontSize: '12px' }}>
                    IP: {detailModal.ip}
                  </span>
                )}
              </div>
            )}
            {detailModal.consensus && (
              <div style={{ 
                marginBottom: '15px', 
                padding: '10px', 
                backgroundColor: detailModal.consensus.isProxy ? '#2d1515' : '#152d15',
                borderRadius: '5px',
                border: `2px solid ${detailModal.consensus.isProxy ? '#ff4444' : '#00aa00'}`
              }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '5px' }}>
                  <span style={{ color: detailModal.consensus.isProxy ? '#ff4444' : '#00aa00' }}>
                    {detailModal.conclusion}
                  </span>
                  <span style={{ 
                    marginLeft: '10px', 
                    fontSize: '14px', 
                    color: detailModal.consensus.level === 'HIGH' ? '#ff4444' : 
                          detailModal.consensus.level === 'MEDIUM' ? '#ffaa00' : '#666'
                  }}>
                    ({detailModal.consensus.level} CONFIDENCE)
                  </span>
                </div>
                <div style={{ fontSize: '14px', color: '#ccc' }}>
                  Agreement: {detailModal.consensus.agreementCount} providers ({detailModal.consensus.consensusRatio}%)
                  {detailModal.consensus.confidence > 0 && (
                    <span style={{ marginLeft: '10px' }}>
                      Weighted Score: {detailModal.consensus.confidence}%
                    </span>
                  )}
                </div>
                {detailModal.consensus.risks.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    <strong style={{ color: '#ff8888' }}>Risk Factors:</strong>
                    <ul style={{ margin: '5px 0', paddingLeft: '20px', color: '#ffaaaa' }}>
                      {detailModal.consensus.risks.map((risk, index) => (
                        <li key={index} style={{ fontSize: '12px' }}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <h4>Detailed Provider Results:</h4>
            {detailModal.providers.map((provider, index) => (
              <div key={index} style={{ marginBottom: '8px', paddingLeft: '10px' }}>
                <strong>{provider.name}</strong>
                {provider.reliability && (
                  <span style={{ 
                    fontSize: '11px', 
                    color: '#888', 
                    marginLeft: '5px' 
                  }}>
                    ({provider.reliability} reliability{provider.weight ? `, weight: ${provider.weight}` : ''})
                  </span>
                )}:{' '}
                <span style={{ 
                  color: provider.result.includes('PROXY') ? '#ff4444' : 
                        provider.result === 'NO PROXY' ? '#00aa00' : '#666',
                  fontWeight: 'bold'
                }}>
                  {provider.result}
                </span>
                {provider.details && provider.details !== 'N/A' && (
                  <span style={{ color: '#666', marginLeft: '5px' }}>
                    ({provider.details})
                  </span>
                )}
              </div>
            ))}
            <span
              role="button"
              tabIndex={-1}
              className="modallink"
              onClick={() => setDetailModal(null)}
              style={{ marginTop: '15px', display: 'inline-block' }}
            >
              {t`Close`}
            </span>
          </div>
        )}
        <p>{t`Check who placed in an area`}</p>
        <p>{t`Canvas`}:&nbsp;
          <select
            value={selectedCanvas}
            onChange={(e) => {
              const sel = e.target;
              selectCanvas(sel.options[sel.selectedIndex].value);
            }}
          >
            {Object.keys(canvases)
              .filter((c) => !canvases[c].v)
              .map((canvas) => (
                <option
                  key={canvas}
                  value={canvas}
                >
                  {canvases[canvas].title}
                </option>
              ))}
          </select>
          {` ${t`Interval`}: `}
          <input
            defaultValue={keepState.interval}
            style={{
              display: 'inline-block',
              width: '100%',
              maxWidth: '5em',
            }}
            type="text"
            placeholder="15m"
            onChange={(evt) => {
              const newInterval = evt.target.value.trim();
              keepState.interval = newInterval;
            }}
          />
          {` ${t`IID (optional)`}: `}
          <input
            defaultValue={keepState.iid}
            style={{
              display: 'inline-block',
              width: '100%',
              maxWidth: '10em',
            }}
            type="text"
            placeholder="xxxx-xxxxx-xxxx"
            onChange={(evt) => {
              const newIid = evt.target.value.trim();
              keepState.iid = newIid;
            }}
          />
        </p>
        <p>
          {t`Top-left corner`}:&nbsp;
          <input
            defaultValue={keepState.tlcoords}
            style={{
              display: 'inline-block',
              width: '100%',
              maxWidth: '15em',
            }}
            type="text"
            placeholder="X_Y or URL"
            onChange={(evt) => {
              let co = evt.target.value.trim();
              co = coordsFromString(co);
              if (co) {
                co = co.join('_');
                evt.target.value = co;
              }
              keepState.tlcoords = co;
            }}
          />
        </p>
        <p>
          {t`Bottom-right corner`}:&nbsp;
          <input
            defaultValue={keepState.brcoords}
            style={{
              display: 'inline-block',
              width: '100%',
              maxWidth: '15em',
            }}
            type="text"
            placeholder="X_Y or URL"
            onChange={(evt) => {
              let co = evt.target.value.trim();
              co = coordsFromString(co);
              if (co) {
                co = co.join('_');
                evt.target.value = co;
              }
              keepState.brcoords = co;
            }}
          />
        </p>
        <button
          type="button"
          onClick={() => {
            if (submitting) {
              return;
            }
            setSubmitting(true);
            submitWatchAction(
              'all',
              selectedCanvas,
              keepState.tlcoords,
              keepState.brcoords,
              keepState.interval,
              keepState.iid,
              (ret) => {
                setSubmitting(false);
                setResp(ret.info);
                if (ret.rows) {
                  setSortBy(0);
                  setTable({
                    columns: ret.columns,
                    types: ret.types,
                    rows: ret.rows,
                    ts: Date.now(),
                  });
                }
              },
            );
          }}
        >
          {(submitting) ? '...' : t`Get Pixels`}
        </button>
        <button
          type="button"
          onClick={() => {
            if (submitting) {
              return;
            }
            setSubmitting(true);
            submitWatchAction(
              'summary',
              selectedCanvas,
              keepState.tlcoords,
              keepState.brcoords,
              keepState.interval,
              keepState.iid,
              (ret) => {
                setSubmitting(false);
                setResp(ret.info);
                if (ret.rows) {
                  setSortBy(0);
                  setTable({
                    columns: ret.columns,
                    types: ret.types,
                    rows: ret.rows,
                    ts: Date.now(),
                  });
                }
              },
            );
          }}
        >
          {(submitting) ? '...' : t`Get Users`}
        </button>
      </div>
      <PixelVisualiser canvasId={selectedCanvas} canvases={canvases} />
      <br />
      {(rows && columns && types) && (
        <React.Fragment key={ts}>
          <div className="modaldivider" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontWeight: 'bold' }}>{rows.length} {rows.length === 1 ? 'result' : 'results'}</span>
            <button
              type="button"
              onClick={exportToCSV}
              style={{
                fontSize: '12px',
                padding: '4px 8px',
                cursor: 'pointer'
              }}
            >
              Export to CSV
            </button>
          </div>
          <table style={{ fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {columns.slice(1).map((col, ind) => {
                  // If this is the user column, split it into three columns
                  if (types[ind + 1] === 'user') {
                    return (
                      <React.Fragment key={col}>
                        <th
                          style={{
                            cursor: 'pointer',
                            padding: '4px 6px',
                            fontWeight: sortBy === ind + 1 && sortSub === 'faction' ? 'normal' : 'bold',
                            position: 'sticky',
                            top: 0,
                          }}
                          onClick={() => onHeaderClick(ind + 1, 'faction')}
                        >
                          Faction{sortBy === ind + 1 && sortSub === 'faction' ? (sortAsc ? ' ↑' : ' ↓') : ''}
                        </th>
                        <th
                          style={{
                            cursor: 'pointer',
                            padding: '4px 6px',
                            fontWeight: sortBy === ind + 1 && sortSub === 'username' ? 'normal' : 'bold',
                            position: 'sticky',
                            top: 0,
                          }}
                          onClick={() => onHeaderClick(ind + 1, 'username')}
                        >
                          Username{sortBy === ind + 1 && sortSub === 'username' ? (sortAsc ? ' ↑' : ' ↓') : ''}
                        </th>
                        <th
                          style={{
                            cursor: 'pointer',
                            padding: '4px 6px',
                            fontWeight: sortBy === ind + 1 && sortSub === 'userId' ? 'normal' : 'bold',
                            position: 'sticky',
                            top: 0,
                          }}
                          onClick={() => onHeaderClick(ind + 1, 'userId')}
                        >
                          User ID{sortBy === ind + 1 && sortSub === 'userId' ? (sortAsc ? ' ↑' : ' ↓') : ''}
                        </th>
                      </React.Fragment>
                    );
                  }
                  
                  return (
                    <th
                      key={col}
                      style={{
                        cursor: 'pointer',
                        padding: '4px 6px',
                        fontWeight: sortBy === ind + 1 ? 'normal' : 'bold',
                        position: 'sticky',
                        top: 0,
                      }}
                      onClick={() => onHeaderClick(ind + 1)}
                    >
                      {col}{sortBy === ind + 1 ? (sortAsc ? ' ↑' : ' ↓') : ''}
                    </th>
                  );
                })}
                {types.includes('cidr') && (
                  <th style={{ padding: '4px 6px', position: 'sticky', top: 0 }}>Proxy</th>
                )}
              </tr>
            </thead>
            <tbody style={{ userSelect: 'text' }}>
              {rows.slice()
                .sort((a, b) => compare(getSortValue(a), getSortValue(b), sortAsc))
                .map((row) => (
                  <tr key={row[0]}>
                    {row.slice(1).map((val, ind) => {
                      const type = types[ind + 1];
                      if (val === null) {
                        return <td style={{ padding: '2px 6px' }} key={ind}>N/A</td>;
                      }
                      switch (type) {
                        case 'ts': {
                          const date = new Date(val);
                          const hours = date.getHours();
                          const minutes = `0${date.getMinutes()}`.slice(-2);
                          const seconds = `0${date.getSeconds()}`.slice(-2);
                          const ms = `00${date.getMilliseconds()}`.slice(-3);
                          return (
                            <td style={{ padding: '2px 6px' }} key={ind} title={date.toLocaleDateString()}>
                              {`${hours}:${minutes}:${seconds}.${ms}`}
                            </td>
                          );
                        }
                        case 'clr': {
                          const cid = cidColumn > 0 ? row[cidColumn] : selectedCanvas;
                          const rgb = canvases[cid]?.colors?.[val];
                          if (!rgb) {
                            return <td style={{ padding: '2px 6px' }} key={ind}>{val}</td>;
                          }
                          return (
                            <td style={{ backgroundColor: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`, padding: '2px 6px' }} key={ind}>
                              {val}
                            </td>
                          );
                        }
                        case 'coord': {
                          const cid = cidColumn > 0 ? row[cidColumn] : selectedCanvas;
                          const ident = canvases[cid]?.ident;
                          const coords = `./#${ident},${val},47`;
                          return (
                            <td style={{ padding: '2px 6px' }} key={ind}>
                              <a href={coords}>{val}</a>
                            </td>
                          );
                        }
                        case 'flag': {
                          const flag = val.toLowerCase();
                          return (
                            <td style={{ padding: '2px 6px' }} key={ind} title={val}>
                              <img style={{ height: '1em', imageRendering: 'crisp-edges' }} alt={val} src={`/cf/${flag}.gif`} />
                            </td>
                          );
                        }
                        case 'cid': {
                          const ident = canvases?.ident;
                          return <td style={{ padding: '2px 6px' }} key={ind}>{ident}</td>;
                        }
                        case 'cidr': {
                          const ip = val.slice(0, val.indexOf('/'));
                          return (
                            <td style={{ padding: '2px 6px' }} key={ind}>
                              <span role="button" tabIndex={-1} style={{ cursor: 'pointer', whiteSpace: 'initial' }} title={t`Copy to Clipboard`} onClick={() => copyTextToClipboard(ip)}>
                                {val}
                              </span>
                            </td>
                          );
                        }
                        case 'uuid': {
                          return (
                            <td style={{ padding: '2px 6px' }} key={ind}>
                              <span role="button" tabIndex={-1} style={{ cursor: 'pointer', whiteSpace: 'initial' }} title={t`Copy to Clipboard`} onClick={() => copyTextToClipboard(val)}>
                                {val}
                              </span>
                            </td>
                          );
                        }
                        case 'user': {
                          const parts = val.split(',');
                          if (parts.length < 2) {
                            return (
                              <React.Fragment key={ind}>
                                <td style={{ padding: '2px 6px' }}></td>
                                <td style={{ padding: '2px 6px' }}>{val}</td>
                                <td style={{ padding: '2px 6px' }}></td>
                              </React.Fragment>
                            );
                          }
                          
                          const username = parts[0];
                          const userId = parts[1];
                          const factionTag = parts.length > 2 ? parts[2] : null;
                          
                          return (
                            <React.Fragment key={ind}>
                              <td style={{ padding: '2px 6px' }}>
                                {factionTag && (
                                  <span
                                    style={{
                                      color: '#FF6B35',
                                      fontWeight: 'bold',
                                      fontSize: '0.9em',
                                    }}
                                    title={`Faction: ${factionTag}`}
                                  >
                                    {factionTag}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '2px 6px' }}>
                              <span
                                role="button"
                                tabIndex={-1}
                                style={{
                                  cursor: 'pointer',
                                  whiteSpace: 'initial',
                                }}
                                  title={t`Copy Username to Clipboard`}
                                  onClick={() => copyTextToClipboard(username)}
                              >
                                  {username}
                                </span>
                              </td>
                              <td style={{ padding: '2px 6px' }}>
                                  <span
                                  role="button"
                                  tabIndex={-1}
                                    style={{
                                    cursor: 'pointer',
                                    whiteSpace: 'initial',
                                    }}
                                  title={t`Copy User ID to Clipboard`}
                                  onClick={() => copyTextToClipboard(userId)}
                                >
                                  {userId}
                              </span>
                            </td>
                            </React.Fragment>
                          );
                        }
                        default: {
                          return <td style={{ padding: '2px 6px' }} key={ind}>{val}</td>;
                        }
                      }
                    })}
                    {/* Add Proxy result cell for CIDR rows */}
                    {types.includes('cidr') && (() => {
                      const cidrIndex = types.indexOf('cidr');
                      const cidrValue = row[cidrIndex];
                      if (cidrValue) {
                        const ip = cidrValue.slice(0, cidrValue.indexOf('/'));
                        const isChecking = checkingProxies[ip];
                        const hasResult = proxyResults[ip];
                        
                        // Extract user information from the same row
                        const userIndex = types.indexOf('user');
                        let username = null;
                        let userId = null;
                        if (userIndex >= 0 && row[userIndex]) {
                          const parts = row[userIndex].split(',');
                          username = parts[0];
                          userId = parts[1];
                        }
                        if (isChecking) {
                          // Show loading state
                          return (
                            <td style={{ padding: '2px 6px' }} key="proxy">
                              <span style={{ color: '#999', fontStyle: 'italic' }}>
                                Checking...
                              </span>
                            </td>
                          );
                        } else if (hasResult) {
                          // Show result with click for details
                          const displayText = getProxyDisplayText(ip);
                          const color = getProxyColor(ip);
                          
                          return (
                            <td style={{ padding: '2px 6px' }} key="proxy">
                              {displayText ? (
                                <span
                                  role="button"
                                  tabIndex={-1}
                                  style={{
                                    cursor: 'pointer',
                                    color: color,
                                    fontWeight: 'bold',
                                    textDecoration: 'underline'
                                  }}
                                  title={t`Click for details`}
                                  onClick={() => showProxyDetails(ip, username, userId)}
                                >
                                  {displayText}
                                </span>
                              ) : (
                                <span style={{ color: '#ff4444' }}>Error</span>
                              )}
                            </td>
                          );
                        } else {
                          // Show check button
                          return (
                            <td style={{ padding: '2px 6px' }} key="proxy">
                              <button
                                type="button"
                                style={{
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  border: '1px solid #ccc',
                                  borderRadius: '3px',
                                  backgroundColor: '#f0f0f0',
                                  cursor: 'pointer'
                                }}
                                onClick={() => handleProxyQualityCheck(ip)}
                                title={t`Check proxy status for this IP`}
                              >
                                Check
                              </button>
                            </td>
                          );
                        }
                      }
                      return (<td style={{ padding: '2px 6px' }} key="proxy">N/A</td>);
                    })()}
                  </tr>
                ))}
            </tbody>
          </table>
        </React.Fragment>
      )}
    </>
  );
}

// possible types:
// 'coord', 'clr', 'ts', 'user', 'uuid', 'string', 'number', 'flag', 'cid'


function PixelVisualiser({ canvasId, canvases }) {
  const [iid, setIid] = useState('');
  const [tl, setTl] = useState('');
  const [br, setBr] = useState('');
  const [since, setSince] = useState('1d');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [frames, setFrames] = useState([]);
  const [dims, setDims] = useState(null);
  const [params, setParams] = useState(null);
  const [currentFrame, setCurrentFrame] = useState(0);

  const canvasRef = useRef(null);
  const lineToggleRef = useRef(null);

  useEffect(() => {
    if (dims && frames.length) {
      const canvas = canvasRef.current;
      canvas.width = dims.widthPx * dims.scale;
      canvas.height = dims.heightPx * dims.scale;
      drawFrame(currentFrame);
    }
  }, [dims, frames, currentFrame]);

  const parseCoord = (str) => {
    const nums = str.match(/-?\d+/g);
    if (!nums || nums.length < 2) throw new Error('Invalid coordinate format: ' + str);
    return nums.slice(0, 2).map(n => parseInt(n, 10));
  };

  const drawFrame = (idx) => {
    const canvas = canvasRef.current;
    if (!canvas || !params) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const showLines = lineToggleRef.current?.checked;

    for (let i = 0; i <= idx; i++) {
      const f = frames[i];
      if (!f) continue;
      ctx.fillStyle = `rgb(${f.col[0]},${f.col[1]},${f.col[2]})`;
      ctx.fillRect(f.x, f.y, f.scale, f.scale);
      if (showLines && i > 0) {
        const p = frames[i - 1];
        ctx.beginPath();
        ctx.moveTo(p.x + p.scale / 2, p.y + p.scale / 2);
        ctx.lineTo(f.x + f.scale / 2, f.y + f.scale / 2);
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  };

  const handleVisualise = async () => {
    setSubmitting(true);
    setError('');
    try {
      const offset = parseInterval(since);
      if (!offset) throw new Error('Invalid time format');

      const [x1i, y1i] = parseCoord(tl);
      const [x2i, y2i] = parseCoord(br);
      const [x1, x2] = x1i < x2i ? [x1i, x2i] : [x2i, x1i];
      const [y1, y2] = y1i < y2i ? [y1i, y2i] : [y2i, y1i];

      const res = await fetch(`${shardOrigin}/api/modtools`, {
        method: 'POST',
        credentials: 'include',
        body: new URLSearchParams({
          watchaction: 'all',
          canvasid: canvasId,
          ulcoor: `${x1}_${y1}`,
          brcoor: `${x2}_${y2}`,
          time: String(Date.now() - offset),
          iid,
        }),
      });

      const data = await res.json();
      const rows = Array.isArray(data) ? data : data.rows;
      if (!rows?.length) throw new Error('No pixels returned');
      rows.sort((a, b) => a[3] - b[3]);

      const coords = rows.map(r => r[1].split(',').map(Number));
      const xs = coords.map(c => c[0]);
      const ys = coords.map(c => c[1]);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const buf = 10;
      const scale = 4;
      const gx1 = minX - buf;
      const gy1 = minY - buf;
      const widthPx = Math.max(...xs) - gx1 + buf + 1;
      const heightPx = Math.max(...ys) - gy1 + buf + 1;
      setDims({ widthPx, heightPx, scale });

      const startTime = rows[0][3];
      const colors = canvases[canvasId]?.colors || [];
      const newFrames = rows.map(r => {
        const [x, y] = r[1].split(',').map(Number);
        return {
          x: (x - gx1) * scale,
          y: (y - gy1) * scale,
          col: colors[r[2]] || [0, 0, 0],
          delay: Math.max(1, Math.floor((r[3] - startTime) / 50)),
          scale
        };
      });

      setParams({ scale });
      setFrames(newFrames);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSlider = (e) => {
    const idx = Number(e.target.value);
    setCurrentFrame(idx);
  };

  return (
    <div className="content">
      <hr />
      <p><strong>Visualise pixels in an area</strong></p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <p>IID: <input value={iid} onChange={e => setIid(e.target.value)} placeholder="xxxx-xxxxx-xxxx" /></p>
      <p>Top-left corner: <input value={tl} onChange={e => setTl(e.target.value)} placeholder="X_Y" /></p>
      <p>Bottom-right corner: <input value={br} onChange={e => setBr(e.target.value)} placeholder="X_Y" /></p>
      <p>Since: <input value={since} onChange={e => setSince(e.target.value)} placeholder="1d" /></p>
      <p>
        <label>
          <input type="checkbox" ref={lineToggleRef} /> Show red lines
        </label>
      </p>
      <button onClick={handleVisualise} disabled={submitting}>
        {submitting ? '...' : 'Visualise'}
      </button>

      {frames.length > 0 && dims && (
        <div style={{ textAlign: 'center', marginTop: '1em' }}>
          <canvas ref={canvasRef} style={{ border: '1px solid #000' }} />
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            value={currentFrame}
            onChange={handleSlider}
            style={{ width: '100%' }}
          />
        </div>
      )}
    </div>
  );
}

export default React.memo(ModWatchtools);
