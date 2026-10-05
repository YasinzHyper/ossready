# ossready

**Scaffold production-ready public GitHub repos in one command.**

Stop copying the same LICENSE, CI workflow, issue templates, and CONTRIBUTING.md into every new repo. `ossready` writes a polished TypeScript project layout with the OSS hygiene GitHub expects—ready to push and open to contributors.

[![CI](https://github.com/YasinzHyper/ossready/actions/workflows/ci.yml/badge.svg)](https://github.com/YasinzHyper/ossready/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

## Why ossready?

Shipping open source is more than `git init` and a README. Public repos that look “ready” usually include:

- A correct license
- CI that actually runs
- Structured GitHub Issue Forms (bug + feature) and PR templates
- GitHub Sponsors / funding links (`.github/FUNDING.yml`)
- Cite-this-software metadata (`CITATION.cff`, Citation File Format 1.2.0)
- Support resources (`SUPPORT.md`) so users know how to ask questions and report bugs
- Contribution guidelines and a changelog
- A release path for version tags
- A security policy and dependency update automation
- A Code of Conduct for community standards
- Consistent editor defaults, automated CodeQL scanning, Dependency Review on pull requests, OpenSSF Scorecard supply-chain checks, a Stale workflow for inactive issues/PRs, and a Lock Threads workflow for closed issues/PRs
- Prettier formatting config and scripts (CI runs `format:check`)
- ESLint flat config with TypeScript and Prettier integration
- `.nvmrc` for Node version managers, aligned with `engines`
- Vitest with v8 coverage (`test` / `test:coverage`) and 80% coverage thresholds wired into CI
- CI hardened with read-only permissions and concurrency that cancels superseded runs
- Optional `--github-owner` so CI badges, `package.json` links, and CODEOWNERS use your real GitHub URLs
- npm Publish workflow with provenance (`release: published` → `npm publish --provenance`) for scaffolds that ship to the registry

`ossready` generates all of that (plus a minimal TypeScript `src/` that builds) so you can focus on the product.

## Install

```bash
# Global
npm i -g ossready

# Or one-shot
npx ossready init my-lib
```

Requires **Node.js 18+**.

## Usage

```bash
# Scaffold into a new directory
ossready init my-awesome-lib

# Scaffold into the current directory
ossready init .

# Preview without writing files
ossready init my-lib --dry-run

# Audit an existing repo for missing OSS-readiness files
ossready doctor .

# Full options
ossready init my-lib \
  --name my-lib \
  --description "Does one thing well" \
  --author "Your Name" \
  --license mit \
  --package-manager npm \
  --coc-email conduct@example.com \
  --github-owner YourGitHubUser
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `[directory]` | `.` | Target folder (created if missing) |
| `--name <name>` | directory basename | Package / project name |
| `--description <text>` | short default | README description |
| `--author <name>` | project name (see note) | Copyright holder for LICENSE and authors in CITATION.cff |
| `--license <license>` | `mit` | `mit` or `apache-2.0` |
| `--package-manager <pm>` | `npm` | `npm`, `pnpm`, or `bun` |
| `--coc-email <email>` | `conduct@example.com` | Contact email in CODE_OF_CONDUCT.md |
| `--github-owner <owner>` | _(omit)_ | GitHub username or org for real CI badge, `package.json` links, CODEOWNERS, FUNDING.yml, CITATION.cff, and SUPPORT.md |
| `--force` | off | Overwrite existing files |
| `--dry-run` | off | Print planned files without writing |

When `--author` is omitted, the LICENSE copyright holder defaults to the project name (with the existing special-case for scaffolding into `.` without `--name`), and CITATION.cff uses a placeholder Anonymous author entry.

When `--github-owner` is set, scaffolded README CI badges, `package.json` `repository` / `bugs` / `homepage`, `.github/CODEOWNERS`, `.github/FUNDING.yml`, CITATION.cff `url` / `repository-code`, and SUPPORT.md issue/discussion links use that owner. When omitted, the familiar `OWNER` placeholders remain (FUNDING.yml keeps `github` commented; CITATION.cff comments the URL fields).

### What gets written

```
LICENSE
README.md
SECURITY.md
SUPPORT.md
CODE_OF_CONDUCT.md
.gitignore
.nvmrc
.editorconfig
.prettierrc
.prettierignore
eslint.config.js
CONTRIBUTING.md
CHANGELOG.md
package.json
tsconfig.json
vitest.config.ts
src/index.ts
src/index.test.ts
.github/workflows/ci.yml
.github/workflows/release.yml   # tag v* → GitHub Release
.github/workflows/codeql.yml    # CodeQL for JS/TS
.github/workflows/dependency-review.yml  # Dependency Review on PRs
.github/workflows/scorecard.yml # OpenSSF Scorecard supply-chain security
.github/workflows/stale.yml     # close inactive issues and PRs
.github/workflows/lock.yml      # lock inactive closed issues and PRs
.github/workflows/publish.yml   # release published → npm publish --provenance
.github/ISSUE_TEMPLATE/bug_report.yml      # Issue Form: bug report
.github/ISSUE_TEMPLATE/feature_request.yml # Issue Form: feature request
.github/ISSUE_TEMPLATE/config.yml         # disable blank issues + security link
.github/PULL_REQUEST_TEMPLATE.md
.github/CODEOWNERS
.github/dependabot.yml          # weekly npm + GitHub Actions updates
.github/FUNDING.yml             # GitHub Sponsors (uses --github-owner when set)
CITATION.cff                    # Citation File Format 1.2.0 (cite-this-software)
```

`package.json` includes a `test:coverage` script (`vitest run --coverage`) and `@vitest/coverage-v8`; `vitest.config.ts` enables the v8 provider with text + html reporters and enforces 80% coverage thresholds for lines, functions, branches, and statements (`coverage/` is gitignored). Scaffolded CI sets `permissions: contents: read` and cancels in-progress runs for the same branch. It uses `npm install` (or `pnpm install` / `bun install`) without a lockfile cache so the first push succeeds, and runs lint, format:check, test, test:coverage, and build. After you commit a lockfile, switch to `npm ci` + `cache: npm` (or the equivalent frozen install for pnpm/bun).

Scaffolds also get `.github/workflows/publish.yml`: on `release: published` it installs with npm, runs test + build, then `npm publish --access public --provenance` (needs repo secret `NPM_TOKEN`; optionally enable [trusted publishing](https://docs.npmjs.com/trusted-publishers) on npmjs.com). The workflow uses npm regardless of `--package-manager` so provenance and `NODE_AUTH_TOKEN` stay simple.

## `ossready doctor`

Already have a repo? `ossready doctor [directory]` audits it for the community health files and automation that `ossready init` scaffolds, without writing anything.

```bash
ossready doctor .            # human-readable report
ossready doctor . --json     # machine-readable report (for CI or scripts)
ossready doctor . --strict   # also fail on missing recommended checks
```

- **Required** (exit code `1` when missing): README, LICENSE, Code of Conduct, CONTRIBUTING, SECURITY policy, issue templates, pull request template, and a CI workflow triggered on `push` / `pull_request`.
- **Recommended** (warnings; fail only with `--strict`): SUPPORT.md, CHANGELOG, CODEOWNERS, Dependabot, CodeQL, OpenSSF Scorecard, FUNDING.yml, CITATION.cff, `.editorconfig`, and `.gitignore`.

Community health files are found case-insensitively in the repo root, `.github/`, or `docs/` (the same places GitHub looks). Workflow checks (CI, CodeQL, Scorecard) inspect `.github/workflows/*.yml` contents rather than file names. A fresh `ossready init` scaffold passes every check.

## Examples

```bash
# MIT + npm (default)
npx ossready init cool-cli --name cool-cli --description "A cool CLI"

# Custom copyright holder
npx ossready init cool-cli --name cool-cli --author "Jane Doe"

# Real GitHub owner URLs (badge, package.json, CODEOWNERS)
npx ossready init cool-cli --name cool-cli --github-owner YasinzHyper

# Custom Code of Conduct contact
npx ossready init cool-cli --name cool-cli --coc-email mods@example.org

# Apache-2.0 + pnpm
npx ossready init enterprise-kit \
  --license apache-2.0 \
  --package-manager pnpm

# Preview the plan first
npx ossready init my-app --dry-run

# Existing folder — overwrite carefully
npx ossready init . --name my-app --force
```

## Releasing (this package)

`ossready` is set up for npm with `publishConfig.access: public` and a Publish workflow.

1. Bump `version` in `package.json` and update [CHANGELOG.md](CHANGELOG.md).
2. Commit, push, and create a GitHub Release (or tag `vX.Y.Z` and publish a release from it).
3. On `release: published`, [.github/workflows/publish.yml](.github/workflows/publish.yml) runs test + build, then `npm publish --access public --provenance`.

**One-time setup:** add an npm Automation token as the repository secret `NPM_TOKEN` (Settings → Secrets and variables → Actions). Optionally enable [trusted publishing](https://docs.npmjs.com/trusted-publishers) for this GitHub repo on npmjs.com so provenance can use OIDC.

## Development (this repo)

```bash
npm install
npm run build
npm test
node dist/cli.js --help
node dist/cli.js init /tmp/demo --name demo --force
node dist/cli.js init /tmp/demo --name demo --dry-run
node dist/cli.js doctor /tmp/demo
```

## License

MIT © Mohammed Yasin Zuhayr ([YasinzHyper](https://github.com/YasinzHyper))
