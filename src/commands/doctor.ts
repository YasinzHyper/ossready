import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

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
}

export interface DoctorResult extends DoctorCheck {
  ok: boolean;
  /** Relative path that satisfied the check (when ok) */
  foundAt?: string;
}

export interface DoctorReport {
  directory: string;
  results: DoctorResult[];
  passed: number;
  total: number;
  missingRequired: number;
  missingRecommended: number;
}

export interface DoctorFlags {
  json?: boolean;
  strict?: boolean;
}

/**
 * GitHub looks for community health files in the repo root, `.github/`, and `docs/`.
 * See https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions
 */
const COMMUNITY_DIRS = ["", ".github", "docs"];

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
    const dir = ".github/workflows";
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
    match: workflowContaining(/github\/codeql-action/),
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
];

/** Public, data-only view of the checks (without matcher functions). */
export const DOCTOR_CHECKS: readonly DoctorCheck[] = CHECKS.map(
  ({ match: _match, ...check }) => check,
);

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

  const passed = results.filter((r) => r.ok).length;
  return {
    directory: root,
    results,
    passed,
    total: results.length,
    missingRequired: results.filter((r) => !r.ok && r.level === "required").length,
    missingRecommended: results.filter((r) => !r.ok && r.level === "recommended").length,
  };
}

/** Render a human-readable report. */
export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`\nossready doctor → ${report.directory}\n`);

  for (const level of ["required", "recommended"] as const) {
    const group = report.results.filter((r) => r.level === level);
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

  lines.push(`  Score: ${report.passed}/${report.total} checks passed`);
  if (report.missingRequired === 0 && report.missingRecommended === 0) {
    lines.push("\n✔ Looks open-source ready!\n");
  } else {
    lines.push(
      `  Missing: ${report.missingRequired} required, ${report.missingRecommended} recommended`,
    );
    lines.push(
      "\nTip: `ossready init <new-dir> --dry-run` shows every file ossready can scaffold; copy the ones you need.\n",
    );
  }
  return lines.join("\n");
}

/**
 * `ossready doctor [directory]` — audit an existing repo for missing community
 * health files and automation. Sets a non-zero exit code when required checks
 * fail (or any check fails with --strict).
 */
export async function doctorCommand(
  directory: string,
  flags: DoctorFlags = {},
): Promise<DoctorReport> {
  const report = await runDoctor(directory);
  const failed =
    report.missingRequired > 0 || (Boolean(flags.strict) && report.missingRecommended > 0);

  if (flags.json) {
    console.log(JSON.stringify({ ...report, ok: !failed }, null, 2));
  } else {
    console.log(formatDoctorReport(report));
  }

  if (failed) {
    process.exitCode = 1;
  }
  return report;
}
