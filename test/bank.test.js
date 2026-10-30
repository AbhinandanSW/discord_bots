import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BANK, DIFFICULTIES, ALL_TOPICS } from '../src/dsa-bot/bank.js';

test('question ids are unique', () => {
  const ids = BANK.map((question) => question.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every question is complete and well formed', () => {
  for (const question of BANK) {
    assert.ok(DIFFICULTIES.includes(question.difficulty), `${question.id} bad difficulty`);
    assert.ok(question.title.length > 3, `${question.id} missing title`);
    assert.ok(question.prompt.length > 40, `${question.id} prompt too short`);
    assert.ok(Array.isArray(question.topics) && question.topics.length > 0, `${question.id} no topics`);
    assert.ok(question.hints.length >= 2, `${question.id} needs at least two hints`);
    assert.match(question.link, /^https:\/\/leetcode\.com\/problems\/[a-z0-9-]+\/$/);
    for (const topic of question.topics) {
      assert.ok(ALL_TOPICS.includes(topic), `${question.id} unknown topic ${topic}`);
    }
  }
});

test('bank covers all difficulties with reasonable depth', () => {
  for (const difficulty of DIFFICULTIES) {
    const count = BANK.filter((question) => question.difficulty === difficulty).length;
    assert.ok(count >= 10, `${difficulty} only has ${count} questions`);
  }
});
