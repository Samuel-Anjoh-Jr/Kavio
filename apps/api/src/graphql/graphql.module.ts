import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule as NestGraphQLModule } from '@nestjs/graphql';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import { formatGraphQLError } from '../lib/graphql-error-formatter';
import { registerGraphQLEnums } from './enums';

// Enums must be registered before the schema is built from the decorators.
registerGraphQLEnums();

const isProduction = process.env.NODE_ENV === 'production';

/**
 * GraphQL serves every READ (DUAL API RULE); writes stay on REST controllers.
 *
 * Code-first: the schema is generated from the same decorated classes the
 * resolvers return, so the SDL cannot drift from the TypeScript. The generated
 * file is written into src/ during development for review and diffing.
 *
 * `formatError` reuses the REST error formatter, so a GraphQL failure carries the
 * same { code, message, requestId } contract as every other error in the system —
 * one shape for the client to handle, one requestId to trace (SRS §19).
 */
@Module({
  imports: [
    NestGraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/graphql/schema.gql'),
      sortSchema: true,
      // The request is what guards and @CurrentUser read from, on both transports.
      context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
      formatError: formatGraphQLError,
      // Introspection and the sandbox are development affordances: in production
      // they hand an attacker a complete map of the API for free.
      introspection: !isProduction,
      playground: false,
      csrfPrevention: true,
    }),
  ],
})
export class GraphQLModule {}
