// backend/routes/matches.js
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// ── GET /matches  — list all my matches with latest message
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const matches = db.prepare(`
    SELECT m.*,
           CASE WHEN m.user_a_id = ? THEN ub.id   ELSE ua.id   END AS other_id,
           CASE WHEN m.user_a_id = ? THEN ub.name ELSE ua.name END AS other_name,
           CASE WHEN m.user_a_id = ? THEN ub.avatar_url ELSE ua.avatar_url END AS other_avatar,
           ref.note AS referral_note,
           referrer.name AS referrer_name,
           (SELECT body       FROM messages WHERE match_id = m.id ORDER BY created_at DESC LIMIT 1) AS last_message,
           (SELECT created_at FROM messages WHERE match_id = m.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
           (SELECT COUNT(*)   FROM messages WHERE match_id = m.id AND sender_id != ? AND read = 0) AS unread_count
    FROM matches m
    JOIN users ua ON ua.id = m.user_a_id
    JOIN users ub ON ub.id = m.user_b_id
    LEFT JOIN referrals ref ON ref.id = m.referral_id
    LEFT JOIN users referrer ON referrer.id = ref.referrer_id
    WHERE m.user_a_id = ? OR m.user_b_id = ?
    ORDER BY COALESCE(last_message_at, m.created_at) DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);

  res.json({ matches });
});

// ── GET /matches/:id/messages  — conversation thread
router.get('/:id/messages', requireAuth, (req, res) => {
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)')
    .get(req.params.id, req.user.id, req.user.id);

  if (!match) return res.status(404).json({ error: 'Match not found.' });

  const messages = db.prepare(`
    SELECT msg.*, u.name AS sender_name, u.avatar_url AS sender_avatar
    FROM messages msg
    JOIN users u ON u.id = msg.sender_id
    WHERE msg.match_id = ?
    ORDER BY msg.created_at ASC
  `).all(req.params.id);

  // Mark messages from other person as read
  db.prepare("UPDATE messages SET read = 1 WHERE match_id = ? AND sender_id != ?")
    .run(req.params.id, req.user.id);

  res.json({ messages });
});

// ── POST /matches/:id/messages  — send a message
router.post('/:id/messages', requireAuth, [
  body('body').trim().isLength({ min: 1, max: 2000 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)')
    .get(req.params.id, req.user.id, req.user.id);

  if (!match) return res.status(404).json({ error: 'Match not found.' });

  const id = uuid();
  db.prepare('INSERT INTO messages (id, match_id, sender_id, body) VALUES (?, ?, ?, ?)')
    .run(id, req.params.id, req.user.id, req.body.body);

  const message = db.prepare(`
    SELECT msg.*, u.name AS sender_name, u.avatar_url AS sender_avatar
    FROM messages msg JOIN users u ON u.id = msg.sender_id
    WHERE msg.id = ?
  `).get(id);

  res.status(201).json({ message });
});

// ── GET /matches/:id  — single match detail
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const match = db.prepare(`
    SELECT m.*,
           CASE WHEN m.user_a_id = ? THEN ub.id   ELSE ua.id   END AS other_id,
           CASE WHEN m.user_a_id = ? THEN ub.name ELSE ua.name END AS other_name,
           CASE WHEN m.user_a_id = ? THEN ub.bio  ELSE ua.bio  END AS other_bio,
           CASE WHEN m.user_a_id = ? THEN ub.age  ELSE ua.age  END AS other_age,
           CASE WHEN m.user_a_id = ? THEN ub.avatar_url ELSE ua.avatar_url END AS other_avatar,
           CASE WHEN m.user_a_id = ? THEN ub.interests  ELSE ua.interests  END AS other_interests,
           ref.note AS referral_note,
           referrer.name AS referrer_name, referrer.avatar_url AS referrer_avatar
    FROM matches m
    JOIN users ua ON ua.id = m.user_a_id
    JOIN users ub ON ub.id = m.user_b_id
    LEFT JOIN referrals ref ON ref.id = m.referral_id
    LEFT JOIN users referrer ON referrer.id = ref.referrer_id
    WHERE m.id = ? AND (m.user_a_id = ? OR m.user_b_id = ?)
  `).get(
    req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id,
    req.params.id, req.user.id, req.user.id
  );

  if (!match) return res.status(404).json({ error: 'Match not found.' });

  if (match.other_interests) {
    try { match.other_interests = JSON.parse(match.other_interests); } catch {}
  }

  res.json({ match });
});

module.exports = router;
