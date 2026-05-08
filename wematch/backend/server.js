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
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
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

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.static(path.join(__dirname, '../frontend/public'), { maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/circles', apiLimiter, circleRoutes);
app.use('/api/referrals', apiLimiter, referralRoutes);
app.use('/api/matches', apiLimiter, matchRoutes);
app.use('/api/subscriptions', apiLimiter, subscriptionRoutes);
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

module.exports = app;
