/*
 * Admintools
 */

import React, { useState, useEffect } from 'react';
import { t } from 'ttag';

import { shardOrigin } from '../store/actions/fetch';
import AdminCanvasConfig from './AdminCanvasConfig';

async function submitIPAction(
  action,
  vallist,
  callback,
) {
  const data = new FormData();
  data.append('ipaction', action);
  data.append('ip', vallist);
  const resp = await fetch(`${shardOrigin}/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: data,
  });
  const clonedResp = resp.clone();
  callback(await clonedResp.text());
}

async function getModList(
  callback,
) {
  const data = new FormData();
  data.append('modlist', true);
  const resp = await fetch(`${shardOrigin}/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: data,
  });
  const clonedResp = resp.clone();
  if (resp.ok) {
    callback(await clonedResp.json());
  } else {
    callback([]);
  }
}

async function submitRemMod(
  userId,
  callback,
) {
  const data = new FormData();
  data.append('remmod', userId);
  const resp = await fetch(`${shardOrigin}/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: data,
  });
  const clonedResp = resp.clone();
  callback(resp.ok, await clonedResp.text());
}

async function submitMakeMod(
  userName,
  callback,
) {
  const data = new FormData();
  data.append('makemod', userName);
  const resp = await fetch(`${shardOrigin}/api/modtools`, {
    credentials: 'include',
    method: 'POST',
    body: data,
  });
  const clonedResp = resp.clone();
  if (resp.ok) {
    callback(await clonedResp.json());
  } else {
    callback(await clonedResp.text());
  }
}

function Admintools() {
  const [iPAction, selectIPAction] = useState('iidtoip');
  const [modName, selectModName] = useState('');
  const [txtval, setTxtval] = useState('');
  const [resp, setResp] = useState(null);
  const [modlist, setModList] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [announceType, setAnnounceType] = useState('popup');
  const [announceMsg, setAnnounceMsg] = useState('');
  const [activeSection, setActiveSection] = useState('general');

  useEffect(() => {
    getModList((mods) => setModList(mods));
  }, []);

  const renderGeneralTools = () => (
    <div>
      <br />
      <h3>{t`IP Actions`}</h3>
      <p>
        {t`Do stuff with IPs (one IP per line)`}
      </p>
      <select
        value={iPAction}
        onChange={(e) => {
          const sel = e.target;
          selectIPAction(sel.options[sel.selectedIndex].value);
        }}
      >
        {['iidtoip', 'iptoiid']
          .map((opt) => (
            <option
              key={opt}
              value={opt}
            >
              {opt}
            </option>
          ))}
      </select>
      <br />
      <textarea
        rows="10"
        cols="17"
        value={txtval}
        onChange={(e) => setTxtval(e.target.value)}
      /><br />
      <button
        type="button"
        onClick={() => {
          if (submitting) {
            return;
          }
          setSubmitting(true);
          submitIPAction(
            iPAction,
            txtval,
            (ret) => {
              setSubmitting(false);
              setTxtval(ret);
            },
          );
        }}
      >
        {(submitting) ? '...' : t`Submit`}
      </button>
      <br />
      <div className="modaldivider" />
      <h3>{t`Announcement`}</h3>
      <p>{t`Send an announcement to all connected users.`}</p>
      <select
        value={announceType}
        onChange={e => setAnnounceType(e.target.value)}
      >
        <option value="popup">{t`Popup`}</option>
        <option value="banner">{t`Banner`}</option>
      </select>
      <br />
      <textarea
        rows="4"
        cols="40"
        value={announceMsg}
        onChange={e => setAnnounceMsg(e.target.value)}
        placeholder={t`Announcement message`}
      />
      <br />
      <button
        type="button"
        onClick={async () => {
          if (submitting) return;
          setSubmitting(true);
          try {
            const resp = await fetch('/api/announcement', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ message: announceMsg, type: announceType })
            });
            const data = await resp.json();
            if (resp.ok) {
              setResp('Announcement sent!');
              setAnnounceMsg('');
            } else {
              setResp(data.error || 'Failed to send announcement');
            }
          } catch (e) {
            setResp(e.message);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {(submitting) ? '...' : t`Send Announcement`}
      </button>
      <br />
      <div className="modaldivider" />
      <h3>{t`Manage Moderators`}</h3>
      <p>
        {t`Remove Moderator`}
      </p>
      {(modlist.length) ? (
        <span
          className="unblocklist"
        >
          {modlist.map((mod) => (
            <div
              role="button"
              tabIndex={0}
              key={mod[0]}
              onClick={() => {
                if (submitting) {
                  return;
                }
                setSubmitting(true);
                submitRemMod(mod[0], (success, ret) => {
                  if (success) {
                    setModList(
                      modlist.filter((modl) => (modl[0] !== mod[0])),
                    );
                  }
                  setSubmitting(false);
                  setResp(ret);
                });
              }}
            >
              {`⦸ ${mod[0]} ${mod[1]}`}
            </div>
          ))}
        </span>
      )
        : (
          <p>{t`There are no mods`}</p>
        )}
      <br />

      <p>
        {t`Assign new Mod`}
      </p>
      <p>
        {t`Enter UserName of new Mod`}:&nbsp;
        <input
          value={modName}
          style={{
            display: 'inline-block',
            width: '100%',
            maxWidth: '20em',
          }}
          type="text"
          placeholder={t`User Name`}
          onChange={(evt) => {
            const co = evt.target.value.trim();
            selectModName(co);
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
          submitMakeMod(
            modName,
            (ret) => {
              if (typeof ret === 'string') {
                setResp(ret);
              } else {
                setResp(`Made ${ret[1]} mod successfully.`);
                setModList([...modlist, ret]);
              }
              setSubmitting(false);
            },
          );
        }}
      >
        {(submitting) ? '...' : t`Submit`}
      </button>
      <br />
      <div className="modaldivider" />
      <br />
    </div>
  );

  return (
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
      
      {/* Admin Section Navigation */}
      <div className="admin-nav" style={{ marginBottom: '20px', borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>
        <button
          type="button"
          onClick={() => setActiveSection('general')}
          style={{
            padding: '8px 16px',
            marginRight: '10px',
            backgroundColor: activeSection === 'general' ? '#007bff' : '#f8f9fa',
            color: activeSection === 'general' ? 'white' : '#333',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {t`General Tools`}
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('canvas')}
          style={{
            padding: '8px 16px',
            backgroundColor: activeSection === 'canvas' ? '#007bff' : '#f8f9fa',
            color: activeSection === 'canvas' ? 'white' : '#333',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {t`Canvas Configuration`}
        </button>
      </div>

      {/* Section Content */}
      {activeSection === 'general' && renderGeneralTools()}
      {activeSection === 'canvas' && <AdminCanvasConfig />}
    </div>
  );
}

export default React.memo(Admintools);
