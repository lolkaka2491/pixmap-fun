import crypto from 'crypto';
import { CANVAS_TOKEN_SECRET, CANVAS_TOKEN_TTL_SECONDS } from './config';

const ALGO = 'sha256';

function hmac(data) {
	return crypto
		.createHmac(ALGO, CANVAS_TOKEN_SECRET)
		.update(data)
		.digest('hex');
}

export function generateCanvasToken(userId) {
	const ts = Math.floor(Date.now() / 1000);
	const payload = `${userId || 0}.${ts}`;
	const sig = hmac(payload);
	return `${payload}.${sig}`;
}

export function verifyCanvasToken(token) {
	if (!token || typeof token !== 'string') return false;
	const parts = token.split('.');
	if (parts.length !== 3) return false;
	const [userIdStr, tsStr, sig] = parts;
	const ts = parseInt(tsStr, 10);
	if (!Number.isFinite(ts)) return false;
	const now = Math.floor(Date.now() / 1000);
	if (now - ts > CANVAS_TOKEN_TTL_SECONDS) return false;
	const expected = hmac(`${userIdStr}.${tsStr}`);
	// timing-safe compare
	const a = Buffer.from(sig);
	const b = Buffer.from(expected);
	if (a.length !== b.length) return false;
	return crypto.timingSafeEqual(a, b);
} 