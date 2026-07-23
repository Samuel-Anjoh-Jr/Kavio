import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from './app-exception';
import { setRequestId } from './logger';

interface MockResponse {
  headers: Record<string, string>;
  statusCode?: number;
  body?: unknown;
  setHeader: (key: string, value: string) => void;
  status: (code: number) => MockResponse;
  json: (body: unknown) => MockResponse;
}

function createMockHost(overrides: { method?: string; path?: string } = {}): {
  host: ArgumentsHost;
  response: MockResponse;
} {
  const response: MockResponse = {
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  const request = {
    method: overrides.method ?? 'GET',
    path: overrides.path ?? '/test',
  };

  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, response };
}

describe('AllExceptionsFilter', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('formats a standard HttpException using the typed error contract', () => {
    setRequestId('req_http_1');
    const filter = new AllExceptionsFilter();
    const { host, response } = createMockHost();

    filter.catch(new HttpException('Resource not found', HttpStatus.NOT_FOUND), host);

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        requestId: 'req_http_1',
      },
    });
    expect(response.headers['x-request-id']).toBe('req_http_1');
  });

  it('preserves code and fields from AppException', () => {
    setRequestId('req_app_1');
    const filter = new AllExceptionsFilter();
    const { host, response } = createMockHost();

    filter.catch(
      new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid input', {
        email: ['must be a valid email'],
      }),
      host,
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        requestId: 'req_app_1',
        fields: { email: ['must be a valid email'] },
      },
    });
  });

  it('maps unknown/unhandled errors to a generic 500 without leaking internals', () => {
    setRequestId('req_unhandled_1');
    const filter = new AllExceptionsFilter();
    const { host, response } = createMockHost();

    filter.catch(new Error('database connection string leaked: postgres://user:pass@host'), host);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please try again.',
        requestId: 'req_unhandled_1',
      },
    });
  });

  it('logs the exception server-side with the requestId', () => {
    setRequestId('req_log_1');
    const filter = new AllExceptionsFilter();
    const { host } = createMockHost();

    filter.catch(new Error('boom'), host);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const output = consoleErrorSpy.mock.calls[0]![0] as string;
    expect(output).toContain('req_log_1');
    expect(output).toContain('boom');
  });

  it('joins class-validator style array messages from ValidationPipe', () => {
    setRequestId('req_validation_1');
    const filter = new AllExceptionsFilter();
    const { host, response } = createMockHost();

    filter.catch(
      new HttpException(
        {
          message: ['name should not be empty', 'email must be an email'],
          error: 'Bad Request',
          statusCode: 400,
        },
        HttpStatus.BAD_REQUEST,
      ),
      host,
    );

    expect(response.statusCode).toBe(400);
    expect((response.body as { error: { message: string } }).error.message).toBe(
      'name should not be empty; email must be an email',
    );
  });

  it('always sets the x-request-id header to match the body requestId', () => {
    setRequestId('req_header_match');
    const filter = new AllExceptionsFilter();
    const { host, response } = createMockHost();

    filter.catch(new Error('boom'), host);

    const body = response.body as { error: { requestId: string } };
    expect(response.headers['x-request-id']).toBe(body.error.requestId);
  });

  it('logs and re-throws for a GraphQL context instead of writing an HTTP response', () => {
    // A resolver exception has no Response object to write to — this filter's
    // job there is only to log; formatGraphQLError builds the client envelope
    // from whatever is re-thrown here. Regression test: this used to crash on
    // `request.method` because switchToHttp() has nothing for a GraphQL call.
    setRequestId('req_gql_1');
    const filter = new AllExceptionsFilter();
    const gqlRequest = { method: 'POST', path: '/graphql' };
    // GqlArgumentsHost.create() reads the [root, args, context, info] tuple via
    // getArgs() and re-wraps it — the same shape @nestjs/graphql passes for
    // every resolver call — then getContext() reads index 2, the GraphQL
    // context object carrying { req, res }.
    const host = {
      getType: () => 'graphql',
      getArgs: () => [undefined, undefined, { req: gqlRequest }, undefined],
      switchToHttp: () => {
        throw new Error('must not be called for a GraphQL context');
      },
    } as unknown as ArgumentsHost;

    const exception = new Error('resolver exploded');

    expect(() => filter.catch(exception, host)).toThrow(exception);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const output = consoleErrorSpy.mock.calls[0]![0] as string;
    expect(output).toContain('req_gql_1');
    expect(output).toContain('resolver exploded');
  });
});
