import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  CHECK_CATALOG,
  checkInfo,
  plainText,
  type CheckGroup,
  type DoctorLevel,
  type FixSupport,
} from "../checks.js";
import { classifyActionRef } from "../templates/actions.js";
import { isManaged } from "../templates/managed.js";
import { GITHUB_OWNER_RE } from "../utils/github.js";
import {
  BADGES_END,
  BADGES_START,
  BADGES_WRITE_COMMAND,
  badgeBlockState,
  detectBadges,
  type BadgeBlockState,
  type BadgeId,
} from "./badges.js";
import { applyFix, formatFixPlan, type FixFlags, type FixPlan } from "./fix.js";
import {
  evaluatePackageJson,
  PACKAGE_JSON_CHECKS,
  packageJsonSkipReason,
  readPackageJson,
  type PackageJsonStatus,
} from "./packageJson.js";
import { runSync, type SyncReport, type SyncStatus } from "./sync.js";

export { PACKAGE_JSON_CHECKS, type PackageJsonStatus } from "./packageJson.js";
export type { CheckGroup, DoctorLevel, FixSupport } from "../checks.js";

export interface DoctorCheck {
  /** Stable identifier (useful for --json consumers) */
  id: string;
  /** Human-readable label */
  label: string;
  level: DoctorLevel;
  /** File ossready would scaffold to satisfy this check */
  scaffoldPath: string;
  /** Short reason shown when the check fails */
  hint: string;
  /**
   * Set on checks that only run when they apply: the npm publish-readiness
   * checks (package.json), the GitHub Actions version check (workflows), the
   * README badge check (README.md), and the managed-files check (files with
   * the ossready marker line).
   */
  group?: CheckGroup;
}

export interface DoctorResult extends DoctorCheck {
  ok: boolean;
  /** Relative path that satisfied the check (when ok) */
  foundAt?: string;
  /** Specific, actionable reason a package.json check failed */
  detail?: string;
}

/** One `uses: owner/repo@ref` line in a workflow. */
export interface WorkflowActionUse {
  /** Workflow path relative to the repo root */
  file: string;
  /** 1-based line number */
  line: number;
  action: string;
  ref: string;
}

export interface WorkflowActionFinding extends WorkflowActionUse {
  /** Ref ossready recommends (see src/templates/actions.ts) */
  recommended: string;
}

export type WorkflowActionsStatus =
  | {
      status: "checked";
      /** Workflow files that were scanned */
      files: string[];
      /** Known actions pinned to an older major than recommended (these fail the check) */
      outdated: WorkflowActionFinding[];
      /** Known actions pinned to a commit SHA: informational only, never failing */
      shaPinned: WorkflowActionFinding[];
    }
  | { status: "skipped"; reason: string };

export type ReadmeBadgesStatus =
  | {
      status: "checked";
      /** `current` passes; `missing` (no markers), `outdated`, and `malformed` (one marker) warn */
      state: BadgeBlockState;
      /** GitHub owner the expected block was built with, when one is known */
      owner?: string;
      /** Badges `ossready badges` would put in the block */
      badges: BadgeId[];
      /** Badges left out because no owner is known */
      needsOwner: BadgeId[];
    }
  | { status: "skipped"; reason: string };

/** One template-owned file as the managed-files check sees it (from `ossready sync`'s comparison). */
export interface ManagedFileState {
  /** Path relative to the repo root */
  path: string;
  /** `ossready sync`'s status: only `outdated` fails the check */
  status: SyncStatus;
  /** Whether the file exists and starts with the ossready marker line */
  managed: boolean;
  /** Why sync skips the file, or why a missing one isn't created */
  reason?: string;
  /** Lines `ossready sync --write` would add / remove (outdated files) */
  added?: number;
  removed?: number;
}

export type ManagedFilesStatus =
  | {
      status: "checked";
      /** Every template-owned file sync looked at, managed or not */
      files: ManagedFileState[];
      /** Managed files that differ from the current template rendering (these fail the check) */
      stale: string[];
    }
  | { status: "skipped"; reason: string };

export interface DoctorReport {
  directory: string;
  results: DoctorResult[];
  passed: number;
  total: number;
  missingRequired: number;
  missingRecommended: number;
  /** Whether the package.json publish-readiness checks ran (skipped without package.json or when private) */
  packageJson: PackageJsonStatus;
  /** Whether the GitHub Actions version check ran (skipped without workflow files) */
  workflowActions: WorkflowActionsStatus;
  /** Whether the README badge check ran (skipped without a root README.md) */
  readmeBadges: ReadmeBadgesStatus;
  /** Whether the managed-files check ran (skipped when no file carries the ossready marker) */
  managedFiles: ManagedFilesStatus;
}

