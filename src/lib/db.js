import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Opens (and migrates) a SQLite database using Node's built-in driver.
 * No native compilation, works on Windows/Linux/macOS out of the box.
 */
export function openDb(file, schema) {
  const dir = path.dirname(path.resolve(file));
  fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(path.resolve(file));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (schema) db.exec(schema);
  return db;
}

export const nowIso = () => new Date().toISOString();

/** SQLite rejects `undefined`; normalise to NULL. */
export const n = (value) => (value === undefined ? null : value);

export function jsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
