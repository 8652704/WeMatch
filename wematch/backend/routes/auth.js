const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { verifyTransport, sendEmail } = require('../utils/email');

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

  const photos = db.prepare(
    'SELECT photo_type, data_url FROM user_photos WHERE user_id = ?'
  ).all(req.user.id).reduce((acc, p) => { acc[p.photo_type] = p.data_url; return acc; }, {});

  res.json({ user: { ...user, photos } });
});

// ── GET /auth/test-email  — verify SMTP config and send a test to yourself
router.get('/test-email', requireAuth, async (req, res) => {
  const check = await verifyTransport();
  if (!check.ok) return res.status(500).json({ error: 'SMTP connection failed', detail: check.error });
  const db = getDb();
  const user = db.prepare('SELECT email, name FROM users WHERE id = ?').get(req.user.id);
  try {
    await sendEmail({
      to: user.email,
      subject: 'WeMatch — email test ✓',
      html: `<p>Hi ${user.name}, your WeMatch email configuration is working correctly.</p>`,
      text: `Hi ${user.name}, your WeMatch email configuration is working correctly.`,
    });
    res.json({ ok: true, message: `Test email sent to ${user.email}` });
  } catch (e) {
    res.status(500).json({ error: 'SMTP connected but send failed', detail: e.message });
  }
});

module.exports = router;
