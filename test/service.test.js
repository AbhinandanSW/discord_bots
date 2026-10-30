import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createDsaStore } from '../src/dsa-bot/store.js';
import { addDays, localDate } from '../src/dsa-bot/tz.js';
import { applySolved, sendDaily } from '../src/dsa-bot/service.js';

const log = { info() {}, warn() {}, error() {}, debug() {} };

function makeConfig(overrides = {}) {
  return {
    dsa: {
      mode: 'thread',
      channelId: 'chan-1',
      timezone: 'UTC',
      hour: 9,
      expireDays: 2,
      sendNextOnSolve: false,
      threadArchiveMinutes: 1440,
      ...overrides,
    },
  };
}

function fakeDiscord() {
  const sent = [];
  const thread = {
    id: 'thread-1',
    archived: true,
    isTextBased: () => true,
    setArchived: async () => {
      thread.archived = false;
    },
    send: async (payload) => {
      sent.push(payload);
      return { id: `msg-${sent.length}`, channelId: 'thread-1' };
    },
  };
  const channel = {
    id: 'chan-1',
    isTextBased: () => true,
    threads: { create: async () => thread },
    send: async (payload) => {
      sent.push(payload);
      return { id: `msg-${sent.length}`, channelId: 'chan-1' };
    },
  };
  const user = {
    send: async (payload) => {
      sent.push(payload);
      return { id: `dm-${sent.length}`, channelId: 'dm-1' };
    },
  };
  const client = {
    channels: {
      fetch: async (id) => {
        if (id === 'chan-1') return channel;
        if (id === 'thread-1') return thread;
        return null;
      },
    },
    users: { fetch: async () => user },
  };
  return { client, sent, thread, channel };
}

function setup(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bots-service-'));
  const store = createDsaStore(path.join(dir, 'dsa.db'));
  store.upsertUser({
    user_id: 'u1',
    username: 'Ada Lovelace',
    difficulty: 'easy',
    topics: 'arrays',
    timezone: 'UTC',
    hour: 0,
  });
  const { client, sent, thread } = fakeDiscord();
  return { store, client, sent, thread, config: makeConfig(overrides), user: store.getUser('u1') };
}

test('daily delivery creates a thread, posts an embed with buttons and records the assignment', async () => {
  const { store, client, sent, thread, config, user } = setup();
  const result = await sendDaily({ client, store, config, log, user });

  assert.ok(result.assignmentId);
  assert.equal(sent.length, 1);
  const payload = sent[0];
  assert.match(payload.content, /<@u1>/);
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.components.length, 1);
  assert.equal(payload.components[0].components.length, 3);

  const stored = store.getAssignment(result.assignmentId);
  assert.equal(stored.status, 'open');
  assert.equal(stored.message_id, 'msg-1');
  assert.equal(stored.thread_id, 'thread-1');
  assert.equal(store.getUser('u1').thread_id, 'thread-1');
  assert.equal(store.getUser('u1').last_sent_on, localDate(new Date(), 'UTC'));

  // Second attempt the same day must not stack questions.
  const again = await sendDaily({ client, store, config, log, user: store.getUser('u1') });
  assert.equal(again.skipped, 'open-assignment');
  assert.equal(sent.length, 1);
  store.close();
});

test('archived threads are reopened instead of duplicated', async () => {
  const { store, client, config, thread } = setup();
  store.updateUser('u1', { thread_id: 'thread-1' });
  thread.archived = true;

  await sendDaily({ client, store, config, log, user: store.getUser('u1') });
  assert.equal(thread.archived, false);
  assert.equal(store.getUser('u1').thread_id, 'thread-1');
  store.close();
});

test('solving sets the streak and schedules a spaced review', async () => {
  const { store, client, config, user } = setup();
  const { assignmentId } = await sendDaily({ client, store, config, log, user });

  const assignment = store.getAssignment(assignmentId);
  const updated = applySolved({ store, user, assignment });

  assert.equal(updated.streak, 1);
  assert.equal(updated.total_solved, 1);
  const today = localDate(new Date(), 'UTC');
  assert.equal(store.getAssignment(assignmentId).due_on, addDays(today, 7));
  store.close();
});

test('a due review is delivered before new material', async () => {
  const { store, client, config, user } = setup();
  const first = await sendDaily({ client, store, config, log, user });
  applySolved({ store, user, assignment: store.getAssignment(first.assignmentId) });

  const yesterday = addDays(localDate(new Date(), 'UTC'), -1);
  store.updateAssignment(first.assignmentId, { due_on: yesterday });

  const second = await sendDaily({ client, store, config, log, user: store.getUser('u1') });
  assert.equal(store.getAssignment(second.assignmentId).kind, 'review');
  assert.equal(store.getAssignment(second.assignmentId).question_id, store.getAssignment(first.assignmentId).question_id);
  assert.equal(store.getAssignment(first.assignmentId).due_on, null);
  store.close();
});

test('dm mode sends the question privately', async () => {
  const { store, client, sent, config, user } = setup({ mode: 'dm' });
  const result = await sendDaily({ client, store, config, log, user });

  assert.equal(result.targetKind, 'dm');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].content, null);
  assert.equal(store.getUser('u1').thread_id, null);
  store.close();
});

test('stale questions expire and a fresh one follows', async () => {
  const { store, client, config, user } = setup();
  const first = await sendDaily({ client, store, config, log, user });
  store.updateAssignment(first.assignmentId, { assigned_on: '2020-01-01' });

  const second = await sendDaily({ client, store, config, log, user: store.getUser('u1') });
  assert.ok(second.assignmentId);
  assert.equal(store.getAssignment(first.assignmentId).status, 'expired');
  assert.equal(store.getOpenAssignment('u1').id, second.assignmentId);
  store.close();
});
