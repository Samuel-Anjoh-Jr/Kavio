import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Throw this from controllers/services for intentional, typed errors (validation,
 * business-rule rejection, etc.) so the response carries a stable `code` and,
 * optionally, per-field messages for inline form feedback on the client.
 */
export class AppException extends HttpException {
  readonly code: string;
  readonly fields?: Record<string, string[]>;

  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    fields?: Record<string, string[]>,
  ) {
    super(message, status);
    this.code = code;
    this.fields = fields;
  }
}
