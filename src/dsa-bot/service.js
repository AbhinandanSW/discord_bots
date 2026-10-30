import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { capitalize, slug, truncate } from '../lib/text.js';
import { BANK, getQuestion } from './bank.js';
import { chooseQuestion } from './picker.js';
import { addDays, localDate, prettyDate } from './tz.js';

const DIFFICULTY_COLORS = { easy: 0x22c55e, medium: 0xf59e0b, hard: 0xef4444 };
const DIFFICULTY_EMOJI = { easy: '\u{1F7E2}', medium: '\u{1F7E1}', hard: '\u{1F534}' };
const ARCHIVE_CHOICES = [60, 1440, 4320, 10080];

export function threadName(user) {
  const base = slug(user.username || `user-${String(user.user_id).slice(-4)}`, 'dsa');
  return truncate(`dsa-${base}`, 90);
}

export function questionEmbed(question, { kind = 'new', hintsUsed = 0 } = {}) {
  const embed = new EmbedBuilder()
    .setColor(DIFFICULTY_COLORS[question.difficulty] ?? 0x6366f1)
    .setTitle(`${DIFFICULTY_EMOJI[question.difficulty] ?? '\u26AA'} ${truncate(question.title, 240)}`)
    .setURL(question.link)
    .setDescription(truncate(question.prompt, 2000))
    .addFields(
      { name: 'Difficulty', value: capitalize(question.difficulty), inline: true },
      { name: 'Topics', value: question.topics.map((topic) => `\`${topic}\``).join(' ').slice(0, 1024), inline: true },
      { name: 'Practice', value: `[Open the problem](${question.link})`, inline: true },
    )
    .setFooter({
      text:
        kind === 'review'
          ? 'Spaced review - this one is coming back because it was tricky'
          : 'Daily challenge - reply with your approach or hit Solved',
    });

  if (hintsUsed > 0) {
    embed.addFields({ name: 'Hints used', value: `${hintsUsed} / ${question.hints.length}`, inline: true });
  }
  return embed;
}

