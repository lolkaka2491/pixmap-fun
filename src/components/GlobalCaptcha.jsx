/*
 * Global Captcha that is valid sitewide
 * via api/captcha
 * Displayed in an Alert
 */

import React, { useState } from 'react';
import { t } from 'ttag';

import Captcha from './Captcha';
import socketClient from '../socket/SocketClient';
import {
  requestBanMe,
} from '../store/actions/fetch';
import { useSelector } from 'react-redux';

const GlobalCaptcha = ({ close }) => {
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [legit, setLegit] = useState(false);
  // used to be able to force Captcha rerender on error
  const [captKey, setCaptKey] = useState(Date.now());
  const { captcha: captchaCfg } = useSelector((s) => s.user);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const cfToken = e.target.cfturnstile?.value;
        const text = (captchaCfg?.useCloudflare
          ? (cfToken || '').trim()
          : e.target.captcha.value.trim().slice(0, 6));
        if (submitting || !text) {
          return;
        }
        // detect suspiciously solved captcha
        if (!legit) {
          await requestBanMe(2);
        }
        // ----
        const captchaid = captchaCfg?.useCloudflare ? 'cfturnstile' : e.target.captchaid.value;
        let errorText;
        try {
          setSubmitting(true);
          const retCode = await socketClient
            .sendCaptchaSolution(text, captchaid);
          switch (retCode) {
            case 0:
              close();
              return;
            case 1:
              errorText = t`You took too long, try again.`;
              break;
            case 2:
              errorText = t`You failed your captcha`;
              break;
            case 3:
              errorText = t`No or invalid captcha text`;
              break;
            case 4:
              errorText = t`No captcha id given`;
              break;
            case 5:
              errorText = t`You have been temporarily banned from solving captchas`;
              break;
            default:
              errorText = t`Unknown Captcha Error`;
          }
        } catch (err) {
          errorText = `${err.message}`;
        }
        setSubmitting(false);
        setCaptKey(Date.now());
        setError(errorText);
      }}
    >
      {(error) && (
        <p key={error} className="errormessage">
          <span>{t`Error`}</span>:&nbsp;{error}
        </p>
      )}
      <Captcha autoload key={captKey} setLegit={setLegit} />
      <p>
        <button
          type="button"
          onClick={close}
        >
          {t`Cancel`}
        </button>
       &nbsp;
        <button
          type="submit"
        >
          {(submitting) ? '...' : t`Send`}
        </button>
      </p>
    </form>
  );
};

export default React.memo(GlobalCaptcha);
