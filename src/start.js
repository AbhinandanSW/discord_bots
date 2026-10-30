/**
 * Container entrypoint. One image, two bots:
 *   BOT=jobs  -> job scraper
 *   BOT=dsa   -> daily DSA coach
 *
 * Hosts run each bot as its own service so a slow Apify run never delays the
 * morning questions, and so each gets its own SQLite file.
 */
const requested = String(process.env.BOT ?? 'jobs').toLowerCase();
const bot = requested === 'dsa' ? 'dsa' : 'jobs';

if (!['jobs', 'dsa'].includes(requested)) {
  console.warn(`[start] Unknown BOT="${requested}", falling back to jobs. Use BOT=jobs or BOT=dsa.`);
}

await import(bot === 'dsa' ? './dsa-bot/index.js' : './jobs-bot/index.js');
