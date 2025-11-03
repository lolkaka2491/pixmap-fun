import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { t } from 'ttag';

import Captcha from '../Captcha';
import { useSelector } from 'react-redux';
import {
  validateEMail, validateName, validatePassword,
} from '../../utils/validation';
import { requestRegistration } from '../../store/actions/fetch';
import { loginUser } from '../../store/actions';
import useLink from '../hooks/link';

function validate(name, email, password, confirmPassword) {
  const errors = [];
  const mailerror = validateEMail(email);
  if (mailerror) errors.push(mailerror);
  const nameerror = validateName(name);
  if (nameerror) errors.push(nameerror);
  const passworderror = validatePassword(password);
  if (passworderror) errors.push(passworderror);

  if (password !== confirmPassword) {
    errors.push('Passwords do not match');
  }
  return errors;
}

const Register = () => {
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);
  const [captKey, setCaptKey] = useState(Date.now());
  const [termsVisible, setTermsVisible] = useState(false);
  const [policyVisible, setPolicyVisible] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const { captcha: captchaCfg } = useSelector((s) => s.user);

  const dispatch = useDispatch();

  const link = useLink();
  
  const handleNameChange = (e) => {
    setNameValue(e.target.value.replace(/[^a-zA-Z0-9]/g, ''));
  };
  
  // Add this function to prevent typing non-allowed characters
  const handleNameKeyDown = (e) => {
    // Allow control keys like backspace, delete, arrows, etc.
    if (e.ctrlKey || e.metaKey || e.altKey || 
        e.key === 'Backspace' || e.key === 'Delete' || 
        e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
        e.key === 'Home' || e.key === 'End' ||
        e.key === 'Tab') {
      return; // Allow these keys
    }
    
    // Only allow English letters and numbers
    const isEnglishLetterOrNumber = /^[a-zA-Z0-9]$/.test(e.key);
    if (!isEnglishLetterOrNumber) {
      e.preventDefault(); // Block the key input
    }
  };

  const handleSubmit = async (evt) => {
    evt.preventDefault();
    if (submitting || !agreeToTerms) {
      if (!agreeToTerms) {
        setErrors(['You must agree to the terms of service']);
      }
      return;
    }

    const name = nameValue; // Use the controlled input value
    const email = evt.target.email.value;
    const password = evt.target.password.value;
    const confirmPassword = evt.target.confirmpassword.value;
    const captcha = captchaCfg?.useCloudflare
      ? evt.target.cfturnstile.value
      : evt.target.captcha.value;
    const captchaid = captchaCfg?.useCloudflare
      ? 'cfturnstile'
      : evt.target.captchaid.value;

    const valErrors = validate(name, email, password, confirmPassword);
    if (valErrors.length > 0) {
      setErrors(valErrors);
      return;
    }

    setSubmitting(true);
    const { errors: respErrors, me } = await requestRegistration(
      name,
      email,
      password,
      captcha,
      captchaid,
    );
    setSubmitting(false);
    if (respErrors) {
      setCaptKey(Date.now());
      setErrors(respErrors);
      return;
    }

    dispatch(loginUser(me));
    link('USERAREA');
  };

  return (
    <div className="content">
      <form
        style={{ paddingLeft: '5%', paddingRight: '5%' }}
        onSubmit={handleSubmit}
      >
        <p>{t`Register new account here`}</p>
        {errors.map((error) => (
          <p key={error} className="errormessage"><span>{t`Error`}</span>
            :&nbsp;{error}</p>
        ))}
        <h3>{t`Name`}:</h3>
        <input
          name="name"
          className="reginput"
          autoComplete="username"
          type="text"
          placeholder={t`Name`}
          value={nameValue}
          onChange={handleNameChange}
          onKeyDown={handleNameKeyDown}
        />
        <h3>{t`Email`}:</h3>
        <input
          name="email"
          className="reginput"
          autoComplete="email"
          type="text"
          placeholder={t`Email`}
        />
        <h3>{t`Password`}:</h3>
        <input
          name="password"
          className="reginput"
          autoComplete="new-password"
          type="password"
          placeholder={t`Password`}
        />
        <h3>{t`Confirm Password`}:</h3>
        <input
          name="confirmpassword"
          className="reginput"
          autoComplete="new-password"
          type="password"
          placeholder={t`Confirm Password`}
        />
        <h3>{t`Captcha`}:</h3>
        <Captcha autoload={false} width={60} key={captKey} />
        <button type="submit" disabled={!agreeToTerms}>
          {(submitting) ? '...' : t`Submit`}
        </button>
        <button
          type="button"
          onClick={() => link('USERAREA')}
        >
          {t`Cancel`}
        </button>
        <div style={{ marginTop: '20px' }}>
          <p>
            <input 
              type="checkbox" 
              id="agreeToTerms" 
              checked={agreeToTerms} 
              onChange={(e) => setAgreeToTerms(e.target.checked)} 
            />
            <label htmlFor="agreeToTerms" style={{ marginLeft: '8px' }}>
              You must agree to our <span style={{ color: 'blue', cursor: 'pointer' }} onClick={() => setTermsVisible(!termsVisible)}>Terms of Service</span> and <span style={{ color: 'blue', cursor: 'pointer' }} onClick={() => setPolicyVisible(!policyVisible)}>Privacy Policy</span>.
            </label>
          </p>
          {termsVisible && (
            <div style={{ padding: '10px', border: '1px solid #ccc', marginTop: '10px', backgroundColor: '#f9f9f9' }}>
              <h2>Terms of Service</h2>
              <p>Welcome to pixmap.fun. By accessing or using our game, you agree to comply with and be bound by the following terms and conditions of use, which together with our privacy policy govern pixmap.fun's relationship with you in relation to this game.</p>
              <h3>1. Use of the Game</h3>
              <p>You agree to use the game only for lawful purposes and in a way that does not infringe the rights of, restrict, or inhibit anyone else's use and enjoyment of the game.</p>
              <h3>2. Account Registration</h3>
              <p>To access certain features of the game, you must create an account. You agree to provide accurate, current, and complete information during the registration process and to update such information to keep it accurate, current, and complete.</p>
              <h3>3. User Conduct</h3>
              <p>You agree not to use the game to:</p>
              <ul>
                <li>Harass, abuse, or harm another person.</li>
                <li>Impersonate any person or entity, or falsely state or otherwise misrepresent your affiliation with a person or entity.</li>
                <li>Engage in any activity that could disable, overburden, or impair the proper working of the game.</li>
              </ul>
              <h3>4. Intellectual Property</h3>
              <p>All content included in the game, such as text, graphics, logos, images, and software, is the property of pixmap.fun or its content suppliers and is protected by international copyright laws.</p>
              <h3>5. Termination</h3>
              <p>We reserve the right to terminate or suspend your account and access to the game at our sole discretion, without notice and liability, for conduct that we believe violates these Terms or is harmful to other users of the game, us, or third parties, or for any other reason.</p>
              <p>And more...</p>
            </div>
          )}
          {policyVisible && (
            <div style={{ padding: '10px', border: '1px solid #ccc', marginTop: '10px', backgroundColor: '#f9f9f9' }}>
              <h2>Privacy and Information Policy</h2>
              <h3>Introduction</h3>
              <p>This Privacy and Information Policy ("Policy") outlines the rules and guidelines regarding the use of private and identifying information within pixmap.fun ("Game"). By accepting this Policy, all players agree to abide by its terms to ensure a safe, respectful, and enjoyable gaming environment for everyone.</p>
              <h3>1. Prohibited Use of Private and Identifying Information</h3>
              <p>1.1 <strong>Private and Identifying Information Defined</strong>: For the purposes of this Policy, "Private and Identifying Information" includes, but is not limited to, real names, addresses, phone numbers, email addresses, social media handles, financial information, and any other personally identifiable information.</p>
              <p>1.2 <strong>Prohibited Activities</strong>: Players are strictly prohibited from using, sharing, or disseminating any Private and Identifying Information of other players within the Game or any other channel/platform. This includes, but is not limited to:</p>
              <ul>
                <li>Sharing another player's real-world identity without their consent.</li>
                <li>Revealing or discussing another player's private or personal information in public or private chat within the Game or any other channel/platform.</li>
                <li>Engaging in doxing (publishing private information about another individual) or any related activity.</li>
              </ul>
              <p>1.3 <strong>Reporting Violations</strong>: Players are encouraged to report any violations of this Policy to the Game Administrators via Discord.</p>
              <h3>2. Use of Information by Game Administrators</h3>
              <p>2.1 <strong>Collection and Use of Information</strong>: Game Administrators may collect and use Private and Identifying Information solely for the purpose of maintaining the Game, ensuring compliance with the Game's rules, and protecting the community from abuse.</p>
              <p>2.2 <strong>Purpose of Use</strong>: The use of such information by Administrators includes, but is not limited to:</p>
              <ul>
                <li>Investigating reports of rule violations, including the misuse of Private and Identifying Information.</li>
                <li>Banning or restricting access to the Game for players who violate this Policy.</li>
                <li>Communicating with players regarding their account or behavior in the Game.</li>
              </ul>
              <p>2.3 <strong>Confidentiality</strong>: Administrators are required to handle all Private and Identifying Information with the highest level of confidentiality and will not disclose such information to third parties except where required by law or necessary for the enforcement of Game rules.</p>
              <h3>3. Player Consent</h3>
              <p>By accepting this Policy, players acknowledge and agree to the following:</p>
              <ul>
                <li>They will not use or share Private and Identifying Information about other players.</li>
                <li>They understand that Game Administrators may use their Private and Identifying Information as outlined in this Policy.</li>
                <li>They consent to the collection and use of their information by Game Administrators for the purposes stated in this Policy.</li>
              </ul>
              <h3>4. Consequences of Policy Violations</h3>
              <p>4.1 <strong>Disciplinary Actions</strong>: Any player found to be in violation of this Policy may be subject to disciplinary actions, including but not limited to:</p>
              <ul>
                <li>Temporary suspension from the Game.</li>
                <li>Permanent banning from the Game.</li>
                <li>Reporting to relevant authorities if the violation involves illegal activities.</li>
              </ul>
              <p>4.2 <strong>Appeal Process</strong>: Players who believe they have been unfairly disciplined may appeal the decision by contacting the Game Administrators via Discord. Appeals will be reviewed and the decision of the Administrators will be final.</p>
              <h3>5. Amendments to the Policy</h3>
              <p>This Policy may be updated or amended at any time by the Game Administrators to address new issues or changes in the law. Continued participation in the Game will constitute acceptance of the updated Policy.</p>
              <h3>6. Contact Information</h3>
              <p>If you have any questions or concerns about this Policy, please contact the Game Administrators via Discord.</p>
              <h3>Acceptance</h3>
              <p>By continuing to play the Game, you acknowledge that you have read, understood, and agree to be bound by this Privacy and Information Policy.</p>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};

export default Register;
