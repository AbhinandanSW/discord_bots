import dotenv from 'dotenv';
import path from 'node:path';
import { DEFAULT_MAP } from './jobs-bot/normalize.js';

const root = path.resolve(import.meta.dirname, '..');
dotenv.config({ path: path.join(root, '.env') });

function env(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function num(name, fallback) {
  const raw = env(name);
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function bool(name, fallback = false) {
  const raw = env(name);
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function csv(name) {
  return (env(name) ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function json(name, fallback) {
  const raw = env(name);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
}

function mapping(key) {
  const override = csv(`APIFY_MAP_${key}`);
  return override.length ? override : DEFAULT_MAP[key.toLowerCase()] ?? [];
}

export const config = {
  root,
  dataDir: path.resolve(root, env('DATA_DIR', 'data')),
  logLevel: env('LOG_LEVEL', 'info'),
  dryRun: bool('DRY_RUN', false),
  guildId: env('GUILD_ID'),

  jobs: {
    token: env('JOBS_DISCORD_TOKEN'),
    clientId: env('JOBS_CLIENT_ID'),
    healthPort: num('JOBS_HEALTH_PORT', 0),
    intervalMinutes: num('SCRAPE_INTERVAL_MINUTES', 180),
    scrapeOnStart: bool('SCRAPE_ON_START', false),
    maxPostsPerRun: num('SCRAPE_MAX_POSTS_PER_RUN', 10),
    maxCandidates: num('JOBS_MAX_CANDIDATES', 300),
    maxAgeDays: num('JOBS_MAX_AGE_DAYS', 14),
    minConfidence: num('JOBS_MIN_CONFIDENCE', 2),
    defaultCategory: env('JOBS_DEFAULT_CATEGORY', 'fullstack'),
    channels: {
      frontend: env('JOBS_CHANNEL_FRONTEND'),
      backend: env('JOBS_CHANNEL_BACKEND'),
      fullstack: env('JOBS_CHANNEL_FULLSTACK'),
    },
    logChannelId: env('JOBS_LOG_CHANNEL_ID'),
    apify: {
      token: env('APIFY_TOKEN'),
      actorId: env('APIFY_ACTOR_ID'),
      input: json('APIFY_INPUT_JSON', {}),
      maxItems: num('APIFY_MAX_ITEMS', 100),
      timeoutSecs: num('APIFY_TIMEOUT_SECS', 280),
      mapping: {
        title: mapping('TITLE'),
        company: mapping('COMPANY'),
        url: mapping('URL'),
        description: mapping('DESCRIPTION'),
        location: mapping('LOCATION'),
        salary: mapping('SALARY'),
        postedAt: mapping('POSTED_AT'),
        emails: mapping('EMAILS'),
        tags: mapping('TAGS'),
        source: mapping('SOURCE'),
        remote: mapping('REMOTE'),
      },
    },
  },

  dsa: {
    token: env('DSA_DISCORD_TOKEN'),
    clientId: env('DSA_CLIENT_ID'),
    healthPort: num('DSA_HEALTH_PORT', 0),
    channelId: env('DSA_CHANNEL_ID'),
    mode: (() => {
    const requested = (env('DSA_MODE', 'thread') || 'thread').toLowerCase();
    return ['thread', 'channel', 'dm'].includes(requested) ? requested : 'thread';
  })(),
    timezone: env('DSA_TIMEZONE', 'Asia/Kolkata'),
    hour: num('DSA_HOUR', 9),
    tickMinutes: Math.max(1, num('DSA_TICK_MINUTES', 5)),
    expireDays: Math.max(1, num('DSA_EXPIRE_DAYS', 2)),
    sendNextOnSolve: bool('DSA_SEND_NEXT_ON_SOLVE', false),
    threadArchiveMinutes: num('DSA_THREAD_ARCHIVE_MINUTES', 1440),
  },
};

export function requireEnv(value, name, hint) {
  if (value) return value;
  throw new Error(`Missing ${name}${hint ? ` - ${hint}` : ''}. Copy .env.example to .env and fill it in.`);
}
