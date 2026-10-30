import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractEmails } from '../src/jobs-bot/emails.js';

test('keeps recruiter addresses and drops robotic ones', () => {
  const text = `
    Send your resume to hr@acme.com or careers@acme.io.
    Do not reply to noreply@acme.com, support@acme.com or privacy@acme.com.
    Logo assets: hero@2x.png and logo@example.com.
  `;
  const emails = extractEmails(text);
  assert.ok(emails.includes('hr@acme.com'));
  assert.ok(emails.includes('careers@acme.io'));
  assert.ok(!emails.includes('noreply@acme.com'));
  assert.ok(!emails.includes('support@acme.com'));
  assert.ok(!emails.includes('privacy@acme.com'));
  assert.ok(!emails.includes('logo@example.com'));
});

test('recruiter-looking local parts rank first', () => {
  const emails = extractEmails('Contact john.doe@acme.com or talent.acquisition@acme.com');
  assert.equal(emails[0], 'talent.acquisition@acme.com');
});

test('dedupes case-insensitively and caps results', () => {
  const emails = extractEmails('HR@Acme.com hr@acme.com jobs@acme.com team@acme.com', { max: 2 });
  assert.deepEqual(emails, ['hr@acme.com', 'jobs@acme.com']);
});

test('handles arrays of candidate strings', () => {
  const emails = extractEmails(['nothing here', 'reach me at hiring@startup.dev']);
  assert.deepEqual(emails, ['hiring@startup.dev']);
});
