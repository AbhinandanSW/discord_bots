import path from 'node:path';
import { Events, MessageFlags } from 'discord.js';
import { config, requireEnv } from '../config.js';
import { createDiscordClient, deployCommands, sleep } from '../lib/discord.js';
import { startHealthServer } from '../lib/http.js';
import { createLogger, describeError } from '../lib/logger.js';
import { ALL_TOPICS } from './bank.js';
import { dsaCommands, handleDsaButton, handleDsaCommand } from './commands.js';
import { sendDaily } from './service.js';
import { createDsaStore } from './store.js';
import { localDate, localHour } from './tz.js';

const log = createLogger('dsa');
const token = loadToken();
const store = createDsaStore(path.join(config.dataDir, 'dsa.db'));
const client = createDiscordClient('dsa');

function loadToken() {
  try {
    return requireEnv(config.dsa.token, 'DSA_DISCORD_TOKEN', 'create an app at discord.com/developers/applications');
  } catch (error) {
    console.error(`\n[dsa] ${error.message}\n`);
    process.exit(1);
  }
}

const mode = config.dsa.mode;

let timer = null;
let health = null;
let ticking = false;

async function tick() {
  if (ticking || !client.isReady()) return;
  ticking = true;
  const started = Date.now();
  let delivered = 0;

  try {
    const users = store.listUsers({ activeOnly: true });
    for (const user of users) {
      try {
        const now = new Date();
        const today = localDate(now, user.timezone);
        if (user.last_sent_on === today) continue;
        if (localHour(now, user.timezone) < user.hour) continue;

        const result = await sendDaily({ client, store, config, log, user });
        if (result?.assignmentId) {
          delivered += 1;
          log.info(`sent "${result.question.title}" to ${user.username || user.user_id}`);
          await sleep(1500);
        }
      } catch (error) {
        log.error(`delivery failed for ${user.user_id}: ${describeError(error)}`);
      }
    }

    if (delivered) log.info(`tick delivered ${delivered} question(s) in ${Date.now() - started}ms`);
  } finally {
    ticking = false;
  }
}

function startScheduler() {
  const minutes = config.dsa.tickMinutes;
  timer = setInterval(() => void tick(), minutes * 60_000);
  timer.unref?.();
  log.info(`scheduler ticking every ${minutes} min`);
  setTimeout(() => void tick(), 5_000);
}

client.once(Events.ClientReady, async (readyClient) => {
  log.info(`logged in as ${readyClient.user.tag} (${readyClient.guilds.cache.size} guild(s))`);
  health = startHealthServer(config.dsa.healthPort, 'dsa-bot');

  if (!config.dsa.channelId && mode !== 'dm') {
    log.warn('DSA_CHANNEL_ID is not set - enrollments will fail until you set it');
  }

  if (config.guildId && !readyClient.guilds.cache.has(config.guildId)) {
    log.warn(`bot is not in server ${config.guildId} - run "npm run doctor" for the invite URL`);
  }

  try {
    await deployCommands({
      token: config.dsa.token,
      clientId: config.dsa.clientId,
      guildId: config.guildId,
      commands: dsaCommands,
      log,
    });
  } catch (error) {
    log.error('command deployment failed:', describeError(error));
  }

  startScheduler();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      if (interaction.commandName !== 'dsa') return;
      await handleAutocomplete(interaction);
      return;
    }

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== 'dsa') return;
      await handleDsaCommand(interaction, { client, store, config, log });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('dsa:')) {
      await handleDsaButton(interaction, { store, config, log });
    }
  } catch (error) {
    log.error('interaction handler failed:', describeError(error));
    await safeErrorReply(interaction, error);
  }
});

async function handleAutocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'topics') {
    await interaction.respond([]);
    return;
  }

  const raw = String(focused.value ?? '');
  const parts = raw.split(',');
  const current = (parts.pop() ?? '').trim().toLowerCase();
  const prefix = parts.map((part) => part.trim()).filter(Boolean);

  const matches = ALL_TOPICS.filter((topic) => topic.includes(current)).slice(0, 25);
  await interaction.respond(
    matches.map((topic) => ({
      name: [...prefix, topic].join(',').slice(0, 100),
      value: [...prefix, topic].join(',').slice(0, 100),
    })),
  );
}

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
    /* interaction expired */
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
