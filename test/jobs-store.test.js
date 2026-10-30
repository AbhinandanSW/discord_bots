import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createJobsStore } from '../src/jobs-bot/store.js';

function tempFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bots-jobs-'));
  return path.join(dir, name);
}

function makeJob(overrides = {}) {
  return {
    fingerprint: 'fp-1',
    title: 'Frontend Developer',
    titleKey: 'frontend developer',
    company: 'Acme',
    companyKey: 'acme',
    url: 'https://acme.com/1',
    description: 'React role',
    location: 'Remote',
    salary: '',
    remote: 1,
    category: 'frontend',
    confidence: 6,
    tags: 'React, TypeScript',
    emails: ['hr@acme.com'],
    source: 'apify',
    postedAt: '2026-01-05T10:00:00.000Z',
    ...overrides,
  };
}

test('jobs store dedupes on fingerprint and on title+company', () => {
  const store = createJobsStore(tempFile('jobs.db'));
  assert.equal(store.addJob(makeJob()).inserted, true);
  assert.equal(store.addJob(makeJob()).inserted, false);
  assert.equal(store.addJob(makeJob({ fingerprint: 'fp-2', url: 'https://acme.com/2' })).inserted, false);
  assert.equal(store.addJob(makeJob({ fingerprint: 'fp-3', titleKey: 'backend dev', companyKey: 'acme' })).inserted, true);
  assert.equal(store.stats().total, 2);
  store.close();
});

test('posting removes a job from the pending queue', () => {
  const store = createJobsStore(tempFile('jobs.db'));
  const { id } = store.addJob(makeJob());
  assert.equal(store.nextUnposted(10).length, 1);
  store.markPosted(id, { channelId: 'c1', messageId: 'm1' });
  assert.equal(store.nextUnposted(10).length, 0);
  assert.equal(store.stats().posted, 1);
  store.close();
});

test('dismissed jobs never surface again', () => {
  const store = createJobsStore(tempFile('jobs.db'));
  const { id } = store.addJob(makeJob());
  store.dismiss(id);
  assert.equal(store.nextUnposted(10).length, 0);
  assert.equal(store.search({ query: 'Frontend' }).length, 0);
  store.close();
});

test('search and email listing work', () => {
  const store = createJobsStore(tempFile('jobs.db'));
  store.addJob(makeJob());
  store.addJob(makeJob({ fingerprint: 'fp-9', titleKey: 'data engineer', title: 'Data Engineer', company: 'Beta', companyKey: 'beta', category: 'backend', emails: ['jobs@beta.dev'], description: 'Spark pipelines and Airflow', tags: 'Spark, Airflow' }));

  assert.equal(store.search({ query: 'React' }).length, 1);
  assert.equal(store.search({ category: 'backend' }).length, 1);

  const emails = store.emails({});
  assert.equal(emails.length, 2);
  assert.ok(emails.some((row) => row.email === 'jobs@beta.dev'));
  store.close();
});

test('settings round-trip and survive JSON encoding', () => {
  const store = createJobsStore(tempFile('jobs.db'));
  store.setSetting('channel:frontend', '123');
  assert.equal(store.getSetting('channel:frontend'), '123');
  store.setSetting('last_run_stats', JSON.stringify({ posted: 3 }));
  assert.deepEqual(store.getJsonSetting('last_run_stats'), { posted: 3 });
  assert.equal(store.getSetting('missing', 'fallback'), 'fallback');
  store.close();
});
