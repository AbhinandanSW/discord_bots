const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold() {
  return LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;
}

/**
 * Tiny dependency-free logger. `createLogger('jobs').child('scrape')` works.
 */
export function createLogger(scope) {
  const emit = (level, args) => {
    if (LEVELS[level] < threshold()) return;
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}]`;
    const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    sink(line, ...args);
  };
  return {
    debug: (...args) => emit('debug', args),
    info: (...args) => emit('info', args),
    warn: (...args) => emit('warn', args),
    error: (...args) => emit('error', args),
    child: (sub) => createLogger(`${scope}:${sub}`),
  };
}

export function describeError(error) {
  if (!error) return 'unknown error';
  if (error instanceof Error) {
    const code = error.code ? ` (${error.code})` : '';
    return `${error.message}${code}`;
  }
  return String(error);
}
