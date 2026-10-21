import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { buildScaffoldFiles } from "../templates/index.js";
import { isManaged, stripManagedMarker } from "../templates/managed.js";
import { PACKAGE_MANAGERS, type ScaffoldOptions } from "../templates/types.js";
import { diffStats, unifiedDiff } from "../utils/diff.js";
import { ensureDir, pathExists } from "../utils/fs.js";
import { inferScaffoldOptions, packageManagerFromField } from "./fix.js";

/**
 * `ossready sync`: bring the template-owned files that `ossready init` writes
 * (every scaffold file that starts with the ossready marker line: workflows,
 * Dependabot, Issue Forms, the PR template, `.editorconfig`) up to date with
 * the current templates. Dry run by default. Never touches README, LICENSE,
 * package.json, the community docs (SECURITY, CODE_OF_CONDUCT, CONTRIBUTING),
 * or source files, and never overwrites a file without the marker unless
 * `--force` is given. `ossready doctor`'s `managed-files` check runs the same
 * comparison (see `runSync`).
 */

export interface SyncFlags {
  /** Apply the changes (default: dry run) */
  write?: boolean;
  /** Also create managed files that don't exist yet */
  addMissing?: boolean;
  /** Also overwrite files that don't carry the ossready marker line */
  force?: boolean;
  /** Print the result as JSON */
  json?: boolean;
  /** One summary line per file instead of diffs */
  quiet?: boolean;
  /** Override the GitHub owner inferred from package.json / the origin remote */
  githubOwner?: string;
  /** Override the package manager inferred from lockfiles / packageManager */
  packageManager?: string;
}

export type SyncStatus = "up-to-date" | "outdated" | "missing" | "skipped";

export interface SyncFileResult {
  /** Path relative to the repo root */
  path: string;
  status: SyncStatus;
  /** Whether `--write` changes (or changed) this file */
  pending: boolean;
  /** Whether this run wrote the file */
  written: boolean;
  /** Why a file is skipped, or how to create a missing one */
  reason?: string;
  /** Lines added / removed by the update (outdated files) */
  added?: number;
  removed?: number;
  /** Unified diff from the current file to the template (outdated files) */
  diff?: string;
}

export interface SyncReport {
  directory: string;
  /** Whether this was a `--write` run */
  write: boolean;
  /** Values the templates were rendered with */
  options: {
    name: string;
    packageManager: ScaffoldOptions["packageManager"];
    githubOwner?: string;
  };
  files: SyncFileResult[];
  /** Files `--write` would change (or changed) */
  pending: number;
  /** Files this run wrote */
  written: number;
}

/** Files that tell the package manager (see `inferScaffoldOptions`). */
const PM_EVIDENCE = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  ".yarnrc.yml",
  "bun.lock",
  "bun.lockb",
];

/** Used only to find out which templates embed the GitHub owner. */
const OWNER_PROBE = "ossready-owner-probe";

const MISSING_REASON = "would create only with --add-missing";

async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * A fresh scaffold has no lockfile until its first install, and only Yarn
 * scaffolds pin `packageManager`. With neither, fall back to the setup steps in
 * the repo's own ossready-managed ci.yml, so a pnpm or bun scaffold is not
 * "synced" to the npm template. Unmarked workflows are never read for this.
 */
async function packageManagerFromManagedCi(
  root: string,
): Promise<ScaffoldOptions["packageManager"] | undefined> {
  for (const file of PM_EVIDENCE) {
    if (await pathExists(join(root, file))) return undefined;
  }
  const pkgText = await readText(join(root, "package.json"));
  if (pkgText !== undefined) {
    try {
      const pkg = JSON.parse(pkgText) as { packageManager?: unknown };
      if (packageManagerFromField(pkg.packageManager)) return undefined;
    } catch {
      // invalid package.json: nothing to learn from it
    }
  }
  const ci = await readText(join(root, ".github/workflows/ci.yml"));
  if (ci === undefined || !isManaged(ci)) return undefined;
  if (/uses:\s*pnpm\/action-setup@/.test(ci)) return "pnpm";
  if (/uses:\s*oven-sh\/setup-bun@/.test(ci)) return "bun";
  if (/run:\s*corepack enable/.test(ci)) return "yarn";
  return undefined;
}

