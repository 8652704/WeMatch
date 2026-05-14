// backend/routes/users.js
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { v4: uuid } = require('uuid');
const { getDb } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const PHOTO_TYPES = ['headshot', 'fullbody', 'hobby'];
const MAX_PHOTO_BYTES = 3_500_000; // ~2.5 MB base64

// ── POST /users/photos — upload or replace a profile photo
router.post('/photos', requireAuth, (req, res) => {
  const { photo_type, data_url } = req.body;
  if (!PHOTO_TYPES.includes(photo_type))
    return res.status(422).json({ error: 'photo_type must be headshot, fullbody, or hobby.' });
  if (!data_url || !data_url.startsWith('data:image/'))
    return res.status(422).json({ error: 'Invalid image data.' });
  if (data_url.length > MAX_PHOTO_BYTES)
    return res.status(413).json({ error: 'Image too large. Please use an image under 2 MB.' });

  const db = getDb();
  db.prepare(`
    INSERT INTO user_photos (id, user_id, photo_type, data_url) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, photo_type) DO UPDATE SET data_url = excluded.data_url, created_at = datetime('now')
  `).run(uuid(), req.user.id, photo_type, data_url);

  res.json({ message: 'Photo saved.' });
});

// ── DELETE /users/photos/:type — remove a profile photo
router.delete('/photos/:type', requireAuth, (req, res) => {
  if (!PHOTO_TYPES.includes(req.params.type))
    return res.status(422).json({ error: 'Invalid photo type.' });
  getDb().prepare('DELETE FROM user_photos WHERE user_id = ? AND photo_type = ?')
    .run(req.user.id, req.params.type);
  res.json({ message: 'Photo removed.' });
});

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
  const values = [...Object.values(updates), req.user.id];

  getDb().prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...values);

  const user = getDb().prepare(`
    SELECT id, email, name, avatar_url, bio, age, gender,
           looking_for, interests, core_values, location, updated_at
    FROM users WHERE id = ?
  `).get(req.user.id);

  ['looking_for', 'interests', 'core_values'].forEach(k => {
    if (user[k]) { try { user[k] = JSON.parse(user[k]); } catch {} }
  });

  res.json({ user });
});

// ── GET /users/browse — filter-based profile search
router.get('/browse', requireAuth, (req, res) => {
  const { gender, location, interests } = req.query;
  const db = getDb();

  let sql = `
    SELECT u.id, u.name, u.bio, u.age, u.gender, u.location, u.looking_for, u.interests,
      (SELECT data_url FROM user_photos WHERE user_id = u.id AND photo_type = 'headshot' LIMIT 1) AS headshot
    FROM users u
    WHERE u.active = 1 AND u.id != ?
  `;
  const params = [req.user.id];

  if (gender) { sql += ' AND u.gender = ?'; params.push(gender); }
  if (location) { sql += ' AND u.location LIKE ?'; params.push(`%${location}%`); }
  if (interests) {
    const terms = interests.split(',').map(s => s.trim()).filter(Boolean);
    terms.forEach(t => { sql += ' AND u.interests LIKE ?'; params.push(`%${t}%`); });
  }

  sql += ' ORDER BY u.created_at DESC LIMIT 40';

  const users = db.prepare(sql).all(...params);
  users.forEach(u => {
    ['looking_for', 'interests'].forEach(k => {
      if (u[k]) { try { u[k] = JSON.parse(u[k]); } catch {} }
    });
  });

  res.json({ users });
});

// ── GET /users/:id  — public profile
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT id, name, avatar_url, bio, age, gender, interests, core_values, location, looking_for
    FROM users WHERE id = ? AND active = 1
  `).get(req.params.id);

  if (!user) return res.status(404).json({ error: 'User not found.' });

  ['interests', 'core_values', 'looking_for'].forEach(k => {
    if (user[k]) { try { user[k] = JSON.parse(user[k]); } catch {} }
  });

  const badges = db.prepare(`
    SELECT badge, matches_made FROM trust_badges WHERE user_id = ? ORDER BY matches_made DESC LIMIT 1
  `).get(req.params.id);

  const photos = db.prepare(
    'SELECT photo_type, data_url FROM user_photos WHERE user_id = ?'
  ).all(req.params.id).reduce((acc, p) => { acc[p.photo_type] = p.data_url; return acc; }, {});

  res.json({ user: { ...user, trust_badge: badges || null, photos } });
});

// ── GET /users — name search (for circle invite)
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
