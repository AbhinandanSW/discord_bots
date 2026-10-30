import { n, nowIso, openDb } from '../lib/db.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT 'mixed',
  topics TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  hour INTEGER NOT NULL DEFAULT 9,
  active INTEGER NOT NULL DEFAULT 1,
  guild_id TEXT,
  thread_id TEXT,
  created_at TEXT NOT NULL,
  last_sent_on TEXT,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  total_solved INTEGER NOT NULL DEFAULT 0,
  total_skipped INTEGER NOT NULL DEFAULT 0,
  last_solved_on TEXT
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'new',
  assigned_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  message_id TEXT,
  thread_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  hints_used INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  solved_at TEXT,
  due_on TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_assignments_due ON assignments(user_id, due_on);
`;

const USER_FIELDS = new Set([
  'username',
  'difficulty',
  'topics',
  'timezone',
  'hour',
  'active',
  'guild_id',
  'thread_id',
  'last_sent_on',
  'streak',
  'best_streak',
  'total_solved',
  'total_skipped',
  'last_solved_on',
]);

const ASSIGNMENT_FIELDS = new Set([
  'assigned_on',
  'kind',
  'message_id',
  'thread_id',
  'status',
  'attempts',
  'hints_used',
  'review_count',
  'solved_at',
  'due_on',
  'notes',
]);

function buildUpdate(table, fields, whitelist) {
  const keys = Object.keys(fields).filter((key) => whitelist.has(key));
  if (!keys.length) return null;
  const assignments = keys.map((key) => `${key} = ?`).join(', ');
  return {
    sql: `UPDATE ${table} SET ${assignments} WHERE ${table === 'users' ? 'user_id' : 'id'} = ?`,
    values: keys.map((key) => n(fields[key])),
  };
}

export function createDsaStore(file) {
  const db = openDb(file, SCHEMA);

  const statements = {
    getUser: db.prepare('SELECT * FROM users WHERE user_id = ?'),
    activeUsers: db.prepare('SELECT * FROM users WHERE active = 1'),
    allUsers: db.prepare('SELECT * FROM users ORDER BY total_solved DESC'),
    insertUser: db.prepare(`
      INSERT INTO users (user_id, username, difficulty, topics, timezone, hour, active, guild_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        difficulty = excluded.difficulty,
        topics = excluded.topics,
        timezone = excluded.timezone,
        hour = excluded.hour,
        active = 1,
        guild_id = excluded.guild_id
    `),
    openAssignment: db.prepare("SELECT * FROM assignments WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1"),
    assignment: db.prepare('SELECT * FROM assignments WHERE id = ?'),
    history: db.prepare('SELECT * FROM assignments WHERE user_id = ? ORDER BY id DESC LIMIT ?'),
    dueReview: db.prepare(`
      SELECT * FROM assignments
      WHERE user_id = ? AND status = 'solved' AND due_on IS NOT NULL AND due_on <= ? AND review_count < 3
      ORDER BY due_on ASC LIMIT 1
    `),
    expire: db.prepare("UPDATE assignments SET status = 'expired' WHERE user_id = ? AND status = 'open' AND assigned_on <= ?"),
    insertAssignment: db.prepare(`
      INSERT INTO assignments (user_id, question_id, kind, assigned_on, review_count)
      VALUES (?, ?, ?, ?, ?)
    `),
    leaderboard: db.prepare(`
      SELECT user_id, username, total_solved, streak, best_streak
      FROM users WHERE active = 1 OR total_solved > 0
      ORDER BY total_solved DESC, streak DESC LIMIT ?
    `),
  };

  function upsertUser(user) {
    statements.insertUser.run(
      user.user_id,
      user.username ?? '',
      user.difficulty ?? 'mixed',
      user.topics ?? '',
      user.timezone ?? 'UTC',
      Number(user.hour ?? 9),
      user.active === 0 ? 0 : 1,
      n(user.guild_id),
      nowIso(),
    );
    return getUser(user.user_id);
  }

  function getUser(userId) {
    return statements.getUser.get(userId) ?? null;
  }

  function listUsers({ activeOnly = true } = {}) {
    return (activeOnly ? statements.activeUsers : statements.allUsers).all();
  }

  function updateUser(userId, patch) {
    const update = buildUpdate('users', patch, USER_FIELDS);
    if (!update) return getUser(userId);
    db.prepare(update.sql).run(...update.values, userId);
    return getUser(userId);
  }

  function deleteUser(userId) {
    db.prepare('DELETE FROM assignments WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE user_id = ?').run(userId);
  }

  function getOpenAssignment(userId) {
    return statements.openAssignment.get(userId) ?? null;
  }

  function getAssignment(id) {
    return statements.assignment.get(id) ?? null;
  }

  function addAssignment({ user_id, question_id, kind = 'new', assigned_on, review_count = 0 }) {
    const result = statements.insertAssignment.run(user_id, question_id, kind, assigned_on, review_count);
    return Number(result.lastInsertRowid);
  }

  function updateAssignment(id, patch) {
    const update = buildUpdate('assignments', patch, ASSIGNMENT_FIELDS);
    if (!update) return getAssignment(id);
    db.prepare(update.sql).run(...update.values, id);
    return getAssignment(id);
  }

  function history(userId, limit = 300) {
    return statements.history.all(userId, Math.max(1, limit));
  }

  function dueReview(userId, today) {
    return statements.dueReview.get(userId, today) ?? null;
  }

  function expireStale(userId, beforeDate) {
    const result = statements.expire.run(userId, beforeDate);
    return Number(result.changes ?? 0);
  }

  function leaderboard(limit = 10) {
    return statements.leaderboard.all(Math.max(1, Math.min(limit, 25)));
  }

  function userTotals(userId) {
    return (
      db
        .prepare(
          `SELECT
             SUM(CASE WHEN status = 'solved' THEN 1 ELSE 0 END) AS solved,
             SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
             SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired,
             COUNT(*) AS total
           FROM assignments WHERE user_id = ?`,
        )
        .get(userId) ?? { solved: 0, skipped: 0, expired: 0, total: 0 }
    );
  }

  return {
    db,
    upsertUser,
    getUser,
    listUsers,
    updateUser,
    deleteUser,
    getOpenAssignment,
    getAssignment,
    addAssignment,
    updateAssignment,
    history,
    dueReview,
    expireStale,
    leaderboard,
    userTotals,
    close: () => db.close(),
  };
}
