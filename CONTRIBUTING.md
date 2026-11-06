# Contributing to Kavio

Read [`CLAUDE.md`](CLAUDE.md) first: it holds the architecture rules (dual API,
dispatcher pattern, TMDS design tokens) that every change must respect.

## Setup

```bash
pnpm install
cp .env.example .env     # then: pnpm keys
pnpm dev:setup
pnpm dev
```

## Before you open a pull request

`pnpm full-check` runs lint, i18n lint, type-check and tests. CI additionally
runs `pnpm test:cov`, `prisma validate` and a high/critical dependency audit.

Definition of done for a PR:

- Typechecks and lints; new logic has tests (put the test in the **same commit**
  as the change it covers).
- Reads go through GraphQL, writes through REST; RBAC guards on every write.
- Inputs validated (Zod / DTO); indexes added for new query paths.
- Loading, empty and error states; EN **and** FR strings (no hardcoded text).
- Accessibility: keyboard, focus, contrast, `prefers-reduced-motion`.
- No secrets committed; new env vars documented in `.env.example`.
- New Prisma models ship with their migration in the same PR.

## Tests and coverage

- API: Jest (`pnpm --filter @kavio/api test`), specs next to the code as `*.spec.ts`.
- Web: Vitest for pure modules in `apps/web/lib` (`pnpm --filter @kavio/web test`).
- Coverage floors live in `apps/api/package.json` (`jest.coverageThreshold`) and
  `apps/web/vitest.config.ts`. They are set just under the current baseline: if
  your change raises coverage, raise the floor; never lower it to make CI pass.
- The API uses Jest's **V8** coverage provider on purpose. The default Istanbul
  provider breaks under this workspace's `minimatch@10` security override.

## Commits and pull requests

- Small, focused commits using Conventional Commits (`feat:`, `fix:`, `test:`,
  `docs:`, `chore:`). Do not mix formatting, refactors and features.
- Reference the SRS requirement IDs and the PROMPT number in the PR description.
- Never skip or quarantine a test to get green.
