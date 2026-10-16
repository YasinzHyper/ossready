import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { buildScaffoldFiles, type ScaffoldFile } from "../templates/index.js";
import type { ScaffoldOptions } from "../templates/types.js";
import { assertValidEmail, normalizeOptionalEmail } from "../utils/email.js";
import { pathExists, writeFileSafe } from "../utils/fs.js";
import {
  ADD_LINKS_COMMAND,
  GITHUB_OWNER_RE,
  githubOwnerFromUrl,
  gitRemoteUrl,
  inferGithubOwnerFromGit,
} from "../utils/github.js";
import type { DoctorReport } from "./doctor.js";
import { linkUrl, readPackageJson, type PackageJson } from "./packageJson.js";

export { githubOwnerFromUrl } from "../utils/github.js";

/**
 * Scaffold files that satisfy each doctor check. Most checks map to one file;
 * issue templates ship as a set (bug, feature, and the chooser config), and
 * AGENTS.md comes with the Copilot instructions file that points to it.
 * The package.json publish-readiness checks and the GitHub Actions version
 * check are handled separately (see planFix).
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
  "agents-md": ["AGENTS.md", ".github/copilot-instructions.md"],
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
  /** package.json fields that would be (or were) added; existing values are never changed */
  packageJson?: { path: "package.json"; add: string[] };
  /** Options inferred from the repo and flags */
  options: ScaffoldOptions;
}

interface PackageJsonLike {
  name?: unknown;
  description?: unknown;
  license?: unknown;
  author?: unknown;
  repository?: unknown;
  bugs?: unknown;
  homepage?: unknown;
  packageManager?: unknown;
}

