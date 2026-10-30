import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { truncate } from '../lib/text.js';
import { CATEGORY_META } from './classify.js';

const CHANNEL_SETTING_PREFIX = 'channel:';

export function resolveChannelId(store, category, config) {
  const stored = store.getSetting(`${CHANNEL_SETTING_PREFIX}${category}`);
  return stored || config.jobs.channels[category] || null;
}

export function setChannelId(store, category, channelId) {
  store.setSetting(`${CHANNEL_SETTING_PREFIX}${category}`, channelId);
}

export function resolveLogChannelId(store, config) {
  return store.getSetting('channel:log') || config.jobs.logChannelId || null;
}

export function channelSettings(store, config) {
  return {
    frontend: resolveChannelId(store, 'frontend', config),
    backend: resolveChannelId(store, 'backend', config),
    fullstack: resolveChannelId(store, 'fullstack', config),
  };
}

export function buildJobEmbed(job) {
  const meta = CATEGORY_META[job.category] ?? CATEGORY_META.fullstack;
  const emails = Array.isArray(job.emails) ? job.emails : [];
  const tags = String(job.tags ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6);

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setAuthor({ name: `${meta.emoji} ${meta.label}` })
    .setTitle(truncate(job.title, 250))
    .setTimestamp(job.postedAt ? new Date(job.postedAt) : new Date())
    .setFooter({ text: [job.source, job.remote ? 'Remote' : null].filter(Boolean).join(' \u00b7 ') || 'Job board' });

  if (job.url) embed.setURL(job.url);

  const description = truncate(String(job.description ?? '').replace(/\s+/g, ' '), 320);
  if (description && description.length > 60) embed.setDescription(description);

  const details = [];
  if (job.company) details.push(`**Company:** ${truncate(job.company, 100)}`);
  if (job.location) details.push(`**Location:** ${truncate(job.location, 100)}`);
  if (job.salary) details.push(`**Compensation:** ${truncate(job.salary, 80)}`);
  if (details.length) embed.addFields({ name: 'Details', value: details.join('\n').slice(0, 1024) });

  if (tags.length) {
    embed.addFields({ name: 'Stack', value: tags.map((tag) => `\`${tag}\``).join(' ').slice(0, 1024) });
  }

  if (emails.length) {
    embed.addFields({
      name: 'HR / recruiter email',
      value: emails.map((email) => `\`${email}\``).join('\n').slice(0, 1024),
    });
  }

  return embed;
}

export function buildJobButtons(job) {
  const row = new ActionRowBuilder();
  if (job.url) {
    row.addComponents(
      new ButtonBuilder().setLabel('Apply now').setStyle(ButtonStyle.Link).setURL(job.url),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`job:dismiss:${job.id}`)
      .setLabel('Not relevant')
      .setEmoji('\u{1F5D1}\uFE0F')
      .setStyle(ButtonStyle.Secondary),
  );
  return row;
}

export async function postJob(channel, job) {
  return channel.send({
    embeds: [buildJobEmbed(job)],
    components: [buildJobButtons(job)],
    allowedMentions: { parse: [] },
  });
}
