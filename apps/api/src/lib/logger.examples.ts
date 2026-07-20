/**
 * Logger usage examples for TrustPro
 * This file demonstrates common patterns for using the structured logger
 * across different parts of the application.
 */

import { createLogger } from './logger';

// Example 1: Simple info log
const authLogger = createLogger('auth');
authLogger.info('User login successful', {
  payload: { userId: 'usr_123', email: 'john@example.com' },
});

// Example 2: Warning for slow operations
const dbLogger = createLogger('database');
dbLogger.warn('Slow query detected', {
  payload: { query: 'SELECT * FROM users WHERE verified = true' },
  durationMs: 850,
});

// Example 3: Error logging with stack trace
const paymentLogger = createLogger('payment');
try {
  throw new Error('Payment gateway timeout');
} catch (error) {
  paymentLogger.error('Payment processing failed', {
    payload: { transactionId: 'tx_456' },
    error,
  });
}

// Example 4: Database query timing
const queryLogger = createLogger('db:query');
const startTime = Date.now();
// ... execute query ...
const duration = Date.now() - startTime;
queryLogger.info('Query executed successfully', {
  payload: { table: 'users', rows: 15 },
  result: { count: 15 },
  durationMs: duration,
});

// Example 5: API request handling
const apiLogger = createLogger('api:webhook');
apiLogger.info('Webhook received', {
  payload: {
    event: 'payment.completed',
    provider: 'campay',
  },
  result: { processed: true, timestamp: new Date().toISOString() },
});

// Example 6: Secret redaction (automatic)
// These will be automatically redacted in logs:
const sensitiveLogger = createLogger('auth:session');
sensitiveLogger.info('Session created', {
  payload: {
    userId: 'usr_789',
    accessToken: 'eyJhbGciOiJIUzI1NiIs...', // REDACTED
    refreshToken: 'refresh_token_secret', // REDACTED
    password: 'my_secure_password', // REDACTED
  },
});

// Example 7: Long data truncation (automatic)
const dataLogger = createLogger('data:import');
const longString = 'a'.repeat(1000);
dataLogger.info('Processing large dataset', {
  payload: { data: longString }, // Truncated to 500 chars + '...'
});

// Example 8: Middleware integration
// RequestLoggerMiddleware automatically logs:
// - Request started with method, path, and query params
// - Request completed with status code and duration
// - RequestId from headers or generated UUID
// - All logs include requestId for tracing

// Example 9: Error handling pattern
const userLogger = createLogger('user:service');
async function createUser(email: string) {
  const startTime = Date.now();
  try {
    userLogger.info('Creating user', {
      payload: { email },
    });
    // ... create user ...
    userLogger.info('User created successfully', {
      result: { userId: 'usr_new_123' },
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    userLogger.error('Failed to create user', {
      payload: { email },
      error,
      durationMs: Date.now() - startTime,
    });
  }
}

// Example 10: Production JSON output
// In production (NODE_ENV=production), logs are output as JSON:
// {"level":"info","scope":"app","msg":"User login successful","requestId":"req_abc123","timestamp":"2024-01-15T10:30:45.123Z","payload":{"userId":"usr_123","email":"john@example.com"}}
//
// In development, logs are pretty-printed:
// [10:30:45 AM] INFO [app] req:req_abc123 User login successful
//   payload: {"userId":"usr_123","email":"john@example.com"}
