// backend/routes/circles.js
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const { getDb } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// ── GET /circles  — my circle members + circles I'm in
router.get('/', requireAuth, (req, res) => {
  const db = getDb();

  // People I've invited into my circle
  const myCircle = db.prepare(`
    SELECT c.id, c.status, c.created_at,
           u.id AS user_id, u.name, u.avatar_url, u.location
    FROM circles c
    JOIN users u ON u.id = c.member_id
    WHERE c.owner_id = ?
    ORDER BY c.status, u.name
  `).all(req.user.id);

  // Circles I've been invited into (where I am a matchmaker)
  const matchmakerFor = db.prepare(`
    SELECT c.id, c.status, c.created_at,
           u.id AS user_id, u.name, u.avatar_url
    FROM circles c
    JOIN users u ON u.id = c.owner_id
    WHERE c.member_id = ? AND c.status = 'accepted'
    ORDER BY u.name
  `).all(req.user.id);

  res.json({ myCircle, matchmakerFor });
});

// ── POST /circles/invite  — invite someone to your circle
router.post('/invite', requireAuth, (req, res) => {
  const { member_id } = req.body;
  if (!member_id) return res.status(400).json({ error: 'member_id is required.' });
  if (member_id === req.user.id) return res.status(400).json({ error: 'Cannot add yourself.' });

  const db = getDb();

  const target = db.prepare('SELECT id, name FROM users WHERE id = ? AND active = 1').get(member_id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const existing = db.prepare('SELECT id FROM circles WHERE owner_id = ? AND member_id = ?').get(req.user.id, member_id);
  if (existing) return res.status(409).json({ error: 'Already in your circle or invite pending.' });

  const id = uuid();
  db.prepare('INSERT INTO circles (id, owner_id, member_id) VALUES (?, ?, ?)').run(id, req.user.id, member_id);

  res.status(201).json({ message: `Invite sent to ${target.name}.`, circle_id: id });
});

// ── POST /circles/:id/accept  — accept an invite into someone's circle
router.post('/:id/accept', requireAuth, (req, res) => {
  const db = getDb();
  const invite = db.prepare('SELECT * FROM circles WHERE id = ? AND member_id = ? AND status = ?')
    .get(req.params.id, req.user.id, 'pending');

  if (!invite) return res.status(404).json({ error: 'Invite not found.' });

  db.prepare("UPDATE circles SET status = 'accepted' WHERE id = ?").run(req.params.id);
  res.json({ message: 'You are now a matchmaker in their circle.' });
});

// ── POST /circles/:id/decline
router.post('/:id/decline', requireAuth, (req, res) => {
  const db = getDb();
  const invite = db.prepare('SELECT * FROM circles WHERE id = ? AND member_id = ? AND status = ?')
    .get(req.params.id, req.user.id, 'pending');

  if (!invite) return res.status(404).json({ error: 'Invite not found.' });

  db.prepare("UPDATE circles SET status = 'declined' WHERE id = ?").run(req.params.id);
  res.json({ message: 'Invite declined.' });
});

// ── DELETE /circles/:id  — remove someone from circle
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const entry = db.prepare('SELECT * FROM circles WHERE id = ? AND owner_id = ?')
    .get(req.params.id, req.user.id);

  if (!entry) return res.status(404).json({ error: 'Circle entry not found.' });

  db.prepare('DELETE FROM circles WHERE id = ?').run(req.params.id);
  res.json({ message: 'Removed from circle.' });
});

module.exports = router;
