/*
 * LogIn Form
 */
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { t } from 'ttag';

import {
  validateEMail,
  validateName,
  validatePassword,
} from '../utils/validation';
import { requestLogin } from '../store/actions/fetch';
import { loginUser } from '../store/actions';

/**
 * Perform client‐side validation on the “nameOrEmail” and “password” fields.
 * Returns an array of error strings, or an empty array if there are no validation issues.
 */
function validate(nameoremail, password) {
  const errors = [];

  // If the input contains an “@”, treat it as email; otherwise as username.
  const mailError = nameoremail.includes('@')
    ? validateEMail(nameoremail)
    : validateName(nameoremail);

  if (mailError) {
    errors.push(mailError);
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    errors.push(passwordError);
  }

  return errors;
}

const inputStyles = {
  display: 'inline-block',
  width: '75%',
  maxWidth: '35em',
};

const LogInForm = () => {
  const [nameoremail, setNameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);

  const dispatch = useDispatch();

  const handleSubmit = async (evt) => {
    evt.preventDefault();

    // Prevent double‐submitting
    if (submitting) return;

    // If validation passed, send the login request
    setSubmitting(true);
    setErrors([]);

    try {
      // requestLogin should return an object like { errors: [...], me: {...} }
      const { errors: respErrors, me } = await requestLogin(
        nameoremail,
        password
      );

      // After the request, always clear the submitting flag
      setSubmitting(false);

      // If the server returned any errors, display them
      if (respErrors && respErrors.length > 0) {
        setErrors(respErrors);
        return;
      }

      // No errors => dispatch loginUser to store user data in Redux,
      // and let your app handle the post‐login redirect or state change
      dispatch(loginUser(me));
    } catch (err) {
      // If requestLogin itself threw (network issue, unexpected server error, etc.),
      // show a generic “server error” message.
      setSubmitting(false);
      setErrors([t`Server error, please try again.`]);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Render any errors returned from validation or the login request */}
      {errors.map((error, idx) => (
        <p key={idx} style={{ color: 'red', margin: '0.5em 0' }}>
          <strong>{t`Error`}:</strong> {error}
        </p>
      ))}

      <input
        value={nameoremail}
        style={inputStyles}
        onChange={(evt) => setNameOrEmail(evt.target.value)}
        type="text"
        placeholder={t`Name or Email`}
        required
      />
      <br />

      <input
        value={password}
        style={inputStyles}
        onChange={(evt) => setPassword(evt.target.value)}
        type="password"
        placeholder={t`Password`}
        required
      />
      <p>
        <button type="submit" disabled={submitting}>
          {submitting ? '...' : t`LogIn`}
        </button>
      </p>
    </form>
  );
};

export default React.memo(LogInForm);