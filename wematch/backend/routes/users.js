// backend/routes/users.js
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { getDb } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// ── PATCH /users/profile  — update own profile
router.patch('/profile', requireAuth, [
  body('name').optional().trim().isLength({ min: 2 }),
  body('bio').optional().trim().isLength({ max: 500 }),
  body('age').optional().isInt({ min: 18, max: 100 }),
  body('gender').optional().isIn(['man', 'woman', 'nonbinary', 'other']),
  body('looking_for').optional().isArray(),
  body('interests').optional().isArray(),
  body('core_values').optional().isArray(),
  body('location').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const fields = ['name', 'bio', 'age', 'gender', 'looking_for', 'interests', 'core_values', 'location'];
  const updates = {};

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates[f] = Array.isArray(req.body[f]) ? JSON.stringify(req.body[f]) : req.body[f];
    }
  }

  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No fields to update.' });

  updates.updated_at = new Date().toISOString();
  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const core_values = [...Object.core_values(updates), req.user.id];

  getDb().prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...core_values);

  const user = getDb().prepare(`
    SELECT id, email, name, avatar_url, bio, age, gender,
           looking_for, interests, core_values, location, updated_at
    FROM users WHERE id = ?
  `).get(req.user.id);

  // Parse JSON arrays back
  ['looking_for', 'interests', 'core_values'].forEach(k => {
    if (user[k]) { try { user[k] = JSON.parse(user[k]); } catch {} }
  });

  res.json({ user });
});

// ── GET /users/:id  — public profile
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT id, name, avatar_url, bio, age, gender, interests, core_values, location
    FROM users WHERE id = ? AND active = 1
  `).get(req.params.id);

  if (!user) return res.status(404).json({ error: 'User not found.' });

  ['interests', 'core_values'].forEach(k => {
    if (user[k]) { try { user[k] = JSON.parse(user[k]); } catch {} }
  });

  // Attach matchmaker score
  const badges = db.prepare(`
    SELECT badge, matches_made FROM trust_badges WHERE user_id = ? ORDER BY matches_made DESC LIMIT 1
  `).get(req.params.id);

  res.json({ user: { ...user, trust_badge: badges || null } });
});

// ── GET /users/search?q=name  — search for people to add to circle
router.get('/', requireAuth, (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters.' });

  const db = getDb();
  const users = db.prepare(`
    SELECT id, name, avatar_url, bio, location
    FROM users
    WHERE active = 1
      AND id != ?
      AND (name LIKE ? OR email LIKE ?)
    LIMIT 20
  `).all(req.user.id, `%${q}%`, `%${q}%`);

  res.json({ users });
});

module.exports = router;
