import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { truncate } from '../lib/text.js';
import { describeError } from '../lib/logger.js';
import { ALL_TOPICS, getQuestion } from './bank.js';
import { parseTopics } from './picker.js';
import {
  applyHint,
  applySkipped,
  applySolved,
  buildStatsEmbed,
  resolveTarget,
  sendDaily,
} from './service.js';
import { isValidTimezone } from './tz.js';

const TOPIC_HINT = 'Comma separated, e.g. arrays,dp,trees';

export const dsaCommands = [
  new SlashCommandBuilder()
    .setName('dsa')
    .setDescription('Personalised daily DSA practice')
    .addSubcommand((sub) =>
      sub
        .setName('enroll')
        .setDescription('Start receiving a daily question in your own thread')
        .addStringOption((option) =>
          option
            .setName('difficulty')
            .setDescription('Fixed difficulty, or let the bot adapt')
            .addChoices(
              { name: 'Adaptive (recommended)', value: 'mixed' },
              { name: 'Easy', value: 'easy' },
              { name: 'Medium', value: 'medium' },
              { name: 'Hard', value: 'hard' },
            ),
        )
        .addStringOption((option) =>
          option.setName('topics').setDescription(TOPIC_HINT).setAutocomplete(true),
        )
        .addIntegerOption((option) =>
          option.setName('hour').setDescription('Hour of day to send it (0-23, local time)').setMinValue(0).setMaxValue(23),
        )
        .addStringOption((option) =>
          option.setName('timezone').setDescription('IANA timezone, e.g. Asia/Kolkata, Europe/Berlin, America/New_York'),
        ),
    )
    .addSubcommand((sub) => sub.setName('today').setDescription('Show or resend your current question'))
    .addSubcommand((sub) =>
      sub
        .setName('done')
        .setDescription('Mark your open question as solved')
        .addStringOption((option) => option.setName('notes').setDescription('What you learned / the key idea')),
    )
    .addSubcommand((sub) => sub.setName('skip').setDescription('Skip the current question and see the solution'))
    .addSubcommand((sub) => sub.setName('hint').setDescription('Get the next hint for your current question'))
    .addSubcommand((sub) =>
      sub
        .setName('stats')
        .setDescription('Streak, accuracy and topic breakdown')
        .addUserOption((option) => option.setName('user').setDescription('Look up someone else')),
    )
    .addSubcommand((sub) => sub.setName('leaderboard').setDescription('Top solvers in this server'))
    .addSubcommand((sub) =>
      sub
        .setName('settings')
        .setDescription('Change difficulty, topics, delivery time or pause')
        .addStringOption((option) =>
          option
            .setName('difficulty')
            .setDescription('Fixed difficulty or adaptive')
            .addChoices(
              { name: 'Adaptive', value: 'mixed' },
              { name: 'Easy', value: 'easy' },
              { name: 'Medium', value: 'medium' },
              { name: 'Hard', value: 'hard' },
            ),
        )
        .addStringOption((option) => option.setName('topics').setDescription(TOPIC_HINT).setAutocomplete(true))
        .addIntegerOption((option) =>
          option.setName('hour').setDescription('Hour of day (0-23, local time)').setMinValue(0).setMaxValue(23),
        )
        .addStringOption((option) => option.setName('timezone').setDescription('IANA timezone, e.g. Asia/Kolkata'))
        .addBooleanOption((option) => option.setName('active').setDescription('Pause or resume daily questions')),
    )
    .addSubcommand((sub) => sub.setName('topics').setDescription('List all available topics')),
];

export async function handleDsaCommand(interaction, ctx) {
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'enroll':
      return enroll(interaction, ctx);
    case 'today':
      return today(interaction, ctx);
    case 'done':
      return done(interaction, ctx);
    case 'skip':
      return skip(interaction, ctx);
    case 'hint':
      return hint(interaction, ctx);
    case 'stats':
      return stats(interaction, ctx);
    case 'leaderboard':
      return leaderboard(interaction, ctx);
    case 'settings':
      return settings(interaction, ctx);
    case 'topics':
      return listTopics(interaction);
    default:
      return interaction.reply({ content: 'Unknown subcommand.', flags: MessageFlags.Ephemeral });
  }
}

function parseTopicInput(value) {
  const requested = parseTopics(value);
  const invalid = requested.filter((topic) => !ALL_TOPICS.includes(topic));
  const valid = requested.filter((topic) => ALL_TOPICS.includes(topic));
  return { valid: [...new Set(valid)], invalid: [...new Set(invalid)] };
}

