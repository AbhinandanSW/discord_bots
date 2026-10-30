import { jsonArray, n, nowIso, openDb } from '../lib/db.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  title_key TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT 'Unknown company',
  company_key TEXT NOT NULL DEFAULT '',
  url TEXT,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  salary TEXT NOT NULL DEFAULT '',
  remote INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '',
  emails TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT '',
  posted_at TEXT,
  created_at TEXT NOT NULL,
  posted_at_discord TEXT,
  posted_channel TEXT,
  message_id TEXT,
  dismissed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
CREATE INDEX IF NOT EXISTS idx_jobs_posting ON jobs(posted_at_discord, dismissed);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

export function createJobsStore(file) {
  const db = openDb(file, SCHEMA);

  const statements = {
    byFingerprint: db.prepare('SELECT id FROM jobs WHERE fingerprint = ?'),
    byTitleCompany: db.prepare('SELECT id FROM jobs WHERE title_key = ? AND company_key = ?'),
    insert: db.prepare(`
      INSERT INTO jobs (
        fingerprint, title, title_key, company, company_key, url, description, location,
        salary, remote, category, confidence, tags, emails, source, posted_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    unposted: db.prepare(`
      SELECT * FROM jobs
      WHERE posted_at_discord IS NULL AND dismissed = 0
      ORDER BY (posted_at IS NULL), posted_at DESC, created_at DESC
      LIMIT ?
    `),
    markPosted: db.prepare(
      'UPDATE jobs SET posted_at_discord = ?, posted_channel = ?, message_id = ? WHERE id = ?',
    ),
    markDismissed: db.prepare('UPDATE jobs SET dismissed = 1 WHERE id = ?'),
    all: db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?'),
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    setSetting: db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ),
  };

  function addJob(job) {
    if (statements.byFingerprint.get(job.fingerprint)) {
      return { inserted: false, reason: 'duplicate-fingerprint' };
    }
    if (job.titleKey && job.companyKey && statements.byTitleCompany.get(job.titleKey, job.companyKey)) {
      return { inserted: false, reason: 'duplicate-title-company' };
    }

    const result = statements.insert.run(
      job.fingerprint,
      job.title,
      n(job.titleKey ?? ''),
      job.company,
      n(job.companyKey ?? ''),
      n(job.url),
      n(job.description ?? ''),
      n(job.location ?? ''),
      n(job.salary ?? ''),
      job.remote ? 1 : 0,
      job.category,
      Number(job.confidence ?? 0),
      n(job.tags ?? ''),
      JSON.stringify(job.emails ?? []),
      n(job.source ?? ''),
      n(job.postedAt),
      nowIso(),
    );

    return { inserted: true, id: Number(result.lastInsertRowid) };
  }

  function getSetting(key, fallback = null) {
    const row = statements.getSetting.get(key);
    return row ? row.value : fallback;
  }

  function setSetting(key, value) {
    statements.setSetting.run(key, value === null || value === undefined ? null : String(value));
  }

  function getJsonSetting(key, fallback = null) {
    const raw = getSetting(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function nextUnposted(limit = 10) {
    return statements.unposted.all(Math.max(1, Math.min(limit, 50)));
  }

  function markPosted(id, { channelId, messageId }) {
    statements.markPosted.run(nowIso(), n(channelId), n(messageId), id);
  }

  function dismiss(id) {
    statements.markDismissed.run(id);
  }

  function getJob(id) {
    return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) ?? null;
  }

  function search({ query = '', category = null, limit = 8, onlyWithEmails = false } = {}) {
    const clauses = ['dismissed = 0'];
    const params = [];
    if (query) {
      clauses.push('(title LIKE ? OR company LIKE ? OR description LIKE ? OR tags LIKE ?)');
      const like = `%${query}%`;
      params.push(like, like, like, like);
    }
    if (category) {
      clauses.push('category = ?');
      params.push(category);
    }
    if (onlyWithEmails) clauses.push("emails != '[]' AND emails IS NOT NULL");

    const sql = `SELECT * FROM jobs WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`;
    params.push(Math.max(1, Math.min(limit, 25)));
    return db.prepare(sql).all(...params);
  }

  function emails({ query = '', limit = 30 } = {}) {
    const rows = search({ query, limit: 100, onlyWithEmails: true });
    const out = [];
    const seen = new Set();
    for (const row of rows) {
      for (const email of jsonArray(row.emails)) {
        const key = email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ email: key, company: row.company, title: row.title, url: row.url, category: row.category });
        if (out.length >= Math.max(1, Math.min(limit, 100))) return out;
      }
    }
    return out;
  }

  function stats() {
    const one = (sql, ...params) => db.prepare(sql).get(...params);
    const total = one('SELECT COUNT(*) AS c FROM jobs').c;
    const posted = one('SELECT COUNT(*) AS c FROM jobs WHERE posted_at_discord IS NOT NULL').c;
    const pending = one('SELECT COUNT(*) AS c FROM jobs WHERE posted_at_discord IS NULL AND dismissed = 0').c;
    const dismissed = one('SELECT COUNT(*) AS c FROM jobs WHERE dismissed = 1').c;
    const emailsCount = one("SELECT COUNT(*) AS c FROM jobs WHERE emails != '[]' AND emails IS NOT NULL").c;
    const byCategory = {};
    for (const row of db.prepare('SELECT category, COUNT(*) AS c FROM jobs GROUP BY category').all()) {
      byCategory[row.category] = row.c;
    }
    return { total, posted, pending, dismissed, emailsCount, byCategory };
  }

  function recent(limit = 20) {
    return statements.all.all(limit);
  }

  return {
    db,
    addJob,
    nextUnposted,
    markPosted,
    dismiss,
    getJob,
    search,
    emails,
    stats,
    recent,
    getSetting,
    setSetting,
    getJsonSetting,
    close: () => db.close(),
  };
}
