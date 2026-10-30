const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;

// Local parts that are almost never a human recruiter.
const BLOCKED_LOCAL = new Set([
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'notifications',
  'notification',
  'support',
  'help',
  'helpdesk',
  'privacy',
  'legal',
  'abuse',
  'security',
  'postmaster',
  'webmaster',
  'admin',
  'administrator',
  'billing',
  'accounts',
  'accounting',
  'unsubscribe',
  'newsletter',
  'marketing',
  'events',
  'sales',
  'info',
  'contact',
  'hello',
  'team',
  'press',
  'media',
  'feedback',
  'compliance',
  'dpo',
  'devops',
  'engineering',
]);

// Local parts that strongly suggest a recruiter/HR inbox.
const BOOSTED_LOCAL = [
  'hr',
  'hiring',
  'recruit',
  'recruiter',
  'recruitment',
  'talent',
  'career',
  'careers',
  'jobs',
  'job',
  'people',
  'personnel',
  'apply',
  'resume',
  'cv',
  'staffing',
];

const BLOCKED_DOMAINS = [
  'example.com',
  'example.org',
  'domain.com',
  'yourdomain.com',
  'email.com',
  'sentry.io',
  'sentry-next.wixpress.com',
  'wixpress.com',
  'godaddy.com',
  'w3.org',
  'schema.org',
  'sentry.wixpress.com',
  'u.com',
  'test.com',
];

const FILE_EXTENSION_RE = /\.(png|jpe?g|gif|webp|svg|css|js|json|html?|woff2?|ttf|ico)$/i;

function domainOf(email) {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

/**
 * Pulls human-looking HR/recruiter emails out of a job description.
 * Returns unique, lower-cased addresses, best candidates first.
 */
export function extractEmails(input, { max = 5 } = {}) {
  const text = Array.isArray(input) ? input.join(' ') : String(input ?? '');
  if (!text) return [];

  const scored = new Map();
  for (const raw of text.match(EMAIL_RE) ?? []) {
    const email = raw.toLowerCase().replace(/^[._-]+|[._-]+$/g, '');
    if (email.length > 120) continue;

    const [local] = email.split('@');
    if (!local) continue;
    if (BLOCKED_DOMAINS.some((domain) => domainOf(email) === domain || domainOf(email).endsWith(`.${domain}`))) continue;
    if (FILE_EXTENSION_RE.test(email)) continue;
    if (BLOCKED_LOCAL.has(local)) continue;
    if (/^[0-9a-f]{16,}$/.test(local)) continue; // hashes / tracking ids

    let score = 1;
    if (BOOSTED_LOCAL.some((part) => local === part || local.startsWith(`${part}.`) || local.startsWith(`${part}-`) || local.startsWith(`${part}_`) || local.endsWith(`.${part}`))) {
      score += 5;
    }
    if (local.includes('+')) score -= 1; // tagged aliases are usually automated

    scored.set(email, Math.max(scored.get(email) ?? 0, score));
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([email]) => email);
}

export const _internals = { EMAIL_RE, BLOCKED_LOCAL, BOOSTED_LOCAL };
