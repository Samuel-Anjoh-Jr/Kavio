import { createLogger, setRequestId, getRequestId } from './logger';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('info', () => {
    it('should log info messages with dev formatting', () => {
      const logger = createLogger('app');
      logger.info('Application started', {
        payload: { port: 4000 },
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[app]');
      expect(output).toContain('Application started');
      expect(output).toContain('INFO');
    });

    it('should include durationMs in dev output', () => {
      const logger = createLogger('db');
      logger.info('Query executed', {
        durationMs: 150,
        result: { rows: 10 },
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('(150ms)');
    });
  });

  describe('warn', () => {
    it('should log warn messages', () => {
      const logger = createLogger('auth');
      logger.warn('Failed login attempt', {
        payload: { userId: '123' },
      });

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const output = consoleWarnSpy.mock.calls[0][0];
      expect(output).toContain('[auth]');
      expect(output).toContain('Failed login attempt');
      expect(output).toContain('WARN');
    });

    it('should include slow query warning with duration', () => {
      const logger = createLogger('db');
      logger.warn('Slow query detected', {
        durationMs: 850,
        payload: { query: 'SELECT * FROM users' },
      });

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const output = consoleWarnSpy.mock.calls[0][0];
      expect(output).toContain('(850ms)');
      expect(output).toContain('Slow query detected');
    });
  });

  describe('error', () => {
    it('should log error messages with stack trace', () => {
      const logger = createLogger('api');
      const testError = new Error('Connection failed');

      logger.error('Database connection error', {
        error: testError,
      });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('[api]');
      expect(output).toContain('Database connection error');
      expect(output).toContain('ERROR');
      expect(output).toContain('Connection failed');
    });

    it('should include error details with payload', () => {
      const logger = createLogger('payment');
      logger.error('Payment processing failed', {
        payload: { transactionId: 'tx_123' },
        error: new Error('Invalid card'),
      });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('Invalid card');
      expect(output).toContain('transactionId');
    });
  });

  describe('secret sanitization', () => {
    it('should redact password fields', () => {
      const logger = createLogger('auth');
      logger.info('User signup', {
        payload: {
          email: 'user@example.com',
          password: 'super_secret_password',
        },
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('super_secret_password');
    });

    it('should redact token fields', () => {
      const logger = createLogger('auth');
      logger.info('Token issued', {
        result: {
          accessToken: 'eyJhbGciOiJIUzI1NiIs...',
          refreshToken: 'refresh_token_xyz',
        },
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('eyJhbGciOiJIUzI1NiIs');
      expect(output).not.toContain('refresh_token_xyz');
    });

    it('should redact authorization headers', () => {
      const logger = createLogger('http');
      logger.info('Request received', {
        payload: {
          method: 'POST',
          authorization: 'Bearer token_abc123',
        },
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('Bearer token_abc123');
    });

    it('should redact API keys', () => {
      const logger = createLogger('external');
      logger.warn('API call', {
        payload: {
          endpoint: '/v1/users',
          api_key: 'sk_live_abc123xyz',
        },
      });

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const output = consoleWarnSpy.mock.calls[0][0];
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('sk_live_abc123xyz');
    });

    it('should truncate long strings', () => {
      const logger = createLogger('data');
      const longString = 'a'.repeat(1000);

      logger.info('Processing data', {
        payload: {
          data: longString,
        },
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('...');
      expect(output).not.toContain(longString);
    });
  });

  describe('requestId', () => {
    it('should include requestId in log output', () => {
      const logger = createLogger('http');
      setRequestId('req_12345');

      logger.info('Processing request');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('req_12345');
    });

    it('should retrieve current requestId', () => {
      setRequestId('req_abc123');

      const requestId = getRequestId();
      expect(requestId).toBe('req_abc123');
    });
  });

  describe('JSON formatting in production', () => {
    it('should output JSON in production mode', () => {
      process.env.NODE_ENV = 'production';
      const logger = createLogger('app');

      logger.info('Application started', {
        payload: { port: 4000 },
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];

      try {
        const parsed = JSON.parse(output);
        expect(parsed).toMatchObject({
          level: 'info',
          scope: 'app',
          msg: 'Application started',
        });
        expect(parsed.timestamp).toBeDefined();
      } catch {
        throw new Error(`Expected JSON output but got: ${output}`);
      }
    });

    it('should include sanitised payload in JSON', () => {
      process.env.NODE_ENV = 'production';
      const logger = createLogger('auth');

      logger.info('Login attempt', {
        payload: {
          username: 'john@example.com',
          password: 'secret123',
        },
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.payload.username).toBe('john@example.com');
      expect(parsed.payload.password).toBe('[REDACTED]');
    });
  });
});
