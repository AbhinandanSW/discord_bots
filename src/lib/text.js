const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '\u2019',
  lsquo: '\u2018',
  ldquo: '\u201c',
  rdquo: '\u201d',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  bull: '\u2022',
  middot: '\u00b7',
};

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const key = String(entity).toLowerCase();
    if (key.startsWith('#x')) return safeFromCodePoint(parseInt(key.slice(2), 16), match);
    if (key.startsWith('#')) return safeFromCodePoint(parseInt(key.slice(1), 10), match);
    return NAMED_ENTITIES[key] ?? match;
  });
}

function safeFromCodePoint(code, fallback) {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/** HTML -> readable plain text. Job descriptions arrive as either HTML or text. */
export function stripHtml(input = '') {
  if (typeof input !== 'string') return '';
  return decodeEntities(
    input
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\u2022 ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\r/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s+([,.;:!?%)\]])/g, '$1')
    .replace(/([([])\s+/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function truncate(text, max) {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}\u2026`;
}

export function collapse(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function norm(text) {
  return collapse(String(text ?? '')).toLowerCase();
}

export function capitalize(text) {
  const value = String(text ?? '');
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

export function slug(text, fallback = 'untitled') {
  const value = String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return value || fallback;
}
