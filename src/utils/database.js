const Database = require('better-sqlite3');
const path = require('path');

// Database file lives in the project root — persists across restarts
const DB_PATH = path.join(__dirname, '../../data/sessions.db');

// Create data directory if needed
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    user_id TEXT PRIMARY KEY,
    messages TEXT DEFAULT '[]',
    travel_info TEXT DEFAULT NULL,
    traveler_profile TEXT DEFAULT NULL,
    search_results TEXT DEFAULT NULL,
    autofill_result TEXT DEFAULT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );
`);

// Get session from DB
function getSession(userId) {
  const row = db.prepare('SELECT * FROM sessions WHERE user_id = ?').get(userId);
  if (!row) {
    return {
      userId,
      messages: [],
      travelInfo: null,
      travelerProfile: null,
      searchResults: null,
      autofillResult: null
    };
  }
  return {
    userId: row.user_id,
    messages: JSON.parse(row.messages || '[]'),
    travelInfo: row.travel_info ? JSON.parse(row.travel_info) : null,
    travelerProfile: row.traveler_profile ? JSON.parse(row.traveler_profile) : null,
    searchResults: row.search_results ? JSON.parse(row.search_results) : null,
    autofillResult: row.autofill_result ? JSON.parse(row.autofill_result) : null
  };
}

// Save/update session in DB
function updateSession(userId, updates) {
  const current = getSession(userId);
  const merged = { ...current, ...updates };

  // Keep messages capped at last 50 to avoid huge DB entries
  if (merged.messages && merged.messages.length > 50) {
    merged.messages = merged.messages.slice(-50);
  }

  db.prepare(`
    INSERT INTO sessions (user_id, messages, travel_info, traveler_profile, search_results, autofill_result, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(user_id) DO UPDATE SET
      messages = excluded.messages,
      travel_info = excluded.travel_info,
      traveler_profile = excluded.traveler_profile,
      search_results = excluded.search_results,
      autofill_result = excluded.autofill_result,
      updated_at = unixepoch()
  `).run(
    userId,
    JSON.stringify(merged.messages || []),
    merged.travelInfo ? JSON.stringify(merged.travelInfo) : null,
    merged.travelerProfile ? JSON.stringify(merged.travelerProfile) : null,
    merged.searchResults ? JSON.stringify(merged.searchResults) : null,
    merged.autofillResult ? JSON.stringify(merged.autofillResult) : null
  );

  return merged;
}

// Clear session (new search)
function clearSession(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// Get all active sessions (for monitoring)
function getAllSessions() {
  return db.prepare('SELECT user_id, updated_at FROM sessions ORDER BY updated_at DESC').all();
}

module.exports = { getSession, updateSession, clearSession, getAllSessions };
