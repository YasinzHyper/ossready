import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { buildScaffoldFiles, type ScaffoldFile } from "../templates/index.js";
import type { ScaffoldOptions } from "../templates/types.js";
import { assertValidEmail, normalizeOptionalEmail } from "../utils/email.js";
import { pathExists, writeFileSafe } from "../utils/fs.js";
import type { DoctorReport } from "./doctor.js";

/**
 * Scaffold files that satisfy each doctor check. Most checks map to one file;
 * issue templates ship as a set (bug, feature, and the chooser config).
 */
export const FIX_FILES: Readonly<Record<string, readonly string[]>> = {
  readme: ["README.md"],
  license: ["LICENSE"],
  "code-of-conduct": ["CODE_OF_CONDUCT.md"],
  contributing: ["CONTRIBUTING.md"],
  security: ["SECURITY.md"],
  "issue-templates": [
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/ISSUE_TEMPLATE/feature_request.yml",
    ".github/ISSUE_TEMPLATE/config.yml",
  ],
  "pr-template": [".github/PULL_REQUEST_TEMPLATE.md"],
  ci: [".github/workflows/ci.yml"],
  support: ["SUPPORT.md"],
  changelog: ["CHANGELOG.md"],
  codeowners: [".github/CODEOWNERS"],
  dependabot: [".github/dependabot.yml"],
  codeql: [".github/workflows/codeql.yml"],
  scorecard: [".github/workflows/scorecard.yml"],
  funding: [".github/FUNDING.yml"],
  citation: ["CITATION.cff"],
  editorconfig: [".editorconfig"],
  gitignore: [".gitignore"],
};

export interface FixFlags {
  /** Override the GitHub owner inferred from package.json / git remote */
  githubOwner?: string;
  /** Override the author / copyright holder inferred from package.json */
  author?: string;
  /** Override the license inferred from package.json (mit | apache-2.0) */
  license?: string;
  /** Code of Conduct contact email (default: GitHub owner link, or none) */
  cocEmail?: string;
  /** Optional private security contact email for SECURITY.md */
  securityEmail?: string;
  /** List what would be written without touching disk */
  dryRun?: boolean;
}

export interface FixPlan {
  /** Files that would be (or were) created */
  create: string[];
  /** Files skipped because something already exists at that path */
  existing: string[];
  /** Check ids that could not be fixed automatically, with the reason */
  skipped: { id: string; reason: string }[];
  /** Options inferred from the repo and flags */
  options: ScaffoldOptions;
}

interface PackageJsonLike {
  name?: unknown;
  description?: unknown;
  license?: unknown;
  author?: unknown;
  repository?: unknown;
}

const GITHUB_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

/** Extract the owner from a GitHub URL (https, git+https, ssh, or `github:owner/repo`). */
export function githubOwnerFromUrl(url: string): string | undefined {
  const m =
    url.match(/github\.com[/:]([A-Za-z0-9-]+)\/[^/\s]+/i) ?? url.match(/^github:([A-Za-z0-9-]+)\//i);
  const owner = m?.[1];
  return owner && GITHUB_OWNER_RE.test(owner) ? owner : undefined;
}

/** Map an SPDX id to a license ossready can scaffold; undefined when unknown. */
export function scaffoldLicense(spdx: string | undefined): ScaffoldOptions["license"] | undefined {
  const v = spdx?.trim().toLowerCase();
  if (v === "mit") return "mit";
  if (v === "apache-2.0" || v === "apache 2.0" || v === "apache2") return "apache-2.0";
  return undefined;
}

function authorName(author: unknown): string | undefined {
  if (typeof author === "string") {
    // "Name <email> (url)" → "Name": keep everything before the email / url part
    const name = (author.split(/[<(]/, 1)[0] ?? "").trim();
    return name || undefined;
  }
  if (author && typeof author === "object" && "name" in author) {
    const name = (author as { name?: unknown }).name;
    return typeof name === "string" && name.trim() ? name.trim() : undefined;
  }
  return undefined;
}

async function readJson(path: string): Promise<PackageJsonLike | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as PackageJsonLike;
  } catch {
    return undefined;
  }
}

