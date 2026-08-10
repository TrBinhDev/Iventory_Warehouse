type LogLevel = 'info' | 'warn' | 'error';

function format(level: LogLevel, message: string): string {
  const time = new Date().toISOString();
  return `[${time}] [${level.toUpperCase()}] ${message}`;
}

export const logger = {
  info: (message: string, ...meta: unknown[]) => console.log(format('info', message), ...meta),
  warn: (message: string, ...meta: unknown[]) => console.warn(format('warn', message), ...meta),
  error: (message: string, ...meta: unknown[]) => console.error(format('error', message), ...meta),
};