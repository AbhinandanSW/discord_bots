import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, daysBetween, isValidTimezone, localDate, localHour } from '../src/dsa-bot/tz.js';

test('localDate respects the timezone', () => {
  const instant = new Date('2026-01-01T00:30:00Z');
  assert.equal(localDate(instant, 'Asia/Kolkata'), '2026-01-01');
  assert.equal(localDate(instant, 'America/Los_Angeles'), '2025-12-31');
  assert.equal(localDate(instant, 'UTC'), '2026-01-01');
});

test('localHour handles midnight without returning 24', () => {
  assert.equal(localHour(new Date('2026-01-01T00:00:00Z'), 'UTC'), 0);
  const kolkata = localHour(new Date('2026-01-01T00:00:00Z'), 'Asia/Kolkata');
  assert.equal(kolkata, 5);
});

test('invalid timezones are rejected and fall back to UTC', () => {
  assert.equal(isValidTimezone('Mars/Olympus'), false);
  assert.equal(isValidTimezone('Asia/Kolkata'), true);
  assert.equal(localDate(new Date('2026-01-01T00:30:00Z'), 'Mars/Olympus'), '2026-01-01');
});

test('date arithmetic crosses months and years', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-01-01', '2026-01-08'), 7);
});
