import rateLimit from 'express-rate-limit';
import logger from '../core/logger';
import { getIPFromRequest } from '../utils/ip';

// Custom key generator that uses the existing IP extraction logic
const customKeyGenerator = (req) => {
  return getIPFromRequest(req);
};

// Rate limiter for 404 errors - more aggressive to prevent scanning
export const notFoundRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 5, // limit each IP to 5 requests per windowMs for 404s
  keyGenerator: customKeyGenerator,
  message: {
    error: 'Too many requests to non-existent endpoints',
    retryAfter: 60
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for certain IPs if needed
    const ip = getIPFromRequest(req);
    // You can add whitelisted IPs here if needed
    return false;
  },
  handler: (req, res, next, options) => {

    // onLimitReached is deprecated, use this instead
    if (req.rateLimit.used === req.rateLimit.limit + 1) {
			const ip = getIPFromRequest(req);
      logger.warn(`404 Rate limit reached for IP: ${ip} on ${req.originalUrl}`);
		}
		res.status(options.statusCode).send(options.message)
	}
});

// General rate limiter for all requests
export const generalRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 100, // limit each IP to 100 requests per windowMs
  keyGenerator: customKeyGenerator,
  message: {
    error: 'Too many requests',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = getIPFromRequest(req);
    // Skip for known good endpoints or certain paths
    if (req.path.startsWith('/api/') || req.path.startsWith('/chunks/') || req.path.startsWith('/tiles/')) {
      return true; // These have their own rate limiting
    }
    return false;
  },
  handler: (req, res, next, options) => {

    // onLimitReached is deprecated, use this instead
    if (req.rateLimit.used === req.rateLimit.limit + 1) {
			const ip = getIPFromRequest(req);
      logger.warn(`General rate limit reached for IP: ${ip} on ${req.originalUrl}`);
		}
		res.status(options.statusCode).send(options.message)
	}
});

// Rate limiter specifically for API endpoints
export const apiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 30, // limit each IP to 30 API requests per minute
  keyGenerator: customKeyGenerator,
  message: {
    error: 'Too many API requests',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {

    // onLimitReached is deprecated, use this instead
    if (req.rateLimit.used === req.rateLimit.limit + 1) {
			const ip = getIPFromRequest(req);
      logger.warn(`API rate limit reached for IP: ${ip} on ${req.originalUrl}`);
		}
		res.status(options.statusCode).send(options.message)
	}
});

// Strict rate limiter for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute window
  max: 5, // limit each IP to 5 auth attempts per 15 minutes
  keyGenerator: customKeyGenerator,
  message: {
    error: 'Too many authentication attempts. Please try again later.',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {

    // onLimitReached is deprecated, use this instead
    if (req.rateLimit.used === req.rateLimit.limit + 1) {
			const ip = getIPFromRequest(req);
      logger.warn(`Auth rate limit reached for IP: ${ip} on ${req.originalUrl}`);
		}
		res.status(options.statusCode).send(options.message)
	}
});

// Rate limiter for registration endpoints
export const registrationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 3, // limit each IP to 3 registration attempts per hour
  keyGenerator: customKeyGenerator,
  message: {
    error: 'Too many registration attempts. Please try again later.',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {

    // onLimitReached is deprecated, use this instead
    if (req.rateLimit.used === req.rateLimit.limit + 1) {
			const ip = getIPFromRequest(req);
      logger.warn(`Registration rate limit reached for IP: ${ip} on ${req.originalUrl}`);
		}
		res.status(options.statusCode).send(options.message)
	}
});

// Rate limiter for password change/reset endpoints
export const passwordRateLimit = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minute window
  max: 3, // limit each IP to 3 password operations per 30 minutes
  keyGenerator: customKeyGenerator,
  message: {
    error: 'Too many password operations. Please try again later.',
    retryAfter: 1800
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {

    // onLimitReached is deprecated, use this instead
    if (req.rateLimit.used === req.rateLimit.limit + 1) {
			const ip = getIPFromRequest(req);
      logger.warn(`Password rate limit reached for IP: ${ip} on ${req.originalUrl}`);
		}
		res.status(options.statusCode).send(options.message)
	}
});

// Rate limiter for sensitive user operations (block, delete account, etc.)
export const sensitiveOperationRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minute window
  max: 10, // limit each IP to 10 sensitive operations per 5 minutes
  keyGenerator: customKeyGenerator,
  message: {
    error: 'Too many operations. Please try again later.',
    retryAfter: 300
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {

    // onLimitReached is deprecated, use this instead
    if (req.rateLimit.used === req.rateLimit.limit + 1) {
			const ip = getIPFromRequest(req);
      logger.warn(`Sensitive operation rate limit reached for IP: ${ip} on ${req.originalUrl}`);
		}
		res.status(options.statusCode).send(options.message)
	}
}); 