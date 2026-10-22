/**
 * The `ossready doctor` check catalogue: one entry per check, in report order.
 *
 * It is the single source for each check's id, title, level, description and
 * `--fix` support. `ossready doctor` takes its ids, labels and levels from it,
 * `ossready doctor --list` prints it, and `npm run docs:gen` renders it into
 * docs/checks.md. Text uses Markdown backticks for code; terminal output
 * strips them (see `plainText`). Pure data, no imports.
 */

export type DoctorLevel = "required" | "recommended";

/** Whether `ossready doctor --fix` can fix a failing check. */
export type FixSupport = "yes" | "partial" | "no";

/** Checks that run only when they apply (see `CheckInfo.runsWhen`). */
export type CheckGroup = "package-json" | "workflow-actions" | "readme-badges" | "managed-files";

export interface CheckInfo {
  /** Stable identifier, as in `doctor --json` results */
  id: string;
  /** Human-readable label, as in the doctor report */
  title: string;
  level: DoctorLevel;
  /** One sentence: what the check wants to find */
  description: string;
  fixable: FixSupport;
  /** What `ossready doctor --fix` does for it, or why it can't */
  fix: string;
  /** The files or fields the check inspects */
  looksAt: string;
  /** Set on checks that run only when they apply */
  group?: CheckGroup;
  /** When a grouped check runs (otherwise it always runs) */
  runsWhen?: string;
}

const PACKAGE_JSON_RUNS = 'only when a `package.json` exists, is valid JSON and is not `"private": true`';
const BY_HAND = "Report only: edit `package.json` by hand.";

