/*
 * Admintools IID component 
 */

import React, { useState } from 'react';
import { t } from 'ttag';

import { parseInterval } from '../core/utils';
import { shardOrigin } from '../store/actions/fetch';

async function submitIIDAction(
  action,
  iid,
  reason,
  duration,
  callback,
) {
  let time = parseInterval(duration);
  if (time === 0 && duration !== '0') {
    callback(t`You must enter a duration`);
    return;
  }
  if (!iid) {
    callback(t`You must enter an IID`);
    return;
  }
  if (time > 0) {
    time += Date.now();
  }
  const data = new FormData();
  data.append('iidaction', action);
  data.append('reason', reason);
  data.append('time', time);
  data.append('iid', iid);
  const resp = await fetch(`${shardOrigin}/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: data,
  });
  callback(await resp.text());
}

async function postForm(params) {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    body.append(k, String(v));
  });
  const resp = await fetch(`${shardOrigin}/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error('Server responded with ' + resp.status + ': ' + text);
  }
  const json = await resp.json();
  return json;
}

function copySilently(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
    });
  } else {
    // fallback
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch {
      // ignore
    }
  }
}

function ModIIDtools() {
  const [iIDAction, selectIIDAction] = useState('status');
  const [iid, selectIid] = useState('');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('1d');
  const [resp, setResp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [flagUserId, setFlagUserId] = useState('');
  const [flags, setFlags] = useState([]);
  const [flagError, setFlagError] = useState('');
  const [fetchingFlags, setFetchingFlags] = useState(false);

  // State for IIDsById:
  const [iidsByUserId, setIidsByUserId] = useState('');
  const [iidsResult, setIidsResult] = useState([]);
  const [iidsError, setIidsError] = useState('');
  const [fetchingIids, setFetchingIids] = useState(false);

  // State for IdsByIID:
  const [userIdsByIID, setUserIdsByIID] = useState('');
  const [idsResult, setIdsResult] = useState([]);
  const [idsError, setIdsError] = useState('');
  const [fetchingIds, setFetchingIds] = useState(false);

  // Fetch flags by user ID
  const handleFetchFlags = async (e) => {
    e.preventDefault();
    setFlagError('');
    setFlags([]);
    const parsed = parseInt(flagUserId, 10);
    if (Number.isNaN(parsed)) {
      setFlagError(t`Invalid user ID`);
      return;
    }
    setFetchingFlags(true);
    try {
      const json = await postForm({ getflags: 'true', userId: parsed });
      setFlags(Array.isArray(json.flags) ? json.flags : []);
    } catch (err) {
      console.error(err);
      setFlagError(t`Error fetching flags` + ': ' + err.message);
    } finally {
      setFetchingFlags(false);
    }
  };

  // Fetch IIDs by user ID
  const handleFetchIIDsById = async (e) => {
    e.preventDefault();
    setIidsError('');
    setIidsResult([]);
    const parsed = parseInt(iidsByUserId, 10);
    if (Number.isNaN(parsed)) {
      setIidsError(t`Invalid user ID`);
      return;
    }
    setFetchingIids(true);
    try {
      const json = await postForm({ getIIDsById: 'true', userId: parsed });
      setIidsResult(Array.isArray(json.iids) ? json.iids : []);
    } catch (err) {
      console.error(err);
      setIidsError(t`Error fetching IIDs` + ': ' + err.message);
    } finally {
      setFetchingIids(false);
    }
  };

  // Fetch user IDs by IID
  const handleFetchIdsByIID = async (e) => {
    e.preventDefault();
    setIdsError('');
    setIdsResult([]);
    const iidParam = userIdsByIID.trim();
    if (!iidParam) {
      setIdsError(t`Invalid IID`);
      return;
    }
    setFetchingIds(true);
    try {
      const json = await postForm({ getIdsByIID: 'true', iid: iidParam });
      setIdsResult(Array.isArray(json.userIds) ? json.userIds : []);
    } catch (err) {
      console.error(err);
      setIdsError(t`Error fetching user IDs` + ': ' + err.message);
    } finally {
      setFetchingIds(false);
    }
  };

  const handleSubmitIIDAction = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setResp('');
    try {
      await submitIIDAction(
        iIDAction,
        iid,
        reason,
        duration,
        (ret) => {
          setResp(ret);
        }
      );
    } finally {
      setSubmitting(false);
    }
  };

  const actions = [
    'status', 'givecaptcha', 'ban', 'unban',
    'banid', 'unbanid', 'whitelist', 'unwhitelist',
    'flagById',
    'iidsById',
    'idsByIID',
  ];

  return (
    <div style={{ textAlign: 'center', padding: '0 5%' }}>
      <h3>{t`IID / User Lookup Actions`}</h3>
      <select
        value={iIDAction}
        onChange={(e) => selectIIDAction(e.target.value)}
      >
        {actions.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>

      {/* === flagById === */}
      {iIDAction === 'flagById' && (
        <div style={{ marginTop: '1em' }}>
          <form onSubmit={handleFetchFlags}>
            <p>{t`Enter User ID to view flags:`}</p>
            <input
              value={flagUserId}
              placeholder="35"
              onChange={(e) => setFlagUserId(e.target.value.trim())}
              style={{ width: '100%', maxWidth: '10em', display: 'inline-block' }}
            />
            <button
              type="submit"
              disabled={fetchingFlags}
              style={{ marginLeft: '0.5em' }}
            >
              {t`Submit`}
            </button>
          </form>
          {flagError && <p style={{ color: 'red' }}>{flagError}</p>}
          {flags.length > 0 && (
            <div style={{ marginTop: '1em' }}>
              <p>{t`Flags:`}</p>
              <div>
                {flags.map((code) => {
                  const c = code.toLowerCase();
                  const imgSrc = `cf/${c}.gif`; // adjust path if needed
                  return (
                    <img
                      key={c}
                      src={imgSrc}
                      alt={c}
                      style={{
                        width: '32px',
                        margin: '0 4px',
                        cursor: 'pointer',
                      }}
                      onClick={() => copySilently(c)}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      title={t`Click to copy code`}
                    />
                  );
                })}
              </div>
            </div>
          )}
          {!fetchingFlags && flags.length === 0 && flagUserId && !flagError && (
            <p>{t`No flags found for this user`}</p>
          )}
        </div>
      )}

      {/* === iidsById === */}
      {iIDAction === 'iidsById' && (
        <div style={{ marginTop: '1em' }}>
          <form onSubmit={handleFetchIIDsById}>
            <p>{t`Enter User ID to view associated IIDs:`}</p>
            <input
              value={iidsByUserId}
              placeholder="35"
              onChange={(e) => setIidsByUserId(e.target.value.trim())}
              style={{ width: '100%', maxWidth: '10em', display: 'inline-block' }}
            />
            <button
              type="submit"
              disabled={fetchingIids}
              style={{ marginLeft: '0.5em' }}
            >
              {t`Submit`}
            </button>
          </form>
          {iidsError && <p style={{ color: 'red' }}>{iidsError}</p>}
          {iidsResult.length > 0 && (
            <div style={{ marginTop: '1em', textAlign: 'left', display: 'inline-block' }}>
              <p>{t`Associated IIDs:`}</p>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {iidsResult.map((iidVal) => (
                  <li
                    key={iidVal}
                    style={{
                      marginBottom: '0.25em',
                      cursor: 'pointer',
                    }}
                    onClick={() => copySilently(iidVal)}
                    title={t`Click to copy IID`}
                  >
                    <code>{iidVal}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!fetchingIids && iidsByUserId && iidsResult.length === 0 && !iidsError && (
            <p>{t`No IIDs found for this user`}</p>
          )}
        </div>
      )}

      {/* === idsByIID === */}
      {iIDAction === 'idsByIID' && (
        <div style={{ marginTop: '1em' }}>
          <form onSubmit={handleFetchIdsByIID}>
            <p>{t`Enter IID to view associated User IDs:`}</p>
            <input
              value={userIdsByIID}
              placeholder="xxxx-xxxx-xxxx"
              onChange={(e) => setUserIdsByIID(e.target.value.trim())}
              style={{ width: '100%', maxWidth: '15em', display: 'inline-block' }}
            />
            <button
              type="submit"
              disabled={fetchingIds}
              style={{ marginLeft: '0.5em' }}
            >
              {t`Submit`}
            </button>
          </form>
          {idsError && <p style={{ color: 'red' }}>{idsError}</p>}
          {idsResult.length > 0 && (
            <div style={{ marginTop: '1em', textAlign: 'left', display: 'inline-block' }}>
              <p>{t`Associated User IDs:`}</p>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {idsResult.map((uid) => {
                  const textUid = String(uid);
                  return (
                    <li
                      key={textUid}
                      style={{
                        marginBottom: '0.25em',
                        cursor: 'pointer',
                      }}
                      onClick={() => copySilently(textUid)}
                      title={t`Click to copy User ID`}
                    >
                      <code>{textUid}</code>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {!fetchingIds && userIdsByIID && idsResult.length === 0 && !idsError && (
            <p>{t`No user IDs found for this IID`}</p>
          )}
        </div>
      )}

      {iIDAction !== 'flagById' && iIDAction !== 'iidsById' && iIDAction !== 'idsByIID' && (
        <div style={{ marginTop: '1em' }}>
          <form onSubmit={handleSubmitIIDAction}>
            {(iIDAction === 'ban' || iIDAction === 'banid') && (
              <>
                <p>{t`Reason`}</p>
                <input
                  maxLength={200}
                  style={{ width: '100%' }}
                  value={reason}
                  placeholder={t`Enter Reason`}
                  onChange={(e) => setReason(e.target.value)}
                />
                <p>
                  {t`Duration`}: <input
                    style={{ width: '100%', maxWidth: '7em', display: 'inline-block' }}
                    value={duration}
                    placeholder="1d"
                    onChange={(e) => setDuration(e.target.value.trim())}
                  />
                  {t`(0 = infinite)`}
                </p>
              </>
            )}
            <p>
              {(iIDAction === 'banid' || iIDAction === 'unbanid')
                ? t`User ID`
                : (iIDAction === 'unban' ? t`Unban IID` : t`IID`)
              }:&nbsp;
              <input
                value={iid}
                style={{ width: '100%', maxWidth: '10em', display: 'inline-block' }}
                type="text"
                placeholder={(iIDAction === 'banid' || iIDAction === 'unbanid')
                  ? 'User ID' : 'xxxx-xxxxx-xxxx'}
                onChange={(e) => selectIid(e.target.value.trim())}
              />
              <button
                type="submit"
                disabled={submitting}
                style={{ marginLeft: '0.5em' }}
              >
                {t`Submit`}
              </button>
            </p>
          </form>
          <textarea
            style={{ width: '100%' }}
            rows={resp ? resp.split('\n').length : 10}
            value={resp}
            readOnly
          />
        </div>
      )}
    </div>
  );
}

export default React.memo(ModIIDtools);
