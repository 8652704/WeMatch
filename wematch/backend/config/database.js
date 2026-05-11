// backend/config/database.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/wematch.db';
const resolvedPath = path.resolve(DB_PATH);
const dbDir = path.dirname(resolvedPath);

let effectivePath = resolvedPath;
if (!fs.existsSync(dbDir)) {
  try {
    fs.mkdirSync(dbDir, { recursive: true });
  } catch (e) {
    console.warn(`[DB] Cannot create ${dbDir} (${e.message}). Falling back to local ./data/`);
    const fallbackDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
    effectivePath = path.join(fallbackDir, 'wematch.db');
  }
}

let db;

function getDb() {
  if (!db) {
    db = new Database(effectivePath, {});
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

module.exports = { getDb };
