import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';

/**
 * The stock ThrottlerGuard (registered globally in AppModule) extracts the
 * request via `context.switchToHttp().getRequest()`. For a GraphQL resolver
 * that returns the FIELD RESOLVER ARGS' first element (`root`), not a request
 * — usually `undefined` at the Query root — so every throttled GraphQL call
 * crashed reading `.ip` off it. Since GraphQL serves every read in the system
 * (DUAL API RULE), that took down the whole read side, not just the resolvers
 * explicitly marked `@Throttle()`.
 *
 * `graphql.module.ts`'s context factory carries the real Express `req`/`res`
 * through to every resolver, so this only has to reach into the right slot of
 * the execution context per transport — the same request/response the stock
 * guard already knows how to rate-limit and stamp headers on.
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  override getRequestResponse(context: ExecutionContext): { req: Request; res: Response } {
    if (context.getType<'graphql'>() === 'graphql') {
      const gqlContext = GqlExecutionContext.create(context).getContext<{
        req: Request;
        res: Response;
      }>();
      return { req: gqlContext.req, res: gqlContext.res };
    }

    const http = context.switchToHttp();
    return { req: http.getRequest(), res: http.getResponse() };
  }
}
