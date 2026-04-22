// backend/server.js
require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const circleRoutes   = require('./routes/circles');
const referralRoutes = require('./routes/referrals');
const matchRoutes    = require('./routes/matches');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      styleSrc:   ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
      fontSrc:    ["'self'", 'fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:', 'blob:'],
    },
  },
}));

// ── CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ── Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many auth attempts, please wait before trying again.' },
});

// ── Parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Static frontend
app.use(express.static(path.join(__dirname, '../frontend/public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
}));

// ── API Routes
app.use('/api/auth',      authLimiter, authRoutes);
app.use('/api/users',     apiLimiter,  userRoutes);
app.use('/api/circles',   apiLimiter,  circleRoutes);
app.use('/api/referrals', apiLimiter,  referralRoutes);
app.use('/api/matches',   apiLimiter,  matchRoutes);

// ── Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// ── Global error handler
app.use((err, req, res, next) => {
  if (process.env.NODE_ENV !== 'production') console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal server error.' : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀  WeMatch API running on http://localhost:${PORT}`);
  console.log(`   ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   DB:  ${process.env.DB_PATH || './data/wematch.db'}\n`);
});

module.exports = app;
