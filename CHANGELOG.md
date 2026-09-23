# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Scaffolded CI defaults to least-privilege `permissions: contents: read` and `concurrency` that cancels superseded runs (ossready's own CI matches)
- Scaffold `.nvmrc` pinned to Node 20 (aligned with existing `engines.node`)
- Scaffolded CI now runs Prettier `format:check` (npm / pnpm / bun) alongside lint, test, and build
- `--github-owner <owner>` flag for `ossready init` to fill real GitHub URLs in the CI badge, `package.json` (`repository` / `bugs` / `homepage`), and `.github/CODEOWNERS`
- Scaffold ESLint flat config (`eslint.config.js`) with typescript-eslint and eslint-config-prettier; `lint` / `typecheck` scripts; CI lint step
- Scaffold `.prettierrc` / `.prettierignore` plus `format` and `format:check` scripts (Prettier ^3)
- Scaffold `.editorconfig` (UTF-8, LF, 2-space indent) for consistent editor defaults
- Scaffold `.github/workflows/codeql.yml` for CodeQL analysis on JS/TS
- Scaffold Vitest (`vitest.config.ts`, `src/index.test.ts`, `test: vitest run`) so new projects get a real test suite from day one
- Scaffold `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) with `--coc-email` flag
- npm publish prep: `publishConfig.access`, CHANGELOG in package `files`, and Publish workflow on GitHub Release
- Scaffolded `package.json` now includes `publishConfig.access: public` and ships CHANGELOG.md
- `--author <name>` flag for `ossready init` to set the LICENSE copyright holder
- Scaffold `SECURITY.md` with private vulnerability reporting guidance
- Scaffold `.github/dependabot.yml` for weekly npm and GitHub Actions updates
- `--dry-run` flag for `ossready init` to preview scaffold files without writing
- GitHub Actions CI for this repository (Node 18/20/22: test + build)

### Fixed

- Scaffolded CI for bun now runs `bun run test` (package.json Vitest script) instead of Bun's built-in test runner
- Scaffolded `src/index.ts` no longer logs on import (pure `greet` export for clean test imports)
- Scaffolded CI no longer uses `npm ci` / `cache: npm` (or pnpm/bun frozen lockfiles) so fresh scaffolds without a lockfile pass on day one
- Scaffold copyright year now uses the current calendar year instead of a hardcoded value

## [0.1.0] - 2026-09-14

### Added

- Initial `ossready init` CLI: LICENSE, README, CI/release workflows, issue/PR templates, CONTRIBUTING, CHANGELOG, TypeScript layout