export interface DoctorFlags extends Omit<FixFlags, "dryRun"> {
  json?: boolean;
  /** Print the report as GitHub-flavored Markdown (job summaries, PR comments) */
  markdown?: boolean;
  strict?: boolean;
  /** Write missing files from ossready's templates (never overwrites) */
  fix?: boolean;
  /** With --fix: show what would be written without touching disk */
  dryRun?: boolean;
}

export interface RunDoctorOptions {
  /** GitHub owner for the readme-badges check (default: package.json links, then the origin remote) */
  githubOwner?: string;
}

/**
 * GitHub looks for community health files in the repo root, `.github/`, and `docs/`.
 * See https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions
 */
const COMMUNITY_DIRS = ["", ".github", "docs"];

const WORKFLOWS_DIR = ".github/workflows";

type Matcher = (root: string) => Promise<string | undefined>;

interface CheckDef extends DoctorCheck {
  match: Matcher;
}

/** id, label and level of a check, from the catalogue in src/checks.ts. */
function catalogued(id: string): Pick<DoctorCheck, "id" | "label" | "level"> {
  const info = checkInfo(id);
  return { id: info.id, label: info.title, level: info.level };
}

/** Case-insensitive lookup of `names` inside `dirs` (relative to root). Returns the relative path found. */
function anyFile(dirs: string[], names: string[]): Matcher {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  return async (root) => {
    for (const dir of dirs) {
      const entries = await listFiles(join(root, dir));
      const hit = entries.find((e) => wanted.has(e.toLowerCase()));
      if (hit) return dir ? `${dir}/${hit}` : hit;
    }
    return undefined;
  };
}

/** At least one file inside `dir` whose name matches `pattern`. */
function anyFileIn(dir: string, pattern: RegExp): Matcher {
  return async (root) => {
    const entries = await listFiles(join(root, dir));
    const hit = entries.find((e) => pattern.test(e));
    return hit ? `${dir}/${hit}` : undefined;
  };
}

/** A GitHub Actions workflow whose contents match `pattern`. */
function workflowContaining(pattern: RegExp): Matcher {
  return async (root) => {
    const dir = WORKFLOWS_DIR;
    const entries = await listFiles(join(root, dir));
    for (const entry of entries.filter((e) => /\.ya?ml$/i.test(e)).sort()) {
      try {
        const text = await readFile(join(root, dir, entry), "utf8");
        if (pattern.test(text)) return `${dir}/${entry}`;
      } catch {
        // unreadable file — ignore
      }
    }
    return undefined;
  };
}

