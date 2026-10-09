# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### ⚠ BREAKING CHANGES

- **Node.js 22.12+ is now required.** Node 18 and Node 20 are end-of-life and are no longer supported or tested: `engines.node` moves from `>=18` to `>=22.12`, and ossready's CI matrix moves from Node 18/20/22 to Node 22/24
- **Scaffolded projects target Node 22 and 24 too:** `ossready init` / `doctor --fix` now generate a `[22, 24]` CI matrix, `engines.node: ">=22.12"`, and `.nvmrc` pinned to `22` (was `[18, 20, 22]`, `>=18`, and `20`)

### Changed

- Upgrade to `cac` 7, `vitest` 5, and TypeScript 7 (supersedes Dependabot #31, #33, and #34, which failed on the Node 18/20 jobs or on TypeScript 7's build); `@types/node` now tracks the minimum supported runtime (22.x). TypeScript 7 no longer picks up `@types/node` implicitly, so `tsconfig.json` now lists `"types": ["node"]`
- Scaffolded projects get `vitest` and `@vitest/coverage-v8` `^5.0.3` (kept on the same version) and `@types/node` `^22.20.5`. The scaffolded `typescript` stays on `^5.7.2` because `typescript-eslint` does not support TypeScript 7 yet
- `tests/node-support.test.ts` keeps ossready's own CI matrix and `engines.node` in lockstep with the scaffold templates (npm / pnpm / bun)
- Scaffolded workflows now pin the current Node 24-based GitHub Action majors instead of the deprecated Node 20 ones: `actions/checkout@v7`, `actions/setup-node@v7`, `github/codeql-action/*@v4`, `actions/upload-artifact@v7`, `actions/stale@v11`, `actions/dependency-review-action@v5`, `pnpm/action-setup@v6` (still pnpm 9), and `softprops/action-gh-release@v3`. ossready's own workflows move to `actions/checkout@v7` and `github/codeql-action@v4` to match (supersedes Dependabot #35 and #36, which failed because the dogfooded `codeql.yml` drifted from its template)
- `tests/action-pins.test.ts` keeps scaffold templates and ossready's own Dependabot-maintained workflows on the same action versions, so a workflow bump that forgets `src/templates` now fails CI with an explicit message
- Scaffolded `SECURITY.md` links the real private advisory form (`https://github.com/<owner>/<name>/security/advisories/new`) when `--github-owner` is set, instead of `OWNER` / `security@example.com` placeholders
- `codeOfConductText()` falls back to the GitHub owner (or no contact) when the CoC email is empty, instead of rendering an empty `****`; `ossready init` still defaults `--coc-email` to `conduct@example.com`

### Added

- `ossready doctor --fix` writes the files behind failing checks from ossready's own templates (never overwrites existing files; no `package.json` / `src` changes), then re-audits. Infers name, description, author, license, GitHub owner, and package manager from `package.json`, lockfiles, and the `origin` git remote, with `--github-owner`, `--author`, `--license`, and `--coc-email` overrides; `--dry-run` previews; `--json` adds a `fix` summary. `LICENSE` is only written when the license is known (MIT / Apache-2.0)
- CI smoke-tests `doctor --fix` on an empty directory (must reach 18/18 with `--strict`)
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
