const crypto = require('crypto');
const config = require('../config');

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  // Ensure both strings are the same length for comparison
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    // Still do a comparison to maintain constant time
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Hash token with salt for comparison
 * This adds an extra layer of security - even if someone sees the hashed value,
 * they can't easily reverse it to get the original token
 */
function hashToken(token) {
  const salt = config.auth.salt || 'auto-reader-default-salt';
  return crypto.createHash('sha256').update(token + salt).digest('hex');
}

/**
 * Authentication middleware
 * Checks for Authorization header with Bearer token
 * Allows Chrome extension requests without auth (origin: chrome-extension://*)
 *
 * Usage:
 *   router.post('/protected', requireAuth, handler)
 *   router.use(requireAuth) // protect all routes in router
 */
function requireAuth(req, res, next) {
  // If auth is disabled, allow all requests
  if (!config.auth.enabled) {
    return next();
  }

  // Allow Chrome extension requests without auth (private, local only)
  const origin = req.headers.origin || '';
  if (origin.startsWith('chrome-extension://')) {
    req.isAuthenticated = true;
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide an Authorization header with Bearer token'
    });
  }

  // Extract token from "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      error: 'Invalid authorization format',
      message: 'Authorization header must be: Bearer <token>'
    });
  }

  const providedToken = parts[1];
  const expectedToken = config.auth.adminToken;

  if (!expectedToken) {
    console.warn('ADMIN_TOKEN not configured - auth will fail for all requests');
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'Authentication is not properly configured'
    });
  }

  // Compare hashed tokens using timing-safe comparison
  const providedHash = hashToken(providedToken);
  const expectedHash = hashToken(expectedToken);

  if (!timingSafeEqual(providedHash, expectedHash)) {
    return res.status(403).json({
      error: 'Invalid token',
      message: 'The provided token is not valid'
    });
  }

  // Token is valid, proceed
  req.isAuthenticated = true;
  next();
}

/**
 * Optional auth middleware
 * Sets req.isAuthenticated but doesn't block the request
 * Useful for endpoints that behave differently for authenticated users
 */
function optionalAuth(req, res, next) {
  if (!config.auth.enabled) {
    req.isAuthenticated = true;
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    req.isAuthenticated = false;
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    req.isAuthenticated = false;
    return next();
  }

  const providedToken = parts[1];
  const expectedToken = config.auth.adminToken;

  if (!expectedToken) {
    req.isAuthenticated = false;
    return next();
  }

  const providedHash = hashToken(providedToken);
  const expectedHash = hashToken(expectedToken);

  req.isAuthenticated = timingSafeEqual(providedHash, expectedHash);
  next();
}

/**
 * Verify token endpoint handler
 * Returns whether the provided token is valid
 */
function verifyToken(req, res) {
  if (!config.auth.enabled) {
    return res.json({ valid: true, authEnabled: false });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.json({ valid: false, authEnabled: true });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.json({ valid: false, authEnabled: true });
  }

  const providedToken = parts[1];
  const expectedToken = config.auth.adminToken;

  if (!expectedToken) {
    return res.json({ valid: false, authEnabled: true, error: 'Token not configured' });
  }

  const providedHash = hashToken(providedToken);
  const expectedHash = hashToken(expectedToken);

  const valid = timingSafeEqual(providedHash, expectedHash);
  res.json({ valid, authEnabled: true });
}

module.exports = {
  requireAuth,
  optionalAuth,
  verifyToken,
  hashToken,
};
