// backend/routes/auth.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const SALT_ROUNDS = 12;

function issueTokens(userId) {
  const accessToken = jwt.sign(
    { sub: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  const refreshToken = uuid();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const db = getDb();
  db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(uuid(), userId, refreshToken, expiresAt);

  return { accessToken, refreshToken };
}

// ── POST /auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  body('name').trim().isLength({ min: 2 }).withMessage('Name is required.'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { email, password, name } = req.body;
  const db = getDb();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const id = uuid();

  db.prepare(`
    INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)
  `).run(id, email, hash, name);

  const { accessToken, refreshToken } = issueTokens(id);
  const user = db.prepare('SELECT id, email, name, avatar_url, created_at FROM users WHERE id = ?').get(id);

  res.status(201).json({ user, accessToken, refreshToken });
});

// ── POST /auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { email, password } = req.body;
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const { accessToken, refreshToken } = issueTokens(user.id);
  const { password: _, ...safeUser } = user;

  res.json({ user: safeUser, accessToken, refreshToken });
});

// ── POST /auth/refresh
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required.' });

  const db = getDb();
  const record = db.prepare(`
    SELECT * FROM refresh_tokens
    WHERE token = ? AND expires_at > datetime('now')
  `).get(refreshToken);

  if (!record) return res.status(401).json({ error: 'Invalid or expired refresh token.' });

  db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(record.id);

  const { accessToken, refreshToken: newRefresh } = issueTokens(record.user_id);
  res.json({ accessToken, refreshToken: newRefresh });
});

// ── POST /auth/logout
router.post('/logout', requireAuth, (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    getDb().prepare('DELETE FROM refresh_tokens WHERE token = ? AND user_id = ?')
      .run(refreshToken, req.user.id);
  }
  res.json({ message: 'Logged out.' });
});

// ── GET /auth/me
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT id, email, name, avatar_url, bio, age, gender,
           looking_for, interests, core_values, location, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);
  res.json({ user });
});

module.exports = router;