async function enroll(interaction, { store, config }) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const difficulty = interaction.options.getString('difficulty') ?? 'mixed';
  const topicsRaw = interaction.options.getString('topics');
  const hour = interaction.options.getInteger('hour') ?? config.dsa.hour;
  const timezone = interaction.options.getString('timezone') ?? config.dsa.timezone;

  if (!isValidTimezone(timezone)) {
    await interaction.editReply(`\`${timezone}\` is not a valid IANA timezone. Try \`Asia/Kolkata\` or \`UTC\`.`);
    return;
  }

  const { valid, invalid } = parseTopicInput(topicsRaw);
  const existing = store.getUser(interaction.user.id);

  const user = store.upsertUser({
    user_id: interaction.user.id,
    username: interaction.user.globalName || interaction.user.username,
    difficulty,
    topics: valid.join(','),
    timezone,
    hour,
    active: 1,
    guild_id: interaction.guildId,
  });

  const open = store.getOpenAssignment(user.user_id);
  let question = null;
  let threadId = config.dsa.mode === 'dm' ? null : user.thread_id;

  try {
    if (open) {
      // Re-opening an archived or deleted thread is the only thing left to do.
      if (config.dsa.mode !== 'dm') {
        const target = await resolveTarget({
          client: interaction.client,
          store,
          config,
          user: store.getUser(user.user_id),
          log: null,
        });
        threadId = target.target.id;
      }
    } else {
      const result = await sendDaily({
        client: interaction.client,
        store,
        config,
        log: null,
        user: store.getUser(user.user_id),
      });
      question = result.question ?? null;
      threadId = store.getUser(user.user_id).thread_id;
    }
  } catch (error) {
    await interaction.editReply(`Enrolled, but delivering the first question failed: ${describeError(error)}`);
    return;
  }

  const lines = [
    existing ? 'Settings updated.' : 'You are enrolled. \u{1F389}',
    `Daily questions at **${String(hour).padStart(2, '0')}:00** (${timezone}).`,
    `Difficulty: **${difficulty === 'mixed' ? 'adaptive' : difficulty}**`,
    `Topics: ${valid.length ? valid.map((topic) => `\`${topic}\``).join(' ') : 'all'}`,
    question ? null : 'You already have an open question waiting.',
    invalid.length ? `\u26A0\uFE0F Ignored unknown topic(s): ${invalid.join(', ')}` : null,
    '',
    config.dsa.mode === 'dm'
      ? 'Check your DMs.'
      : threadId
        ? `Your thread: <#${threadId}>`
        : 'Your thread will be created with the first question.',
  ].filter(Boolean);

  await interaction.editReply({
    content: lines.join('\n'),
    allowedMentions: { parse: [] },
  });
}

async function today(interaction, { store, config }) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const user = store.getUser(interaction.user.id);
  if (!user) {
    await interaction.editReply('You are not enrolled yet. Run `/dsa enroll`.');
    return;
  }

  const open = store.getOpenAssignment(user.user_id);
  if (open) {
    const question = getQuestion(open.question_id);
    await interaction.editReply({
      content: [
        `Open question: **${question ? question.title : open.question_id}**`,
        question ? `[Open the problem](${question.link})` : null,
        user.thread_id ? `Thread: <#${user.thread_id}>` : null,
        'Use the buttons in the thread, or `/dsa done`, `/dsa hint`, `/dsa skip`.',
      ]
        .filter(Boolean)
        .join('\n'),
      allowedMentions: { parse: [] },
    });
    return;
  }

  try {
    const result = await sendDaily({ client: interaction.client, store, config, log: null, user });
    if (result.skipped) {
      await interaction.editReply(`Could not send a question (${result.skipped}).`);
      return;
    }
    await interaction.editReply(
      config.dsa.mode === 'dm'
        ? 'Sent to your DMs.'
        : `Sent to <#${store.getUser(user.user_id)?.thread_id ?? ''}>.`,
    );
  } catch (error) {
    await interaction.editReply(`Failed to send: ${describeError(error)}`);
  }
}

async function done(interaction, { store }) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const user = store.getUser(interaction.user.id);
  if (!user) {
    await interaction.editReply('You are not enrolled yet. Run `/dsa enroll`.');
    return;
  }
  const assignment = store.getOpenAssignment(user.user_id);
  if (!assignment) {
    await interaction.editReply('You have no open question right now.');
    return;
  }

  const question = getQuestion(assignment.question_id);
  const notes = interaction.options.getString('notes');
  if (notes) store.updateAssignment(assignment.id, { notes: truncate(notes, 500) });

  const updated = applySolved({ store, user, assignment });
  await clearButtons(interaction.client, assignment);
  await announceSolved(interaction, updated, question, { viaCommand: true });
}

