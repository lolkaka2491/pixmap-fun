import logger from '../core/logger';
import { getIPFromRequest } from '../utils/ip';

// 404 handler middleware
export default function notFoundHandler(req, res, next) {
  const ip = getIPFromRequest(req);
  const method = req.method;
  const url = req.originalUrl;
  
  // Log the attempt to access non-existent endpoint
  logger.warn(`404 - ${method} ${url} from IP: ${ip}`);
  
  // Set security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  });
  
  // Return appropriate response based on request type
  if (req.path.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
    // For API requests, return JSON
    res.status(404).json({
      error: 'Endpoint not found',
      message: `Cannot ${method} ${req.path}`,
      statusCode: 404
    });
  } else {
    // For regular requests, return text
    res.status(404).send(`Cannot ${method} ${req.path}`);
  }
} 