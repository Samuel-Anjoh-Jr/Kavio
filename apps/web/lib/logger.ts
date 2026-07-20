'use client';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  scope: string;
  msg: string;
  timestamp: string;
  payload?: unknown;
  result?: unknown;
  error?: unknown;
}

const SECRETS_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /jwt/i,
  /api[_-]?key/i,
  /access[_-]?key/i,
  /private[_-]?key/i,
  /refresh[_-]?token/i,
];

function sanitizeValue(value: unknown, key?: string): unknown {
  if (key && SECRETS_PATTERNS.some((pattern) => pattern.test(key))) {
    return '[REDACTED]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > 500 ? value.slice(0, 500) + '...' : value;
  }

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map((item, idx) => sanitizeValue(item, String(idx)));
    }
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      sanitized[k] = sanitizeValue(v, k);
    }
    return sanitized;
  }

  return value;
}

class Logger {
  constructor(private scope: string) {}

  private createEntry(
    level: LogLevel,
    msg: string,
    options?: {
      payload?: unknown;
      result?: unknown;
      error?: unknown;
    },
  ): LogEntry {
    return {
      level,
      scope: this.scope,
      msg,
      payload: options?.payload,
      result: options?.result,
      error: options?.error,
      timestamp: new Date().toISOString(),
    };
  }

  info(
    msg: string,
    options?: {
      payload?: unknown;
      result?: unknown;
    },
  ): void {
    const entry = this.createEntry('info', msg, options);
    const logData: Record<string, unknown> = {};
    if (options?.payload) logData.payload = sanitizeValue(options.payload);
    if (options?.result) logData.result = sanitizeValue(options.result);

    console.log(`%c[${entry.scope}] ${msg}`, 'color: #3D5AFE; font-weight: bold;', logData);
  }

  warn(
    msg: string,
    options?: {
      payload?: unknown;
      result?: unknown;
    },
  ): void {
    const entry = this.createEntry('warn', msg, options);
    const logData: Record<string, unknown> = {};
    if (options?.payload) logData.payload = sanitizeValue(options.payload);
    if (options?.result) logData.result = sanitizeValue(options.result);

    console.warn(`%c[${entry.scope}] ${msg}`, 'color: #F59E0B; font-weight: bold;', logData);
  }

  error(
    msg: string,
    options?: {
      payload?: unknown;
      result?: unknown;
      error?: unknown;
    },
  ): void {
    const entry = this.createEntry('error', msg, options);
    const logData: Record<string, unknown> = {};
    if (options?.payload) logData.payload = sanitizeValue(options.payload);
    if (options?.result) logData.result = sanitizeValue(options.result);
    if (options?.error) logData.error = sanitizeValue(options.error);

    console.error(`%c[${entry.scope}] ${msg}`, 'color: #EF4444; font-weight: bold;', logData);
  }
}

export function createLogger(scope: string): Logger {
  return new Logger(scope);
}
