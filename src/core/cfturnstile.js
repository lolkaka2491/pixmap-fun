import axios from 'axios';
import logger from './logger';
import { CF_TURNSTILE_SECRET_KEY } from './config';

/**
 * Verify Cloudflare Turnstile token
 * @param {string} token - cf-turnstile response token from client
 * @param {string} ip - user IP for remoteip verification
 * @returns {Promise<boolean>} true if valid
 */
export async function verifyTurnstileToken(token, ip) {
  if (!token) return false;
  try {
    const params = new URLSearchParams();
    params.append('secret', CF_TURNSTILE_SECRET_KEY);
    params.append('response', token);
    if (ip) params.append('remoteip', ip);

    const { data } = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      params,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    if (data?.success) return true;
    logger.info(`Turnstile verify failed: ${JSON.stringify(data)}`);
    return false;
  } catch (err) {
    logger.warn(`Turnstile verify error: ${err.message}`);
    return false;
  }
} 