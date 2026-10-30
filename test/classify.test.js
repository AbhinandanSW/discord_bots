import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyJob } from '../src/jobs-bot/classify.js';

test('frontend role lands in frontend', () => {
  const result = classifyJob({
    title: 'Senior Frontend Engineer',
    description: 'Build design systems with React, TypeScript, CSS and Tailwind. Own accessibility.',
  });
  assert.equal(result.category, 'frontend');
  assert.ok(result.tags.includes('React'));
  assert.ok(result.confidence >= 2);
});

test('backend role lands in backend', () => {
  const result = classifyJob({
    title: 'Backend Engineer',
    description: 'Java, Spring Boot, Kafka and PostgreSQL. Design REST APIs and microservices.',
  });
  assert.equal(result.category, 'backend');
  assert.ok(result.tags.includes('Java'));
});

test('explicit full stack wording wins', () => {
  const result = classifyJob({
    title: 'Full Stack Developer',
    description: 'Work across React and Node.js.',
  });
  assert.equal(result.category, 'fullstack');
});

test('strong signal on both sides is treated as full stack', () => {
  const result = classifyJob({
    title: 'Software Engineer',
    description: 'You will build React frontends and Django microservices with PostgreSQL and Redis.',
  });
  assert.equal(result.category, 'fullstack');
});

test('keyword stuffing does not break the cap', () => {
  const result = classifyJob({
    title: 'Platform Engineer',
    description: 'react '.repeat(80),
  });
  assert.equal(result.category, 'frontend');
});

test('no signal falls back to the default category with zero confidence', () => {
  const result = classifyJob({ title: 'Office Manager', description: 'Manage calendars and supplies.' });
  assert.equal(result.category, 'fullstack');
  assert.equal(result.confidence, 0);
});

test('word boundaries stop partial matches', () => {
  const result = classifyJob({ title: 'Driver', description: 'Deliver nodes between warehouses.' });
  assert.equal(result.scores.backend, 0);
});