function firstOf(...matchers: Matcher[]): Matcher {
  return async (root) => {
    for (const m of matchers) {
      const hit = await m(root);
      if (hit) return hit;
    }
    return undefined;
  };
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

const CHECKS: CheckDef[] = [
  {
    ...catalogued("readme"),
    scaffoldPath: "README.md",
    hint: "Explain what the project does and how to use it.",
    match: anyFile(COMMUNITY_DIRS, ["README.md", "README", "README.markdown", "README.rst", "README.txt"]),
  },
  {
    ...catalogued("license"),
    scaffoldPath: "LICENSE",
    hint: "Without a license, nobody can legally reuse your code.",
    match: anyFile([""], ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENCE.md", "COPYING"]),
  },
  {
    ...catalogued("code-of-conduct"),
    scaffoldPath: "CODE_OF_CONDUCT.md",
    hint: "Set community standards (ossready uses Contributor Covenant 2.1).",
    match: anyFile(COMMUNITY_DIRS, ["CODE_OF_CONDUCT.md", "CODE_OF_CONDUCT", "CODE_OF_CONDUCT.txt"]),
  },
  {
    ...catalogued("contributing"),
    scaffoldPath: "CONTRIBUTING.md",
    hint: "Tell contributors how to set up, test, and submit changes.",
    match: anyFile(COMMUNITY_DIRS, ["CONTRIBUTING.md", "CONTRIBUTING", "CONTRIBUTING.txt", "CONTRIBUTING.rst"]),
  },
  {
    ...catalogued("security"),
    scaffoldPath: "SECURITY.md",
    hint: "Explain how to privately report vulnerabilities.",
    match: anyFile(COMMUNITY_DIRS, ["SECURITY.md", "SECURITY", "SECURITY.txt"]),
  },
  {
    ...catalogued("issue-templates"),
    scaffoldPath: ".github/ISSUE_TEMPLATE/bug_report.yml",
    hint: "Structured bug/feature forms keep reports actionable.",
    match: firstOf(
      anyFileIn(".github/ISSUE_TEMPLATE", /^(?!config\.ya?ml$).+\.(ya?ml|md)$/i),
      anyFile(COMMUNITY_DIRS, ["ISSUE_TEMPLATE.md"]),
    ),
  },
  {
    ...catalogued("pr-template"),
    scaffoldPath: ".github/PULL_REQUEST_TEMPLATE.md",
    hint: "Prompt contributors for context, tests, and checklist items.",
    match: firstOf(
      anyFile(COMMUNITY_DIRS, ["PULL_REQUEST_TEMPLATE.md", "pull_request_template.md"]),
      anyFileIn(".github/PULL_REQUEST_TEMPLATE", /\.md$/i),
    ),
  },
  {
    ...catalogued("ci"),
    scaffoldPath: ".github/workflows/ci.yml",
    hint: "Run tests on every push and pull request.",
    match: workflowContaining(/^\s*(pull_request|push)\s*:|^\s*on\s*:\s*\[?.*\b(pull_request|push)\b/m),
  },
  {
    ...catalogued("support"),
    scaffoldPath: "SUPPORT.md",
    hint: "Point users to the right place for questions and help.",
    match: anyFile(COMMUNITY_DIRS, ["SUPPORT.md", "SUPPORT", "SUPPORT.txt"]),
  },
  {
    ...catalogued("changelog"),
    scaffoldPath: "CHANGELOG.md",
    hint: "Document notable changes per release (Keep a Changelog).",
    match: anyFile(["", "docs"], ["CHANGELOG.md", "CHANGELOG", "HISTORY.md", "CHANGES.md"]),
  },
  {
    ...catalogued("codeowners"),
    scaffoldPath: ".github/CODEOWNERS",
    hint: "Auto-request reviews from maintainers.",
    match: anyFile(COMMUNITY_DIRS, ["CODEOWNERS"]),
  },
  {
    ...catalogued("dependabot"),
    scaffoldPath: ".github/dependabot.yml",
    hint: "Keep dependencies and GitHub Actions up to date automatically.",
    match: anyFile([".github"], ["dependabot.yml", "dependabot.yaml"]),
  },
  {
    ...catalogued("codeql"),
    scaffoldPath: ".github/workflows/codeql.yml",
    hint: "Catch security bugs with GitHub code scanning.",
    // Only init/analyze mean CodeQL actually runs; upload-sarif alone (e.g. Scorecard) does not.
    match: workflowContaining(/github\/codeql-action\/(?:init|analyze)@/),
  },
  {
    ...catalogued("scorecard"),
    scaffoldPath: ".github/workflows/scorecard.yml",
    hint: "Track supply-chain security posture.",
    match: workflowContaining(/ossf\/scorecard-action/),
  },
  {
    ...catalogued("funding"),
    scaffoldPath: ".github/FUNDING.yml",
    hint: "Show a Sponsor button on the repo.",
    match: anyFile([".github"], ["FUNDING.yml", "FUNDING.yaml"]),
  },
  {
    ...catalogued("citation"),
    scaffoldPath: "CITATION.cff",
    hint: 'Enable GitHub\'s "Cite this repository" button.',
    match: anyFile([""], ["CITATION.cff"]),
  },
  {
    ...catalogued("editorconfig"),
    scaffoldPath: ".editorconfig",
    hint: "Consistent indentation and line endings across editors.",
    match: anyFile([""], [".editorconfig"]),
  },
  {
    ...catalogued("gitignore"),
    scaffoldPath: ".gitignore",
    hint: "Keep build output and secrets out of git.",
    match: anyFile([""], [".gitignore"]),
  },
  {
    ...catalogued("agents-md"),
    scaffoldPath: "AGENTS.md",
    hint: "Give AI coding agents your setup, test, and style rules (https://agents.md).",
    match: anyFile([""], ["AGENTS.md"]),
  },
];

/**
 * Public, data-only view of the file checks that always run (without matcher functions).
 * The npm publish-readiness checks are listed separately in `PACKAGE_JSON_CHECKS`,
 * the GitHub Actions version check in `WORKFLOW_ACTIONS_CHECK`, the README
 * badge check in `README_BADGES_CHECK`, and the managed-files check in
 * `MANAGED_FILES_CHECK`. Every check's id, label and level come from the
 * catalogue in src/checks.ts (`CHECK_CATALOG`).
 */
export const DOCTOR_CHECKS: readonly DoctorCheck[] = CHECKS.map(
  ({ match: _match, ...check }) => check,
);

/** Recommended check that runs only when `.github/workflows/*.yml|yaml` exist. */
export const WORKFLOW_ACTIONS_CHECK: DoctorCheck = {
  ...catalogued("workflow-actions"),
  scaffoldPath: WORKFLOWS_DIR,
  hint: "Bump these or let Dependabot (github-actions ecosystem) do it.",
  group: "workflow-actions",
};

/** Recommended check that runs only when a root `README.md` exists. */
export const README_BADGES_CHECK: DoctorCheck = {
  ...catalogued("readme-badges"),
  scaffoldPath: "README.md",
  hint: "Keep the README badge block current with `ossready badges --write`.",
  group: "readme-badges",
};

/** Recommended check that runs only when at least one file carries the ossready marker line. */
export const MANAGED_FILES_CHECK: DoctorCheck = {
  ...catalogued("managed-files"),
  scaffoldPath: ".github",
  hint: "Preview with `ossready sync`, then apply with `ossready sync --write` or `ossready doctor --fix`.",
  group: "managed-files",
};

/**
 * Every `uses: owner/repo[/path]@ref` line in a workflow, with 1-based line numbers.
 * Local (`./`) and `docker://` actions are skipped. Pure.
 */
export function findActionUses(text: string): { line: number; action: string; ref: string }[] {
  const out: { line: number; action: string; ref: string }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const value = /^\s*(?:-\s+)?uses:\s*["']?([^\s"'#]+)/.exec(raw)?.[1];
    if (!value || value.startsWith("./") || value.startsWith("../") || value.startsWith("docker://")) {
      return;
    }
    const at = value.lastIndexOf("@");
    if (at <= 0 || at === value.length - 1) return;
    const action = value.slice(0, at);
    if (!action.includes("/")) return;
    out.push({ line: i + 1, action, ref: value.slice(at + 1) });
  });
  return out;
}

/** Scan `.github/workflows/*.yml|yaml` for known actions pinned to an outdated major. */
export async function scanWorkflowActions(root: string): Promise<WorkflowActionsStatus> {
  const names = (await listFiles(join(root, WORKFLOWS_DIR))).filter((e) => /\.ya?ml$/i.test(e)).sort();
  if (!names.length) {
    return { status: "skipped", reason: `no ${WORKFLOWS_DIR}/*.yml files` };
  }
  const files: string[] = [];
  const outdated: WorkflowActionFinding[] = [];
  const shaPinned: WorkflowActionFinding[] = [];
  for (const name of names) {
    const file = `${WORKFLOWS_DIR}/${name}`;
    let text: string;
    try {
      text = await readFile(join(root, WORKFLOWS_DIR, name), "utf8");
    } catch {
      continue; // unreadable file — ignore
    }
    files.push(file);
    for (const use of findActionUses(text)) {
      const status = classifyActionRef(use.action, use.ref);
      if (status.kind === "outdated") outdated.push({ file, ...use, recommended: status.recommended });
      else if (status.kind === "sha") shaPinned.push({ file, ...use, recommended: status.recommended });
    }
  }
  return { status: "checked", files, outdated, shaPinned };
}

/** `actions/checkout@v4 → v7 (.github/workflows/ci.yml:12)` */
export function formatActionFinding(f: WorkflowActionFinding): string {
  return `${f.action}@${f.ref} → ${f.recommended} (${f.file}:${f.line})`;
}

/**
 * Compare README.md's badge block with what `ossready badges` would generate.
 * The owner comes from `githubOwner`, else package.json GitHub links, else the
 * repo's own origin remote: the same sources `doctor --fix` uses.
 */
export async function checkReadmeBadges(root: string, githubOwner?: string): Promise<ReadmeBadgesStatus> {
  let text: string;
  try {
    text = await readFile(join(root, "README.md"), "utf8");
  } catch {
    return { status: "skipped", reason: "no README.md" };
  }
  const detected = await detectBadges(root, { githubOwner, noGitConfig: true, noParent: true });
  return {
    status: "checked",
    state: badgeBlockState(text, detected.markdown),
    ...(detected.owner ? { owner: detected.owner } : {}),
    badges: detected.badges.map((b) => b.id),
    needsOwner: detected.needsOwner,
  };
}

/** Actionable reason the readme-badges check failed. */
export function readmeBadgesDetail(status: Extract<ReadmeBadgesStatus, { status: "checked" }>): string {
  if (status.state === "malformed") {
    return `README.md has only one of ${BADGES_START} / ${BADGES_END} — fix the markers by hand, then run \`ossready badges --write\`.`;
  }
  const what =
    status.state === "missing"
      ? `README.md has no ${BADGES_START} … ${BADGES_END} badge block`
      : "README.md's badge block doesn't match what `ossready badges` generates";
  const how = status.owner
    ? "run `ossready badges --write` or `ossready doctor --fix`"
    : `run \`${BADGES_WRITE_COMMAND}\``;
  return `${what} — ${how}.`;
}

const NO_MANAGED_FILES = "no files carry the ossready marker line";

/**
 * Compare the template-owned files with the current templates, using
 * `ossready sync`'s own comparison (a dry run, same inference, same owner
 * rules). Only files that start with the ossready marker count: missing and
 * unmarked files are reported but never fail the check, and when no file
 * carries the marker the check is skipped.
 */
export async function checkManagedFiles(root: string, githubOwner?: string): Promise<ManagedFilesStatus> {
  let sync: SyncReport;
  try {
    sync = await runSync(root, { githubOwner });
  } catch (err) {
    return {
      status: "skipped",
      reason: `could not render the templates: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const files: ManagedFileState[] = [];
  for (const f of sync.files) {
    // Without --force, sync reports `up-to-date` / `outdated` only for marked files.
    let managed = f.status === "up-to-date" || f.status === "outdated";
    if (f.status === "skipped") {
      try {
        managed = isManaged(await readFile(join(root, f.path), "utf8"));
      } catch {
        managed = false;
      }
    }
    files.push({
      path: f.path,
      status: f.status,
      managed,
      ...(f.reason ? { reason: f.reason } : {}),
      ...(f.status === "outdated" ? { added: f.added ?? 0, removed: f.removed ?? 0 } : {}),
    });
  }
  if (!files.some((f) => f.managed)) return { status: "skipped", reason: NO_MANAGED_FILES };
  return {
    status: "checked",
    files,
    stale: files.filter((f) => f.status === "outdated").map((f) => f.path),
  };
}

/** Actionable reason the managed-files check failed. */
export function managedFilesDetail(stale: readonly string[]): string {
  const n = stale.length;
  return `${n} ossready-managed file${n === 1 ? "" : "s"} differ${n === 1 ? "s" : ""} from the current templates (${stale.join(", ")}) — preview with \`ossready sync\`, apply with \`ossready sync --write\` or \`ossready doctor --fix\`.`;
}

function normalizeOwner(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  const owner = String(raw).trim();
  if (!GITHUB_OWNER_RE.test(owner)) {
    throw new Error(
      `Invalid --github-owner "${String(raw)}". Use a GitHub username or org (letters, digits, hyphen; 1–39 characters).`,
    );
  }
  return owner;
}

/** Audit `directory` for OSS-readiness files. Pure (no console output). */
export async function runDoctor(directory: string, options: RunDoctorOptions = {}): Promise<DoctorReport> {
  const root = resolve(process.cwd(), directory);
  let isDir = false;
  try {
    isDir = (await stat(root)).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) {
    throw new Error(`Directory "${root}" does not exist or is not a directory.`);
  }
  const githubOwner = normalizeOwner(options.githubOwner);

  const results: DoctorResult[] = [];
  for (const { match, ...check } of CHECKS) {
    const foundAt = await match(root);
    results.push({ ...check, ok: Boolean(foundAt), ...(foundAt ? { foundAt } : {}) });
  }

  const pkgState = await readPackageJson(root);
  const skipReason = packageJsonSkipReason(pkgState);
  let packageJson: PackageJsonStatus;
  if (skipReason !== undefined || pkgState.kind !== "ok") {
    packageJson = { status: "skipped", reason: skipReason ?? "package.json could not be read" };
  } else {
    packageJson = { status: "checked" };
    const outcomes = await evaluatePackageJson(root, pkgState.pkg);
    for (const def of PACKAGE_JSON_CHECKS) {
      const o = outcomes[def.id] ?? { ok: false, detail: def.hint };
      results.push({
        ...def,
        level: checkInfo(def.id).level,
        scaffoldPath: "package.json",
        group: "package-json",
        ok: o.ok,
        ...(o.ok ? { foundAt: o.foundAt ?? "package.json" } : { detail: o.detail ?? def.hint }),
      });
    }
  }

  const workflowActions = await scanWorkflowActions(root);
  if (workflowActions.status === "checked") {
    const ok = workflowActions.outdated.length === 0;
    results.push({
      ...WORKFLOW_ACTIONS_CHECK,
      ok,
      ...(ok
        ? { foundAt: WORKFLOWS_DIR }
        : {
            detail: `${workflowActions.outdated.map(formatActionFinding).join("; ")}. ${WORKFLOW_ACTIONS_CHECK.hint}`,
          }),
    });
  }

  const readmeBadges = await checkReadmeBadges(root, githubOwner);
  if (readmeBadges.status === "checked") {
    const ok = readmeBadges.state === "current";
    results.push({
      ...README_BADGES_CHECK,
      ok,
      ...(ok ? { foundAt: "README.md" } : { detail: readmeBadgesDetail(readmeBadges) }),
    });
  }

  const managedFiles = await checkManagedFiles(root, githubOwner);
  if (managedFiles.status === "checked") {
    const ok = managedFiles.stale.length === 0;
    const count = managedFiles.files.filter((f) => f.managed).length;
    results.push({
      ...MANAGED_FILES_CHECK,
      ok,
      ...(ok
        ? { foundAt: `${count} managed file${count === 1 ? "" : "s"}` }
        : { detail: managedFilesDetail(managedFiles.stale) }),
    });
  }

  const passed = results.filter((r) => r.ok).length;
  return {
    directory: root,
    results,
    passed,
    total: results.length,
    missingRequired: results.filter((r) => !r.ok && r.level === "required").length,
    missingRecommended: results.filter((r) => !r.ok && r.level === "recommended").length,
    packageJson,
    workflowActions,
    readmeBadges,
    managedFiles,
  };
}

/** Render a human-readable report. */
export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`\nossready doctor → ${report.directory}\n`);

  for (const level of ["required", "recommended"] as const) {
    const group = report.results.filter((r) => r.level === level && !r.group);
    lines.push(`  ${level === "required" ? "Required" : "Recommended"}:`);
    for (const r of group) {
      if (r.ok) {
        lines.push(`    ✔ ${r.label} (${r.foundAt})`);
      } else {
        const mark = level === "required" ? "✖" : "⚠";
        lines.push(`    ${mark} ${r.label} — missing ${r.scaffoldPath}. ${r.hint}`);
      }
    }
    lines.push("");
  }

  const pj = report.packageJson;
  if (pj?.status === "checked") {
    lines.push("  npm publish readiness (package.json, recommended):");
    for (const r of report.results.filter((x) => x.group === "package-json")) {
      lines.push(r.ok ? `    ✔ ${r.label} (${r.foundAt})` : `    ⚠ ${r.label} — ${r.detail ?? r.hint}`);
    }
    lines.push("");
  } else if (pj?.status === "skipped") {
    lines.push(`  npm publish readiness (package.json): skipped — ${pj.reason}`);
    lines.push("");
  }

  const wa = report.workflowActions;
  if (wa?.status === "checked") {
    lines.push("  GitHub Actions versions (workflows, recommended):");
    if (wa.outdated.length === 0) {
      lines.push(
        `    ✔ ${WORKFLOW_ACTIONS_CHECK.label} (${wa.files.length} workflow file${wa.files.length === 1 ? "" : "s"})`,
      );
    } else {
      lines.push(`    ⚠ ${WORKFLOW_ACTIONS_CHECK.label} — ${wa.outdated.length} outdated:`);
      for (const f of wa.outdated) lines.push(`      ${formatActionFinding(f)}`);
      lines.push(`      ${WORKFLOW_ACTIONS_CHECK.hint}`);
    }
    if (wa.shaPinned.length) {
      lines.push(
        `    ℹ ${wa.shaPinned.length} SHA-pinned action${wa.shaPinned.length === 1 ? "" : "s"} not version-checked (fine; keep them updated with Dependabot)`,
      );
    }
    lines.push("");
  } else if (wa?.status === "skipped") {
    lines.push(`  GitHub Actions versions (workflows): skipped — ${wa.reason}`);
    lines.push("");
  }

  const rb = report.readmeBadges;
  if (rb?.status === "checked") {
    const r = report.results.find((x) => x.group === "readme-badges");
    lines.push("  README badges (README.md, recommended):");
    if (r?.ok) {
      lines.push(
        `    ✔ ${README_BADGES_CHECK.label} (${rb.badges.length} badge${rb.badges.length === 1 ? "" : "s"}, current)`,
      );
    } else {
      lines.push(`    ⚠ ${README_BADGES_CHECK.label} — ${r?.detail ?? README_BADGES_CHECK.hint}`);
    }
    lines.push("");
  } else if (rb?.status === "skipped") {
    lines.push(`  README badges: skipped — ${rb.reason}`);
    lines.push("");
  }

  const mf = report.managedFiles;
  if (mf?.status === "checked") {
    const r = report.results.find((x) => x.group === "managed-files");
    const count = mf.files.filter((f) => f.managed).length;
    lines.push("  ossready-managed files (recommended):");
    if (r?.ok) {
      lines.push(
        `    ✔ ${MANAGED_FILES_CHECK.label} (${count} file${count === 1 ? "" : "s"} with the ossready marker)`,
      );
    } else {
      lines.push(`    ⚠ ${MANAGED_FILES_CHECK.label} — ${mf.stale.length} stale:`);
      for (const f of mf.files.filter((x) => x.status === "outdated")) {
        lines.push(`      ${f.path} (+${f.added ?? 0} -${f.removed ?? 0})`);
      }
      lines.push(`      ${MANAGED_FILES_CHECK.hint}`);
    }
    lines.push("");
  } else if (mf?.status === "skipped") {
    lines.push(`  ossready-managed files: skipped — ${mf.reason}`);
    lines.push("");
  }

  lines.push(`  Score: ${report.passed}/${report.total} checks passed`);
  if (report.missingRequired === 0 && report.missingRecommended === 0) {
    lines.push("\n✔ Looks open-source ready!\n");
  } else {
    lines.push(
      `  Missing: ${report.missingRequired} required, ${report.missingRecommended} recommended`,
    );
    lines.push(
      "\nTip: `ossready doctor --fix` writes the missing files from ossready's templates (add --dry-run to preview).\n",
    );
  }
  return lines.join("\n");
}

/** Text made safe for one GitHub-flavored Markdown table cell: newlines become spaces; `\\` then `|` are escaped. */
export function markdownCell(text: string): string {
  return text
    .replace(/\s*\r?\n\s*/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .trim();
}

/** The conditional check groups, as the Markdown report names them when they are skipped. */
const MARKDOWN_GROUPS: readonly [label: string, key: "packageJson" | "workflowActions" | "readmeBadges" | "managedFiles"][] = [
  ["npm publish readiness (`package.json`)", "packageJson"],
  ["GitHub Actions versions (`workflow-actions`)", "workflowActions"],
  ["README badges (`readme-badges`)", "readmeBadges"],
  ["ossready-managed files (`managed-files`)", "managedFiles"],
];

/**
 * Render the report as GitHub-flavored Markdown for `$GITHUB_STEP_SUMMARY` or a
 * PR comment: the score as a heading, a one-line verdict, one table row per
 * check (where it was found, or the actionable reason it failed), and the
 * conditional checks that were skipped. The audited directory's absolute path
 * is left out so job summaries don't show runner paths. Pure.
 */
export function formatDoctorMarkdown(report: DoctorReport): string {
  const lines: string[] = [`## ossready doctor: ${report.passed}/${report.total} checks passed`, ""];
  if (report.missingRequired === 0 && report.missingRecommended === 0) {
    lines.push("✅ Looks open-source ready!");
  } else {
    const mark = report.missingRequired > 0 ? "❌" : "⚠️";
    lines.push(
      `${mark} Missing: ${report.missingRequired} required, ${report.missingRecommended} recommended. Run \`ossready doctor --fix\` to write the missing files (add \`--dry-run\` to preview).`,
    );
  }
  lines.push("", "| Status | Check | Level | Details |", "| --- | --- | --- | --- |");
  for (const r of report.results) {
    const status = r.ok ? "✅" : r.level === "required" ? "❌" : "⚠️";
    const details = r.ok
      ? `found: ${r.foundAt ?? r.scaffoldPath}`
      : (r.detail ?? `missing ${r.scaffoldPath}. ${r.hint}`);
    lines.push(`| ${status} | ${markdownCell(r.label)} (\`${r.id}\`) | ${r.level} | ${markdownCell(details)} |`);
  }
  const skipped: string[] = [];
  for (const [label, key] of MARKDOWN_GROUPS) {
    const s = report[key];
    if (s?.status === "skipped") skipped.push(`- ${label}: ${s.reason}`);
  }
  if (skipped.length) lines.push("", "Skipped (not counted):", "", ...skipped);
  return lines.join("\n");
}

/** One check as `ossready doctor --list` shows it (catalogue text without Markdown backticks). */
export interface CheckListEntry {
  id: string;
  title: string;
  level: DoctorLevel;
  description: string;
  fixable: FixSupport;
  /** What `ossready doctor --fix` does for it, or why it can't */
  fix: string;
  /** The files or fields the check inspects */
  looksAt: string;
  /** `always`, or when a conditional check runs */
  runsWhen: string;
  group?: CheckGroup;
}

/** Every doctor check from the catalogue, in report order. Pure. */
export function checkList(): CheckListEntry[] {
  return CHECK_CATALOG.map((c) => ({
    id: c.id,
    title: c.title,
    level: c.level,
    description: plainText(c.description),
    fixable: c.fixable,
    fix: plainText(c.fix),
    looksAt: plainText(c.looksAt),
    runsWhen: plainText(c.runsWhen ?? "always"),
    ...(c.group ? { group: c.group } : {}),
  }));
}

/** Human-readable `ossready doctor --list` output. */
export function formatCheckList(entries: readonly CheckListEntry[] = checkList()): string {
  const lines: string[] = [`\nossready doctor checks (${entries.length})\n`];
  for (const level of ["required", "recommended"] as const) {
    const group = entries.filter((c) => c.level === level);
    lines.push(`  ${level === "required" ? "Required" : "Recommended"} (${group.length}):`);
    for (const c of group) {
      lines.push(`    ${c.id} — ${c.title} [--fix: ${c.fixable}]`);
      lines.push(`      ${c.description}`);
      lines.push(`      Looks at: ${c.looksAt}`);
      if (c.runsWhen !== "always") lines.push(`      Runs ${c.runsWhen}.`);
    }
    lines.push("");
  }
  lines.push("  --fix: yes = ossready doctor --fix fixes it, partial = only in some cases, no = report only.");
  lines.push("  Full reference: docs/checks.md in the ossready repository. Add --json for machine-readable output.\n");
  return lines.join("\n");
}

/**
 * `ossready doctor --list [--json]`: print the check catalogue without auditing
 * anything. Always exits 0.
 */
export function listChecksCommand(flags: { json?: boolean } = {}): CheckListEntry[] {
  const checks = checkList();
  if (flags.json) {
    console.log(JSON.stringify({ total: checks.length, checks }, null, 2));
  } else {
    console.log(formatCheckList(checks));
  }
  return checks;
}

/**
 * `ossready doctor [directory]` — audit an existing repo for missing community
 * health files and automation. With `--fix`, write the missing files from
 * ossready's templates (never overwriting), update stale ossready-managed
 * files the way `ossready sync --write` does, and re-audit. Sets a non-zero
 * exit code when required checks fail (or any check fails with --strict).
 * `--markdown` prints the report as GitHub-flavored Markdown instead, keeping
 * stdout pure Markdown (the `--fix` plan goes to stderr).
 */
export async function doctorCommand(
  directory: string,
  flags: DoctorFlags = {},
): Promise<DoctorReport> {
  if (flags.json && flags.markdown) {
    throw new Error("Use either --json or --markdown, not both.");
  }
  const auditOptions: RunDoctorOptions = { githubOwner: flags.githubOwner };
  let report = await runDoctor(directory, auditOptions);
  let fix: FixPlan | undefined;
  const dryRun = Boolean(flags.dryRun);

  if (flags.fix) {
    fix = await applyFix(report, {
      githubOwner: flags.githubOwner,
      author: flags.author,
      license: flags.license,
      cocEmail: flags.cocEmail,
      securityEmail: flags.securityEmail,
      dryRun,
    });
    const managed = report.results.find((r) => r.group === "managed-files");
    if (managed && !managed.ok) {
      // `ossready sync --write` without --force or --add-missing: only files that
      // still carry the marker and differ from the template are rewritten.
      const sync = await runSync(report.directory, { write: !dryRun, githubOwner: flags.githubOwner });
      fix.managedFiles = {
        update: sync.files.filter((f) => f.status === "outdated" && f.pending).map((f) => f.path),
      };
    }
    if (!dryRun) report = await runDoctor(directory, auditOptions);
  }

  const failed =
    report.missingRequired > 0 || (Boolean(flags.strict) && report.missingRecommended > 0);

  if (flags.json) {
    console.log(JSON.stringify({ ...report, ok: !failed, ...(fix ? { fix } : {}) }, null, 2));
  } else if (flags.markdown) {
    // stdout stays pure Markdown (e.g. `>> "$GITHUB_STEP_SUMMARY"`), so the fix plan goes to stderr.
    if (fix) console.error(formatFixPlan(fix, dryRun));
    console.log(formatDoctorMarkdown(report));
  } else {
    if (fix) console.log(formatFixPlan(fix, dryRun));
    console.log(formatDoctorReport(report));
  }

  if (failed) {
    process.exitCode = 1;
  }
  return report;
}
