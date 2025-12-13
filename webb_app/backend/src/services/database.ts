import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import type { User } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/app.db');

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    autoRecord INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    callerId TEXT NOT NULL,
    calleeId TEXT NOT NULL,
    status TEXT NOT NULL,
    startedAt TEXT NOT NULL,
    endedAt TEXT,
    FOREIGN KEY (callerId) REFERENCES users(id),
    FOREIGN KEY (calleeId) REFERENCES users(id)
  );
`);

export const userQueries = {
  create: db.prepare(`
    INSERT INTO users (id, username, passwordHash, createdAt, autoRecord)
    VALUES (?, ?, ?, ?, ?)
  `),

  findByUsername: db.prepare(`
    SELECT * FROM users WHERE username = ?
  `),

  findById: db.prepare(`
    SELECT * FROM users WHERE id = ?
  `),

  searchByUsername: db.prepare(`
    SELECT id, username FROM users WHERE username LIKE ? AND id != ? LIMIT 20
  `),

  updateAutoRecord: db.prepare(`
    UPDATE users SET autoRecord = ? WHERE id = ?
  `),

  getAutoRecord: db.prepare(`
    SELECT autoRecord FROM users WHERE id = ?
  `),
};

export const callQueries = {
  create: db.prepare(`
    INSERT INTO calls (id, callerId, calleeId, status, startedAt)
    VALUES (?, ?, ?, ?, ?)
  `),

  updateStatus: db.prepare(`
    UPDATE calls SET status = ?, endedAt = ? WHERE id = ?
  `),

  findById: db.prepare(`
    SELECT * FROM calls WHERE id = ?
  `),
};

export default db;
