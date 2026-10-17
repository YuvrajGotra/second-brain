/* Minimal leveled logger — swap for pino/winston in a larger deployment. */
const silent = process.env.NODE_ENV === 'test' && !process.env.DEBUG_LOGS;

const write = (level, args) => {
  if (silent && level !== 'error') return;
  const ts = new Date().toISOString();
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(`[${ts}] ${level.toUpperCase()}`, ...args);
};

export const logger = {
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
  debug: (...args) => process.env.DEBUG_LOGS && write('debug', args),
};