export function questionButtons(assignmentId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dsa:solve:${assignmentId}`)
      .setLabel('Solved')
      .setEmoji('\u2705')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`dsa:hint:${assignmentId}`)
      .setLabel('Hint')
      .setEmoji('\u{1F4A1}')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`dsa:skip:${assignmentId}`)
      .setLabel('Skip')
      .setEmoji('\u23ED\uFE0F')
      .setStyle(ButtonStyle.Secondary),
  );
}

export async function resolveTarget({ client, store, config, user, log }) {
  if (config.dsa.mode === 'dm') {
    const discordUser = await client.users.fetch(user.user_id);
    return { kind: 'dm', target: discordUser };
  }

  const channelId = config.dsa.channelId;
  if (!channelId) throw new Error('DSA_CHANNEL_ID is not set');

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`DSA channel ${channelId} is missing or not text based`);
  }

  if (config.dsa.mode === 'channel') return { kind: 'channel', target: channel };

  if (user.thread_id) {
    const thread = await client.channels.fetch(user.thread_id).catch(() => null);
    if (thread) {
      if (thread.archived) await thread.setArchived(false).catch(() => {});
      return { kind: 'thread', target: thread };
    }
    log?.warn(`stored thread ${user.thread_id} is gone, creating a new one`);
    store.updateUser(user.user_id, { thread_id: null });
  }

  const autoArchiveDuration = ARCHIVE_CHOICES.includes(config.dsa.threadArchiveMinutes)
    ? config.dsa.threadArchiveMinutes
    : 1440;
  const thread = await channel.threads.create({
    name: threadName(user),
    autoArchiveDuration,
    reason: `DSA coaching for ${user.username || user.user_id}`,
  });
  store.updateUser(user.user_id, { thread_id: thread.id });
  return { kind: 'thread', target: thread };
}

/**
 * Creates the assignment row first (the buttons need its id), then delivers.
 * A failed delivery is marked so it never blocks future questions.
 */
export async function deliverQuestion({
  client,
  store,
  config,
  user,
  log,
  question,
  kind = 'new',
  reviewCount = 0,
  content = null,
}) {
  const today = localDate(new Date(), user.timezone);
  const assignmentId = store.addAssignment({
    user_id: user.user_id,
    question_id: question.id,
    kind,
    assigned_on: today,
    review_count: reviewCount,
  });

  try {
    const { kind: targetKind, target } = await resolveTarget({ client, store, config, user, log });
    const payload = {
      content: content ?? (targetKind === 'dm' ? null : `<@${user.user_id}>`),
      embeds: [questionEmbed(question, { kind })],
      components: [questionButtons(assignmentId)],
      allowedMentions: targetKind === 'dm' ? { parse: [] } : { users: [user.user_id] },
    };
    const message = await target.send(payload);
    store.updateAssignment(assignmentId, { message_id: message.id, thread_id: message.channelId });
    store.updateUser(user.user_id, { last_sent_on: today });
    return { assignmentId, message, targetKind, question };
  } catch (error) {
    store.updateAssignment(assignmentId, { status: 'failed' });
    throw error;
  }
}

/**
 * One day's delivery for one user: finish stale questions, prefer a due review,
 * otherwise pick something new.
 */
export async function sendDaily({ client, store, config, log, user, rng = Math.random }) {
  const today = localDate(new Date(), user.timezone);
  store.expireStale(user.user_id, addDays(today, -config.dsa.expireDays));

  if (store.getOpenAssignment(user.user_id)) {
    return { skipped: 'open-assignment' };
  }

  const due = store.dueReview(user.user_id, today);
  if (due) {
    const question = getQuestion(due.question_id);
    if (question) {
      const result = await deliverQuestion({
        client,
        store,
        config,
        log,
        user,
        question,
        kind: 'review',
        reviewCount: due.review_count + 1,
      });
      store.updateAssignment(due.id, { due_on: null });
      return result;
    }
  }

  const history = store.history(user.user_id);
  const question = chooseQuestion({ bank: BANK, user, history, rng });
  if (!question) return { skipped: 'no-questions' };

  return deliverQuestion({ client, store, config, log, user, question, kind: 'new' });
}

function nextStreak(user, today) {
  if (user.last_solved_on === today) return Math.max(user.streak ?? 1, 1);
  if (user.last_solved_on && addDays(user.last_solved_on, 1) === today) return (user.streak ?? 0) + 1;
  return 1;
}

export function applySolved({ store, user, assignment }) {
  const today = localDate(new Date(), user.timezone);
  const interval = assignment.hints_used > 0 || assignment.kind === 'review' ? 3 : 7;

  store.updateAssignment(assignment.id, {
    status: 'solved',
    solved_at: new Date().toISOString(),
    due_on: addDays(today, interval),
    attempts: (assignment.attempts ?? 0) + 1,
  });

  const streak = nextStreak(user, today);
  return store.updateUser(user.user_id, {
    streak,
    best_streak: Math.max(user.best_streak ?? 0, streak),
    total_solved: (user.total_solved ?? 0) + 1,
    last_solved_on: today,
  });
}

export function applySkipped({ store, user, assignment }) {
  store.updateAssignment(assignment.id, {
    status: 'skipped',
    attempts: (assignment.attempts ?? 0) + 1,
  });
  return store.updateUser(user.user_id, {
    streak: 0,
    total_skipped: (user.total_skipped ?? 0) + 1,
  });
}

export function applyHint({ store, assignment }) {
  const hintsUsed = (assignment.hints_used ?? 0) + 1;
  store.updateAssignment(assignment.id, { hints_used: hintsUsed });
  return hintsUsed;
}

function topicBreakdown(history) {
  const map = new Map();
  for (const entry of history) {
    const question = getQuestion(entry.question_id);
    if (!question) continue;
    for (const topic of question.topics) {
      const row = map.get(topic) ?? { solved: 0, seen: 0 };
      row.seen += 1;
      if (entry.status === 'solved') row.solved += 1;
      map.set(topic, row);
    }
  }
  return [...map.entries()]
    .map(([topic, row]) => ({ topic, ...row, rate: row.seen ? row.solved / row.seen : 0 }))
    .sort((a, b) => b.seen - a.seen);
}

export function buildStatsEmbed({ user, totals, history, config }) {
  const topics = topicBreakdown(history);
  const strong = topics.filter((topic) => topic.solved > 0).sort((a, b) => b.rate - a.rate).slice(0, 3);
  const weak = topics.filter((topic) => topic.seen > topic.solved).sort((a, b) => a.rate - b.rate).slice(0, 3);
  const accuracy = totals.total ? Math.round(((totals.solved ?? 0) / Math.max(1, totals.solved + totals.skipped + totals.expired)) * 100) : 0;

  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle(`DSA progress \u00b7 ${user.username || 'you'}`)
    .addFields(
      { name: 'Streak', value: `\u{1F525} ${user.streak ?? 0} day(s)`, inline: true },
      { name: 'Best streak', value: String(user.best_streak ?? 0), inline: true },
      { name: 'Solved', value: String(totals.solved ?? 0), inline: true },
      { name: 'Skipped', value: String(totals.skipped ?? 0), inline: true },
      { name: 'Expired', value: String(totals.expired ?? 0), inline: true },
      { name: 'Accuracy', value: `${accuracy}%`, inline: true },
      {
        name: 'Preferences',
        value: [
          `Difficulty: **${user.difficulty === 'mixed' ? 'adaptive' : user.difficulty}**`,
          `Topics: ${user.topics ? user.topics.split(',').map((topic) => `\`${topic}\``).join(' ') : 'all'}`,
          `Daily at **${String(user.hour).padStart(2, '0')}:00** (${user.timezone})`,
        ].join('\n'),
      },
      {
        name: 'Strong topics',
        value: strong.length ? strong.map((topic) => `${topic.topic} (${topic.solved}/${topic.seen})`).join(', ') : 'not enough data yet',
      },
      {
        name: 'Needs work',
        value: weak.length ? weak.map((topic) => `${topic.topic} (${topic.solved}/${topic.seen})`).join(', ') : 'nothing flagged',
      },
    )
    .setFooter({
      text: `Enrolled ${prettyDate(String(user.created_at).slice(0, 10))} \u00b7 mode: ${config.dsa.mode}`,
    });

  return embed;
}
