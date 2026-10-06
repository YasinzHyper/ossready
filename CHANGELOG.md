# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Scaffolded `SECURITY.md` links the real private advisory form (`https://github.com/<owner>/<name>/security/advisories/new`) when `--github-owner` is set, instead of `OWNER` / `security@example.com` placeholders
- `codeOfConductText()` falls back to the GitHub owner (or no contact) when the CoC email is empty, instead of rendering an empty `****`; `ossready init` still defaults `--coc-email` to `conduct@example.com`

### Added

- Dogfood community health files in ossready itself, generated from its own templates: `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`, `.github/dependabot.yml`, `.editorconfig`, and `.github/workflows/codeql.yml` — `ossready doctor .` now scores 18/18 (was 10/18)
- `tests/dogfood.test.ts` asserts the repo passes every doctor check and that dogfooded files stay byte-identical to their templates; CI runs `node dist/cli.js doctor . --strict` after build
- `ossready doctor [directory]` command that audits an existing repo for missing OSS-readiness files (8 required + 10 recommended checks: community health files in root/`.github`/`docs`, issue/PR templates, CI/CodeQL/Scorecard workflows by contents, Dependabot, FUNDING, CITATION, EditorConfig, .gitignore); `--json` output and `--strict` mode; exits `1` when required checks fail
- Scaffold `.github/workflows/lock.yml` using `dessant/lock-threads@v6` (daily cron; locks closed issues/PRs inactive for 45 days; reason comments; exempts pinned/security/good first issue; dogfooded in ossready)
- Scaffold `.github/workflows/stale.yml` using `actions/stale@v9` (daily cron; labels/closes inactive issues and PRs; exempts pinned/security/good first issue and milestones; dogfooded in ossready)
- Scaffold `SUPPORT.md` (GitHub community health "Get support" file) with issues/discussions links from `--github-owner` when set; dogfooded in ossready
- Scaffold `CITATION.cff` (Citation File Format 1.2.0) with title, authors from `--author`, and `url` / `repository-code` from `--github-owner` when set; dogfooded in ossready
- Scaffold `.github/FUNDING.yml` for GitHub Sponsors (uses `--github-owner` when set; placeholder comments otherwise); dogfooded in ossready
- Scaffold GitHub Issue Forms (`.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, and `config.yml` with `blank_issues_enabled: false` + security advisory contact link); replaces legacy markdown issue templates; dogfooded in ossready
- Scaffold `.github/workflows/publish.yml` (release published → npm install/test/build → `npm publish --access public --provenance` with `id-token: write` + `NPM_TOKEN`; matches ossready dogfood)
- Scaffold `.github/workflows/scorecard.yml` using `ossf/scorecard-action@v2.4.4` (OpenSSF Scorecard supply-chain security; dogfooded in ossready)
- Scaffold `.github/workflows/dependency-review.yml` using `actions/dependency-review-action@v4` on pull requests
- Scaffold Vitest coverage thresholds (lines / functions / branches / statements at 80%) so `test:coverage` fails when coverage drops below the floor
- Scaffold Vitest coverage (`@vitest/coverage-v8`, `test:coverage` script, v8 provider with text + html reporters) and a CI coverage step (npm / pnpm / bun)
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

- Pin Scorecard workflow to `ossf/scorecard-action@v2.4.4` — there is no floating `v2` tag, so `@v2` failed to resolve on dogfood runs
- Scaffolded CI for bun now runs `bun run test` (package.json Vitest script) instead of Bun's built-in test runner
- Scaffolded `src/index.ts` no longer logs on import (pure `greet` export for clean test imports)
- Scaffolded CI no longer uses `npm ci` / `cache: npm` (or pnpm/bun frozen lockfiles) so fresh scaffolds without a lockfile pass on day one
- Scaffold copyright year now uses the current calendar year instead of a hardcoded value

## [0.1.0] - 2026-09-14

### Added

- Initial `ossready init` CLI: LICENSE, README, CI/release workflows, issue/PR templates, CONTRIBUTING, CHANGELOG, TypeScript layout
