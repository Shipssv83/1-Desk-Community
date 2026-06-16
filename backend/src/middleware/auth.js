const jwt = require('jsonwebtoken');
const env = require('../config/env');
const db = require('../config/db');

async function verifyToken(req, res, next) {
  // Read token from cookie or authorization header (useful for sockets or external test tools)
  let token = req.cookies?.access_token;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await db.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, name: true, role: true, isActive: true }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Unauthorized', code: 'INVALID_USER' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      is_active: user.isActive
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Unauthorized', code: 'INVALID_TOKEN' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

const requireAdmin = requireRole('admin');

module.exports = {
  verifyToken,
  requireRole,
  requireAdmin
};
