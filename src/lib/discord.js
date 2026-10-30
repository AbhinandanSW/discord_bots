import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { createLogger } from './logger.js';

export function createDiscordClient(name) {
  const log = createLogger(name);
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.on('error', (error) => log.error('gateway error:', error.message));
  client.on('warn', (message) => log.warn(message));
  client.rest.on('rateLimited', (info) =>
    log.warn(`rate limited on ${info.route} for ${info.timeToReset}ms`),
  );

  return client;
}

/**
 * Registers slash commands. Guild-scoped deploys are instant (GUILD_ID);
 * global deploys can take up to an hour to show up.
 */
export async function deployCommands({ token, clientId, guildId, commands, log }) {
  if (!token) throw new Error('Missing bot token for command deployment');
  if (!clientId) throw new Error('Missing CLIENT_ID for command deployment');

  const rest = new REST({ version: '10' }).setToken(token);
  const body = commands.map((command) => command.toJSON());
  const label = guildId ? `guild ${guildId}` : 'globally';

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
  }

  log?.info(`registered ${body.length} commands ${label}`);
  return body.length;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
