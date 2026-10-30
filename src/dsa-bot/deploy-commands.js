import { config, requireEnv } from '../config.js';
import { deployCommands } from '../lib/discord.js';
import { createLogger } from '../lib/logger.js';
import { dsaCommands } from './commands.js';

const log = createLogger('dsa:deploy');

try {
  const token = requireEnv(config.dsa.token, 'DSA_DISCORD_TOKEN');
  const clientId = requireEnv(config.dsa.clientId, 'DSA_CLIENT_ID');
  await deployCommands({ token, clientId, guildId: config.guildId, commands: dsaCommands, log });
  log.info('done');
} catch (error) {
  log.error(error.message);
  process.exit(1);
}
