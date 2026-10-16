import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { classifyActionRef } from "../templates/actions.js";
import { applyFix, formatFixPlan, type FixFlags, type FixPlan } from "./fix.js";
import {
  evaluatePackageJson,
  PACKAGE_JSON_CHECKS,
  packageJsonSkipReason,
  readPackageJson,
  type PackageJsonStatus,
} from "./packageJson.js";

export { PACKAGE_JSON_CHECKS, type PackageJsonStatus } from "./packageJson.js";

export type DoctorLevel = "required" | "recommended";

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
   * checks (package.json) and the GitHub Actions version check (workflows).
   */
  group?: "package-json" | "workflow-actions";
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
}

export interface DoctorFlags extends Omit<FixFlags, "dryRun"> {
  json?: boolean;
  strict?: boolean;
  /** Write missing files from ossready's templates (never overwrites) */
  fix?: boolean;
  /** With --fix: show what would be written without touching disk */
  dryRun?: boolean;
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
    id: "readme",
    label: "README",
    level: "required",
    scaffoldPath: "README.md",
    hint: "Explain what the project does and how to use it.",
    match: anyFile(COMMUNITY_DIRS, ["README.md", "README", "README.markdown", "README.rst", "README.txt"]),
  },
  {
    id: "license",
    label: "License",
    level: "required",
    scaffoldPath: "LICENSE",
    hint: "Without a license, nobody can legally reuse your code.",
    match: anyFile([""], ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENCE.md", "COPYING"]),
  },
  {
    id: "code-of-conduct",
    label: "Code of Conduct",
    level: "required",
    scaffoldPath: "CODE_OF_CONDUCT.md",
    hint: "Set community standards (ossready uses Contributor Covenant 2.1).",
    match: anyFile(COMMUNITY_DIRS, ["CODE_OF_CONDUCT.md", "CODE_OF_CONDUCT", "CODE_OF_CONDUCT.txt"]),
  },
  {
    id: "contributing",
    label: "Contributing guide",
    level: "required",
    scaffoldPath: "CONTRIBUTING.md",
    hint: "Tell contributors how to set up, test, and submit changes.",
    match: anyFile(COMMUNITY_DIRS, ["CONTRIBUTING.md", "CONTRIBUTING", "CONTRIBUTING.txt", "CONTRIBUTING.rst"]),
  },
  {
    id: "security",
    label: "Security policy",
    level: "required",
    scaffoldPath: "SECURITY.md",
    hint: "Explain how to privately report vulnerabilities.",
    match: anyFile(COMMUNITY_DIRS, ["SECURITY.md", "SECURITY", "SECURITY.txt"]),
  },
  {
    id: "issue-templates",
    label: "Issue templates",
    level: "required",
    scaffoldPath: ".github/ISSUE_TEMPLATE/bug_report.yml",
    hint: "Structured bug/feature forms keep reports actionable.",
    match: firstOf(
      anyFileIn(".github/ISSUE_TEMPLATE", /^(?!config\.ya?ml$).+\.(ya?ml|md)$/i),
      anyFile(COMMUNITY_DIRS, ["ISSUE_TEMPLATE.md"]),
    ),
  },
  {
    id: "pr-template",
    label: "Pull request template",
    level: "required",
    scaffoldPath: ".github/PULL_REQUEST_TEMPLATE.md",
    hint: "Prompt contributors for context, tests, and checklist items.",
    match: firstOf(
      anyFile(COMMUNITY_DIRS, ["PULL_REQUEST_TEMPLATE.md", "pull_request_template.md"]),
      anyFileIn(".github/PULL_REQUEST_TEMPLATE", /\.md$/i),
    ),
  },
  {
    id: "ci",
    label: "CI workflow",
    level: "required",
    scaffoldPath: ".github/workflows/ci.yml",
    hint: "Run tests on every push and pull request.",
    match: workflowContaining(/^\s*(pull_request|push)\s*:|^\s*on\s*:\s*\[?.*\b(pull_request|push)\b/m),
  },
  {
    id: "support",
    label: "Support resources",
    level: "recommended",
    scaffoldPath: "SUPPORT.md",
    hint: "Point users to the right place for questions and help.",
    match: anyFile(COMMUNITY_DIRS, ["SUPPORT.md", "SUPPORT", "SUPPORT.txt"]),
  },
  {
    id: "changelog",
    label: "Changelog",
    level: "recommended",
    scaffoldPath: "CHANGELOG.md",
    hint: "Document notable changes per release (Keep a Changelog).",
    match: anyFile(["", "docs"], ["CHANGELOG.md", "CHANGELOG", "HISTORY.md", "CHANGES.md"]),
  },
  {
    id: "codeowners",
    label: "CODEOWNERS",
    level: "recommended",
    scaffoldPath: ".github/CODEOWNERS",
    hint: "Auto-request reviews from maintainers.",
    match: anyFile(COMMUNITY_DIRS, ["CODEOWNERS"]),
  },
  {
    id: "dependabot",
    label: "Dependabot config",
    level: "recommended",
    scaffoldPath: ".github/dependabot.yml",
    hint: "Keep dependencies and GitHub Actions up to date automatically.",
    match: anyFile([".github"], ["dependabot.yml", "dependabot.yaml"]),
  },
  {
    id: "codeql",
    label: "CodeQL code scanning",
    level: "recommended",
    scaffoldPath: ".github/workflows/codeql.yml",
    hint: "Catch security bugs with GitHub code scanning.",
    // Only init/analyze mean CodeQL actually runs; upload-sarif alone (e.g. Scorecard) does not.
    match: workflowContaining(/github\/codeql-action\/(?:init|analyze)@/),
  },
  {
    id: "scorecard",
    label: "OpenSSF Scorecard",
    level: "recommended",
    scaffoldPath: ".github/workflows/scorecard.yml",
    hint: "Track supply-chain security posture.",
    match: workflowContaining(/ossf\/scorecard-action/),
  },
  {
    id: "funding",
    label: "Funding links",
    level: "recommended",
    scaffoldPath: ".github/FUNDING.yml",
    hint: "Show a Sponsor button on the repo.",
    match: anyFile([".github"], ["FUNDING.yml", "FUNDING.yaml"]),
  },
  {
    id: "citation",
    label: "Citation metadata",
    level: "recommended",
    scaffoldPath: "CITATION.cff",
    hint: 'Enable GitHub\'s "Cite this repository" button.',
    match: anyFile([""], ["CITATION.cff"]),
  },
  {
    id: "editorconfig",
    label: "EditorConfig",
    level: "recommended",
    scaffoldPath: ".editorconfig",
    hint: "Consistent indentation and line endings across editors.",
    match: anyFile([""], [".editorconfig"]),
  },
  {
    id: "gitignore",
    label: ".gitignore",
    level: "recommended",
    scaffoldPath: ".gitignore",
    hint: "Keep build output and secrets out of git.",
    match: anyFile([""], [".gitignore"]),
  },
  {
    id: "agents-md",
    label: "AI agent instructions",
    level: "recommended",
    scaffoldPath: "AGENTS.md",
    hint: "Give AI coding agents your setup, test, and style rules (https://agents.md).",
    match: anyFile([""], ["AGENTS.md"]),
  },
];

/**
 * Public, data-only view of the file checks that always run (without matcher functions).
 * The npm publish-readiness checks are listed separately in `PACKAGE_JSON_CHECKS`,
 * and the GitHub Actions version check in `WORKFLOW_ACTIONS_CHECK`.
 */
export const DOCTOR_CHECKS: readonly DoctorCheck[] = CHECKS.map(
  ({ match: _match, ...check }) => check,
);

/** Recommended check that runs only when `.github/workflows/*.yml|yaml` exist. */
export const WORKFLOW_ACTIONS_CHECK: DoctorCheck = {
  id: "workflow-actions",
  label: "Current GitHub Action versions",
  level: "recommended",
  scaffoldPath: WORKFLOWS_DIR,
  hint: "Bump these or let Dependabot (github-actions ecosystem) do it.",
  group: "workflow-actions",
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

/** Audit `directory` for OSS-readiness files. Pure (no console output). */
export async function runDoctor(directory: string): Promise<DoctorReport> {
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
        level: "recommended",
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

/**
 * `ossready doctor [directory]` — audit an existing repo for missing community
 * health files and automation. With `--fix`, write the missing files from
 * ossready's templates (never overwriting) and re-audit. Sets a non-zero exit
 * code when required checks fail (or any check fails with --strict).
 */
export async function doctorCommand(
  directory: string,
  flags: DoctorFlags = {},
): Promise<DoctorReport> {
  let report = await runDoctor(directory);
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
    if (!dryRun) report = await runDoctor(directory);
  }

  const failed =
    report.missingRequired > 0 || (Boolean(flags.strict) && report.missingRecommended > 0);

  if (flags.json) {
    console.log(JSON.stringify({ ...report, ok: !failed, ...(fix ? { fix } : {}) }, null, 2));
  } else {
    if (fix) console.log(formatFixPlan(fix, dryRun));
    console.log(formatDoctorReport(report));
  }

  if (failed) {
    process.exitCode = 1;
  }
  return report;
}
