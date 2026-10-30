import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createDsaStore } from '../src/dsa-bot/store.js';

function tempFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bots-dsa-'));
  return path.join(dir, name);
}

test('enrolment is idempotent and updates preferences', () => {
  const store = createDsaStore(tempFile('dsa.db'));
  store.upsertUser({ user_id: 'u1', username: 'Ada', difficulty: 'easy', topics: 'arrays', timezone: 'UTC', hour: 9 });
  const updated = store.upsertUser({ user_id: 'u1', username: 'Ada L', difficulty: 'hard', topics: 'dp', timezone: 'UTC', hour: 7 });
  assert.equal(updated.username, 'Ada L');
  assert.equal(updated.difficulty, 'hard');
  assert.equal(updated.topics, 'dp');
  assert.equal(store.listUsers().length, 1);
  store.close();
});

test('assignment lifecycle: open -> solved -> due review', () => {
  const store = createDsaStore(tempFile('dsa.db'));
  store.upsertUser({ user_id: 'u1', username: 'Ada', timezone: 'UTC' });

  const id = store.addAssignment({ user_id: 'u1', question_id: 'two-sum', assigned_on: '2026-01-01' });
  const open = store.getOpenAssignment('u1');
  assert.equal(open.id, id);

  store.updateAssignment(id, { status: 'solved', solved_at: '2026-01-01T10:00:00Z', due_on: '2026-01-08' });
  assert.equal(store.getOpenAssignment('u1'), null);
  assert.equal(store.dueReview('u1', '2026-01-07'), null);

  const due = store.dueReview('u1', '2026-01-08');
  assert.equal(due.question_id, 'two-sum');
  store.updateAssignment(id, { due_on: null });
  assert.equal(store.dueReview('u1', '2026-01-20'), null);
  store.close();
});

test('stale open assignments expire so the user is not blocked', () => {
  const store = createDsaStore(tempFile('dsa.db'));
  store.upsertUser({ user_id: 'u1', username: 'Ada', timezone: 'UTC' });
  store.addAssignment({ user_id: 'u1', question_id: 'two-sum', assigned_on: '2026-01-01' });

  assert.equal(store.expireStale('u1', '2025-12-31'), 0);
  assert.equal(store.expireStale('u1', '2026-01-02'), 1);
  assert.equal(store.getOpenAssignment('u1'), null);

  const totals = store.userTotals('u1');
  assert.equal(totals.expired, 1);
  store.close();
});

test('history includes every assignment with question ids', () => {
  const store = createDsaStore(tempFile('dsa.db'));
  store.upsertUser({ user_id: 'u1', username: 'Ada', timezone: 'UTC' });
  for (const question of ['two-sum', 'valid-parentheses', 'climbing-stairs']) {
    const id = store.addAssignment({ user_id: 'u1', question_id: question, assigned_on: '2026-01-01' });
    store.updateAssignment(id, { status: 'solved' });
  }
  const history = store.history('u1');
  assert.equal(history.length, 3);
  assert.deepEqual(
    history.map((entry) => entry.question_id).sort(),
    ['climbing-stairs', 'two-sum', 'valid-parentheses'],
  );
  store.close();
});

test('leaderboard ranks by solved count then streak', () => {
  const store = createDsaStore(tempFile('dsa.db'));
  store.upsertUser({ user_id: 'u1', username: 'Ada', timezone: 'UTC' });
  store.upsertUser({ user_id: 'u2', username: 'Bob', timezone: 'UTC' });
  store.updateUser('u1', { total_solved: 4, streak: 2 });
  store.updateUser('u2', { total_solved: 4, streak: 6 });

  const board = store.leaderboard(5);
  assert.equal(board[0].user_id, 'u2');
  assert.equal(board[1].user_id, 'u1');
  store.close();
});

test('deleting a user clears their assignments', () => {
  const store = createDsaStore(tempFile('dsa.db'));
  store.upsertUser({ user_id: 'u1', username: 'Ada', timezone: 'UTC' });
  store.addAssignment({ user_id: 'u1', question_id: 'two-sum', assigned_on: '2026-01-01' });
  store.deleteUser('u1');
  assert.equal(store.getUser('u1'), null);
  assert.equal(store.history('u1').length, 0);
  store.close();
});
