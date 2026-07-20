import { getRequestId } from './logger';
import { httpStatusToCode } from './error-contract';

/**
 * Minimal structural mirror of `graphql-js`'s GraphQLError, kept dependency-free
 * until GraphQLModule/apollo packages are installed by the prompt that introduces
 * the first resolvers. Once wired up, pass this as
 * `GraphQLModule.forRoot({ formatError: formatGraphQLError })` so every GraphQL
 * error matches the same typed contract as the REST exception filter.
 */
export interface FormattableGraphQLError {
  message: string;
  path?: ReadonlyArray<string | number>;
  extensions?: {
    code?: string;
    http?: { status?: number };
    fields?: Record<string, string[]>;
    [key: string]: unknown;
  };
}

export interface FormattedGraphQLError {
  message: string;
  path?: ReadonlyArray<string | number>;
  extensions: {
    code: string;
    requestId: string;
    fields?: Record<string, string[]>;
  };
}

export function formatGraphQLError(error: FormattableGraphQLError): FormattedGraphQLError {
  const requestId = getRequestId() ?? 'unknown';
  const status = error.extensions?.http?.status;
  const code = error.extensions?.code ?? (status ? httpStatusToCode(status) : 'INTERNAL_ERROR');
  const fields = error.extensions?.fields;

  return {
    message: error.message,
    path: error.path,
    extensions: {
      code,
      requestId,
      ...(fields ? { fields } : {}),
    },
  };
}
