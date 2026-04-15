// ============================================================
// JWT Auth Middleware
// ============================================================

const jwt = require('jsonwebtoken');

/**
 * Verifies the JWT from the Authorization header and attaches
 * the decoded payload to req.user.
 *
 * Clients must send:  Authorization: Bearer <token>
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = header.slice(7); // strip "Bearer "

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
