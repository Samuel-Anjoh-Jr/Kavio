# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Add an entry under
**Unreleased** in every pull request.

## [Unreleased]

### Added
- Enforced coverage floors: Jest (V8) thresholds for `apps/api` and Vitest
  thresholds for `apps/web`, run in CI via `pnpm test:cov`.
- `CONTRIBUTING.md`, this changelog and a Dependabot configuration.
- `PROMOTE_EMAIL` and `TEST_REDIS_DB` documented in `.env.example`.
