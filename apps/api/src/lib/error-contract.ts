/**
 * The typed error contract every REST controller and the GraphQL error
 * formatter must return. See PROMPT 04 / SRS §19.
 */
export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    fields?: Record<string, string[]>;
  };
}

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

export function httpStatusToCode(status: number): string {
  if (STATUS_CODES[status]) {
    return STATUS_CODES[status];
  }
  return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
}
