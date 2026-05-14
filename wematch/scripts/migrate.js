// scripts/migrate.js
require('dotenv').config();
const { getDb } = require('../backend/config/database');

const db = getDb();

db.exec(`
  -- ─────────────────────────────────────────
  --  USERS
  -- ─────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    name        TEXT NOT NULL,
    avatar_url  TEXT,
    bio         TEXT,
    age         INTEGER,
    gender      TEXT CHECK(gender IN ('man','woman','nonbinary','other')),
    looking_for TEXT,       -- JSON array e.g. '["woman","nonbinary"]'
    interests   TEXT,       -- JSON array e.g. '["hiking","coffee","travel"]'
    core_values      TEXT,       -- JSON array e.g. '["family","adventure"]'
    location    TEXT,
    verified    INTEGER DEFAULT 0,
    active      INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  -- ─────────────────────────────────────────
  --  REFRESH TOKENS
  -- ─────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT UNIQUE NOT NULL,
    expires_at  TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  -- ─────────────────────────────────────────
  --  CIRCLES  (matchmaker relationships)
  -- ─────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS circles (
    id          TEXT PRIMARY KEY,
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status      TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(owner_id, member_id)
  );

  -- ─────────────────────────────────────────
  --  REFERRALS  (match suggestions)
  -- ─────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS referrals (
    id            TEXT PRIMARY KEY,
    referrer_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note          TEXT,
    status        TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','matched','expired')),
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );

  -- ─────────────────────────────────────────
  --  MATCHES  (mutual interest confirmed)
  -- ─────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS matches (
    id            TEXT PRIMARY KEY,
    user_a_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referral_id   TEXT REFERENCES referrals(id),
    chat_mode     TEXT DEFAULT 'direct' CHECK(chat_mode IN ('direct','group')),
    created_at    TEXT DEFAULT (datetime('now')),
    UNIQUE(user_a_id, user_b_id)
  );

  -- ─────────────────────────────────────────
  --  MESSAGES
  -- ─────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    match_id    TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    sender_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    read        INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  -- ─────────────────────────────────────────
  --  TRUST BADGES  (matchmaker reputation)
  -- ─────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS trust_badges (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge           TEXT NOT NULL CHECK(badge IN ('rising','connector','top_matchmaker','elite')),
    matches_made    INTEGER DEFAULT 0,
    awarded_at      TEXT DEFAULT (datetime('now'))
  );

  -- ─────────────────────────────────────────
  --  CIRCLE INVITES  (email-based invitations)
  -- ─────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS circle_invites (
    id               TEXT PRIMARY KEY,
    owner_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_name     TEXT NOT NULL,
    invitee_email    TEXT NOT NULL,
    token            TEXT NOT NULL UNIQUE,
    joined           INTEGER DEFAULT 0,
    opted_out        INTEGER DEFAULT 0,
    last_reminder_at TEXT,
    created_at       TEXT DEFAULT (datetime('now')),
    UNIQUE(owner_id, invitee_email)
  );



  -- ─────────────────────────────────────────
  --  USER PHOTOS
  -- ─────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS user_photos (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    photo_type  TEXT NOT NULL CHECK(photo_type IN ('headshot','fullbody','hobby')),
    data_url    TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, photo_type)
  );

  -- ─────────────────────────────────────────
  --  INDEXES
  -- ─────────────────────────────────────────
  CREATE INDEX IF NOT EXISTS idx_user_photos_user ON user_photos(user_id);
  CREATE INDEX IF NOT EXISTS idx_circles_owner    ON circles(owner_id);
  CREATE INDEX IF NOT EXISTS idx_circles_member   ON circles(member_id);
  CREATE INDEX IF NOT EXISTS idx_referrals_recip  ON referrals(recipient_id);
  CREATE INDEX IF NOT EXISTS idx_referrals_ref    ON referrals(referrer_id);
  CREATE INDEX IF NOT EXISTS idx_matches_a        ON matches(user_a_id);
  CREATE INDEX IF NOT EXISTS idx_matches_b        ON matches(user_b_id);
  CREATE INDEX IF NOT EXISTS idx_messages_match   ON messages(match_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_user     ON refresh_tokens(user_id);
`);

console.log('✅  Migration complete — all tables created.');
process.exit(0);
