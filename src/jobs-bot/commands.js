import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { truncate } from '../lib/text.js';
import { CATEGORIES, CATEGORY_META } from './classify.js';
import { channelSettings, setChannelId } from './post.js';

export const jobCommands = [
  new SlashCommandBuilder()
    .setName('scrape')
    .setDescription('Run the job scrape now (does not wait for the schedule)')
    .addIntegerOption((option) =>
      option.setName('limit').setDescription('Max jobs to post this run (1-25)').setMinValue(1).setMaxValue(25),
    )
    .addBooleanOption((option) => option.setName('dry').setDescription('Only fetch and classify, never post'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('jobs')
    .setDescription('Browse everything the scraper has collected')
    .addSubcommand((sub) =>
      sub
        .setName('search')
        .setDescription('Search stored jobs')
        .addStringOption((option) => option.setName('query').setDescription('Title, company, tag or keyword').setRequired(true))
        .addStringOption((option) =>
          option
            .setName('category')
            .setDescription('Filter by category')
            .addChoices(...CATEGORIES.map((category) => ({ name: CATEGORY_META[category].label, value: category }))),
        )
        .addIntegerOption((option) =>
          option.setName('limit').setDescription('Results to show (default 8)').setMinValue(1).setMaxValue(15),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('emails')
        .setDescription('List HR / recruiter emails found in job posts')
        .addStringOption((option) => option.setName('query').setDescription('Filter by company or role'))
        .addIntegerOption((option) =>
          option.setName('limit').setDescription('Max emails (default 30)').setMinValue(1).setMaxValue(100),
        ),
    )
    .addSubcommand((sub) => sub.setName('stats').setDescription('Scraper health and totals')),

  new SlashCommandBuilder()
    .setName('jobs-setup')
    .setDescription('Choose the output channels for each category')
    .addChannelOption((option) =>
      option
        .setName('frontend')
        .setDescription('Channel for frontend roles')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addChannelOption((option) =>
      option
        .setName('backend')
        .setDescription('Channel for backend roles')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addChannelOption((option) =>
      option
        .setName('fullstack')
        .setDescription('Channel for full stack roles')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addChannelOption((option) =>
      option
        .setName('log')
        .setDescription('Channel for per-run summaries')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('jobs-pause')
    .setDescription('Pause scheduled scraping')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('jobs-resume')
    .setDescription('Resume scheduled scraping')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
];

export async function handleJobCommand(interaction, ctx) {
  const { commandName } = interaction;

  if (commandName === 'scrape') return handleScrape(interaction, ctx);
  if (commandName === 'jobs') return handleJobs(interaction, ctx);
  if (commandName === 'jobs-setup') return handleSetup(interaction, ctx);
  if (commandName === 'jobs-pause') return handlePause(interaction, ctx, true);
  if (commandName === 'jobs-resume') return handlePause(interaction, ctx, false);
}

async function handleScrape(interaction, { scrape, config }) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const limit = interaction.options.getInteger('limit') ?? config.jobs.maxPostsPerRun;
  const dryRun = interaction.options.getBoolean('dry') ?? false;

  const stats = await scrape({ reason: 'manual', limit, dryRun });
  if (!stats) {
    await interaction.editReply('A scrape is already running. Try again when it finishes.');
    return;
  }
  if (stats.error) {
    await interaction.editReply(`Scrape failed: ${stats.error}`);
    return;
  }

  const byCategory = Object.entries(stats.byCategory)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => `${CATEGORY_META[category]?.label ?? category}: ${count}`)
    .join(', ');

  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle(dryRun ? 'Dry run complete' : 'Scrape complete')
    .addFields(
      { name: 'Fetched', value: String(stats.fetched), inline: true },
      { name: 'New jobs', value: String(stats.inserted), inline: true },
      { name: 'Posted', value: String(stats.posted), inline: true },
      { name: 'Duplicates', value: String(stats.duplicate), inline: true },
      { name: 'Skipped', value: String(stats.invalid + stats.stale + stats.lowConfidence), inline: true },
      { name: 'Took', value: `${stats.tookMs}ms`, inline: true },
    );

  if (byCategory) embed.addFields({ name: 'By category', value: byCategory });
  if (stats.skippedNoChannel) {
    embed.addFields({
      name: 'No channel configured',
      value: `${stats.skippedNoChannel} job(s) waiting - run /jobs-setup`,
    });
  }
  if (stats.failedPosts) {
    embed.addFields({ name: 'Failed posts', value: String(stats.failedPosts) });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleJobs(interaction, ctx) {
  const { store, config } = ctx;
  const sub = interaction.options.getSubcommand();

  if (sub === 'search') {
    const query = interaction.options.getString('query', true);
    const category = interaction.options.getString('category');
    const limit = interaction.options.getInteger('limit') ?? 8;
    const rows = store.search({ query, category, limit });

    if (!rows.length) {
      await interaction.reply({ content: `No stored jobs match \`${query}\`.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const lines = rows.map((row) => {
      const meta = CATEGORY_META[row.category] ?? CATEGORY_META.fullstack;
      const title = row.url ? `[${truncate(row.title, 90)}](${row.url})` : `**${truncate(row.title, 90)}**`;
      let emailCount = 0;
      try {
        const parsed = JSON.parse(row.emails || '[]');
        emailCount = Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        emailCount = 0;
      }
      const extras = [row.company, row.location, emailCount ? `${emailCount} email(s)` : null]
        .filter(Boolean)
        .join(' \u00b7 ');
      return `${meta.emoji} ${title}${extras ? `\n\u2003${extras}` : ''}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle(`Jobs matching "${truncate(query, 80)}"`)
      .setDescription(lines.join('\n\n').slice(0, 4000))
      .setFooter({ text: `${rows.length} result(s) from local database` });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'emails') {
    const query = interaction.options.getString('query') ?? '';
    const limit = interaction.options.getInteger('limit') ?? 30;
    const rows = store.emails({ query, limit });

    if (!rows.length) {
      await interaction.reply({
        content: 'No HR emails stored yet. Emails are extracted from job descriptions automatically.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const lines = rows.map(
      (row) => `${row.email}  |  ${truncate(row.company, 30)}  |  ${truncate(row.title, 45)}`,
    );
    const body = truncate(lines.join('\n'), 1850);

    await interaction.reply({
      content: `**HR / recruiter emails** (${rows.length})\n\`\`\`\n${body}\n\`\`\``,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // stats
  const stats = store.stats();
  const settings = channelSettings(store, config);
  const lastRunAt = store.getSetting('last_run_at');
  const lastRun = store.getJsonSetting('last_run_stats', null);
  const paused = store.getSetting('paused') === '1';

  const channelLine = CATEGORIES.map((category) => {
    const id = settings[category];
    return `${CATEGORY_META[category].emoji} ${CATEGORY_META[category].label}: ${id ? `<#${id}>` : 'not set'}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(paused ? 0xf59e0b : 0x22c55e)
    .setTitle('Job scraper status')
    .addFields(
      { name: 'State', value: paused ? 'Paused (`/jobs-resume`)' : `Running every ${config.jobs.intervalMinutes} min`, inline: true },
      { name: 'Stored', value: `${stats.total} jobs`, inline: true },
      { name: 'Posted', value: `${stats.posted} (${stats.pending} pending)`, inline: true },
      { name: 'Channels', value: channelLine },
      {
        name: 'Last run',
        value: lastRunAt
          ? `${new Date(lastRunAt).toISOString().replace('T', ' ').slice(0, 16)} UTC${
              lastRun ? ` \u00b7 fetched ${lastRun.fetched}, new ${lastRun.inserted}, posted ${lastRun.posted}` : ''
            }`
          : 'never',
      },
      {
        name: 'By category',
        value:
          Object.entries(stats.byCategory)
            .map(([category, count]) => `${category}: ${count}`)
            .join(' \u00b7 ') || 'none',
      },
      { name: 'HR emails found', value: `${stats.emailsCount} job(s) contain an email` },
    )
    .setFooter({ text: 'Emails are best-effort regex matches from descriptions - verify before sending.' });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleSetup(interaction, { store, config }) {
  const updates = [];
  for (const category of CATEGORIES) {
    const channel = interaction.options.getChannel(category);
    if (channel) {
      setChannelId(store, category, channel.id);
      updates.push(`${CATEGORY_META[category].label} \u2192 <#${channel.id}>`);
    }
  }
  const logChannel = interaction.options.getChannel('log');
  if (logChannel) {
    store.setSetting('channel:log', logChannel.id);
    updates.push(`Logs \u2192 <#${logChannel.id}>`);
  }

  const settings = channelSettings(store, config);
  const logId = store.getSetting('channel:log') ?? config.jobs.logChannelId;
  const summary = CATEGORIES.map(
    (category) => `${CATEGORY_META[category].emoji} ${CATEGORY_META[category].label}: ${settings[category] ? `<#${settings[category]}>` : 'not set'}`,
  ).join('\n');

  const embed = new EmbedBuilder()
    .setColor(updates.length ? 0x22c55e : 0x6366f1)
    .setTitle(updates.length ? 'Channels updated' : 'Current channels')
    .setDescription(summary)
    .addFields({ name: 'Log channel', value: logId ? `<#${logId}>` : 'not set' });

  if (updates.length) embed.setFooter({ text: updates.join(' | ') });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handlePause(interaction, { store }, paused) {
  store.setSetting('paused', paused ? '1' : '0');
  await interaction.reply({
    content: paused
      ? 'Scheduled scraping paused. Manual `/scrape` still works.'
      : 'Scheduled scraping resumed.',
    flags: MessageFlags.Ephemeral,
  });
}