function parsePackageManager(raw: string | undefined): ScaffoldOptions["packageManager"] | undefined {
  if (raw === undefined) return undefined;
  const pm = String(raw).trim().toLowerCase();
  if (!(PACKAGE_MANAGERS as readonly string[]).includes(pm)) {
    throw new Error(`Invalid --package-manager "${raw}". Use: ${PACKAGE_MANAGERS.join(" | ")}`);
  }
  return pm as ScaffoldOptions["packageManager"];
}

/** Compare (and with `write`, update) the managed files in `directory`. No console output. */
export async function runSync(directory: string, flags: SyncFlags = {}): Promise<SyncReport> {
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

  const pmFlag = parsePackageManager(flags.packageManager);
  // Same inference as `doctor --fix`: package.json, lockfiles, the origin remote.
  const { options: inferred } = await inferScaffoldOptions(root, { githubOwner: flags.githubOwner });
  const packageManager =
    pmFlag ?? (await packageManagerFromManagedCi(root)) ?? inferred.packageManager;
  const options: ScaffoldOptions = { ...inferred, packageManager };

  // init's own renderers; a template is in scope when it carries the marker.
  const templates = buildScaffoldFiles(options).filter((f) => isManaged(f.content));
  const render = (githubOwner: string | undefined) =>
    new Map(buildScaffoldFiles({ ...options, githubOwner }).map((f) => [f.path, f.content]));
  const withOwner = render(OWNER_PROBE);
  const withoutOwner = render(undefined);

  const files: SyncFileResult[] = [];
  for (const { path, content } of templates) {
    const current = await readText(resolve(root, path));
    const ownerBound = withOwner.get(path) !== withoutOwner.get(path);

    if (current === undefined) {
      const create = Boolean(flags.addMissing);
      files.push({
        path,
        status: "missing",
        pending: create,
        written: false,
        ...(create ? {} : { reason: MISSING_REASON }),
      });
    } else if (current === content) {
      files.push({ path, status: "up-to-date", pending: false, written: false });
    } else if (ownerBound && !options.githubOwner) {
      // Re-rendering would swap real URLs for OWNER placeholders.
      files.push({
        path,
        status: "skipped",
        pending: false,
        written: false,
        reason:
          'needs the GitHub owner: pass --github-owner <you> or add "repository" to package.json',
      });
    } else if (!isManaged(current) && !flags.force) {
      files.push({
        path,
        status: "skipped",
        pending: false,
        written: false,
        reason:
          stripManagedMarker(content) === current
            ? "not managed by ossready: no marker line, but it matches the template, so --force safely adopts it"
            : "not managed by ossready: no marker line; --force overwrites it",
      });
    } else {
      files.push({
        path,
        status: "outdated",
        pending: true,
        written: false,
        ...diffStats(current, content),
        diff: unifiedDiff(current, content, `a/${path}`, `b/${path}`),
      });
    }
  }

  const write = Boolean(flags.write);
  if (write) {
    const contentByPath = new Map(templates.map((t) => [t.path, t.content]));
    for (const file of files) {
      if (!file.pending) continue;
      const full = resolve(root, file.path);
      await ensureDir(dirname(full));
      await writeFile(full, contentByPath.get(file.path) ?? "", "utf8");
      file.written = true;
    }
  }

  return {
    directory: root,
    write,
    options: {
      name: options.name,
      packageManager,
      ...(options.githubOwner ? { githubOwner: options.githubOwner } : {}),
    },
    files,
    pending: files.filter((f) => f.pending).length,
    written: files.filter((f) => f.written).length,
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** One status line for a file, e.g. `would update (+1 -1)`. */
export function syncFileLabel(file: SyncFileResult, write: boolean): string {
  switch (file.status) {
    case "up-to-date":
      return "up to date";
    case "outdated": {
      const stats = `(+${file.added ?? 0} -${file.removed ?? 0})`;
      return `${file.written ? "updated" : write ? "not updated" : "would update"} ${stats}`;
    }
    case "missing":
      if (!file.pending) return `missing (${file.reason ?? MISSING_REASON})`;
      return file.written ? "created" : write ? "not created" : "missing (would create)";
    default:
      return `skipped (${file.reason ?? "not managed by ossready"})`;
  }
}

const SYMBOL: Record<SyncStatus, string> = {
  "up-to-date": "✔",
  outdated: "~",
  missing: "+",
  skipped: "·",
};

/** Human-readable report: one line per file, plus diffs unless `quiet`. */
export function formatSyncReport(report: SyncReport, opts: { quiet?: boolean } = {}): string {
  const { write, options: o } = report;
  const lines: string[] = [];
  lines.push(`\nossready sync${write ? "" : " (dry run)"} → ${report.directory}`);
  lines.push(
    `  Templates rendered for "${o.name}", ${o.packageManager}${o.githubOwner ? `, owner ${o.githubOwner}` : ", no GitHub owner"}\n`,
  );
  for (const file of report.files) {
    lines.push(`  ${SYMBOL[file.status]} ${file.path} — ${syncFileLabel(file, write)}`);
    if (file.status === "outdated" && file.pending && file.diff && !opts.quiet) {
      for (const line of file.diff.replace(/\n$/, "").split("\n")) lines.push(`      ${line}`);
    }
  }

  const count = (pred: (f: SyncFileResult) => boolean) => report.files.filter(pred).length;
  const upToDate = count((f) => f.status === "up-to-date");
  const updates = count((f) => f.status === "outdated" && f.pending);
  const creates = count((f) => f.status === "missing" && f.pending);
  const missing = count((f) => f.status === "missing" && !f.pending);
  const skipped = count((f) => f.status === "skipped");
  const parts = [`${upToDate} up to date`];
  if (updates) parts.push(`${updates} ${write ? "updated" : "would update"}`);
  if (creates) parts.push(`${creates} ${write ? "created" : "would create"}`);
  if (missing) parts.push(`${missing} missing`);
  if (skipped) parts.push(`${skipped} skipped`);
  lines.push(`\n  ${plural(report.files.length, "managed file")}: ${parts.join(", ")}`);

  if (missing) lines.push("  Add --add-missing to create the missing files.");
  if (report.files.some((f) => f.status === "skipped" && f.reason?.startsWith("not managed"))) {
    lines.push("  Files without the ossready marker line are left alone; --force updates them too.");
  }
  if (write) {
    lines.push(
      report.written
        ? `\n✔ Wrote ${plural(report.written, "file")}. Review the changes before committing.\n`
        : "\n✔ Nothing to write.\n",
    );
  } else if (report.pending) {
    lines.push(`\nRun \`ossready sync --write\` to apply ${plural(report.pending, "change")}.\n`);
  } else {
    lines.push("\n✔ Everything ossready manages is up to date.\n");
  }
  return lines.join("\n");
}

/**
 * `ossready sync [directory]`. Exit code 1 when a dry run finds pending
 * changes (handy in CI); 0 when up to date and after a successful `--write`.
 */
export async function syncCommand(directory: string, flags: SyncFlags = {}): Promise<SyncReport> {
  const report = await runSync(directory, flags);
  const failed = !report.write && report.pending > 0;
  if (flags.json) {
    console.log(JSON.stringify({ ...report, ok: !failed }, null, 2));
  } else {
    console.log(formatSyncReport(report, { quiet: flags.quiet }));
  }
  if (failed) process.exitCode = 1;
  return report;
}
