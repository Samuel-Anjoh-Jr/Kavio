import { AsyncLocalStorage } from 'async_hooks';

const requestIdStorage = new AsyncLocalStorage<string>();

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  scope: string;
  msg: string;
  requestId?: string;
  durationMs?: number;
  payload?: unknown;
  result?: unknown;
  error?: unknown;
  timestamp: string;
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

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
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

function formatLog(entry: LogEntry): string {
  const isProduction = process.env.NODE_ENV === 'production';

  const sanitizedEntry: LogEntry = {
    ...entry,
    payload: entry.payload ? sanitizeValue(entry.payload) : undefined,
    result: entry.result ? sanitizeValue(entry.result) : undefined,
    error: entry.error ? sanitizeValue(entry.error) : undefined,
  };

  if (isProduction) {
    return JSON.stringify(sanitizedEntry);
  }

  const timestamp = new Date(sanitizedEntry.timestamp).toLocaleTimeString();
  let output = `[${timestamp}] ${sanitizedEntry.level.toUpperCase()} [${sanitizedEntry.scope}]`;

  if (sanitizedEntry.requestId) {
    output += ` req:${sanitizedEntry.requestId}`;
  }

  output += ` ${sanitizedEntry.msg}`;

  if (sanitizedEntry.durationMs !== undefined) {
    output += ` (${sanitizedEntry.durationMs}ms)`;
  }

  if (sanitizedEntry.payload !== undefined) {
    output += `\n  payload: ${JSON.stringify(sanitizedEntry.payload)}`;
  }

  if (sanitizedEntry.result !== undefined) {
    output += `\n  result: ${JSON.stringify(sanitizedEntry.result)}`;
  }

  if (sanitizedEntry.error !== undefined) {
    const errorStr =
      sanitizedEntry.error instanceof Error
        ? `${sanitizedEntry.error.message}\n${sanitizedEntry.error.stack}`
        : JSON.stringify(sanitizedEntry.error);
    output += `\n  error: ${errorStr}`;
  }

  return output;
}

class Logger {
  constructor(private scope: string) {}

  setRequestId(requestId: string): void {
    requestIdStorage.enterWith(requestId);
  }

  getRequestId(): string | undefined {
    return requestIdStorage.getStore();
  }

  private createEntry(
    level: LogLevel,
    msg: string,
    options?: {
      payload?: unknown;
      result?: unknown;
      error?: unknown;
      durationMs?: number;
    },
  ): LogEntry {
    return {
      level,
      scope: this.scope,
      msg,
      requestId: this.getRequestId(),
      durationMs: options?.durationMs,
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
      durationMs?: number;
    },
  ): void {
    const entry = this.createEntry('info', msg, options);
    console.log(formatLog(entry));
  }

  warn(
    msg: string,
    options?: {
      payload?: unknown;
      result?: unknown;
      durationMs?: number;
    },
  ): void {
    const entry = this.createEntry('warn', msg, options);
    console.warn(formatLog(entry));
  }

  error(
    msg: string,
    options?: {
      payload?: unknown;
      result?: unknown;
      error?: unknown;
      durationMs?: number;
    },
  ): void {
    const entry = this.createEntry('error', msg, options);
    console.error(formatLog(entry));
  }
}

export function createLogger(scope: string): Logger {
  return new Logger(scope);
}

export function setRequestId(requestId: string): void {
  const logger = new Logger('system');
  logger.setRequestId(requestId);
}

export function getRequestId(): string | undefined {
  const logger = new Logger('system');
  return logger.getRequestId();
}
