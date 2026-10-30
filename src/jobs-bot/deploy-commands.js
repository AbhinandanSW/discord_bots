import { config, requireEnv } from '../config.js';
import { deployCommands } from '../lib/discord.js';
import { createLogger } from '../lib/logger.js';
import { jobCommands } from './commands.js';

const log = createLogger('jobs:deploy');

try {
  const token = requireEnv(config.jobs.token, 'JOBS_DISCORD_TOKEN');
  const clientId = requireEnv(config.jobs.clientId, 'JOBS_CLIENT_ID');
  await deployCommands({ token, clientId, guildId: config.guildId, commands: jobCommands, log });
  log.info('done');
} catch (error) {
  log.error(error.message);
  process.exit(1);
}
