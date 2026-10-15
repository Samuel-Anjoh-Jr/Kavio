import { describe, expect, it } from 'vitest';
import { ApiError, isRefreshRejection } from './api-error';

function apiError(status: number) {
  return new ApiError(status, {
    error: { code: 'X', message: 'x', requestId: 'r' },
  });
}

describe('isRefreshRejection', () => {
  it('ends the session when the API refuses the refresh token', () => {
    expect(isRefreshRejection(apiError(401))).toBe(true);
    expect(isRefreshRejection(apiError(400))).toBe(true);
    expect(isRefreshRejection(apiError(403))).toBe(true);
  });

  it('keeps the session when the API could not be reached at all', () => {
    // What `fetch` throws on a dropped connection, DNS failure or offline device.
    expect(isRefreshRejection(new TypeError('fetch failed'))).toBe(false);
  });

  it('keeps the session when the API was up but failing', () => {
    expect(isRefreshRejection(apiError(500))).toBe(false);
    expect(isRefreshRejection(apiError(502))).toBe(false);
    expect(isRefreshRejection(apiError(503))).toBe(false);
  });

  it('keeps the session on request-level 4xx that say nothing about the token', () => {
    expect(isRefreshRejection(apiError(408))).toBe(false);
    expect(isRefreshRejection(apiError(429))).toBe(false);
  });
});
