import { HttpStatus, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppException } from './app-exception';

/**
 * Validates a request payload against a Zod schema and returns the parsed,
 * typed value. On failure it throws the standard {@link AppException} so the
 * global filter renders the typed error contract, mapping each Zod issue to a
 * `fields` entry for inline, per-field form feedback (SRS §19).
 *
 * Usage: `@Body(new ZodValidationPipe(signUpSchema)) dto: SignUpDto`.
 */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const fields: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        // Root-level issues (no path) group under `_` so they still surface.
        const key = issue.path.length > 0 ? issue.path.join('.') : '_';
        (fields[key] ??= []).push(issue.message);
      }

      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Some fields need your attention.',
        fields,
      );
    }

    return result.data;
  }
}