async function skip(interaction, { store }) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const user = store.getUser(interaction.user.id);
  if (!user) {
    await interaction.editReply('You are not enrolled yet. Run `/dsa enroll`.');
    return;
  }
  const assignment = store.getOpenAssignment(user.user_id);
  if (!assignment) {
    await interaction.editReply('You have no open question right now.');
    return;
  }

  const question = getQuestion(assignment.question_id);
  applySkipped({ store, user, assignment });
  await clearButtons(interaction.client, assignment);

  await interaction.editReply({
    content: [
      `Skipped **${question ? question.title : assignment.question_id}**. Streak reset.`,
      question ? `Read the editorial: ${question.link}` : null,
      'Skipping is fine - it just tells the coach to slow down.',
    ]
      .filter(Boolean)
      .join('\n'),
    allowedMentions: { parse: [] },
  });
}

async function hint(interaction, { store }) {
  const user = store.getUser(interaction.user.id);
  if (!user) {
    await interaction.reply({ content: 'You are not enrolled yet. Run `/dsa enroll`.', flags: MessageFlags.Ephemeral });
    return;
  }
  const assignment = store.getOpenAssignment(user.user_id);
  if (!assignment) {
    await interaction.reply({ content: 'You have no open question right now.', flags: MessageFlags.Ephemeral });
    return;
  }
  const question = getQuestion(assignment.question_id);
  if (!question) {
    await interaction.reply({ content: 'Question data is missing.', flags: MessageFlags.Ephemeral });
    return;
  }

  const used = applyHint({ store, assignment });
  if (used > question.hints.length) {
    await interaction.reply({
      content: `That was the last hint. Editorial: ${question.link}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: `**Hint ${used}/${question.hints.length}** \u2014 ${question.hints[used - 1]}`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

async function stats(interaction, { store, config }) {
  const target = interaction.options.getUser('user') ?? interaction.user;
  const user = store.getUser(target.id);
  if (!user) {
    await interaction.reply({
      content: `${target.id === interaction.user.id ? 'You are' : 'That user is'} not enrolled yet.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const embed = buildStatsEmbed({
    user,
    totals: store.userTotals(user.user_id),
    history: store.history(user.user_id),
    config,
  });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function leaderboard(interaction, { store }) {
  const rows = store.leaderboard(10).filter((row) => row.total_solved > 0);
  if (!rows.length) {
    await interaction.reply({
      content: 'Nobody has solved a question yet. Be the first - `/dsa enroll`.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
  const lines = rows.map((row, index) => {
    const medal = medals[index] ?? `${index + 1}.`;
    return `${medal} **${truncate(row.username || `user-${String(row.user_id).slice(-4)}`, 30)}** \u2014 ${row.total_solved} solved \u00b7 ${row.streak} day streak`;
  });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle('DSA leaderboard')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Ranked by total solved, then current streak' }),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function settings(interaction, { store, config }) {
  const user = store.getUser(interaction.user.id);
  if (!user) {
    await interaction.reply({ content: 'You are not enrolled yet. Run `/dsa enroll`.', flags: MessageFlags.Ephemeral });
    return;
  }

  const patch = {};
  const difficulty = interaction.options.getString('difficulty');
  const topicsRaw = interaction.options.getString('topics');
  const hour = interaction.options.getInteger('hour');
  const timezone = interaction.options.getString('timezone');
  const active = interaction.options.getBoolean('active');

  if (difficulty) patch.difficulty = difficulty;
  if (typeof hour === 'number') patch.hour = hour;
  if (typeof active === 'boolean') patch.active = active ? 1 : 0;

  if (timezone) {
    if (!isValidTimezone(timezone)) {
      await interaction.reply({
        content: `\`${timezone}\` is not a valid IANA timezone.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    patch.timezone = timezone;
  }

  let invalid = [];
  if (topicsRaw !== null) {
    const parsed = parseTopicInput(topicsRaw);
    patch.topics = parsed.valid.join(',');
    invalid = parsed.invalid;
  }

  if (!Object.keys(patch).length) {
    const summary = [
      `Difficulty: **${user.difficulty === 'mixed' ? 'adaptive' : user.difficulty}**`,
      `Topics: ${user.topics ? user.topics.split(',').map((topic) => `\`${topic}\``).join(' ') : 'all'}`,
      `Delivery: **${String(user.hour).padStart(2, '0')}:00** (${user.timezone})`,
      `Status: **${user.active ? 'active' : 'paused'}**`,
      `Thread: ${user.thread_id ? `<#${user.thread_id}>` : 'not created yet'}`,
      '',
      'Change something with `/dsa settings difficulty: topics: hour: timezone: active:`.',
    ].join('\n');

    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x6366f1).setTitle('Your DSA settings').setDescription(summary)], flags: MessageFlags.Ephemeral });
    return;
  }

  const updated = store.updateUser(user.user_id, patch);
  const lines = [
    'Settings updated.',
    `Difficulty: **${updated.difficulty === 'mixed' ? 'adaptive' : updated.difficulty}**`,
    `Topics: ${updated.topics ? updated.topics.split(',').map((topic) => `\`${topic}\``).join(' ') : 'all'}`,
    `Delivery: **${String(updated.hour).padStart(2, '0')}:00** (${updated.timezone})`,
    `Status: **${updated.active ? 'active' : 'paused'}**`,
    invalid.length ? `\u26A0\uFE0F Ignored unknown topic(s): ${invalid.join(', ')}` : null,
  ].filter(Boolean);

  await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
}

async function listTopics(interaction) {
  const chunks = [];
  for (let index = 0; index < ALL_TOPICS.length; index += 10) {
    chunks.push(ALL_TOPICS.slice(index, index + 10).map((topic) => `\`${topic}\``).join(', '));
  }
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x6366f1)
        .setTitle('Available topics')
        .setDescription(chunks.join('\n')),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function clearButtons(client, assignment) {
  if (!assignment.message_id || !assignment.thread_id) return;
  try {
    const channel = await client.channels.fetch(assignment.thread_id).catch(() => null);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(assignment.message_id).catch(() => null);
    if (message) await message.edit({ components: [] });
  } catch {
    /* message may be deleted - not important */
  }
}

async function announceSolved(interaction, updatedUser, question, { viaCommand = false } = {}) {
  const lines = [
    `\u2705 **Solved!** Streak: **${updatedUser.streak}** day(s) \u00b7 Total: **${updatedUser.total_solved}**`,
    question ? `Editorial / discussion: ${question.link}` : null,
    'Next question arrives at your scheduled time.',
  ].filter(Boolean);

  if (viaCommand) {
    await interaction.editReply({ content: lines.join('\n'), allowedMentions: { parse: [] } });
    if (updatedUser.thread_id) {
      const channel = await interaction.client.channels.fetch(updatedUser.thread_id).catch(() => null);
      if (channel?.isTextBased()) {
        await channel
          .send({
            content: `\u2705 <@${updatedUser.user_id}> solved today's question. Streak: **${updatedUser.streak}**.`,
            allowedMentions: { users: [updatedUser.user_id] },
          })
          .catch(() => {});
      }
    }
    return;
  }

  await interaction.followUp({ content: lines.join('\n'), allowedMentions: { parse: [] } });
}

export async function handleDsaButton(interaction, { store, config }) {
  const [, action, rawId] = interaction.customId.split(':');
  const assignmentId = Number(rawId);
  if (!Number.isFinite(assignmentId)) {
    await interaction.reply({ content: 'Invalid question reference.', flags: MessageFlags.Ephemeral });
    return;
  }

  const assignment = store.getAssignment(assignmentId);
  if (!assignment) {
    await interaction.reply({ content: 'That question no longer exists.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (assignment.user_id !== interaction.user.id) {
    await interaction.reply({ content: 'This is not your question - use `/dsa enroll` to get your own.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (assignment.status !== 'open') {
    await interaction.reply({ content: 'This question is already closed.', flags: MessageFlags.Ephemeral });
    return;
  }

  const user = store.getUser(assignment.user_id);
  const question = getQuestion(assignment.question_id);
  if (!user) {
    await interaction.reply({ content: 'Your profile is missing. Run `/dsa enroll`.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === 'hint') {
    const used = applyHint({ store, assignment });
    if (used > (question?.hints.length ?? 0)) {
      await interaction.reply({
        content: question ? `No hints left. Editorial: ${question.link}` : 'No hints available.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({
      content: `**Hint ${used}/${question.hints.length}** \u2014 ${question.hints[used - 1]}`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (action === 'solve') {
    await interaction.update({ components: [] });
    const updated = applySolved({ store, user, assignment });
    await announceSolved(interaction, updated, question);
    if (config.dsa.sendNextOnSolve) {
      try {
        const result = await sendDaily({
          client: interaction.client,
          store,
          config,
          log: null,
          user: store.getUser(user.user_id),
        });
        if (result?.assignmentId) {
          await interaction.followUp({
            content: 'Since you are on a roll, here is the next one.',
            allowedMentions: { parse: [] },
          });
        }
      } catch (error) {
        /* next question is best-effort */
      }
    }
    return;
  }

  if (action === 'skip') {
    await interaction.update({ components: [] });
    applySkipped({ store, user, assignment });
    await interaction.followUp({
      content: [
        `Skipped **${question ? question.title : assignment.question_id}**.`,
        question ? `Read the editorial: ${question.link}` : null,
        'The coach will ease off on this topic for a bit.',
      ]
        .filter(Boolean)
        .join('\n'),
      allowedMentions: { parse: [] },
    });
    return;
  }

  await interaction.reply({ content: 'Unknown action.', flags: MessageFlags.Ephemeral });
}
