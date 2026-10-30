import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BANK } from '../src/dsa-bot/bank.js';
import { chooseQuestion, parseTopics, targetDifficulty } from '../src/dsa-bot/picker.js';

const fixed = (value) => () => value;

test('parseTopics normalises csv input', () => {
  assert.deepEqual(parseTopics(' Arrays, dp ,,Trees '), ['arrays', 'dp', 'trees']);
  assert.deepEqual(parseTopics(''), []);
});

test('respects a fixed difficulty and topic preference', () => {
  const question = chooseQuestion({
    bank: BANK,
    user: { difficulty: 'easy', topics: 'arrays' },
    history: [],
    rng: fixed(0.4),
  });
  assert.equal(question.difficulty, 'easy');
  assert.ok(question.topics.includes('arrays'));
});

test('never repeats a question the user has already seen', () => {
  const seenEasyArrays = BANK.filter((question) => question.difficulty === 'easy' && question.topics.includes('arrays'));
  const history = seenEasyArrays.slice(0, -1).map((question) => ({
    question_id: question.id,
    status: 'solved',
  }));

  const question = chooseQuestion({
    bank: BANK,
    user: { difficulty: 'easy', topics: 'arrays' },
    history,
    rng: fixed(0.9),
  });
  assert.equal(question.id, seenEasyArrays.at(-1).id);
});

test('relaxes filters instead of running dry', () => {
  const history = BANK.map((question) => ({ question_id: question.id, status: 'solved' }));
  const question = chooseQuestion({ bank: BANK, user: { difficulty: 'hard', topics: 'tries' }, history, rng: fixed(0.5) });
  assert.ok(question, 'expected a fallback question');
});

test('avoids repeating the previous topic when alternatives exist', () => {
  const history = BANK.filter((question) => question.topics.includes('arrays')).slice(0, 3).map((question) => ({
    question_id: question.id,
    status: 'solved',
  }));
  const picks = new Set();
  for (let index = 0; index < 12; index += 1) {
    const question = chooseQuestion({
      bank: BANK,
      user: { difficulty: 'mixed', topics: '' },
      history,
      rng: fixed(index / 12),
    });
    picks.add(question.id);
  }
  assert.ok(picks.size > 1, 'expected variety across picks');
});

test('adaptive difficulty ramps with solved count', () => {
  const user = { difficulty: 'mixed' };
  assert.equal(targetDifficulty(user, [], fixed(0.5)), 'easy');

  const sixSolved = BANK.slice(0, 6).map((question) => ({ question_id: question.id, status: 'solved' }));
  assert.equal(targetDifficulty(user, sixSolved, fixed(0.9)), 'medium');

  const recentlySkipped = [
    { question_id: 'two-sum', status: 'skipped' },
    { question_id: 'valid-parentheses', status: 'skipped' },
  ];
  assert.equal(targetDifficulty(user, recentlySkipped, fixed(0.5)), 'easy');
});

test('generated picks always carry usable content', () => {
  for (let index = 0; index < 25; index += 1) {
    const question = chooseQuestion({ bank: BANK, user: { difficulty: 'mixed', topics: '' }, history: [], rng: fixed(index / 25) });
    assert.ok(question.id);
    assert.ok(question.hints.length >= 2);
  }
});
