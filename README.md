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
- README badges (CI, npm, license, OpenSSF Scorecard, CodeQL) in a managed block that [`ossready badges --write`](#ossready-badges) keeps current
- Workflows, Dependabot config, Issue Forms, the PR template, and `.editorconfig` that [`ossready sync`](#ossready-sync) keeps up to date with ossready's templates later (and `ossready doctor` tells you when they drift)
- Your real GitHub URLs in README badges, `package.json` links, and CODEOWNERS, from `--github-owner` or inferred from your git remote / `git config github.user`
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

# List every doctor check (id, level, description, --fix support)
ossready doctor --list

# Bring ossready-managed workflows and GitHub configs up to date (dry run; add --write to apply)
ossready sync .

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

Reference docs generated from the code: [docs/commands.md](docs/commands.md) lists every command and option with examples, and [docs/checks.md](docs/checks.md) lists every `ossready doctor` check.

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
| `--github-owner <owner>` | inferred from git (see below) | GitHub username or org for the README CI / CodeQL / Scorecard badges, `package.json` links, CODEOWNERS, FUNDING.yml, CITATION.cff, SUPPORT.md, and SECURITY.md |
| `-y`, `--yes` | off | Skip interactive prompts and use defaults for omitted options |
| `--force` | off | Overwrite existing files |
| `--dry-run` | off | Print planned files without writing |

When `--author` is omitted, the LICENSE copyright holder defaults to the project name (with the existing special-case for scaffolding into `.` without `--name`), and CITATION.cff uses a placeholder Anonymous author entry.

### README badges

The generated README.md starts with the same managed badge block that [`ossready badges`](#ossready-badges) writes, right after the `#` heading and between `<!-- ossready:badges:start -->` and `<!-- ossready:badges:end -->`. It is built by the same code from what the scaffold contains: CI, npm version and downloads, License, OpenSSF Scorecard, and CodeQL. Without a GitHub owner it holds only the npm and license badges, exactly what `ossready badges` prints without an owner; `ossready doctor --fix --github-owner <you>` (or `ossready badges --write --github-owner <you>`) fills in the rest later. Running `ossready badges --write` on a fresh scaffold gives no diff, and the block passes the scaffold's own Prettier `format:check`.

### GitHub owner

With a GitHub owner, the scaffolded README CI / CodeQL / Scorecard badges, `package.json` `repository` / `bugs` / `homepage`, `.github/CODEOWNERS`, `.github/FUNDING.yml`, CITATION.cff `url` / `repository-code`, SUPPORT.md issue/discussion links, and the SECURITY.md private advisory link use that owner.

When `--github-owner` is omitted (including with `--yes`), `ossready init` tries to infer it, in this order, and prints where it came from:

1. the target folder's `origin` git remote (`https://github.com/<owner>/…` or `git@github.com:<owner>/…`),
2. the parent folder's `origin` remote (handy for `ossready init my-lib` inside a clone),
3. `git config --global github.user`.

The same helper powers the interactive prompt's default, `ossready badges`, and `ossready doctor --fix` (which only looks at `package.json` links and the repo's own remote). Pass `--github-owner` to override it.

When no owner is given or found, the README badge block has only the npm and license badges, the familiar `OWNER` placeholders remain elsewhere (FUNDING.yml keeps `github` commented; CITATION.cff comments the URL fields), and `package.json` has no `repository` / `bugs` / `homepage`, so `doctor --strict` flags `pkg-links`. init's next steps say so, and you can add the links and the remaining badges at any time from the project folder:

```bash
ossready doctor --fix --github-owner <you>   # adds repository / bugs / homepage and the CI, CodeQL, Scorecard badges
ossready doctor --strict                     # now passes
```

With `--package-manager yarn`, the scaffold targets modern Yarn (Berry) through [Corepack](https://nodejs.org/api/corepack.html): `package.json` pins `"packageManager": "yarn@4.x"`, `.yarnrc.yml` sets `nodeLinker: node-modules` so ESLint, Vitest, and TypeScript work without Plug'n'Play setup, `vite` is listed explicitly (Vitest's peer, which Yarn does not auto-install), and `.gitignore` / `.prettierignore` cover `.yarn/*` (keeping `patches`, `plugins`, `releases`, `sdks`, `versions`) and `.pnp.*`. Generated CI runs `corepack enable`, then `yarn install` with `YARN_ENABLE_IMMUTABLE_INSTALLS=false` (no lockfile is committed yet), then `yarn <script>`. README and CONTRIBUTING show `corepack enable` + `yarn` commands; Dependabot keeps the `npm` ecosystem, which covers Yarn.

When `--security-email` is set, SECURITY.md includes that address as a private reporting contact alongside the advisory form (or instead of the `security@example.com` placeholder when no owner is set). Both `--coc-email` and `--security-email` are validated before any files are written; clearly invalid addresses exit non-zero with a friendly error.

### What gets written

```
LICENSE
README.md                       # with the managed badge block after the heading
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

The workflows, `.github/dependabot.yml`, the three Issue Forms, and `.editorconfig` start with a `# Managed by ossready` comment line; `.github/PULL_REQUEST_TEMPLATE.md` starts with the same text as an HTML comment (`<!-- Managed by ossready … -->`, which GitHub doesn't render). Edit them as you like: [`ossready sync`](#ossready-sync) uses the line to bring them up to date with newer templates later, and leaves alone any file where you delete it. See [Managed files](#managed-files) for the full list.

`AGENTS.md` follows the cross-tool [AGENTS.md](https://agents.md) convention read by Codex, Copilot, Cursor, Claude Code, Gemini CLI, and other coding agents. It gives the project overview, the setup and build / test / coverage / lint / typecheck / format commands for your package manager, the Prettier / ESLint / EditorConfig style rules, pull request and commit expectations (pointing to CONTRIBUTING.md), and a security note (pointing to SECURITY.md). `.github/copilot-instructions.md` is a short pointer to it for GitHub Copilot.

`package.json` includes a `test:coverage` script (`vitest run --coverage`) and `@vitest/coverage-v8`; `vitest.config.ts` enables the v8 provider with text + html reporters and enforces 80% coverage thresholds for lines, functions, branches, and statements (`coverage/` is gitignored). Scaffolded CI sets `permissions: contents: read` and cancels in-progress runs for the same branch. It uses `npm install` (or `pnpm install` / `yarn install` / `bun install`) without a lockfile cache so the first push succeeds, and runs lint, format:check, test, test:coverage, and build. After you commit a lockfile, switch to `npm ci` + `cache: npm` (or the equivalent frozen install for pnpm/yarn/bun).

A fresh scaffold passes its own `format:check`, `lint`, `typecheck`, `test`, `test:coverage`, and `build` out of the box; ossready's CI verifies this end to end on every change (for npm, pnpm, Yarn, and bun) by scaffolding a project, installing its dependencies, and running each script. CI also scaffolds a project without an owner and checks that `doctor --fix --github-owner` then makes `doctor --strict` pass and adds the owner's CI badge to the README.

Scaffolds also get `.github/workflows/publish.yml`: on `release: published` it installs and runs test + build (with Yarn via Corepack for yarn scaffolds, otherwise npm), then `npm publish --access public --provenance` (needs repo secret `NPM_TOKEN`; optionally enable [trusted publishing](https://docs.npmjs.com/trusted-publishers) on npmjs.com). Publishing always goes through `npm publish` so provenance and `NODE_AUTH_TOKEN` stay simple.

## `ossready doctor`

Already have a repo? `ossready doctor [directory]` audits it for the community health files and automation that `ossready init` scaffolds. By default it is read-only; add `--fix` to fill the gaps.

```bash
ossready doctor .                  # human-readable report
ossready doctor . --json           # machine-readable report (for CI or scripts)
ossready doctor . --strict         # also fail on missing recommended checks
ossready doctor . --fix --dry-run  # preview which missing files would be written
ossready doctor . --fix            # write them, then re-audit
ossready doctor . --fix --github-owner <you>  # also add package.json links and owner badges when the owner can't be inferred
ossready doctor --list             # list every check (id, level, description, --fix support); add --json for JSON
```

It runs 30 checks: 8 **required** ones (exit code `1` when missing: README, LICENSE, Code of Conduct, CONTRIBUTING, SECURITY policy, issue templates, pull request template, and a CI workflow triggered on `push` / `pull_request`) and 22 **recommended** ones (warnings; fail only with `--strict`). 11 of the recommended checks run only when they apply: 8 npm publish-readiness checks when a `package.json` exists, `workflow-actions`, `readme-badges`, and `managed-files`. **[docs/checks.md](docs/checks.md) describes every check**: what it looks at, when it runs, and whether `--fix` can fix it. `ossready doctor --list` prints the same catalogue in a terminal.

Community health files are found case-insensitively in the repo root, `.github/`, or `docs/` (the same places GitHub looks). Workflow checks (CI, CodeQL, Scorecard) inspect `.github/workflows/*.yml` contents rather than file names. A fresh `ossready init` scaffold with a GitHub owner passes every check; one without an owner passes everything except `pkg-links` until you run `ossready doctor --fix --github-owner <you>`.

### npm publish readiness (`package.json`)

The 8 `pkg-*` checks (name and version, description, license, links, engines, files, entry points, and publish access for scoped packages) are listed in [docs/checks.md](docs/checks.md#pkg-name-version). They are skipped (not failed) when there is no `package.json`, when it is `"private": true`, or when it isn't valid JSON. The report shows why, and `--json` includes `packageJson: { "status": "checked" }` or `{ "status": "skipped", "reason": "..." }`, plus each check with its `id`, `ok`, `group: "package-json"`, and an actionable `detail` when it fails.

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
- Workflows that `ossready init` generated (they start with the `# Managed by ossready` line) can be updated in one go with [`ossready sync --write`](#ossready-sync), which shows the diff first.

### README badges (`readme-badges`)

`doctor` builds the badge block `ossready badges` would generate for the repo and compares it with the one between `<!-- ossready:badges:start -->` and `<!-- ossready:badges:end -->` in the root `README.md`:

```text
  README badges (README.md, recommended):
    ⚠ README badges — README.md has no <!-- ossready:badges:start --> … <!-- ossready:badges:end --> badge block — run `ossready badges --write` or `ossready doctor --fix`.
```

- It warns when the markers are missing, when the block is out of date (for example after adding `codeql.yml` or a license), or when only one marker is present.
- The GitHub owner comes from `doctor --github-owner`, then GitHub URLs in `package.json`, then the repo's own `origin` remote (the same sources as `--fix`; `git config github.user` is not used). Without an owner the expected block has only the badges that don't need one, so a fresh scaffold without an owner still passes.
- No root `README.md` means the check is skipped, not failed. `--json` includes `readmeBadges: { "status": "checked", "state": "current" | "missing" | "outdated" | "malformed", "owner", "badges": [...], "needsOwner": [...] }` or `{ "status": "skipped", "reason": "..." }`.

### ossready-managed files (`managed-files`)

`doctor` runs the same comparison as [`ossready sync`](#ossready-sync) (a dry run, in-process) and warns when a file that still carries the ossready marker line differs from what the current templates render for the repo:

```text
  ossready-managed files (recommended):
    ⚠ ossready-managed files up to date — 1 stale:
      .github/workflows/stale.yml (+1 -1)
      Preview with `ossready sync`, then apply with `ossready sync --write` or `ossready doctor --fix`.
```

- Only marked files count. A missing managed file, or one whose marker line you deleted, never fails this check (the other checks already cover whether the file exists).
- When no file in the repo carries the marker, the check is skipped and not counted.
- The values come from the same sources as `sync` and `--fix` (`doctor --github-owner`, `package.json`, lockfiles, the `origin` remote), and a file that would need the owner to re-render is reported, not failed.
- `--json` includes `managedFiles: { "status": "checked", "files": [{ "path", "status", "managed", "reason"?, "added"?, "removed"? }], "stale": [...] }` or `{ "status": "skipped", "reason": "..." }`, where `status` is sync's `up-to-date`, `outdated`, `missing`, or `skipped`.

### `--fix`

`ossready doctor --fix` writes only the files behind failing checks, using the same templates as `ossready init`, and **never overwrites** anything that already exists. It does not touch `tsconfig.json` or `src/`. The only `package.json` change it makes is adding missing `repository` / `bugs` / `homepage` links, and only when the GitHub owner is known (from `--github-owner`, existing GitHub URLs in `package.json`, or the `origin` git remote); otherwise it lists `pkg-links` under "Not fixed automatically" with the `--github-owner` command to run. Keys that already exist are never changed. The other publish-readiness checks are report-only and listed under "Not fixed automatically". `workflow-actions` is report-only too: `--fix` never rewrites unmarked workflows and lists it under "Not fixed automatically" with a hint to bump the pins or let Dependabot's `github-actions` ecosystem do it, and to use `ossready sync --write` for ossready-managed workflows. For `managed-files`, `--fix` runs the same write as `ossready sync --write` (never `--force`, never `--add-missing`), so only stale files that still carry the marker are updated, and it lists them under "Updated stale ossready-managed files". For `readme-badges`, `--fix` runs the same write as `ossready badges --write` (only the text between the markers changes, and it runs after the other files and links are written) when the owner is known; without one it lists `readme-badges` under "Not fixed automatically" with `ossready badges --write --github-owner <you>`, and a README with only one marker is left for you to fix. A README that `--fix` creates gets the badge block for what the repo has. A missing `AGENTS.md` is filled together with `.github/copilot-instructions.md`, using the detected package manager's commands. Values are inferred from the repo:

| Value | Inferred from | Override |
|-------|---------------|----------|
| Project name / description | `package.json` `name` / `description` (falls back to the folder name) | — |
| GitHub owner (CODEOWNERS, SECURITY, SUPPORT, FUNDING, CITATION, `package.json` links, README badges) | `package.json` `repository` / `bugs` / `homepage`, then the `origin` git remote | `--github-owner <owner>` |
| Copyright holder / CITATION author | `package.json` `author` | `--author <name>` |
| License | `package.json` `license` (`MIT` or `Apache-2.0`) | `--license mit\|apache-2.0` |
| Package manager (CI template, AGENTS.md) | `pnpm-lock.yaml` / `bun.lock(b)` / `yarn.lock` or `.yarnrc.yml`, then `package.json` `packageManager`, else npm | — |
| Code of Conduct contact | GitHub owner link | `--coc-email <email>` |
| Security contact email | _(omit — advisory form / placeholder only)_ | `--security-email <email>` |

Picking a license is a legal decision, so `--fix` leaves `LICENSE` missing (and the check failing) unless the license is `MIT` / `Apache-2.0` in `package.json` or passed with `--license`. If `--fix` adds `.github/workflows/ci.yml`, review it before pushing: the template runs `lint`, `format:check`, `test`, and `build` scripts that an older repo may not have. `--json` output includes a `fix` object listing created, existing, and skipped files, plus `packageJson.add` when links were added, `readmeBadges` when the badge block was written, and `managedFiles.update` when stale managed files were updated.

ossready dogfoods this: its own community health files are generated from the same templates, `tests/dogfood.test.ts` keeps them in sync, and CI runs `ossready doctor . --strict` on every push and pull request (currently 30/30: 19 file checks, 8 `package.json` checks, `workflow-actions`, `readme-badges`, and `managed-files`). Its `AGENTS.md` is written for ossready itself (real commands and guard tests), so it is checked for presence rather than byte-compared to the template.

## `ossready sync`

Scaffolded a while ago? `ossready sync [directory]` brings the files that `ossready init` owns up to date with the current templates: the workflows (`ci`, `release`, `publish`, `codeql`, `dependency-review`, `scorecard`, `stale`, `lock`), `.github/dependabot.yml`, the Issue Forms (`bug_report.yml`, `feature_request.yml`, `config.yml`), `.github/PULL_REQUEST_TEMPLATE.md`, and `.editorconfig`. It never touches README, LICENSE, `package.json`, SECURITY.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md, or your source code.

```bash
ossready sync .                 # dry run: one line per file, with a unified diff for each change
ossready sync . --quiet         # dry run with a +added -removed summary instead of diffs
ossready sync . --write         # apply the changes
ossready sync . --add-missing   # also plan managed files that don't exist yet (add --write to create them)
ossready sync . --force         # also update files without the marker line (see below)
ossready sync . --json          # machine-readable result
ossready sync . --github-owner <you> --package-manager pnpm   # override the inferred values
```

```text
ossready sync (dry run) → /path/to/my-lib
  Templates rendered for "my-lib", npm, owner octo

  ✔ .github/workflows/ci.yml — up to date
  ~ .github/workflows/stale.yml — would update (+1 -1)
      --- a/.github/workflows/stale.yml
      +++ b/.github/workflows/stale.yml
      @@ -16,7 +16,7 @@
      ...
      -        uses: actions/stale@v9
      +        uses: actions/stale@v11
      ...
  + .github/workflows/dependency-review.yml — missing (would create only with --add-missing)
  · .github/workflows/codeql.yml — skipped (not managed by ossready: no marker line; --force overwrites it)
```

- **Dry run by default.** Nothing is written without `--write`. The exit code is `0` when everything is up to date and `1` when changes are pending, so `ossready sync` works as a CI check. After a successful `--write` it is `0`. `ossready doctor` runs the same comparison as its `managed-files` check, and `doctor --fix` applies it.
- **Ownership marker.** Every managed file starts with the marker line: ``# Managed by ossready — edit freely; `ossready sync` previews template updates (delete this line to opt out)`` in YAML and `.editorconfig`, and the same text as an HTML comment (``<!-- Managed by ossready — … -->`` followed by a blank line) in the Markdown PR template. `sync` only updates files whose first line is still that marker. Files without it are reported as `skipped (not managed by ossready …)` and left alone unless you pass `--force`. If an unmarked file matches the template exactly (for example one scaffolded before the marker existed), the reason says so, and `--force` adopts it by adding the line.
- **Your repo's real values.** Templates are rendered by the same code as `ossready init`, with the values `doctor --fix` infers: the name from `package.json`, the GitHub owner from `package.json` links or the `origin` remote, and the package manager from lockfiles or the `packageManager` field. A fresh scaffold without a lockfile falls back to the setup steps in its managed `ci.yml`. `--github-owner` and `--package-manager` override the inferred values.
- **No owner.** Files that embed the GitHub owner (the Issue Forms `config.yml` security link) are compared with the `OWNER` placeholder version. If yours already names a real owner, `sync` skips it and asks for `--github-owner`, so it never writes placeholders over real URLs.
- `--json` prints `{ directory, write, options: { name, packageManager, githubOwner }, files: [{ path, status, pending, written, reason?, added?, removed?, diff? }], pending, written, ok }`, where `status` is `up-to-date`, `outdated`, `missing`, or `skipped`.

### Managed files

A file is managed when its rendering depends only on values ossready can read back from the repo (name, owner, package manager) and it isn't something you are expected to rewrite:

| Managed (carries the marker) | Not managed, and why |
|------------------------------|----------------------|
| `.github/workflows/*.yml` (all eight templates) | README.md, LICENSE, `package.json`, CHANGELOG.md, `src/`: yours from day one |
| `.github/dependabot.yml` | SECURITY.md: embeds the `--security-email` contact (not recoverable from the repo) and a supported-versions table you are meant to edit |
| `.github/ISSUE_TEMPLATE/*.yml` (bug, feature, config) | CODE_OF_CONDUCT.md: embeds the `--coc-email` contact (not recoverable from the repo) |
| `.github/PULL_REQUEST_TEMPLATE.md` (HTML comment marker) | CONTRIBUTING.md, SUPPORT.md, AGENTS.md: meant to be rewritten for your project |
| `.editorconfig` (`#` marker) | CODEOWNERS, FUNDING.yml, CITATION.cff: filled in by hand |

**Opting a file out:** delete its marker line (the first line) and edit freely. From then on `sync` reports it as skipped, `doctor`'s `managed-files` check ignores it, and `doctor --fix` never touches it. Put the line back (or run `ossready sync --force` on a file that matches the template) to opt back in.

ossready runs `ossready sync .` on itself in CI and has nothing pending: its `codeql`, `lock`, `stale`, `scorecard`, and `publish` workflows, `dependabot.yml`, Issue Forms, PR template, and `.editorconfig` carry the marker and match the templates byte for byte (`tests/dogfood.test.ts`). Three files are intentional exceptions. ossready's `ci.yml` has jobs the template doesn't (the doctor and sync dogfood steps, the scaffold e2e jobs, and packed-install), so it has no marker and is reported as skipped. `release.yml` and `dependency-review.yml` aren't used here, so they're reported as missing, and only `--add-missing` would create them. CI also runs `ossready sync` on fresh npm, pnpm, Yarn, bun, and no-owner scaffolds, where it must find nothing pending.

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

With `--write`, the block goes between `<!-- ossready:badges:start -->` and `<!-- ossready:badges:end -->` in README.md, with a blank line around the badges so it stays Prettier-formatted. If the markers aren't there yet, it is inserted right after the first `#` heading (or at the top when there is none). Only the text between the markers is ever replaced, and running `--write` again on an unchanged repo gives no diff. `ossready init` writes the same block into new projects, and `ossready doctor` checks it (`readme-badges`).

The owner comes from GitHub URLs in `package.json` (`repository`, `bugs`, `homepage`), then the sources [`init`](#github-owner) uses (target `origin` remote, then the parent's, then `git config github.user`); the repo name comes from those `package.json` URLs, then the `origin` remote, then `package.json` `name` (without its scope), then the folder name. Without an owner, the CI, CodeQL, and Scorecard badges are left out and a hint suggests `--github-owner`; `--write` then exits `1` without touching README.md. ossready's own badge block above is generated this way, and `tests/badges.test.ts` checks it stays current.

## Examples

```bash
# Interactive: answer the questions, Enter accepts each default
npx ossready init cool-cli

# MIT + npm (default), no questions
npx ossready init cool-cli --name cool-cli --description "A cool CLI" --yes

# Custom copyright holder
npx ossready init cool-cli --name cool-cli --author "Jane Doe"

# Real GitHub owner URLs (badges, package.json, CODEOWNERS)
npx ossready init cool-cli --name cool-cli --github-owner YasinzHyper

# Scaffolded without an owner? Add the package.json links and owner badges later
cd cool-cli && npx ossready doctor --fix --github-owner YasinzHyper

# Pick up newer workflow templates in an existing scaffold (review the diff, then write)
cd cool-cli && npx ossready sync && npx ossready sync --write

# Add CI / npm / license / Scorecard / CodeQL badges to an existing README
cd my-old-lib && npx ossready badges --write

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
npm run docs:gen                     # regenerate docs/checks.md and docs/commands.md (tests fail when they drift)
node dist/cli.js --help
node dist/cli.js init /tmp/demo --name demo --force
node dist/cli.js init /tmp/demo --name demo --dry-run
node dist/cli.js init /tmp/demo --dry-run          # interactive in a terminal
node dist/cli.js init /tmp/demo --dry-run --yes    # same, without prompts
node dist/cli.js doctor /tmp/demo
node dist/cli.js doctor . --strict   # this repo should pass 30/30
node dist/cli.js doctor --list       # the check catalogue (src/checks.ts)
node dist/cli.js doctor /tmp/legacy --fix --dry-run
node dist/cli.js sync .              # this repo: nothing pending (ci.yml skipped, release / dependency-review missing)
node dist/cli.js sync /tmp/demo --write
node dist/cli.js badges . --write    # refresh this README's badge block (no diff when current)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout and how to add a scaffolded file. AI coding agents should read [AGENTS.md](AGENTS.md).

## License

MIT © Mohammed Yasin Zuhayr ([YasinzHyper](https://github.com/YasinzHyper))
