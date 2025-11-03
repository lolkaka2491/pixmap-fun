/*
 * get information about ban
 */

import React, { useState } from 'react';
import { t } from 'ttag';

import useInterval from './hooks/interval';
import useLink from './hooks/link';
import {
  largeDurationToString,
} from '../core/utils';
import { requestBanInfo } from '../store/actions/fetch';

const BanInfo = ({ close, isIdBan }) => {
  const [errors, setErrors] = useState([]);
  const [reason, setReason] = useState(null);
  const [mod, setMod] = useState(null);
  const [expireTs, setExpireTs] = useState(0);
  const [expire, setExpire] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [banDate, setBanDate] = useState(null);

  const link = useLink();

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setErrors([]);
    const info = await requestBanInfo(isIdBan ? '/api/idbaninfo' : '/api/baninfo');
    setSubmitting(false);
    if (info.errors) {
      setErrors(info.errors);
      return;
    }
    const {
      sleft,
      duration,
      mod: newMod,
      reason: newReason,
      since,
    } = info;
    if (sleft) {
      const tsDate = new Date(Date.now() + sleft * 1000);
      setExpireTs(sleft);
      setExpire(tsDate.toLocaleString());
    } else if (duration && duration !== 'Permanent') {
      setExpireTs(duration);
      const tsDate = new Date(Date.now() + duration * 1000);
      setExpire(tsDate.toLocaleString());
    }
    setMod(newMod);
    setReason(newReason);
    setBanDate(since);
  };

  useInterval(() => {
    if (expireTs > 0) {
      setExpireTs(expireTs - 1);
      if (expireTs === 1) {
        handleSubmit();
      }
    }
  }, 1000);

  /* eslint-disable max-len */

  return (
    <div style={{ userSelect: 'text' }}>
      <p>
        {t`You are banned. You think it is unjustified? Check out the `}
        <span
          role="button"
          tabIndex={0}
          className="modallink"
          onClick={() => {
            link('HELP', { target: 'fullscreen' });
            close();
          }}
        >{t`Help`}</span>
        {t` on how to appeal.`}
      </p>
      {errors.map((error) => (
        <p key={error} className="errormessage">
          <span>{t`Error`}</span>:&nbsp;{error}
        </p>
      ))}
      {(reason) && (
        <React.Fragment key="rea">
          <h3>{t`Reason`}:</h3>
          <p>{reason}</p>
        </React.Fragment>
      )}
      {(mod) && (
        <React.Fragment key="mod">
          <h3>{t`By Mod`}:</h3>
          <p>{mod}</p>
        </React.Fragment>
      )}
      {(banDate) && (
        <React.Fragment key="since">
          <h3>{t`Since`}:</h3>
          <p>{banDate}</p>
        </React.Fragment>
      )}
      {(expireTs > 0) && (
        <React.Fragment key="exp">
          <h3>{t`Duration`}:</h3>
          <p>
            {t`Your ban expires at `}
            <span style={{ fontWeight: 'bold' }}>{expire}</span>
            {t` which is in `}
            <span
              style={{ fontWeight: 'bold' }}
            >
              {largeDurationToString(expireTs)}
            </span>
          </p>
        </React.Fragment>
      )}
      {(expireTs < 0) && (
        <React.Fragment key="nb">
          <h3>{t`Unbanned`}:</h3>
          <p>{t`Now that you have seen this message, you are no longer banned.`}</p>
        </React.Fragment>
      )}
      <p>
        {(!reason) && (
          <React.Fragment key="btnr">
            <button
              type="button"
              style={{
                fontWeight: 'bold',
                animation: 'glowing 1300ms infinite',
              }}
              onClick={handleSubmit}
            >
              {(submitting) ? '...' : t`Why?`}
            </button>
            &nbsp;
          </React.Fragment>
        )}
        <button
          type="submit"
          onClick={close}
        >
          {t`OK`}
        </button>
      </p>
    </div>
  );
};

export default React.memo(BanInfo);
