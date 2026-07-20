import {
  Controller,
  Get,
  HttpStatus,
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { RequestIdMiddleware } from '../src/lib/request-id.middleware';
import { RequestLoggerMiddleware } from '../src/lib/request-logger.middleware';
import { AllExceptionsFilter } from '../src/lib/all-exceptions.filter';
import { AppException } from '../src/lib/app-exception';

@Controller('__test-errors')
class TestErrorController {
  @Get('typed')
  throwTyped(): never {
    throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid phone number', {
      phone: ['must be E.164 format'],
    });
  }

  @Get('unhandled')
  throwUnhandled(): never {
    throw new Error('unexpected boom');
  }
}

@Module({ controllers: [TestErrorController] })
class TestErrorModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, RequestLoggerMiddleware).forRoutes('*');
  }
}

describe('Error contract (e2e)', () => {
  let app: INestApplication<App>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(async () => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestErrorModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterEach(async () => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    await app.close();
  });

  it('returns the typed error contract with a matching x-request-id header for a known error', async () => {
    const res = await request(app.getHttpServer()).get('/__test-errors/typed').expect(400);

    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid phone number',
        requestId: res.headers['x-request-id'],
        fields: { phone: ['must be E.164 format'] },
      },
    });
  });

  it('returns a generic 500 contract for unhandled errors and logs the same requestId server-side', async () => {
    const res = await request(app.getHttpServer()).get('/__test-errors/unhandled').expect(500);

    const requestId = res.headers['x-request-id'] as string;
    expect(requestId).toBeDefined();
    expect(res.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please try again.',
        requestId,
      },
    });

    const loggedLines = consoleErrorSpy.mock.calls.map((call) => call[0] as string);
    expect(loggedLines.some((line) => line.includes(requestId))).toBe(true);
  });

  it('propagates a client-supplied x-request-id header through to the response and error body', async () => {
    const res = await request(app.getHttpServer())
      .get('/__test-errors/typed')
      .set('x-request-id', 'trace-abc-123')
      .expect(400);

    expect(res.headers['x-request-id']).toBe('trace-abc-123');
    expect((res.body as { error: { requestId: string } }).error.requestId).toBe('trace-abc-123');
  });

  it('rejects a malformed client-supplied x-request-id and generates its own', async () => {
    const res = await request(app.getHttpServer())
      .get('/__test-errors/typed')
      .set('x-request-id', 'not a valid id; contains spaces & symbols!')
      .expect(400);

    expect(res.headers['x-request-id']).not.toBe('not a valid id; contains spaces & symbols!');
    expect((res.body as { error: { requestId: string } }).error.requestId).toBe(
      res.headers['x-request-id'],
    );
  });
});
