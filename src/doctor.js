import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const JOBS_PERMISSIONS = '93184';
const DSA_PERMISSIONS = '326417599488';
const results = [];
let failures = 0;

function pass(message) {
  results.push(`  \u2714 ${message}`);
}

function warn(message) {
  results.push(`  \u26A0 ${message}`);
}

function fail(message) {
  failures += 1;
  results.push(`  \u2716 ${message}`);
}

function isSnowflake(value) {
  return typeof value === 'string' && /^\d{17,20}$/.test(value);
}

async function checkDiscord(label, token, clientId) {
  if (!token) {
    fail(`${label}: token missing`);
    return;
  }
  if (!clientId) warn(`${label}: CLIENT_ID missing (needed to deploy commands)`);
  else if (!isSnowflake(clientId)) warn(`${label}: CLIENT_ID does not look like a snowflake`);

  try {
    const response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      fail(`${label}: token rejected by Discord (HTTP ${response.status})`);
      return;
    }
    const me = await response.json();
    pass(`${label}: logged in as ${me.username}#${me.discriminator ?? '0'}`);
  } catch (error) {
    warn(`${label}: could not verify token (${error.message})`);
  }
}

async function checkActor() {
  const { token, actorId } = config.jobs.apify;
  if (!token || !actorId) {
    warn('Apify: APIFY_TOKEN or APIFY_ACTOR_ID missing - scraping will fail');
    return;
  }

  const actor = String(actorId).trim().replace('/', '~').replace(/^acts\//, '');
  try {
    const response = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(actor)}?token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      fail(`Apify: actor "${actor}" not found or token invalid (HTTP ${response.status})`);
      return;
    }
    const payload = await response.json();
    const data = payload?.data ?? {};
    pass(`Apify: actor "${data.username ? `${data.username}/${data.name}` : actor}" is reachable`);
  } catch (error) {
    warn(`Apify: could not verify actor (${error.message})`);
  }
}

function checkDataDir() {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    const probe = path.join(config.dataDir, '.write-test');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    pass(`data dir writable: ${config.dataDir}`);
  } catch (error) {
    fail(`data dir not writable (${config.dataDir}): ${error.message}`);
  }
}

function checkJobsChannels() {
  const channels = config.jobs.channels;
  const configured = Object.entries(channels).filter(([, id]) => id);
  if (!configured.length) {
    warn('Jobs: no JOBS_CHANNEL_* set - you can still configure them with /jobs-setup');
  }
  for (const [category, id] of configured) {
    if (isSnowflake(id)) pass(`Jobs: ${category} channel ${id}`);
    else fail(`Jobs: ${category} channel "${id}" is not a valid channel ID`);
  }
  if (config.jobs.logChannelId && !isSnowflake(config.jobs.logChannelId)) {
    fail('Jobs: JOBS_LOG_CHANNEL_ID is not a valid channel ID');
  }
}

function checkDsaChannel() {
  if (config.dsa.mode === 'dm') {
    pass('DSA: dm mode (no channel required)');
    return;
  }
  if (!config.dsa.channelId) fail('DSA: DSA_CHANNEL_ID missing');
  else if (!isSnowflake(config.dsa.channelId)) fail('DSA: DSA_CHANNEL_ID is not a valid channel ID');
  else pass(`DSA: channel ${config.dsa.channelId} (mode: ${config.dsa.mode})`);
}

function inviteUrl(clientId, permissions) {
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${permissions}`;
}

const [major, minor] = process.versions.node.split('.').map(Number);
if (major > 22 || (major === 22 && minor >= 5)) pass(`Node ${process.versions.node}`);
else fail(`Node ${process.versions.node} is too old - need 22.5+`);

if (config.guildId) {
  if (isSnowflake(config.guildId)) pass(`GUILD_ID ${config.guildId} (instant command registration)`);
  else fail('GUILD_ID is not a valid server ID');
} else {
  warn('GUILD_ID not set - commands deploy globally and can take up to an hour to appear');
}

if (fs.existsSync(path.join(config.root, '.env'))) pass('.env found');
else warn('.env not found - copy .env.example to .env');

checkDataDir();
checkJobsChannels();
checkDsaChannel();

await checkDiscord('Jobs bot', config.jobs.token, config.jobs.clientId);
await checkDiscord('DSA bot', config.dsa.token, config.dsa.clientId);
await checkActor();

console.log('\nEnvironment check\n' + results.join('\n'));

if (config.jobs.clientId || config.dsa.clientId) {
  console.log('\nInvite URLs');
  if (config.jobs.clientId) console.log(`  Jobs: ${inviteUrl(config.jobs.clientId, JOBS_PERMISSIONS)}`);
  if (config.dsa.clientId) console.log(`  DSA : ${inviteUrl(config.dsa.clientId, DSA_PERMISSIONS)}`);
}

console.log(
  failures
    ? `\n${failures} blocking problem(s). Fix the rows marked \u2716 above.`
    : '\nNo blocking problems found. Next: npm run deploy && npm run jobs',
);
process.exit(failures ? 1 : 0);
