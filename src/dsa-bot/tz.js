const DATE_FORMATTERS = new Map();

function formatterFor(timeZone) {
  if (!DATE_FORMATTERS.has(timeZone)) {
    DATE_FORMATTERS.set(
      timeZone,
      new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
        hourCycle: 'h23',
      }),
    );
  }
  return DATE_FORMATTERS.get(timeZone);
}

export function isValidTimezone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Local calendar date (YYYY-MM-DD), hour and weekday for a timezone. */
export function localParts(date, timeZone = 'UTC') {
  const tz = isValidTimezone(timeZone) ? timeZone : 'UTC';
  const parts = Object.fromEntries(
    formatterFor(tz)
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday,
  };
}

export function localDate(date = new Date(), timeZone = 'UTC') {
  return localParts(date, timeZone).date;
}

export function localHour(date = new Date(), timeZone = 'UTC') {
  return localParts(date, timeZone).hour;
}

/** Pure UTC date arithmetic on YYYY-MM-DD strings. */
export function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function prettyDate(dateString) {
  if (!dateString) return 'never';
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