/** Extract owner and repo name from a GitHub URL (repository, bugs, or homepage style). */
export function githubRepoFromUrl(url: string): { owner: string; repo: string } | undefined {
  const m =
    url.match(/github\.com[/:]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[/#?].*)?$/i) ??
    url.match(/^github:([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/i);
  const owner = m?.[1];
  const repo = m?.[2];
  return owner && repo && GITHUB_OWNER_RE.test(owner) ? { owner, repo } : undefined;
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

/** Package manager from package.json's Corepack `packageManager` field (e.g. `yarn@4.6.0`). */
export function packageManagerFromField(field: unknown): ScaffoldOptions["packageManager"] | undefined {
  if (typeof field !== "string") return undefined;
  const pm = field.trim().split("@", 1)[0]?.toLowerCase();
  return pm === "npm" || pm === "pnpm" || pm === "yarn" || pm === "bun" ? pm : undefined;
}

async function detectPackageManager(
  root: string,
  pkg: PackageJsonLike,
): Promise<ScaffoldOptions["packageManager"]> {
  if (await pathExists(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if ((await pathExists(join(root, "bun.lockb"))) || (await pathExists(join(root, "bun.lock")))) {
    return "bun";
  }
  if ((await pathExists(join(root, "yarn.lock"))) || (await pathExists(join(root, ".yarnrc.yml")))) {
    return "yarn";
  }
  return packageManagerFromField(pkg.packageManager) ?? "npm";
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

  const repoUrl = linkUrl(pkg.repository) ?? "";
  const otherUrls = [linkUrl(pkg.bugs), typeof pkg.homepage === "string" ? pkg.homepage : undefined];

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
    githubOwner =
      (repoUrl ? githubOwnerFromUrl(repoUrl) : undefined) ??
      otherUrls.map((u) => (u ? githubOwnerFromUrl(u) : undefined)).find(Boolean) ??
      (await inferGithubOwnerFromGit(root))?.owner;
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
      packageManager: await detectPackageManager(root, pkg),
      year: new Date().getFullYear(),
      copyrightHolder: author ?? githubOwner ?? name,
      cocEmail,
      securityEmail,
      githubOwner,
      author,
    },
  };
}

/** GitHub repo name for package.json links: existing GitHub URLs, then the git remote, then the package name. */
async function inferRepoName(root: string, pkg: PackageJson): Promise<string> {
  const urls = [
    linkUrl(pkg.repository),
    linkUrl(pkg.bugs),
    typeof pkg.homepage === "string" ? pkg.homepage : undefined,
    await gitRemoteUrl(root),
  ];
  for (const url of urls) {
    const hit = url ? githubRepoFromUrl(url) : undefined;
    if (hit) return hit.repo;
  }
  const name = typeof pkg.name === "string" ? pkg.name.trim() : "";
  return (name.startsWith("@") ? name.split("/")[1] : name) || basename(root);
}

/**
 * Plan the only package.json edit `--fix` makes: add missing `repository`, `bugs`
 * and `homepage` when the GitHub owner is known. Keys that already exist are
 * never touched, even when their value looks wrong.
 */
export async function planPackageJsonLinks(
  root: string,
  owner: string | undefined,
): Promise<{ add: string[]; content?: string; reason?: string }> {
  const state = await readPackageJson(root);
  if (state.kind !== "ok") return { add: [], reason: "package.json could not be read" };
  if (!owner) {
    return {
      add: [],
      reason: `could not infer the GitHub owner — run \`${ADD_LINKS_COMMAND}\`, set an origin git remote, or add "repository" to package.json`,
    };
  }
  const pkg = state.pkg;
  const base = `https://github.com/${owner}/${await inferRepoName(root, pkg)}`;
  const next: PackageJson = { ...pkg };
  const add: string[] = [];
  if (pkg.repository === undefined) {
    next.repository = { type: "git", url: `git+${base}.git` };
    add.push("repository");
  }
  if (pkg.bugs === undefined) {
    next.bugs = { url: `${base}/issues` };
    add.push("bugs");
  }
  if (pkg.homepage === undefined) {
    next.homepage = `${base}#readme`;
    add.push("homepage");
  }
  if (!add.length) {
    return {
      add,
      reason: '"repository", "bugs" or "homepage" exists but is empty or malformed — fix it by hand',
    };
  }
  const indent = state.text.match(/^([ \t]+)"/m)?.[1] ?? "  ";
  return { add, content: JSON.stringify(next, null, indent) + "\n" };
}

/** Work out which files `doctor --fix` would write for the failing checks. Pure (no writes). */
export async function planFix(
  report: DoctorReport,
  flags: FixFlags = {},
): Promise<FixPlan & { files: ScaffoldFile[]; packageJsonContent?: string }> {
  const root = report.directory;
  const { options, licenseKnown } = await inferScaffoldOptions(root, flags);
  const templates = new Map(buildScaffoldFiles(options).map((f) => [f.path, f]));

  const create: string[] = [];
  const existing: string[] = [];
  const skipped: FixPlan["skipped"] = [];
  const files: ScaffoldFile[] = [];
  let packageJson: FixPlan["packageJson"];
  let packageJsonContent: string | undefined;

  for (const result of report.results) {
    if (result.ok) continue;
    if (result.group === "package-json") {
      if (result.id === "pkg-links") {
        const links = await planPackageJsonLinks(root, options.githubOwner);
        if (links.content) {
          packageJson = { path: "package.json", add: links.add };
          packageJsonContent = links.content;
        } else {
          skipped.push({ id: result.id, reason: links.reason ?? "nothing to add" });
        }
      } else {
        skipped.push({ id: result.id, reason: `edit package.json by hand: ${result.detail ?? result.hint}` });
      }
      continue;
    }
    if (result.group === "workflow-actions") {
      // Report-only: rewriting someone's workflows is not a safe automatic edit.
      const count = report.workflowActions?.status === "checked" ? report.workflowActions.outdated.length : 0;
      skipped.push({
        id: result.id,
        reason: `${count} outdated action pin${count === 1 ? "" : "s"} — bump these or let Dependabot (github-actions ecosystem) do it`,
      });
      continue;
    }
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

  return {
    create,
    existing,
    skipped,
    ...(packageJson ? { packageJson } : {}),
    options,
    files,
    ...(packageJsonContent ? { packageJsonContent } : {}),
  };
}

/**
 * Write missing scaffold files for failing checks and add missing package.json
 * links. Never overwrites existing files or existing package.json values.
 */
export async function applyFix(report: DoctorReport, flags: FixFlags = {}): Promise<FixPlan> {
  const { files, packageJsonContent, ...plan } = await planFix(report, flags);
  if (!flags.dryRun) {
    for (const file of files) {
      await writeFileSafe(resolve(report.directory, file.path), file.content, false);
    }
    if (packageJsonContent) {
      await writeFile(resolve(report.directory, "package.json"), packageJsonContent, "utf8");
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
  } else if (!plan.packageJson) {
    lines.push("  Nothing to create.");
  }
  if (plan.packageJson) {
    lines.push(
      `  ${dryRun ? "Would add to" : "Added to"} package.json: ${plan.packageJson.add.join(", ")}`,
    );
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
