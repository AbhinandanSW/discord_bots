import crypto from 'node:crypto';
import { collapse, norm, stripHtml, truncate } from '../lib/text.js';
import { extractEmails } from './emails.js';

/**
 * Candidate paths for each field in an Apify dataset item.
 * Override any of these with APIFY_MAP_<FIELD> in .env.
 */
export const DEFAULT_MAP = {
  title: ['title', 'position', 'jobTitle', 'job_title', 'role', 'name'],
  company: ['company', 'companyName', 'company_name', 'employer', 'organization', 'hiringOrganization', 'org'],
  url: ['url', 'jobUrl', 'job_url', 'applyUrl', 'apply_url', 'jobLink', 'externalUrl', 'link'],
  description: ['description', 'descriptionText', 'description_text', 'descriptionHtml', 'jobDescription', 'job_description', 'summary', 'details', 'content'],
  location: ['location', 'candidateRequiredLocation', 'city', 'place', 'jobLocation', 'locations'],
  salary: ['salary', 'salaryRange', 'salary_range', 'compensation', 'pay', 'salaryText'],
  postedAt: ['postedAt', 'date', 'createdAt', 'publishedAt', 'postedDate', 'posted_at', 'published_at'],
  emails: ['emails', 'emailsList', 'contactEmails', 'hrEmails', 'recruiterEmails', 'email'],
  tags: ['tags', 'skills', 'technologies', 'requirements', 'keywords'],
  source: ['source', 'board', 'site', 'provider'],
  remote: ['remote', 'isRemote', 'workplaceType', 'remoteType'],
};

const TRACKING_PARAMS = /^(utm_|ref$|ref_|source$|gh_src|trk|tracking|fbclid|gclid|mc_cid|mc_eid|igshid)/i;

function getPath(object, path) {
  let current = object;
  for (const key of String(path).split('.')) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(key);
      current = Number.isInteger(index) ? current[index] : current.map((entry) => entry?.[key]).find((entry) => entry !== undefined);
    } else {
      current = current[key];
    }
  }
  return current;
}

function isBlank(value) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

/** First non-empty value among the candidate paths. */
export function pick(item, paths = []) {
  for (const path of paths) {
    const value = getPath(item, path);
    if (!isBlank(value)) return value;
  }
  return undefined;
}

function flattenValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string' || typeof entry === 'number') return String(entry);
        if (entry && typeof entry === 'object') {
          return entry.name ?? entry.title ?? entry.label ?? entry.value ?? entry.text ?? '';
        }
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') {
    return Object.values(value).map(flattenValue).filter(Boolean).join(' ');
  }
  return String(value);
}

/**
 * Object fields often carry metadata next to the useful text
 * (`{ name: 'Acme', logo: '...', url: '...' }`). Prefer the human field.
 */
function primaryValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of ['name', 'title', 'label', 'value', 'text', 'displayName', 'jobTitle']) {
      const candidate = value[key];
      if (candidate !== undefined && candidate !== null && candidate !== '' && typeof candidate !== 'object') {
        return candidate;
      }
    }
  }
  return value;
}

function money(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return collapse(value);
  if (typeof value === 'object') {
    const currency = value.currency ?? value.currencyCode ?? '';
    const min = value.min ?? value.minimum ?? value.from;
    const max = value.max ?? value.maximum ?? value.to;
    const period = value.period ?? value.unit ?? '';
    const range = [min, max].filter((part) => part !== undefined && part !== null).join('-');
    const text = [currency, range, period].filter(Boolean).join(' ');
    return text || flattenValue(value);
  }
  return '';
}

function toIsoDate(value) {
  if (value === undefined || value === null || value === '') return null;
  let date;
  if (typeof value === 'number') {
    date = new Date(value > 1e12 ? value : value * 1000);
  } else if (/^\d{10,13}$/.test(String(value).trim())) {
    const numeric = Number(value);
    date = new Date(numeric > 1e12 ? numeric : numeric * 1000);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return date.toISOString();
}

export function normalizeUrl(raw) {
  if (!raw) return null;
  let value = String(raw).trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    if (/^[\w-]+(\.[\w-]+)+/.test(value)) value = `https://${value}`;
    else return null;
  }
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.protocol = 'https:';
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    let pathname = url.pathname.replace(/\/+$/, '');
    const search = url.searchParams.toString();
    return `${url.protocol}//${url.host}${pathname}${search ? `?${search}` : ''}`;
  } catch {
    return null;
  }
}

export function fingerprintOf({ url, title, company }) {
  if (url) return crypto.createHash('sha1').update(`url:${url}`).digest('hex');
  return crypto.createHash('sha1').update(`tc:${norm(title)}|${norm(company)}`).digest('hex');
}

function detectRemote(value, location, description) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = norm(`${flattenValue(value)} ${location} ${truncate(description, 400)}`);
  if (!text) return 0;
  if (/\b(fully remote|remote[- ]first|work from home|wfh|100% remote|remote)\b/.test(text)) return 1;
  if (/\b(hybrid|on[- ]site|onsite|in[- ]office)\b/.test(text) && !/\bremote\b/.test(text)) return 0;
  return 0;
}

/**
 * Turns one raw Apify dataset item into the job shape the rest of the bot uses.
 * Returns null when the item has no usable title or no way to apply/read it.
 */
export function normalizeItem(item, mapping = DEFAULT_MAP) {
  if (!item || typeof item !== 'object') return null;

  const title = collapse(flattenValue(primaryValue(pick(item, mapping.title))));
  const rawDescription = flattenValue(primaryValue(pick(item, mapping.description)));
  const description = truncate(stripHtml(rawDescription), 20000);

  const company =
    collapse(flattenValue(primaryValue(pick(item, mapping.company)))) || 'Unknown company';
  const location = collapse(flattenValue(primaryValue(pick(item, mapping.location)))) || '';
  const salary = collapse(money(primaryValue(pick(item, mapping.salary))));
  const source = collapse(flattenValue(primaryValue(pick(item, mapping.source)))) || 'Apify';
  const tags = flattenValue(primaryValue(pick(item, mapping.tags)));

  const url = normalizeUrl(flattenValue(primaryValue(pick(item, mapping.url))));

  if (!title || title.length < 3) return null;
  if (!url && description.length < 40) return null;

  const emailCandidates = [
    flattenValue(primaryValue(pick(item, mapping.emails))),
    description,
    `${title} ${company}`,
  ];
  const emails = extractEmails(emailCandidates.join(' \n '), { max: 5 });

  return {
    title: truncate(title, 250),
    company: truncate(company, 120),
    url,
    description,
    location: truncate(location, 120),
    salary: truncate(salary, 80),
    remote: detectRemote(pick(item, mapping.remote), location, description),
    source: truncate(source, 60),
    tags,
    emails,
    postedAt: toIsoDate(pick(item, mapping.postedAt)),
    fingerprint: fingerprintOf({ url, title, company }),
    titleKey: norm(title).slice(0, 140),
    companyKey: norm(company).slice(0, 100),
  };
}
