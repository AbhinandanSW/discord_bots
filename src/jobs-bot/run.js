import { sleep } from '../lib/discord.js';
import { describeError } from '../lib/logger.js';
import { fetchApifyItems } from '../lib/apify.js';
import { CATEGORY_META, classifyJob } from './classify.js';
import { normalizeItem } from './normalize.js';
import { postJob, resolveChannelId, resolveLogChannelId } from './post.js';

const POST_DELAY_MS = 1200;

function isStale(job, maxAgeDays) {
  if (!job.postedAt || !maxAgeDays) return false;
  const age = Date.now() - new Date(job.postedAt).getTime();
  if (!Number.isFinite(age) || age < 0) return false;
  return age > maxAgeDays * 24 * 60 * 60 * 1000;
}

/**
 * Fetch -> normalise -> classify -> dedupe -> store -> post.
 * Safe to call concurrently: the caller guards with a `running` flag.
 */
export async function runScrape({ client, store, config, log, reason = 'manual', limit = null, dryRun = false }) {
  const apify = config.jobs.apify;
  const startedAt = Date.now();
  const maxPosts = Math.max(1, Math.min(limit ?? config.jobs.maxPostsPerRun, 25));
  const stats = {
    reason,
    fetched: 0,
    inserted: 0,
    posted: 0,
    invalid: 0,
    duplicate: 0,
    stale: 0,
    lowConfidence: 0,
    skippedNoChannel: 0,
    failedPosts: 0,
    byCategory: { frontend: 0, backend: 0, fullstack: 0 },
    dryRun,
  };

  log.info(`fetching from Apify actor ${apify.actorId} (limit ${apify.maxItems})`);
  const { items, tookMs } = await fetchApifyItems({
    token: apify.token,
    actorId: apify.actorId,
    input: apify.input,
    limit: apify.maxItems,
    timeoutSecs: apify.timeoutSecs,
  });
  stats.fetched = items.length;
  log.info(`actor returned ${items.length} items in ${tookMs}ms`);

  for (const item of items) {
    const job = normalizeItem(item, apify.mapping);
    if (!job) {
      stats.invalid += 1;
      continue;
    }
    if (isStale(job, config.jobs.maxAgeDays)) {
      stats.stale += 1;
      continue;
    }

    const classification = classifyJob(job, {
      defaultCategory: config.jobs.defaultCategory,
      minConfidence: config.jobs.minConfidence,
    });

    if (classification.confidence < config.jobs.minConfidence) {
      stats.lowConfidence += 1;
      continue;
    }

    const result = store.addJob({
      ...job,
      category: classification.category,
      confidence: classification.confidence,
      tags: classification.tags.join(', '),
    });

    if (result.inserted) stats.inserted += 1;
    else stats.duplicate += 1;
  }

  const pending = store.nextUnposted(Math.max(maxPosts, Math.min(config.jobs.maxCandidates, maxPosts * 10)));
  if (!pending.length) {
    log.info('nothing new to post');
    finish();
    return stats;
  }

  const channelCache = new Map();
  async function channelFor(category) {
    const id = resolveChannelId(store, category, config);
    if (!id) return null;
    if (channelCache.has(id)) return channelCache.get(id);
    try {
      const channel = await client.channels.fetch(id);
      if (!channel || !channel.isTextBased()) {
        log.warn(`channel ${id} for ${category} is not text based`);
        channelCache.set(id, null);
        return null;
      }
      channelCache.set(id, channel);
      return channel;
    } catch (error) {
      log.error(`cannot fetch channel ${id} for ${category}: ${describeError(error)}`);
      channelCache.set(id, null);
      return null;
    }
  }

  let posted = 0;
  for (const job of pending) {
    if (posted >= maxPosts) break;
    if (dryRun) {
      stats.byCategory[job.category] = (stats.byCategory[job.category] ?? 0) + 1;
      stats.posted += 1;
      posted += 1;
      continue;
    }

    const channel = await channelFor(job.category);
    if (!channel) {
      stats.skippedNoChannel += 1;
      continue;
    }

    try {
      const message = await postJob(channel, job);
      store.markPosted(job.id, { channelId: channel.id, messageId: message.id });
      stats.byCategory[job.category] = (stats.byCategory[job.category] ?? 0) + 1;
      stats.posted += 1;
      posted += 1;
      if (posted < maxPosts) await sleep(POST_DELAY_MS);
    } catch (error) {
      stats.failedPosts += 1;
      log.error(`failed to post job ${job.id} (${job.title}): ${describeError(error)}`);
    }
  }

  finish();
  return stats;

  function finish() {
    stats.tookMs = Date.now() - startedAt;
    store.setSetting('last_run_at', new Date().toISOString());
    store.setSetting('last_run_stats', JSON.stringify(stats));
    log.info(
      `run complete: fetched=${stats.fetched} new=${stats.inserted} posted=${stats.posted} ` +
        `dupes=${stats.duplicate} invalid=${stats.invalid} lowConfidence=${stats.lowConfidence}`,
    );
    void notifyLogChannel(stats);
  }

  async function notifyLogChannel(runStats) {
    const id = resolveLogChannelId(store, config);
    if (!id || dryRun) return;
    try {
      const channel = await client.channels.fetch(id).catch(() => null);
      if (!channel?.isTextBased()) return;
      const parts = Object.entries(runStats.byCategory)
        .filter(([, count]) => count > 0)
        .map(([category, count]) => `${CATEGORY_META[category]?.label ?? category}: ${count}`);
      const line = [
        `**Scrape ${runStats.reason}**`,
        `fetched ${runStats.fetched}`,
        `new ${runStats.inserted}`,
        `posted ${runStats.posted}${parts.length ? ` (${parts.join(', ')})` : ''}`,
        `dupes ${runStats.duplicate}`,
        runStats.failedPosts ? `failed ${runStats.failedPosts}` : null,
        runStats.skippedNoChannel ? `no-channel ${runStats.skippedNoChannel}` : null,
      ]
        .filter(Boolean)
        .join(' \u00b7 ');
      await channel.send({ content: line, allowedMentions: { parse: [] } });
    } catch (error) {
      log.warn(`log channel notification failed: ${describeError(error)}`);
    }
  }
}
