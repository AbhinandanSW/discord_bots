import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { runScrape } from '../src/jobs-bot/run.js';
import { createJobsStore } from '../src/jobs-bot/store.js';
import { DEFAULT_MAP } from '../src/jobs-bot/normalize.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const silentLog = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return silentLog;
  },
};

function makeConfig() {
  return {
    jobs: {
      intervalMinutes: 180,
      maxPostsPerRun: 5,
      maxCandidates: 50,
      maxAgeDays: 30,
      minConfidence: 2,
      defaultCategory: 'fullstack',
      logChannelId: null,
      channels: {},
      apify: {
        token: 'token',
        actorId: 'someone~actor',
        input: { query: 'engineer' },
        maxItems: 10,
        timeoutSecs: 30,
        mapping: DEFAULT_MAP,
      },
    },
  };
}

function mockApify(items) {
  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(items),
    };
  };
  return () => captured;
}

test('dry run classifies, dedupes and stores without posting', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bots-scrape-'));
  const store = createJobsStore(path.join(dir, 'jobs.db'));

  const getRequest = mockApify([
    {
      title: 'Senior Frontend Engineer',
      company: 'Acme',
      url: 'https://acme.com/jobs/1?utm_source=x',
      description: 'React and TypeScript, build design systems. Email hr@acme.com',
      postedAt: new Date().toISOString(),
    },
    {
      title: 'Senior Frontend Engineer',
      company: 'Acme',
      url: 'https://acme.com/jobs/1',
      description: 'React and TypeScript, build design systems. Email hr@acme.com',
      postedAt: new Date().toISOString(),
    },
    {
      title: 'Backend Engineer',
      company: 'Beta',
      url: 'https://beta.com/jobs/9',
      description: 'Java, Spring Boot, Kafka, PostgreSQL, REST APIs, microservices.',
      postedAt: new Date().toISOString(),
    },
    { title: '', description: 'nothing useful' },
  ]);

  const stats = await runScrape({
    client: { channels: { fetch: async () => null } },
    store,
    config: makeConfig(),
    log: silentLog,
    dryRun: true,
  });

  assert.equal(stats.fetched, 4);
  assert.equal(stats.inserted, 2);
  assert.equal(stats.duplicate, 1);
  assert.equal(stats.invalid, 1);
  assert.equal(stats.posted, 2);
  assert.equal(stats.byCategory.frontend, 1);
  assert.equal(stats.byCategory.backend, 1);

  const stored = store.search({ query: 'Frontend' });
  assert.equal(stored.length, 1);
  assert.deepEqual(JSON.parse(stored[0].emails), ['hr@acme.com']);

  const request = getRequest();
  assert.match(request.url, /\/acts\/someone~actor\/run-sync-get-dataset-items/);
  assert.deepEqual(request.body, { query: 'engineer' });
  store.close();
});

test('stale listings are skipped', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bots-scrape-'));
  const store = createJobsStore(path.join(dir, 'jobs.db'));
  mockApify([
    {
      title: 'React Developer',
      company: 'Old Co',
      url: 'https://old.example/jobs/1',
      description: 'React and CSS work for a long running project.',
      postedAt: '2020-01-01T00:00:00Z',
    },
  ]);

  const stats = await runScrape({
    client: { channels: { fetch: async () => null } },
    store,
    config: makeConfig(),
    log: silentLog,
    dryRun: true,
  });

  assert.equal(stats.inserted, 0);
  assert.equal(stats.stale, 1);
  store.close();
});

test('apify errors surface as a failed run instead of crashing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bots-scrape-'));
  const store = createJobsStore(path.join(dir, 'jobs.db'));

  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ error: { message: 'Authentication token is invalid' } }),
  });

  await assert.rejects(
    () =>
      runScrape({
        client: { channels: { fetch: async () => null } },
        store,
        config: makeConfig(),
        log: silentLog,
        dryRun: true,
      }),
    /Authentication token is invalid/,
  );
  store.close();
});
