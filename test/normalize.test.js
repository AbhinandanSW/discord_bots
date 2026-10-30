import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_MAP, fingerprintOf, normalizeItem, normalizeUrl } from '../src/jobs-bot/normalize.js';

test('normalizes a typical Apify item', () => {
  const job = normalizeItem(
    {
      title: 'Frontend Developer',
      company: { name: 'Acme' },
      url: 'https://www.acme.com/jobs/1?utm_source=linkedin&b=2&a=1',
      descriptionHtml: '<p>Build with <b>React</b>.<br/>Email hr@acme.com</p>',
      location: { name: 'Remote, India' },
      salary: { min: 10, max: 20, currency: 'USD', period: 'hour' },
      postedAt: '2026-01-05T10:00:00Z',
      tags: ['React', 'TypeScript'],
    },
    DEFAULT_MAP,
  );

  assert.equal(job.title, 'Frontend Developer');
  assert.equal(job.company, 'Acme');
  assert.equal(job.url, 'https://acme.com/jobs/1?a=1&b=2');
  assert.equal(job.description, 'Build with React.\nEmail hr@acme.com');
  assert.equal(job.location, 'Remote, India');
  assert.equal(job.salary, 'USD 10-20 hour');
  assert.equal(job.remote, 1);
  assert.deepEqual(job.emails, ['hr@acme.com']);
  assert.equal(job.postedAt, '2026-01-05T10:00:00.000Z');
});

test('tracking params do not change the fingerprint', () => {
  const a = normalizeItem({ title: 'Role', url: 'https://x.com/j/1?utm_source=a', description: 'Long enough description to be valid.' });
  const b = normalizeItem({ title: 'Role', url: 'https://x.com/j/1', description: 'Long enough description to be valid.' });
  assert.equal(a.fingerprint, b.fingerprint);
});

test('rejects items without a title or usable content', () => {
  assert.equal(normalizeItem(null), null);
  assert.equal(normalizeItem({ description: 'no title at all' }), null);
  assert.equal(normalizeItem({ title: 'No body here' }), null);
});

test('prefers the human field inside metadata objects', () => {
  const job = normalizeItem({
    title: 'Platform Engineer',
    company: { name: 'Acme', logo: 'https://cdn.acme.com/logo.png', url: 'https://acme.com' },
    url: 'https://acme.com/jobs/2',
    description: 'Own the deployment platform and its reliability.',
  });
  assert.equal(job.company, 'Acme');
});

test('custom field mapping overrides defaults', () => {
  const mapping = { ...DEFAULT_MAP, title: ['positionName'], company: ['employer.name'] };
  const job = normalizeItem(
    { positionName: 'Backend Developer', employer: { name: 'Beta' }, description: 'Node.js and PostgreSQL services, plus Redis caching and queues.' },
    mapping,
  );
  assert.equal(job.title, 'Backend Developer');
  assert.equal(job.company, 'Beta');
});

test('epoch seconds are parsed as dates', () => {
  assert.equal(
    normalizeItem({ title: 'Role', url: 'https://x.com/1', postedAt: 1767600000, description: 'A valid description here.' }).postedAt,
    '2026-01-05T08:00:00.000Z',
  );
});

test('normalizeUrl accepts bare domains and rejects garbage', () => {
  assert.equal(normalizeUrl('acme.com/jobs'), 'https://acme.com/jobs');
  assert.equal(normalizeUrl('not a url'), null);
  assert.equal(fingerprintOf({ title: 'A', company: 'B' }), fingerprintOf({ title: 'a ', company: 'b' }));
});
