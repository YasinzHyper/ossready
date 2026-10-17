# ossready

<!-- ossready:badges:start -->
[![CI](https://github.com/YasinzHyper/ossready/actions/workflows/ci.yml/badge.svg)](https://github.com/YasinzHyper/ossready/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/ossready.svg)](https://www.npmjs.com/package/ossready)
[![npm downloads](https://img.shields.io/npm/dm/ossready.svg)](https://www.npmjs.com/package/ossready)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![OpenSSF Scorecard](https://img.shields.io/ossf-scorecard/github.com/YasinzHyper/ossready?label=openssf%20scorecard)](https://scorecard.dev/viewer/?uri=github.com/YasinzHyper/ossready)
[![CodeQL](https://github.com/YasinzHyper/ossready/actions/workflows/codeql.yml/badge.svg)](https://github.com/YasinzHyper/ossready/actions/workflows/codeql.yml)
<!-- ossready:badges:end -->

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen.svg)](https://nodejs.org)

**Scaffold production-ready public GitHub repos in one command.**

Stop copying the same LICENSE, CI workflow, issue templates, and CONTRIBUTING.md into every new repo. `ossready` writes a polished TypeScript project layout with the OSS hygiene GitHub expects—ready to push and open to contributors.

## Why ossready?

Shipping open source is more than `git init` and a README. Public repos that look “ready” usually include:

- A correct license
- CI that actually runs
- Structured GitHub Issue Forms (bug + feature) and PR templates
- GitHub Sponsors / funding links (`.github/FUNDING.yml`)
- Cite-this-software metadata (`CITATION.cff`, Citation File Format 1.2.0)
- Support resources (`SUPPORT.md`) so users know how to ask questions and report bugs
- Contribution guidelines and a changelog
- Instructions for AI coding agents (`AGENTS.md`, plus `.github/copilot-instructions.md` pointing to it) with your real setup, test, lint, and format commands
- A release path for version tags
- A security policy and dependency update automation
- A Code of Conduct for community standards
- Consistent editor defaults, automated CodeQL scanning, Dependency Review on pull requests, OpenSSF Scorecard supply-chain checks, a Stale workflow for inactive issues/PRs, and a Lock Threads workflow for closed issues/PRs
- Prettier formatting config and scripts (CI runs `format:check`)
- ESLint flat config with TypeScript and Prettier integration
- `.nvmrc` for Node version managers, aligned with `engines`
- Vitest with v8 coverage (`test` / `test:coverage`) and 80% coverage thresholds wired into CI
- CI hardened with read-only permissions and concurrency that cancels superseded runs
- Your real GitHub URLs in CI badges, `package.json` links, and CODEOWNERS, from `--github-owner` or inferred from your git remote / `git config github.user`
- Your choice of package manager: npm, pnpm, Yarn (modern Yarn via Corepack), or bun — CI, docs, and scripts follow it
- npm Publish workflow with provenance (`release: published` → `npm publish --provenance`) for scaffolds that ship to the registry

`ossready` generates all of that (plus a minimal TypeScript `src/` that builds) so you can focus on the product.

## Install

```bash
# Global
npm i -g ossready

# Or one-shot
npx ossready init my-lib
```

Requires **Node.js 22.12+** (CI covers Node 22 and 24; Node 18 and 20 are end-of-life and no longer supported).

## Usage

```bash
# Scaffold into a new directory (asks for anything you leave out)
ossready init my-awesome-lib

# Same, but never prompt: use defaults for everything not passed as a flag
ossready init my-awesome-lib --yes

# Scaffold into the current directory
ossready init .

# Preview without writing files
ossready init my-lib --dry-run

# Audit an existing repo for missing OSS-readiness files
ossready doctor .

# Print (or --write) README badges for a repo
ossready badges .

# Full options
ossready init my-lib \
  --name my-lib \
  --description "Does one thing well" \
  --author "Your Name" \
  --license mit \
  --package-manager npm \
  --coc-email conduct@example.com \
  --security-email security@example.com \
  --github-owner YourGitHubUser
```

### Interactive prompts vs `--yes`

Run `ossready init` in a terminal and it asks for each option you didn't pass as a flag. Press Enter to accept the default in brackets:

```text
$ ossready init my-lib

ossready init — press Enter to accept the [default]. Pass --yes to skip these questions.

? Project name [my-lib]:
? Description [A production-ready TypeScript project scaffolded with ossready.]: Does one thing well
? License (mit / apache-2.0) [mit]:
? Package manager (npm / pnpm / yarn / bun) [npm]: pnpm
? Author / copyright holder (optional, Enter to skip): Jane Doe
? GitHub owner (user or org) [janedoe]:
? Code of Conduct contact email [conduct@example.com]:
? Private security contact email (optional, Enter to skip):
```

- Flags always win and are never asked about, so `ossready init my-lib --license apache-2.0` only skips the license question.
- Defaults come from the target folder when it has one: `package.json` `name` / `description` / `license` / `author` / `repository`, and the package manager from lockfiles, `packageManager`, or the `npx` / `pnpm dlx` / `bunx` that launched ossready. Otherwise the folder name and the defaults in the table below are used. The GitHub owner default is inferred as described in [GitHub owner](#github-owner).
- Invalid answers (project name, license, package manager, GitHub owner, or email) show an error and the question is asked again.
- Ctrl+C (exit code `130`) or end of input (exit code `1`) cancels before anything is written. `--dry-run` works with prompts too.

Prompts only appear when stdin and stdout are both terminals, the `CI` environment variable is not set, and `--yes` / `-y` is not passed. Piped or scripted runs, CI jobs, and `--yes` never prompt and behave exactly as before, with the same defaults.

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `[directory]` | `.` | Target folder (created if missing) |
| `--name <name>` | directory basename | Package / project name |
| `--description <text>` | short default | README description |
| `--author <name>` | project name (see note) | Copyright holder for LICENSE and authors in CITATION.cff |
| `--license <license>` | `mit` | `mit` or `apache-2.0` |
| `--package-manager <pm>` | `npm` | `npm`, `pnpm`, `yarn`, or `bun` |
| `--coc-email <email>` | `conduct@example.com` | Contact email in CODE_OF_CONDUCT.md (must be a valid email) |
| `--security-email <email>` | _(omit)_ | Private security contact email in SECURITY.md (must be a valid email when set) |
| `--github-owner <owner>` | inferred from git (see below) | GitHub username or org for real CI badge, `package.json` links, CODEOWNERS, FUNDING.yml, CITATION.cff, SUPPORT.md, and SECURITY.md |
| `-y`, `--yes` | off | Skip interactive prompts and use defaults for omitted options |
| `--force` | off | Overwrite existing files |
| `--dry-run` | off | Print planned files without writing |

When `--author` is omitted, the LICENSE copyright holder defaults to the project name (with the existing special-case for scaffolding into `.` without `--name`), and CITATION.cff uses a placeholder Anonymous author entry.

### GitHub owner

With a GitHub owner, scaffolded README CI badges, `package.json` `repository` / `bugs` / `homepage`, `.github/CODEOWNERS`, `.github/FUNDING.yml`, CITATION.cff `url` / `repository-code`, SUPPORT.md issue/discussion links, and the SECURITY.md private advisory link use that owner.

When `--github-owner` is omitted (including with `--yes`), `ossready init` tries to infer it, in this order, and prints where it came from:

1. the target folder's `origin` git remote (`https://github.com/<owner>/…` or `git@github.com:<owner>/…`),
2. the parent folder's `origin` remote (handy for `ossready init my-lib` inside a clone),
3. `git config --global github.user`.

The same helper powers the interactive prompt's default, `ossready badges`, and `ossready doctor --fix` (which only looks at `package.json` links and the repo's own remote). Pass `--github-owner` to override it.

When no owner is given or found, the familiar `OWNER` placeholders remain (FUNDING.yml keeps `github` commented; CITATION.cff comments the URL fields) and `package.json` has no `repository` / `bugs` / `homepage`, so `doctor --strict` flags `pkg-links`. init's next steps say so, and you can add the links at any time from the project folder:

```bash
ossready doctor --fix --github-owner <you>   # adds repository / bugs / homepage
ossready doctor --strict                     # now passes
```

With `--package-manager yarn`, the scaffold targets modern Yarn (Berry) through [Corepack](https://nodejs.org/api/corepack.html): `package.json` pins `"packageManager": "yarn@4.x"`, `.yarnrc.yml` sets `nodeLinker: node-modules` so ESLint, Vitest, and TypeScript work without Plug'n'Play setup, `vite` is listed explicitly (Vitest's peer, which Yarn does not auto-install), and `.gitignore` / `.prettierignore` cover `.yarn/*` (keeping `patches`, `plugins`, `releases`, `sdks`, `versions`) and `.pnp.*`. Generated CI runs `corepack enable`, then `yarn install` with `YARN_ENABLE_IMMUTABLE_INSTALLS=false` (no lockfile is committed yet), then `yarn <script>`. README and CONTRIBUTING show `corepack enable` + `yarn` commands; Dependabot keeps the `npm` ecosystem, which covers Yarn.

When `--security-email` is set, SECURITY.md includes that address as a private reporting contact alongside the advisory form (or instead of the `security@example.com` placeholder when no owner is set). Both `--coc-email` and `--security-email` are validated before any files are written; clearly invalid addresses exit non-zero with a friendly error.

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
AGENTS.md                       # instructions for AI coding agents (agents.md)
CHANGELOG.md
package.json
.yarnrc.yml                     # --package-manager yarn only (nodeLinker: node-modules)
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
.github/copilot-instructions.md # points GitHub Copilot to AGENTS.md
.github/dependabot.yml          # weekly npm + GitHub Actions updates
.github/FUNDING.yml             # GitHub Sponsors (uses --github-owner when set)
CITATION.cff                    # Citation File Format 1.2.0 (cite-this-software)
```

`AGENTS.md` follows the cross-tool [AGENTS.md](https://agents.md) convention read by Codex, Copilot, Cursor, Claude Code, Gemini CLI, and other coding agents. It gives the project overview, the setup and build / test / coverage / lint / typecheck / format commands for your package manager, the Prettier / ESLint / EditorConfig style rules, pull request and commit expectations (pointing to CONTRIBUTING.md), and a security note (pointing to SECURITY.md). `.github/copilot-instructions.md` is a short pointer to it for GitHub Copilot.

`package.json` includes a `test:coverage` script (`vitest run --coverage`) and `@vitest/coverage-v8`; `vitest.config.ts` enables the v8 provider with text + html reporters and enforces 80% coverage thresholds for lines, functions, branches, and statements (`coverage/` is gitignored). Scaffolded CI sets `permissions: contents: read` and cancels in-progress runs for the same branch. It uses `npm install` (or `pnpm install` / `yarn install` / `bun install`) without a lockfile cache so the first push succeeds, and runs lint, format:check, test, test:coverage, and build. After you commit a lockfile, switch to `npm ci` + `cache: npm` (or the equivalent frozen install for pnpm/yarn/bun).

A fresh scaffold passes its own `format:check`, `lint`, `typecheck`, `test`, `test:coverage`, and `build` out of the box; ossready's CI verifies this end to end on every change (for npm, pnpm, Yarn, and bun) by scaffolding a project, installing its dependencies, and running each script. CI also scaffolds a project without an owner and checks that `doctor --fix --github-owner` then makes `doctor --strict` pass.

Scaffolds also get `.github/workflows/publish.yml`: on `release: published` it installs and runs test + build (with Yarn via Corepack for yarn scaffolds, otherwise npm), then `npm publish --access public --provenance` (needs repo secret `NPM_TOKEN`; optionally enable [trusted publishing](https://docs.npmjs.com/trusted-publishers) on npmjs.com). Publishing always goes through `npm publish` so provenance and `NODE_AUTH_TOKEN` stay simple.

## `ossready doctor`

Already have a repo? `ossready doctor [directory]` audits it for the community health files and automation that `ossready init` scaffolds. By default it is read-only; add `--fix` to fill the gaps.

```bash
ossready doctor .                  # human-readable report
ossready doctor . --json           # machine-readable report (for CI or scripts)
ossready doctor . --strict         # also fail on missing recommended checks
ossready doctor . --fix --dry-run  # preview which missing files would be written
ossready doctor . --fix            # write them, then re-audit
ossready doctor . --fix --github-owner <you>  # also add package.json links when the owner can't be inferred
```

- **Required** (exit code `1` when missing): README, LICENSE, Code of Conduct, CONTRIBUTING, SECURITY policy, issue templates, pull request template, and a CI workflow triggered on `push` / `pull_request`.
- **Recommended** (warnings; fail only with `--strict`): SUPPORT.md, CHANGELOG, CODEOWNERS, Dependabot, CodeQL, OpenSSF Scorecard, FUNDING.yml, CITATION.cff, `.editorconfig`, `.gitignore`, and `AGENTS.md`.
- **npm publish readiness** (recommended, only when a `package.json` exists): 8 more checks, listed in the table below.
- **GitHub Actions versions** (recommended, only when `.github/workflows/*.yml` exist): the `workflow-actions` check flags actions pinned to an outdated major, as described below.

Community health files are found case-insensitively in the repo root, `.github/`, or `docs/` (the same places GitHub looks). Workflow checks (CI, CodeQL, Scorecard) inspect `.github/workflows/*.yml` contents rather than file names. A fresh `ossready init` scaffold with a GitHub owner passes every check; one without an owner passes everything except `pkg-links` until you run `ossready doctor --fix --github-owner <you>`.

### npm publish readiness (`package.json`)

| Check id | Passes when |
|----------|-------------|
| `pkg-name-version` | `name` and a semver `version` are set |
| `pkg-description` | `description` is set |
| `pkg-license` | `license` is set and, when LICENSE is recognisably MIT or Apache-2.0, matches it |
| `pkg-links` | `repository`, `bugs`, and `homepage` are set (the failure message suggests `ossready doctor --fix --github-owner <you>`) |
| `pkg-engines` | `engines.node` is set |
| `pkg-files` | a `files` allowlist or an `.npmignore` exists, so `npm publish` doesn't ship everything |
| `pkg-entry` | `main` / `exports` (libraries) or `bin` (CLIs) exist, are relative paths inside the package, don't point at `.ts` sources, and are covered by `files` |
| `pkg-publish-access` | scoped names (`@scope/pkg`) set `publishConfig.access` |

These checks are skipped (not failed) when there is no `package.json`, when it is `"private": true`, or when it isn't valid JSON. The report shows why, and `--json` includes `packageJson: { "status": "checked" }` or `{ "status": "skipped", "reason": "..." }`, plus each check with its `id`, `ok`, `group: "package-json"`, and an actionable `detail` when it fails.

### GitHub Actions versions (`workflow-actions`)

`doctor` reads every `.github/workflows/*.yml` / `*.yaml` for `uses: owner/repo@ref` lines and compares the major version with the one ossready's own templates pin (the single list in [`src/templates/actions.ts`](src/templates/actions.ts): `actions/checkout@v7`, `actions/setup-node@v7`, `github/codeql-action/*@v4`, `actions/upload-artifact@v7`, `actions/stale@v11`, `actions/dependency-review-action@v5`, `pnpm/action-setup@v6`, `oven-sh/setup-bun@v2`, `softprops/action-gh-release@v3`, `ossf/scorecard-action@v2.5.0`, `dessant/lock-threads@v6`). Each outdated pin is reported with its location:

```text
  GitHub Actions versions (workflows, recommended):
    ⚠ Current GitHub Action versions — 2 outdated:
      actions/checkout@v4 → v7 (.github/workflows/ci.yml:12)
      github/codeql-action/init@v3 → v4 (.github/workflows/codeql.yml:20)
      Bump these or let Dependabot (github-actions ecosystem) do it.
```

- Only the major counts, so `ossf/scorecard-action@v2.4.4` passes against `v2.5.0`, and newer majors pass too.
- Commit-SHA pins are fine: they are listed as info only and never fail the check. Branch refs such as `@main` are not judged.
- Local (`./…`) and `docker://` actions, and actions ossready doesn't scaffold, are ignored.
- No workflow files means the check is skipped, not failed. `--json` includes `workflowActions: { "status": "checked", "files": [...], "outdated": [{ "file", "line", "action", "ref", "recommended" }], "shaPinned": [...] }` or `{ "status": "skipped", "reason": "..." }`.

### `--fix`

`ossready doctor --fix` writes only the files behind failing checks, using the same templates as `ossready init`, and **never overwrites** anything that already exists. It does not touch `tsconfig.json` or `src/`. The only `package.json` change it makes is adding missing `repository` / `bugs` / `homepage` links, and only when the GitHub owner is known (from `--github-owner`, existing GitHub URLs in `package.json`, or the `origin` git remote); otherwise it lists `pkg-links` under "Not fixed automatically" with the `--github-owner` command to run. Keys that already exist are never changed. The other publish-readiness checks are report-only and listed under "Not fixed automatically". `workflow-actions` is report-only too: `--fix` never rewrites existing workflows and lists it under "Not fixed automatically" with a hint to bump the pins or let Dependabot's `github-actions` ecosystem do it. A missing `AGENTS.md` is filled together with `.github/copilot-instructions.md`, using the detected package manager's commands. Values are inferred from the repo:

| Value | Inferred from | Override |
|-------|---------------|----------|
| Project name / description | `package.json` `name` / `description` (falls back to the folder name) | — |
| GitHub owner (CODEOWNERS, SECURITY, SUPPORT, FUNDING, CITATION, `package.json` links) | `package.json` `repository` / `bugs` / `homepage`, then the `origin` git remote | `--github-owner <owner>` |
| Copyright holder / CITATION author | `package.json` `author` | `--author <name>` |
| License | `package.json` `license` (`MIT` or `Apache-2.0`) | `--license mit\|apache-2.0` |
| Package manager (CI template, AGENTS.md) | `pnpm-lock.yaml` / `bun.lock(b)` / `yarn.lock` or `.yarnrc.yml`, then `package.json` `packageManager`, else npm | — |
| Code of Conduct contact | GitHub owner link | `--coc-email <email>` |
| Security contact email | _(omit — advisory form / placeholder only)_ | `--security-email <email>` |

Picking a license is a legal decision, so `--fix` leaves `LICENSE` missing (and the check failing) unless the license is `MIT` / `Apache-2.0` in `package.json` or passed with `--license`. If `--fix` adds `.github/workflows/ci.yml`, review it before pushing: the template runs `lint`, `format:check`, `test`, and `build` scripts that an older repo may not have. `--json` output includes a `fix` object listing created, existing, and skipped files, plus `packageJson.add` when links were added.

ossready dogfoods this: its own community health files are generated from the same templates, `tests/dogfood.test.ts` keeps them in sync, and CI runs `ossready doctor . --strict` on every push and pull request (currently 28/28: 19 file checks, 8 `package.json` checks, and `workflow-actions`). Its `AGENTS.md` is written for ossready itself (real commands and guard tests), so it is checked for presence rather than byte-compared to the template.

## `ossready badges`

`ossready badges [directory]` prints a Markdown block of README badges for a repo, based on what it finds there:

| Badge | Shown when | Source |
|-------|------------|--------|
| CI | `.github/workflows/ci.yml` exists | GitHub's native workflow badge |
| npm version, npm downloads | `package.json` has a `name` and isn't `"private": true` | shields.io |
| License | `package.json` `license`, or a recognisable LICENSE file (MIT, Apache-2.0, …) | shields.io |
| OpenSSF Scorecard | `.github/workflows/scorecard.yml` exists | shields.io |
| CodeQL | `.github/workflows/codeql.yml` exists | GitHub's native workflow badge |

```bash
ossready badges .                         # print the block
ossready badges . --json                  # badges, URLs, owner, and repo as JSON
ossready badges . --write --dry-run       # show what --write would change
ossready badges . --write                 # insert or update the block in README.md
ossready badges . --github-owner me --repo my-lib   # override the inferred owner / repo
ossready badges . --repo me/my-lib        # same, in one flag
```

With `--write`, the block goes between `<!-- ossready:badges:start -->` and `<!-- ossready:badges:end -->` in README.md. If the markers aren't there yet, it is inserted right after the first `#` heading (or at the top when there is none). Only the text between the markers is ever replaced, and running `--write` again on an unchanged repo gives no diff.

The owner is inferred like [`init`'s](#github-owner) (target `origin` remote, then the parent's, then `git config github.user`); the repo name comes from the `origin` remote, then `package.json` `repository` / `name`, then the folder name. Without an owner, the CI, CodeQL, and Scorecard badges are left out and a hint suggests `--github-owner`; `--write` then exits `1` without touching README.md. ossready's own badge block above is generated this way, and `tests/badges.test.ts` checks it stays current.

## Examples

```bash
# Interactive: answer the questions, Enter accepts each default
npx ossready init cool-cli

# MIT + npm (default), no questions
npx ossready init cool-cli --name cool-cli --description "A cool CLI" --yes

# Custom copyright holder
npx ossready init cool-cli --name cool-cli --author "Jane Doe"

# Real GitHub owner URLs (badge, package.json, CODEOWNERS)
npx ossready init cool-cli --name cool-cli --github-owner YasinzHyper

# Scaffolded without an owner? Add the package.json links later
cd cool-cli && npx ossready doctor --fix --github-owner YasinzHyper

# Add CI / npm / license / Scorecard / CodeQL badges to the README
cd cool-cli && npx ossready badges --write

# Custom Code of Conduct contact
npx ossready init cool-cli --name cool-cli --coc-email mods@example.org

# Security advisory form + private email contact
npx ossready init cool-cli --name cool-cli --github-owner YasinzHyper --security-email security@example.com

# Apache-2.0 + pnpm
npx ossready init enterprise-kit \
  --license apache-2.0 \
  --package-manager pnpm

# Yarn (Berry via Corepack)
npx ossready init yarn-kit --package-manager yarn

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
node dist/cli.js init /tmp/demo --dry-run          # interactive in a terminal
node dist/cli.js init /tmp/demo --dry-run --yes    # same, without prompts
node dist/cli.js doctor /tmp/demo
node dist/cli.js doctor . --strict   # this repo should pass 28/28
node dist/cli.js doctor /tmp/legacy --fix --dry-run
node dist/cli.js badges . --write    # refresh this README's badge block (no diff when current)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout and how to add a scaffolded file. AI coding agents should read [AGENTS.md](AGENTS.md).

## License

MIT © Mohammed Yasin Zuhayr ([YasinzHyper](https://github.com/YasinzHyper))
