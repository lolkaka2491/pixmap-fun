import React, { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { t } from 'ttag';
import { IoReloadCircleSharp } from 'react-icons/io5';
import { shardOrigin } from '../store/actions/fetch';

async function getUrlAndId() {
  const url = `${shardOrigin}/captcha.png`;
  const resp = await fetch(url, {
    cache: 'no-cache',
  });
  if (resp.ok) {
    const captchaid = resp.headers.get('captcha-id');
    const pngBlob = await resp.blob();
    return [URL.createObjectURL(pngBlob), captchaid];
  }
  if (resp.status === 429) {
    const data = await resp.json();
    throw new Error(data.error || 'You have been temporarily banned from requesting captchas');
  }
  throw new Error(t`Could not load captcha`);
}

const floatStyle = {
  width: '100%',
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%,-50%)',
};

const Captcha = ({ autoload, width, setLegit }) => {
  const [captchaData, setCaptchaData] = useState({});
  const [errors, setErrors] = useState([]);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const { captcha: captchaCfg } = useSelector((s) => s.user);
  const [useCF, setUseCF] = useState(!!captchaCfg?.useCloudflare);
  const tsContainerRef = useRef(null);
  const tsWidgetIdRef = useRef(null);

  // Turnstile script loader
  useEffect(() => {
    setUseCF(!!captchaCfg?.useCloudflare);
    if (captchaCfg?.useCloudflare) {
      if (!captchaCfg?.cfSiteKey) {
        console.warn('[Captcha] Missing CF_TURNSTILE_SITE_KEY');
        setErrors([t`Could not load captcha`]);
        setUseCF(false);
        return;
      }
      if (!document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile/v0/"]')) {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.onload = () => {
          console.log('[Captcha] Turnstile script loaded');
        };
        s.onerror = () => {
          console.warn('[Captcha] Failed to load Turnstile script');
          setErrors([t`Could not load captcha`]);
          setUseCF(false);
        };
        document.head.appendChild(s);
      }
    }
  }, [captchaCfg]);

  // Render Turnstile when script and container are ready
  useEffect(() => {
    if (!useCF) return undefined;
    let poll;
    let fallbackTimer;
    const tryRender = () => {
      // eslint-disable-next-line no-underscore-dangle
      const api = window?.turnstile;
      if (api && tsContainerRef.current && !tsWidgetIdRef.current) {
        try {
          tsWidgetIdRef.current = api.render(tsContainerRef.current, {
            sitekey: captchaCfg.cfSiteKey,
            callback: (token) => {
              const hidden = document.getElementById('cf-turnstile-token');
              if (hidden) hidden.value = token;
              setLegit && setLegit(true);
            },
            'refresh-expired': 'auto',
            size: 'flexible',
          });
          clearInterval(poll);
          clearTimeout(fallbackTimer);
        } catch (e) {
          // ignore and retry
        }
      }
    };
    if (window?.turnstile) {
      tryRender();
    } else {
      poll = setInterval(tryRender, 200);
    }
    // Fallback to legacy captcha after 4s if still not rendered
    fallbackTimer = setTimeout(() => {
      if (!tsWidgetIdRef.current) {
        setErrors([t`Could not load captcha`]);
        setUseCF(false);
      }
    }, 4000);
    return () => {
      if (poll) clearInterval(poll);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [useCF, captchaCfg, tsContainerRef]);

  const reloadCaptcha = async () => {
    if (imgLoaded) {
      setImgLoaded(false);
    }
    try {
      if (!useCF) {
        const captchaResponse = await getUrlAndId();
        const [pngUrl, captchaid] = captchaResponse;
        setCaptchaData({ url: pngUrl, id: captchaid });
      } else if (window?.turnstile && tsWidgetIdRef.current) {
        try {
          window.turnstile.reset(tsWidgetIdRef.current);
        } catch (_) {
          // ignore
        }
      }
    } catch (error) {
      setErrors([error.message]);
    }
  };

  useEffect(() => {
    if (autoload) {
      reloadCaptcha();
    }
    // Load policy acceptance status from localStorage
    setPolicyAccepted(localStorage.getItem('policyAccepted') === 'true');
  }, [autoload]);

  const contWidth = width || 100;

  const handleSend = () => {
    if (policyAccepted) {
      // Your existing send logic here
      // Hide the policy text after sending
      localStorage.setItem('policyAccepted', 'true');
    } else {
      // Show an error message or handle accordingly
    }
  };

  const handlePolicyToggle = () => {
    const policyInfo = document.getElementById('policy-info');
    if (policyInfo.style.display === 'none') {
      policyInfo.style.display = 'block';
    } else {
      policyInfo.style.display = 'none';
    }
  };

  return (
    <>
      <p>
        {t`Type the characters from the following image:`}
        &nbsp;
        <span style={{ fontSize: 11 }}>
          ({t`Tip: Not case-sensitive; I and l are the same`})
        </span>
      </p>
      {errors.map((error) => (
        <p key={error} className="errormessage">
          <span>{t`Error`}</span>:&nbsp;{error}
        </p>
      ))}
      {!useCF && (
      <div
        style={{
          width: `${contWidth}%`,
          paddingTop: `${Math.floor(contWidth * 0.6)}%`,
          position: 'relative',
          display: 'inline-block',
          backgroundColor: '#e0e0e0',
        }}
      >
        {(captchaData.url)
          ? (
            <img
              style={{
                ...floatStyle,
                opacity: (imgLoaded) ? 1 : 0,
                transition: '100ms',
              }}
              src={captchaData.url}
              alt="CAPTCHA"
              onLoad={() => {
                setErrors([]);
                setImgLoaded(true);
              }}
              onError={() => {
                setErrors([t`Could not load captcha`]);
              }}
            />
          )
          : (
            <span
              style={floatStyle}
              role="button"
              tabIndex={0}
              title={t`Load Captcha`}
              className="modallink"
              onClick={reloadCaptcha}
              onKeyPress={reloadCaptcha}
            >
              {t`Click to Load Captcha`}
            </span>
          )}
      </div>
      )}
      {useCF && (
        <div
          ref={tsContainerRef}
          style={{
            width: `${contWidth}%`,
            minHeight: 80,
            display: 'inline-block',
            backgroundColor: '#e0e0e0',
          }}
        />
      )}
      <p>
        {!useCF && (
          <>
            {t`Can't read? Reload:`}&nbsp;
            <span
              role="button"
              tabIndex={-1}
              title={t`Reload`}
              className="modallink"
              style={{ fontSize: 28 }}
              onClick={reloadCaptcha}
            >
              <IoReloadCircleSharp />
            </span>
          </>
        )}
      </p>
      {!useCF && (
        <>
          <input
            name="captcha"
            placeholder={t`Enter Characters`}
            type="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            onChange={() => setLegit && setLegit(true)}
            autoFocus={autoload}
            style={{
              width: '6em',
              fontSize: 21,
              margin: 5,
            }}
          />
          <input type="hidden" name="captchaid" value={captchaData.id || '0'} />
        </>
      )}
      {useCF && (
        <input type="hidden" id="cf-turnstile-token" name="cfturnstile" value="" />
      )}
      
      {/* ToS and Privacy Policy Text */}
      {!policyAccepted && (
        <>
          <p>
            {t`By solving the captcha, You agree to the `}
            <span
              style={{ color: 'blue', cursor: 'pointer' }}
              onClick={handlePolicyToggle}
            >
              {t`Terms of Service and Privacy Policy`}
            </span>
          </p>
          <div id="policy-info" style={{ display: 'none' }}>
            <h2>{t`Privacy and Information Policy`}</h2>
            <p>{t`**Introduction**`}</p>
            <p>{t`This Privacy and Information Policy ("Policy") outlines the rules and guidelines regarding the use of private and identifying information within pixmap.fun ("Game"). By accepting this Policy, all players agree to abide by its terms to ensure a safe, respectful, and enjoyable gaming environment for everyone.`}</p>
            <h3>{t`1. Prohibited Use of Private and Identifying Information`}</h3>
            <p>{t`1.1 **Private and Identifying Information Defined**: For the purposes of this Policy, "Private and Identifying Information" includes, but is not limited to, real names, addresses, phone numbers, email addresses, social media handles, financial information, and any other personally identifiable information.`}</p>
            <p>{t`1.2 **Prohibited Activities**: Players are strictly prohibited from using, sharing, or disseminating any Private and Identifying Information of other players within the Game or any other channel/platform. This includes, but is not limited to:`}</p>
            <ul>
              <li>{t`Sharing another player's real-world identity without their consent.`}</li>
              <li>{t`Revealing or discussing another player's private or personal information in public or private chat within the Game or any other channel/platform.`}</li>
              <li>{t`Engaging in doxing (publishing private information about another individual) or any related activity.`}</li>
            </ul>
            <p>{t`1.3 **Reporting Violations**: Players are encouraged to report any violations of this Policy to the Game Administrators via Discord.`}</p>
            <h3>{t`2. Use of Information by Game Administrators`}</h3>
            <p>{t`2.1 **Collection and Use of Information**: Game Administrators may collect and use Private and Identifying Information solely for the purpose of maintaining the Game, ensuring compliance with the Game's rules, and protecting the community from abuse.`}</p>
            <p>{t`2.2 **Purpose of Use**: The use of such information by Administrators includes, but is not limited to:`}</p>
            <ul>
              <li>{t`Investigating reports of rule violations, including the misuse of Private and Identifying Information.`}</li>
              <li>{t`Banning or restricting access to the Game for players who violate this Policy.`}</li>
              <li>{t`Communicating with players regarding their account or behavior in the Game.`}</li>
            </ul>
            <p>{t`2.3 **Confidentiality**: Administrators are required to handle all Private and Identifying Information with the highest level of confidentiality and will not disclose such information to third parties except where required by law or necessary for the enforcement of Game rules.`}</p>
            <h3>{t`3. Player Consent`}</h3>
            <p>{t`By accepting this Policy, players acknowledge and agree to the following:`}</p>
            <ul>
              <li>{t`They will not use or share Private and Identifying Information about other players.`}</li>
              <li>{t`They understand that Game Administrators may use their Private and Identifying Information as outlined in this Policy.`}</li>
              <li>{t`They consent to the collection and use of their information by Game Administrators for the purposes stated in this Policy.`}</li>
            </ul>
            <h3>{t`4. Consequences of Policy Violations`}</h3>
            <p>{t`4.1 **Disciplinary Actions**: Any player found to be in violation of this Policy may be subject to disciplinary actions, including but not limited to:`}</p>
            <ul>
              <li>{t`Temporary suspension from the Game.`}</li>
              <li>{t`Permanent banning from the Game.`}</li>
              <li>{t`Reporting to relevant authorities if the violation involves illegal activities.`}</li>
            </ul>
            <p>{t`4.2 **Appeal Process**: Players who believe they have been unfairly disciplined may appeal the decision by contacting the Game Administrators via Discord. Appeals will be reviewed and the decision of the Administrators will be final.`}</p>
            <h3>{t`5. Amendments to the Policy`}</h3>
            <p>{t`This Policy may be updated or amended at any time by the Game Administrators to address new issues or changes in the law. Continued participation in the Game will constitute acceptance of the updated Policy.`}</p>
            <h3>{t`6. Contact Information`}</h3>
            <p>{t`If you have any questions or concerns about this Policy, please contact the Game Administrators via Discord.`}</p>
            <p>{t`**Acceptance**`}</p>
            <p>{t`By continuing to play the Game, you acknowledge that you have read, understood, and agree to be bound by this Privacy and Information Policy.`}</p>
          </div>
        </>
      )}
    </>
  );
};

export default Captcha;
