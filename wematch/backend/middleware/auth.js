// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header.' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const db = getDb();
    const user = db.prepare('SELECT id, email, name, avatar_url FROM users WHERE id = ? AND active = 1').get(payload.sub);
    if (!user) return res.status(401).json({ error: 'User not found or deactivated.' });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
}

module.exports = { requireAuth };
