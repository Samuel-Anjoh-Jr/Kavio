export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    fields?: Record<string, string[]>;
  };
}

/**
 * Thrown by fetchJson() for failed REST writes (the dual-API rule: writes go
 * via REST). Carries the server's typed { code, message, requestId, fields? }
 * contract so forms can show inline success/error and per-field feedback
 * instead of failing silently.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly fields?: Record<string, string[]>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error.code;
    this.requestId = body.error.requestId;
    this.fields = body.error.fields;
  }

  fieldError(field: string): string | undefined {
    return this.fields?.[field]?.[0];
  }
}

/**
 * Whether a failed refresh was the API REFUSING the refresh token (pure).
 *
 * 4xx is a verdict about the token: expired, revoked, replayed, malformed. 408
 * and 429 are the exceptions, being about the request rather than the token.
 * Everything else (a thrown fetch, a 5xx, a non-JSON proxy page) means the API
 * could not give a verdict, and must not end the session.
 */
export function isRefreshRejection(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

export async function parseApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body?.error?.message && body?.error?.requestId) {
      return new ApiError(response.status, body);
    }
  } catch {
    // Response wasn't JSON (network/proxy-level failure) — fall through to the generic error.
  }

  return new ApiError(response.status, {
    error: {
      code: 'UNKNOWN_ERROR',
      message: FALLBACK_MESSAGE,
      requestId: response.headers.get('x-request-id') ?? 'unknown',
    },
  });
}

/** fetch() wrapper for REST writes that throws a typed ApiError on failure. */
export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await response.json()) as T;
}
