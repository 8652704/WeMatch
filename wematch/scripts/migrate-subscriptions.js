require('dotenv').config();
const { getDb } = require('../backend/config/database');
const db = getDb();
for (const sql of [
  "ALTER TABLE users ADD COLUMN stripe_customer_id  TEXT",
  "ALTER TABLE users ADD COLUMN plan                TEXT DEFAULT 'free'",
  "ALTER TABLE users ADD COLUMN subscription_id     TEXT",
  "ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'inactive'",
  "ALTER TABLE users ADD COLUMN plan_expires_at     TEXT",
]) { try { db.exec(sql); } catch(e) {} }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_users_stripe ON users(stripe_customer_id);'); } catch(e) {}
console.log('Subscription migration complete.');
process.exit(0);
