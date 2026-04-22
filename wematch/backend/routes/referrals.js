// backend/routes/referrals.js
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// ── GET /referrals  — referrals sent to me + referrals I've made
router.get('/', requireAuth, (req, res) => {
  const db = getDb();

  // Referrals received (feed)
  const received = db.prepare(`
    SELECT r.*,
           ref.name  AS referrer_name,  ref.avatar_url  AS referrer_avatar,
           cand.name AS candidate_name, cand.avatar_url AS candidate_avatar,
           cand.bio, cand.age, cand.interests, cand.values, cand.location
    FROM referrals r
    JOIN users ref  ON ref.id  = r.referrer_id
    JOIN users cand ON cand.id = r.candidate_id
    WHERE r.recipient_id = ? AND r.status = 'pending'
    ORDER BY r.created_at DESC
  `).all(req.user.id);

  // Referrals I've made (as matchmaker)
  const sent = db.prepare(`
    SELECT r.*,
           recip.name AS recipient_name, recip.avatar_url AS recipient_avatar,
           cand.name  AS candidate_name, cand.avatar_url  AS candidate_avatar
    FROM referrals r
    JOIN users recip ON recip.id = r.recipient_id
    JOIN users cand  ON cand.id  = r.candidate_id
    WHERE r.referrer_id = ?
    ORDER BY r.created_at DESC
  `).all(req.user.id);

  // Parse JSON arrays
  received.forEach(r => {
    ['interests', 'values'].forEach(k => {
      if (r[k]) { try { r[k] = JSON.parse(r[k]); } catch {} }
    });
  });

  res.json({ received, sent });
});

// ── POST /referrals  — matchmaker creates a referral
router.post('/', requireAuth, [
  body('recipient_id').notEmpty().withMessage('recipient_id is required.'),
  body('candidate_id').notEmpty().withMessage('candidate_id is required.'),
  body('note').optional().trim().isLength({ max: 500 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

  const { recipient_id, candidate_id, note } = req.body;
  const db = getDb();

  if (recipient_id === candidate_id) {
    return res.status(400).json({ error: 'Recipient and candidate must be different people.' });
  }
  if (recipient_id === req.user.id || candidate_id === req.user.id) {
    return res.status(400).json({ error: 'You cannot refer yourself.' });
  }

  // Referrer must be in the recipient's circle
  const inCircle = db.prepare(`
    SELECT id FROM circles
    WHERE owner_id = ? AND member_id = ? AND status = 'accepted'
  `).get(recipient_id, req.user.id);

  if (!inCircle) {
    return res.status(403).json({ error: 'You must be in this person\'s circle to refer matches.' });
  }

  // No duplicate pending referral
  const dup = db.prepare(`
    SELECT id FROM referrals
    WHERE referrer_id = ? AND recipient_id = ? AND candidate_id = ? AND status = 'pending'
  `).get(req.user.id, recipient_id, candidate_id);
  if (dup) return res.status(409).json({ error: 'You already have a pending referral for this pair.' });

  const id = uuid();
  db.prepare(`
    INSERT INTO referrals (id, referrer_id, recipient_id, candidate_id, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.user.id, recipient_id, candidate_id, note || null);

  res.status(201).json({ message: 'Referral sent!', referral_id: id });
});

// ── POST /referrals/:id/accept
router.post('/:id/accept', requireAuth, (req, res) => {
  const db = getDb();
  const referral = db.prepare(
    "SELECT * FROM referrals WHERE id = ? AND recipient_id = ? AND status = 'pending'"
  ).get(req.params.id, req.user.id);

  if (!referral) return res.status(404).json({ error: 'Referral not found.' });

  db.prepare("UPDATE referrals SET status = 'accepted', updated_at = datetime('now') WHERE id = ?")
    .run(req.params.id);

  // Check if candidate also accepted a referral back (double opt-in)
  const counterpart = db.prepare(`
    SELECT * FROM referrals
    WHERE recipient_id = ? AND candidate_id = ? AND status = 'accepted'
  `).get(referral.candidate_id, req.user.id);

  if (counterpart) {
    // Create the match!
    const [a, b] = [req.user.id, referral.candidate_id].sort();
    const existingMatch = db.prepare('SELECT id FROM matches WHERE user_a_id = ? AND user_b_id = ?').get(a, b);
    if (!existingMatch) {
      const matchId = uuid();
      db.prepare('INSERT INTO matches (id, user_a_id, user_b_id, referral_id) VALUES (?, ?, ?, ?)')
        .run(matchId, a, b, referral.id);

      // Update referral status + update matchmaker badge
      db.prepare("UPDATE referrals SET status = 'matched' WHERE id = ? OR id = ?")
        .run(req.params.id, counterpart.id);

      _updateMatchmakerBadge(db, referral.referrer_id);

      return res.json({ message: 'It\'s a match! 🎉', matched: true, match_id: matchId });
    }
  }

  res.json({ message: 'Interested noted. Waiting for the other person.', matched: false });
});

// ── POST /referrals/:id/decline
router.post('/:id/decline', requireAuth, (req, res) => {
  const db = getDb();
  const referral = db.prepare(
    "SELECT * FROM referrals WHERE id = ? AND recipient_id = ? AND status = 'pending'"
  ).get(req.params.id, req.user.id);

  if (!referral) return res.status(404).json({ error: 'Referral not found.' });

  db.prepare("UPDATE referrals SET status = 'declined', updated_at = datetime('now') WHERE id = ?")
    .run(req.params.id);

  res.json({ message: 'Referral declined.' });
});

// ── Helper: recalculate trust badge for matchmaker
function _updateMatchmakerBadge(db, userId) {
  const total = db.prepare("SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ? AND status = 'matched'")
    .get(userId).n;

  let badge = null;
  if (total >= 10) badge = 'elite';
  else if (total >= 5) badge = 'top_matchmaker';
  else if (total >= 2) badge = 'connector';
  else if (total >= 1) badge = 'rising';

  if (badge) {
    const existing = db.prepare('SELECT id FROM trust_badges WHERE user_id = ?').get(userId);
    if (existing) {
      db.prepare('UPDATE trust_badges SET badge = ?, matches_made = ? WHERE user_id = ?')
        .run(badge, total, userId);
    } else {
      db.prepare('INSERT INTO trust_badges (id, user_id, badge, matches_made) VALUES (?, ?, ?, ?)')
        .run(uuid(), userId, badge, total);
    }
  }
}

module.exports = router;
