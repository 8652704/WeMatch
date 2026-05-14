require('dotenv').config();
const { getDb } = require('../backend/config/database');

const db = getDb();

// Safely add photo_reminder_at column — no-op if already exists
try {
  db.exec('ALTER TABLE users ADD COLUMN photo_reminder_at TEXT');
  console.log('✅  Added photo_reminder_at column to users.');
} catch (e) {
  if (!e.message.includes('duplicate column')) throw e;
  console.log('ℹ️   photo_reminder_at column already exists — skipping.');
}

console.log('✅  Photo migration complete.');
process.exit(0);
