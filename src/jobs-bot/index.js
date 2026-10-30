import path from 'node:path';
import { Events, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { config, requireEnv } from '../config.js';
import { createDiscordClient, deployCommands } from '../lib/discord.js';
import { startHealthServer } from '../lib/http.js';
import { createLogger, describeError } from '../lib/logger.js';
import { jobCommands, handleJobCommand } from './commands.js';
import { runScrape } from './run.js';
import { createJobsStore } from './store.js';

const log = createLogger('jobs');
const token = loadToken();
const store = createJobsStore(path.join(config.dataDir, 'jobs.db'));
const client = createDiscordClient('jobs');

function loadToken() {
  try {
    return requireEnv(config.jobs.token, 'JOBS_DISCORD_TOKEN', 'create an app at discord.com/developers/applications');
  } catch (error) {
    console.error(`\n[jobs] ${error.message}\n`);
    process.exit(1);
  }
}

let running = false;
let timer = null;
let health = null;

async function scrape(options = {}) {
  if (running) {
    log.warn('scrape already in progress - ignoring request');
    return null;
  }
  if (store.getSetting('paused') === '1' && options.reason === 'schedule') {
    log.info('scheduler paused, skipping');
    return null;
  }

  running = true;
  try {
    return await runScrape({ client, store, config, log, ...options });
  } catch (error) {
    log.error('scrape failed:', describeError(error));
    return { error: describeError(error) };
  } finally {
    running = false;
  }
}

function schedule() {
  if (timer) clearInterval(timer);
  const minutes = config.jobs.intervalMinutes;
  if (!(minutes > 0)) {
    log.info('scheduler disabled (SCRAPE_INTERVAL_MINUTES=0)');
    return;
  }
  timer = setInterval(() => {
    if (!client.isReady()) return;
    void scrape({ reason: 'schedule' });
  }, minutes * 60_000);
  timer.unref?.();
  log.info(`scheduler every ${minutes} min`);
}

client.once(Events.ClientReady, async (readyClient) => {
  log.info(`logged in as ${readyClient.user.tag} (${readyClient.guilds.cache.size} guild(s))`);
  health = startHealthServer(config.jobs.healthPort, 'jobs-bot');

  if (config.jobs.token && config.jobs.clientId) {
    try {
      await deployCommands({
        token: config.jobs.token,
        clientId: config.jobs.clientId,
        guildId: config.guildId,
        commands: jobCommands,
        log,
      });
    } catch (error) {
      log.error('command deployment failed:', describeError(error));
    }
  }

  if (!config.jobs.channels.frontend && !config.jobs.channels.backend && !config.jobs.channels.fullstack) {
    log.warn('no channels configured - run /jobs-setup in Discord or set JOBS_CHANNEL_* in .env');
  }

  if (config.guildId && !readyClient.guilds.cache.has(config.guildId)) {
    log.warn(`bot is not in server ${config.guildId} - run "npm run doctor" for the invite URL`);
  }

  schedule();

  if (config.jobs.scrapeOnStart) {
    log.info('running startup scrape in 10s');
    setTimeout(() => void scrape({ reason: 'startup' }), 10_000);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (!jobCommands.some((command) => command.name === interaction.commandName)) return;
      await handleJobCommand(interaction, { client, store, config, log, scrape });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('job:dismiss:')) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
        await interaction.reply({
          content: 'Only moderators can remove a posted job.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const id = Number(interaction.customId.split(':')[2]);
      const job = Number.isFinite(id) ? store.getJob(id) : null;
      if (!job) {
        await interaction.reply({ content: 'That job is no longer stored.', flags: MessageFlags.Ephemeral });
        return;
      }
      store.dismiss(id);
      await interaction.reply({ content: `Removed "${job.title}".`, flags: MessageFlags.Ephemeral });
      await interaction.message.delete().catch(() => {});
    }
  } catch (error) {
    log.error('interaction handler failed:', describeError(error));
    await safeErrorReply(interaction, error);
  }
});

async function safeErrorReply(interaction, error) {
  if (!interaction.isRepliable()) return;
  const payload = {
    content: `Something went wrong: ${describeError(error).slice(0, 300)}`,
    flags: MessageFlags.Ephemeral,
  };
  try {
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch {
    /* interaction already expired */
  }
}

async function shutdown(signal) {
  log.info(`received ${signal}, shutting down`);
  if (timer) clearInterval(timer);
  try {
    health?.close();
    store.close();
  } catch {
    /* ignore */
  }
  try {
    await client.destroy();
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => log.error('unhandled rejection:', describeError(reason)));

client.login(token).catch((error) => {
  log.error('login failed:', describeError(error));
  process.exit(1);
});
