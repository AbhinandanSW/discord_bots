import { DIFFICULTIES } from './bank.js';

export function parseTopics(value) {
  if (Array.isArray(value)) return value.map((topic) => String(topic).toLowerCase().trim()).filter(Boolean);
  return String(value ?? '')
    .split(',')
    .map((topic) => topic.toLowerCase().trim())
    .filter(Boolean);
}

/**
 * Picks the difficulty for the next question.
 * A user with a fixed preference always gets that. "mixed" adapts:
 * start easy, ramp up as they solve, and ease off after skips.
 */
export function targetDifficulty(user, history = [], rng = Math.random) {
  const fixed = String(user.difficulty ?? 'mixed').toLowerCase();
  if (DIFFICULTIES.includes(fixed)) return fixed;

  const recent = history.slice(0, 5);
  const recentSkips = recent.filter((entry) => entry.status === 'skipped').length;
  if (recentSkips >= 2) return 'easy';

  const solved = history.filter((entry) => entry.status === 'solved').length;
  if (solved < 5) return 'easy';
  if (solved < 15) return 'medium';
  return rng() < 0.3 ? 'hard' : 'medium';
}

function topicStats(history, bankById) {
  const stats = new Map();
  for (const entry of history) {
    const question = bankById.get(entry.question_id);
    if (!question) continue;
    for (const topic of question.topics) {
      const current = stats.get(topic) ?? { solved: 0, skipped: 0, expired: 0 };
      if (entry.status === 'solved') current.solved += 1;
      else if (entry.status === 'skipped') current.skipped += 1;
      else if (entry.status === 'expired') current.expired += 1;
      stats.set(topic, current);
    }
  }
  return stats;
}

function weightFor(question, { target, topics, stats, lastTopics }) {
  let weight = 1;

  if (question.difficulty === target) weight += 2;
  if (topics.length && question.topics.some((topic) => topics.includes(topic))) weight += 1.5;

  for (const topic of question.topics) {
    const stat = stats.get(topic);
    if (!stat) {
      weight += 0.4; // unexplored topic
      continue;
    }
    const attempts = stat.solved + stat.skipped + stat.expired;
    if (attempts > 0) {
      const successRate = stat.solved / attempts;
      weight += (1 - successRate) * 1.2;
    }
  }

  if (question.topics.some((topic) => lastTopics.has(topic))) weight *= 0.5;

  return Math.max(0.1, weight);
}

function weightedPick(items, weights, rng) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) return items[Math.floor(rng() * items.length) % items.length];
  let threshold = rng() * total;
  for (let index = 0; index < items.length; index += 1) {
    threshold -= weights[index];
    if (threshold <= 0) return items[index];
  }
  return items[items.length - 1];
}

/**
 * Chooses the next unseen question, relaxing topic and difficulty filters in
 * stages so a user with narrow preferences never gets stuck with nothing.
 */
export function chooseQuestion({ bank, user, history = [], rng = Math.random }) {
  const bankById = new Map(bank.map((question) => [question.id, question]));
  const seen = new Set(history.map((entry) => entry.question_id));
  const topics = parseTopics(user.topics);
  const target = targetDifficulty(user, history, rng);
  const stats = topicStats(history, bankById);

  const lastTopics = new Set();
  const mostRecent = history[0];
  if (mostRecent) {
    for (const topic of bankById.get(mostRecent.question_id)?.topics ?? []) lastTopics.add(topic);
  }

  const pools = [
    () => bank.filter((question) => !seen.has(question.id) && question.difficulty === target && (!topics.length || question.topics.some((topic) => topics.includes(topic)))),
    () => bank.filter((question) => !seen.has(question.id) && (!topics.length || question.topics.some((topic) => topics.includes(topic)))),
    () => bank.filter((question) => !seen.has(question.id) && question.difficulty === target),
    () => bank.filter((question) => !seen.has(question.id)),
    () => bank.filter((question) => question.difficulty === target),
    () => bank.slice(),
  ];

  let pool = [];
  for (const build of pools) {
    pool = build();
    if (pool.length) break;
  }
  if (!pool.length) return null;

  const weights = pool.map((question) => weightFor(question, { target, topics, stats, lastTopics }));
  return weightedPick(pool, weights, rng);
}