export const CHECK_CATALOG: readonly CheckInfo[] = [
  {
    id: "readme",
    title: "README",
    level: "required",
    description: "A README that explains what the project does and how to use it.",
    fixable: "yes",
    fix: "Writes `README.md` from the template, with the badge block.",
    looksAt:
      "`README.md`, `README`, `README.markdown`, `README.rst` or `README.txt` in the repo root, `.github/` or `docs/` (any case)",
  },
  {
    id: "license",
    title: "License",
    level: "required",
    description: "A license file, so others can legally reuse the code.",
    fixable: "partial",
    fix: "Writes `LICENSE` only when the license is known (`MIT` or `Apache-2.0` in `package.json`, or `--license`): picking one is your call.",
    looksAt: "`LICENSE`, `LICENSE.md`, `LICENSE.txt`, `LICENCE`, `LICENCE.md` or `COPYING` in the repo root (any case)",
  },
  {
    id: "code-of-conduct",
    title: "Code of Conduct",
    level: "required",
    description: "A Code of Conduct that sets community standards.",
    fixable: "yes",
    fix: "Writes `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1).",
    looksAt:
      "`CODE_OF_CONDUCT.md`, `CODE_OF_CONDUCT` or `CODE_OF_CONDUCT.txt` in the repo root, `.github/` or `docs/` (any case)",
  },
  {
    id: "contributing",
    title: "Contributing guide",
    level: "required",
    description: "A guide that tells contributors how to set up, test and submit changes.",
    fixable: "yes",
    fix: "Writes `CONTRIBUTING.md`.",
    looksAt:
      "`CONTRIBUTING.md`, `CONTRIBUTING`, `CONTRIBUTING.txt` or `CONTRIBUTING.rst` in the repo root, `.github/` or `docs/` (any case)",
  },
  {
    id: "security",
    title: "Security policy",
    level: "required",
    description: "A security policy that explains how to report vulnerabilities privately.",
    fixable: "yes",
    fix: "Writes `SECURITY.md` (with `--security-email` when given).",
    looksAt: "`SECURITY.md`, `SECURITY` or `SECURITY.txt` in the repo root, `.github/` or `docs/` (any case)",
  },
  {
    id: "issue-templates",
    title: "Issue templates",
    level: "required",
    description: "Issue templates or Issue Forms that keep bug reports and feature requests actionable.",
    fixable: "yes",
    fix: "Writes the bug report and feature request Issue Forms plus `config.yml`.",
    looksAt:
      "a `.yml`, `.yaml` or `.md` file in `.github/ISSUE_TEMPLATE/` other than `config.yml`, or `ISSUE_TEMPLATE.md` in the repo root, `.github/` or `docs/`",
  },
  {
    id: "pr-template",
    title: "Pull request template",
    level: "required",
    description: "A pull request template that asks for context, tests and a checklist.",
    fixable: "yes",
    fix: "Writes `.github/PULL_REQUEST_TEMPLATE.md`.",
    looksAt:
      "`PULL_REQUEST_TEMPLATE.md` or `pull_request_template.md` in the repo root, `.github/` or `docs/`, or a `.md` file in `.github/PULL_REQUEST_TEMPLATE/`",
  },
  {
    id: "ci",
    title: "CI workflow",
    level: "required",
    description: "A GitHub Actions workflow that runs on every push or pull request.",
    fixable: "yes",
    fix: "Writes `.github/workflows/ci.yml`; review it before pushing, since it runs the lint, format:check, test and build scripts.",
    looksAt: "the contents of `.github/workflows/*.yml` and `*.yaml`: a `push` or `pull_request` trigger",
  },
  {
    id: "support",
    title: "Support resources",
    level: "recommended",
    description: "Support resources that point users to the right place for questions and help.",
    fixable: "yes",
    fix: "Writes `SUPPORT.md`.",
    looksAt: "`SUPPORT.md`, `SUPPORT` or `SUPPORT.txt` in the repo root, `.github/` or `docs/` (any case)",
  },
  {
    id: "changelog",
    title: "Changelog",
    level: "recommended",
    description: "A changelog that records notable changes per release (Keep a Changelog).",
    fixable: "yes",
    fix: "Writes `CHANGELOG.md`.",
    looksAt: "`CHANGELOG.md`, `CHANGELOG`, `HISTORY.md` or `CHANGES.md` in the repo root or `docs/` (any case)",
  },
  {
    id: "codeowners",
    title: "CODEOWNERS",
    level: "recommended",
    description: "A CODEOWNERS file, so maintainers are asked for reviews automatically.",
    fixable: "yes",
    fix: "Writes `.github/CODEOWNERS` (with the GitHub owner when known).",
    looksAt: "`CODEOWNERS` in the repo root, `.github/` or `docs/`",
  },
  {
    id: "dependabot",
    title: "Dependabot config",
    level: "recommended",
    description: "Dependabot config that keeps dependencies and GitHub Actions up to date.",
    fixable: "yes",
    fix: "Writes `.github/dependabot.yml` (npm and GitHub Actions, weekly).",
    looksAt: "`.github/dependabot.yml` or `.github/dependabot.yaml`",
  },
  {
    id: "codeql",
    title: "CodeQL code scanning",
    level: "recommended",
    description: "CodeQL code scanning that catches security bugs.",
    fixable: "yes",
    fix: "Writes `.github/workflows/codeql.yml`.",
    looksAt:
      "the contents of `.github/workflows/*.yml` and `*.yaml`: a `github/codeql-action/init` or `analyze` step (an `upload-sarif` step alone does not count)",
  },
  {
    id: "scorecard",
    title: "OpenSSF Scorecard",
    level: "recommended",
    description: "An OpenSSF Scorecard workflow that tracks supply-chain security.",
    fixable: "yes",
    fix: "Writes `.github/workflows/scorecard.yml`.",
    looksAt: "the contents of `.github/workflows/*.yml` and `*.yaml`: `ossf/scorecard-action`",
  },
  {
    id: "funding",
    title: "Funding links",
    level: "recommended",
    description: "Funding links that show a Sponsor button on the repo.",
    fixable: "yes",
    fix: "Writes `.github/FUNDING.yml` (with the GitHub owner when known).",
    looksAt: "`.github/FUNDING.yml` or `.github/FUNDING.yaml`",
  },
  {
    id: "citation",
    title: "Citation metadata",
    level: "recommended",
    description: "Citation File Format metadata for GitHub's Cite this repository button.",
    fixable: "yes",
    fix: "Writes `CITATION.cff`.",
    looksAt: "`CITATION.cff` in the repo root",
  },
  {
    id: "editorconfig",
    title: "EditorConfig",
    level: "recommended",
    description: "An EditorConfig file for consistent indentation and line endings across editors.",
    fixable: "yes",
    fix: "Writes `.editorconfig`.",
    looksAt: "`.editorconfig` in the repo root",
  },
  {
    id: "gitignore",
    title: ".gitignore",
    level: "recommended",
    description: "A `.gitignore` that keeps build output and secrets out of git.",
    fixable: "yes",
    fix: "Writes `.gitignore`.",
    looksAt: "`.gitignore` in the repo root",
  },
  {
    id: "agents-md",
    title: "AI agent instructions",
    level: "recommended",
    description: "An `AGENTS.md` that gives AI coding agents the setup, test and style rules.",
    fixable: "yes",
    fix: "Writes `AGENTS.md` and `.github/copilot-instructions.md` with the detected package manager's commands.",
    looksAt: "`AGENTS.md` in the repo root",
  },
  {
    id: "pkg-name-version",
    title: "package.json name and version",
    level: "recommended",
    description: "`package.json` has a `name` and a semver `version`; npm cannot publish without them.",
    fixable: "no",
    fix: BY_HAND,
    looksAt: "`package.json` `name` and `version`",
    group: "package-json",
    runsWhen: PACKAGE_JSON_RUNS,
  },
  {
    id: "pkg-description",
    title: "package.json description",
    level: "recommended",
    description: "`package.json` has a one-line `description` for npm search and the package page.",
    fixable: "no",
    fix: BY_HAND,
    looksAt: "`package.json` `description`",
    group: "package-json",
    runsWhen: PACKAGE_JSON_RUNS,
  },
  {
    id: "pkg-license",
    title: "package.json license",
    level: "recommended",
    description:
      "`package.json` `license` is an SPDX id that matches the LICENSE file when that file is recognisably MIT or Apache-2.0.",
    fixable: "no",
    fix: BY_HAND,
    looksAt: "`package.json` `license` and the `LICENSE` file in the repo root",
    group: "package-json",
    runsWhen: PACKAGE_JSON_RUNS,
  },
  {
    id: "pkg-links",
    title: "package.json repository, bugs and homepage",
    level: "recommended",
    description: "`package.json` has `repository`, `bugs` and `homepage`, so npm links back to the repo.",
    fixable: "partial",
    fix: "Adds the missing links when the GitHub owner is known (`--github-owner`, GitHub URLs in `package.json`, or the `origin` remote); existing values are never changed.",
    looksAt: "`package.json` `repository`, `bugs` and `homepage`",
    group: "package-json",
    runsWhen: PACKAGE_JSON_RUNS,
  },
  {
    id: "pkg-engines",
    title: "package.json engines.node",
    level: "recommended",
    description: "`package.json` declares the supported Node.js range in `engines.node`.",
    fixable: "no",
    fix: BY_HAND,
    looksAt: "`package.json` `engines.node`",
    group: "package-json",
    runsWhen: PACKAGE_JSON_RUNS,
  },
  {
    id: "pkg-files",
    title: "Published files allowlist",
    level: "recommended",
    description: "A `files` allowlist or an `.npmignore`, so npm publish does not ship everything.",
    fixable: "no",
    fix: BY_HAND,
    looksAt: "`package.json` `files`, then `.npmignore` in the repo root",
    group: "package-json",
    runsWhen: PACKAGE_JSON_RUNS,
  },
  {
    id: "pkg-entry",
    title: "Entry points (main / exports / bin)",
    level: "recommended",
    description:
      "`main`, `exports` or `bin` point at relative paths inside the package, not at `.ts` sources, and are covered by `files`.",
    fixable: "no",
    fix: BY_HAND,
    looksAt: "`package.json` `main`, `exports`, `bin` and `files`",
    group: "package-json",
    runsWhen: PACKAGE_JSON_RUNS,
  },
  {
    id: "pkg-publish-access",
    title: "publishConfig.access for scoped packages",
    level: "recommended",
    description: "Scoped packages set `publishConfig.access`, since npm publishes them as restricted by default.",
    fixable: "no",
    fix: BY_HAND,
    looksAt: "`package.json` `name` and `publishConfig.access`",
    group: "package-json",
    runsWhen: PACKAGE_JSON_RUNS,
  },
  {
    id: "workflow-actions",
    title: "Current GitHub Action versions",
    level: "recommended",
    description:
      "Known actions are not pinned to an older major than ossready's templates use; commit-SHA pins are info only.",
    fixable: "no",
    fix: "Report only: bump the pins or let Dependabot do it; `ossready sync --write` updates ossready-managed workflows.",
    looksAt: "`uses:` lines in `.github/workflows/*.yml` and `*.yaml`, compared with `src/templates/actions.ts`",
    group: "workflow-actions",
    runsWhen: "only when `.github/workflows/*.yml` or `*.yaml` files exist",
  },
  {
    id: "readme-badges",
    title: "README badges",
    level: "recommended",
    description: "The badge block in `README.md` matches what `ossready badges` would generate.",
    fixable: "partial",
    fix: "Runs `ossready badges --write` when the GitHub owner is known; a README with only one marker is left for you to fix.",
    looksAt: "the `ossready:badges` start and end markers in the root `README.md`",
    group: "readme-badges",
    runsWhen: "only when a root `README.md` exists",
  },
  {
    id: "managed-files",
    title: "ossready-managed files up to date",
    level: "recommended",
    description: "Files that start with the ossready marker line match the current templates.",
    fixable: "yes",
    fix: "Runs `ossready sync --write` for stale marked files (never `--force` or `--add-missing`).",
    looksAt:
      "the files `ossready sync` manages (workflows, `dependabot.yml`, Issue Forms, the PR template and `.editorconfig`)",
    group: "managed-files",
    runsWhen: "only when at least one file carries the ossready marker line",
  },
];

const BY_ID = new Map(CHECK_CATALOG.map((c) => [c.id, c]));

/** The catalogue entry for a check id; throws for an unknown id. */
export function checkInfo(id: string): CheckInfo {
  const info = BY_ID.get(id);
  if (!info) throw new Error(`Unknown doctor check "${id}"`);
  return info;
}

/** Catalogue text for a terminal: Markdown backticks removed. */
export function plainText(text: string): string {
  return text.replace(/`/g, "");
}
