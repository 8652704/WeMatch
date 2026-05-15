require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const circleRoutes = require('./routes/circles');
const referralRoutes = require('./routes/referrals');
const matchRoutes = require('./routes/matches');
const subscriptionRoutes = require('./routes/subscriptions');

const app = express();
const PORT = process.env.PORT || 3000;
app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));

app.set('trust proxy', 1);
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, 'https://' + req.headers.host + req.url);
    }
    if (req.headers.host && req.headers.host.startsWith('www.')) {
      return res.redirect(301, 'https://' + req.headers.host.slice(4) + req.url);
    }
  }
  next();
});

app.use(helmet({
   contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
}));

const defaultOrigins = process.env.NODE_ENV === 'production'
  ? 'https://wematch.dating,https://www.wematch.dating'
  : 'http://localhost:3000';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || defaultOrigins).split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

const apiLimiter = rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, please try again later.' } });
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 10, message: { error: 'Too many auth attempts, please wait before trying again.' } });

app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.static(path.join(__dirname, '../frontend/public'), { maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/circles', apiLimiter, circleRoutes);
app.use('/api/referrals', apiLimiter, referralRoutes);
app.use('/api/matches', apiLimiter, matchRoutes);
app.use('/api/subscriptions', apiLimiter, subscriptionRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0', env: process.env.NODE_ENV, timestamp: new Date().toISOString() }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/public/index.html')));
app.use((err, req, res, next) => {
  if (process.env.NODE_ENV !== 'production') console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error.' : err.message });
});

app.listen(PORT, () => {
  console.log(`\nWeMatch API running on http://localhost:${PORT}`);
  console.log(`ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`DB:  ${process.env.DB_PATH || './data/wematch.db'}\n`);
});
// Send 24-hour reminder emails to circle invitees who haven't joined or opted out
setInterval(async () => {
  try {
    const { getDb } = require('./config/database');
    const db = getDb();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const pending = db.prepare(`
      SELECT ci.id, ci.invitee_email, ci.invitee_name, ci.token,
             u.name AS owner_name
      FROM circle_invites ci JOIN users u ON u.id = ci.owner_id
      WHERE ci.joined = 0 AND ci.opted_out = 0
        AND (ci.last_reminder_at IS NULL OR ci.last_reminder_at < ?)
    `).all(cutoff);
    const { sendCircleReminderEmail } = require('./utils/email');
    const baseUrl = process.env.APP_URL || 'https://wematch.dating';
    for (const row of pending) {
      try {
        await sendCircleReminderEmail(
          row.invitee_email, row.invitee_name, row.owner_name,
          baseUrl, `${baseUrl}/?optout=${row.token}`
        );
        db.prepare('UPDATE circle_invites SET last_reminder_at = ? WHERE id = ?')
          .run(new Date().toISOString(), row.id);
      } catch (e) { console.error('[REMINDER] Failed for', row.invitee_email, e.message); }
    }
    if (pending.length) console.log(`[REMINDER] Processed ${pending.length} circle reminder(s)`);
  } catch (e) { console.error('[REMINDER] Scheduler error:', e.message); }
}, 60 * 60 * 1000);

// Send weekly reminders to users missing full-body or hobby photos
setInterval(async () => {
  try {
    const { getDb } = require('./config/database');
    const db = getDb();
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const users = db.prepare(`
      SELECT u.id, u.email, u.name,
        (SELECT COUNT(*) FROM user_photos WHERE user_id = u.id AND photo_type = 'fullbody') AS has_fullbody,
        (SELECT COUNT(*) FROM user_photos WHERE user_id = u.id AND photo_type = 'hobby') AS has_hobby
      FROM users u
      WHERE u.active = 1
        AND (u.photo_reminder_at IS NULL OR u.photo_reminder_at < ?)
    `).all(cutoff);
    let count = 0;
    for (const u of users) {
      if (u.has_fullbody && u.has_hobby) continue;
      const missing = [!u.has_fullbody && 'full-body', !u.has_hobby && 'group/hobby'].filter(Boolean).join(' and ');
      console.log(`[PHOTO REMINDER] Sending to ${u.email} — missing: ${missing}`);
      db.prepare('UPDATE users SET photo_reminder_at = ? WHERE id = ?')
        .run(new Date().toISOString(), u.id);
      count++;
    }
    if (count) console.log(`[PHOTO REMINDER] Processed ${count} photo reminder(s)`);
  } catch (e) { console.error('[PHOTO REMINDER] Scheduler error:', e.message); }
}, 60 * 60 * 1000);

module.exports = app;
