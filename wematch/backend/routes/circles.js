const router = require('express').Router();
const { v4: uuid } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { sendCircleWelcomeEmail, sendCircleReminderEmail } = require('../utils/email');

const FREE_CIRCLE_LIMIT = 3;

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const accepted = db.prepare(`
    SELECT c.id, c.created_at, u.id AS user_id, u.name, u.avatar_url, u.location
    FROM circles c JOIN users u ON u.id = c.member_id
    WHERE c.owner_id = ? AND c.status = 'accepted' ORDER BY u.name
  `).all(req.user.id);
  const invites = db.prepare(`
    SELECT id, invitee_name AS name, invitee_email AS email,
           joined, opted_out, last_reminder_at, created_at
    FROM circle_invites WHERE owner_id = ? AND opted_out = 0 ORDER BY created_at DESC
  `).all(req.user.id);
  const owner = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.id);
  const plan  = owner.plan || 'free';
  const limit = plan === 'free' ? FREE_CIRCLE_LIMIT : null;
  const total = invites.length + accepted.length;
  res.json({ accepted, invites, total, limit, plan });
});

router.post('/invite', requireAuth, [
  body('name').trim().isLength({ min: 2 }).withMessage('Name is required.'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  const { name, email } = req.body;
  const db = getDb();
  const owner = db.prepare('SELECT plan, name FROM users WHERE id = ?').get(req.user.id);
  const activeCount = db.prepare(
    'SELECT COUNT(*) AS n FROM circle_invites WHERE owner_id = ? AND opted_out = 0'
  ).get(req.user.id).n;
  if ((owner.plan || 'free') === 'free' && activeCount >= FREE_CIRCLE_LIMIT) {
    return res.status(403).json({
      error: `Free plan allows up to ${FREE_CIRCLE_LIMIT} circle members. Upgrade to add more.`,
      upgrade_required: true,
    });
  }
  const dup = db.prepare('SELECT id FROM circle_invites WHERE owner_id = ? AND invitee_email = ?').get(req.user.id, email);
  if (dup) return res.status(409).json({ error: 'You already invited this person.' });
  const token = uuid();
  const id    = uuid();
  const baseUrl = process.env.APP_URL || 'https://wematch.dating';
  db.prepare('INSERT INTO circle_invites (id, owner_id, invitee_name, invitee_email, token) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.user.id, name, email, token);
  const existing = db.prepare('SELECT id FROM users WHERE email = ? AND active = 1').get(email);
  if (existing) {
    try {
      db.prepare('INSERT OR IGNORE INTO circles (id, owner_id, member_id, status) VALUES (?, ?, ?, ?)').run(uuid(), req.user.id, existing.id, 'accepted');
      db.prepare('UPDATE circle_invites SET joined = 1 WHERE id = ?').run(id);
    } catch {}
  }
  try {
    await sendCircleWelcomeEmail(email, name, owner.name, baseUrl, `${baseUrl}/?optout=${token}`);
  } catch (e) { console.error('[EMAIL] Circle welcome failed:', e.message); }
  res.status(201).json({ message: `Invite sent to ${name}!`, invite_id: id });
});

router.delete('/invite/:id', requireAuth, (req, res) => {
  const db = getDb();
  const invite = db.prepare('SELECT id FROM circle_invites WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!invite) return res.status(404).json({ error: 'Invite not found.' });
  db.prepare('DELETE FROM circle_invites WHERE id = ?').run(req.params.id);
  res.json({ message: 'Invite removed.' });
});

router.post('/optout/:token', (req, res) => {
  const db = getDb();
  const invite = db.prepare('SELECT id FROM circle_invites WHERE token = ?').get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invalid opt-out link.' });
  db.prepare('UPDATE circle_invites SET opted_out = 1 WHERE id = ?').run(invite.id);
  res.json({ message: 'You have been unsubscribed from these reminders.' });
});

router.post('/:id/accept', requireAuth, (req, res) => {
  const db = getDb();
  const invite = db.prepare("SELECT * FROM circles WHERE id = ? AND member_id = ? AND status = 'pending'").get(req.params.id, req.user.id);
  if (!invite) return res.status(404).json({ error: 'Invite not found.' });
  db.prepare("UPDATE circles SET status = 'accepted' WHERE id = ?").run(req.params.id);
  res.json({ message: 'You are now a matchmaker in their circle.' });
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const entry = db.prepare('SELECT id FROM circles WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!entry) return res.status(404).json({ error: 'Circle entry not found.' });
  db.prepare('DELETE FROM circles WHERE id = ?').run(req.params.id);
  res.json({ message: 'Removed from circle.' });
});

module.exports = router;