async function gitRemoteOwner(root: string): Promise<string | undefined> {
  try {
    const config = await readFile(join(root, ".git", "config"), "utf8");
    const section = config.split(/^\[/m).find((s) => s.startsWith('remote "origin"'));
    const url = section?.match(/^\s*url\s*=\s*(.+)$/m)?.[1]?.trim();
    return url ? githubOwnerFromUrl(url) : undefined;
  } catch {
    return undefined;
  }
}

async function detectPackageManager(root: string): Promise<ScaffoldOptions["packageManager"]> {
  if (await pathExists(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if ((await pathExists(join(root, "bun.lockb"))) || (await pathExists(join(root, "bun.lock")))) {
    return "bun";
  }
  return "npm";
}

/**
 * Infer scaffold options for an existing repo from package.json, lockfiles,
 * and the `origin` git remote. Flags always win over inferred values.
 */
export async function inferScaffoldOptions(
  root: string,
  flags: FixFlags = {},
): Promise<{ options: ScaffoldOptions; licenseKnown: boolean }> {
  const pkg = (await readJson(join(root, "package.json"))) ?? {};

  const name = typeof pkg.name === "string" && pkg.name.trim() ? pkg.name.trim() : basename(root);
  const description =
    typeof pkg.description === "string" && pkg.description.trim()
      ? pkg.description.trim()
      : `${name} — an open-source project.`;

  const repoUrl =
    typeof pkg.repository === "string"
      ? pkg.repository
      : pkg.repository && typeof pkg.repository === "object" && "url" in pkg.repository
        ? String((pkg.repository as { url?: unknown }).url ?? "")
        : "";

  let githubOwner: string | undefined;
  if (flags.githubOwner !== undefined) {
    const trimmed = flags.githubOwner.trim();
    if (!GITHUB_OWNER_RE.test(trimmed)) {
      throw new Error(
        `Invalid --github-owner "${flags.githubOwner}". Use a GitHub username or org (letters, digits, hyphen; 1–39 characters).`,
      );
    }
    githubOwner = trimmed;
  } else {
    githubOwner = (repoUrl ? githubOwnerFromUrl(repoUrl) : undefined) ?? (await gitRemoteOwner(root));
  }

  let license: ScaffoldOptions["license"] | undefined;
  if (flags.license !== undefined) {
    license = scaffoldLicense(flags.license);
    if (!license) {
      throw new Error(`Invalid --license "${flags.license}". Use: mit | apache-2.0`);
    }
  } else {
    license = scaffoldLicense(typeof pkg.license === "string" ? pkg.license : undefined);
  }

  const author = flags.author?.trim() || authorName(pkg.author);

  let cocEmail = "";
  if (flags.cocEmail !== undefined) {
    const trimmed = flags.cocEmail.trim();
    if (trimmed) {
      cocEmail = assertValidEmail(trimmed, "--coc-email");
    }
  }
  const securityEmail = normalizeOptionalEmail(flags.securityEmail, "--security-email");

  return {
    licenseKnown: Boolean(license),
    options: {
      name,
      description,
      license: license ?? "mit",
      packageManager: await detectPackageManager(root),
      year: new Date().getFullYear(),
      copyrightHolder: author ?? githubOwner ?? name,
      cocEmail,
      securityEmail,
      githubOwner,
      author,
    },
  };
}

/** Work out which files `doctor --fix` would write for the failing checks. Pure (no writes). */
export async function planFix(report: DoctorReport, flags: FixFlags = {}): Promise<FixPlan & { files: ScaffoldFile[] }> {
  const root = report.directory;
  const { options, licenseKnown } = await inferScaffoldOptions(root, flags);
  const templates = new Map(buildScaffoldFiles(options).map((f) => [f.path, f]));

  const create: string[] = [];
  const existing: string[] = [];
  const skipped: FixPlan["skipped"] = [];
  const files: ScaffoldFile[] = [];

  for (const result of report.results) {
    if (result.ok) continue;
    if (result.id === "license" && !licenseKnown) {
      skipped.push({
        id: result.id,
        reason:
          "choosing a license is your call — set \"license\" in package.json or pass --license mit|apache-2.0",
      });
      continue;
    }
    const paths = FIX_FILES[result.id];
    if (!paths) {
      skipped.push({ id: result.id, reason: "no template for this check" });
      continue;
    }
    for (const path of paths) {
      const file = templates.get(path);
      if (!file) {
        skipped.push({ id: result.id, reason: `no template for ${path}` });
        continue;
      }
      if (create.includes(path) || existing.includes(path)) continue;
      if (await pathExists(resolve(root, path))) {
        existing.push(path);
      } else {
        create.push(path);
        files.push(file);
      }
    }
  }

  return { create, existing, skipped, options, files };
}

/** Write missing scaffold files for failing checks. Never overwrites existing files. */
export async function applyFix(report: DoctorReport, flags: FixFlags = {}): Promise<FixPlan> {
  const { files, ...plan } = await planFix(report, flags);
  if (!flags.dryRun) {
    for (const file of files) {
      await writeFileSafe(resolve(report.directory, file.path), file.content, false);
    }
  }
  return plan;
}

/** Human-readable summary of a fix run. */
export function formatFixPlan(plan: FixPlan, dryRun: boolean): string {
  const lines: string[] = [];
  const o = plan.options;
  lines.push(
    `\nossready doctor --fix${dryRun ? " (dry run)" : ""} — using name "${o.name}", ${o.license === "mit" ? "MIT" : "Apache-2.0"}, ${o.packageManager}${o.githubOwner ? `, owner ${o.githubOwner}` : ", no GitHub owner (placeholders kept)"}\n`,
  );
  if (plan.create.length) {
    lines.push(`  ${dryRun ? "Would create" : "Created"} (${plan.create.length}):`);
    for (const p of plan.create) lines.push(`    + ${p}`);
  } else {
    lines.push("  Nothing to create.");
  }
  if (plan.existing.length) {
    lines.push(`  Left alone (${plan.existing.length}, already exist):`);
    for (const p of plan.existing) lines.push(`    · ${p}`);
  }
  if (plan.skipped.length) {
    lines.push(`  Not fixed automatically (${plan.skipped.length}):`);
    for (const s of plan.skipped) lines.push(`    ✖ ${s.id}: ${s.reason}`);
  }
  if (plan.create.some((p) => p.startsWith(".github/workflows/"))) {
    lines.push(
      "\n  Review new workflows before pushing: the CI template runs lint, format:check, test, and build scripts.",
    );
  }
  lines.push("");
  return lines.join("\n");
}
