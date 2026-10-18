import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  GITHUB_OWNER_RE,
  githubOwnerFromUrl,
  gitRemoteUrl,
  inferGithubOwnerFromGit,
} from "../utils/github.js";

/** Markers that delimit the managed badge block in README.md. */
export const BADGES_START = "<!-- ossready:badges:start -->";
export const BADGES_END = "<!-- ossready:badges:end -->";

/** The command that adds the owner-bound badges when no GitHub owner can be inferred. */
export const BADGES_WRITE_COMMAND = "ossready badges --write --github-owner <you>";

export type BadgeId = "ci" | "npm-version" | "npm-downloads" | "license" | "scorecard" | "codeql";

export interface Badge {
  id: BadgeId;
  label: string;
  image: string;
  link: string;
  markdown: string;
}

export interface BadgesOptions {
  /** GitHub owner override */
  githubOwner?: string;
  /** Repo name override: `name` or `owner/name` */
  repo?: string;
  /** Skip `git config --global github.user` (tests, doctor) */
  noGitConfig?: boolean;
  /** Skip the parent directory's origin remote (doctor: same sources as `doctor --fix`) */
  noParent?: boolean;
}

export interface BadgesResult {
  owner?: string;
  ownerSource?: string;
  repo: string;
  badges: Badge[];
  /** Badge ids that were skipped because no GitHub owner is known */
  needsOwner: BadgeId[];
  markdown: string;
}

export const NO_OWNER_HINT =
  "No GitHub owner found (no GitHub URL in package.json, no github.com origin remote, parent remote, or git config github.user). " +
  "Pass --github-owner <you> (or --repo <owner>/<name>) to include CI, CodeQL, and Scorecard badges.";

interface PackageJsonLike {
  name?: unknown;
  private?: unknown;
  license?: unknown;
  repository?: unknown;
  bugs?: unknown;
  homepage?: unknown;
}

async function readPackageJson(root: string): Promise<PackageJsonLike | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as PackageJsonLike) : undefined;
  } catch {
    return undefined;
  }
}

/** Repo name from a GitHub URL, e.g. `https://github.com/o/name.git` → `name`. */
export function githubRepoFromUrl(url: string): string | undefined {
  const m = url.match(/github\.com[/:][A-Za-z0-9-]+\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[#?/].*)?$/i);
  return m?.[1] || undefined;
}

function urlField(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { url?: unknown }).url === "string") {
    return (value as { url: string }).url;
  }
  return undefined;
}

/** `repository`, `bugs`, and `homepage` URLs from package.json, in that order. */
function packageUrls(pkg: PackageJsonLike | undefined): string[] {
  return [urlField(pkg?.repository), urlField(pkg?.bugs), urlField(pkg?.homepage)].filter(
    (u): u is string => Boolean(u),
  );
}

/** shields.io static badge escaping: `-` → `--`, `_` → `__`, spaces → `%20`. */
export function shieldsEscape(text: string): string {
  return encodeURIComponent(text.replace(/-/g, "--").replace(/_/g, "__")).replace(/%2D%2D/g, "--");
}

async function detectLicense(root: string, pkg: PackageJsonLike | undefined): Promise<string | undefined> {
  if (typeof pkg?.license === "string" && pkg.license.trim() && pkg.license !== "UNLICENSED") {
    return pkg.license.trim();
  }
  for (const name of ["LICENSE", "LICENSE.md", "LICENSE.txt"]) {
    try {
      const text = await readFile(join(root, name), "utf8");
      if (/Apache License/i.test(text) && /Version 2\.0/.test(text)) return "Apache-2.0";
      if (/MIT License/i.test(text) || /Permission is hereby granted, free of charge/i.test(text)) return "MIT";
      if (/GNU GENERAL PUBLIC LICENSE/.test(text) && /Version 3/.test(text)) return "GPL-3.0";
      if (/BSD 3-Clause/i.test(text)) return "BSD-3-Clause";
      if (/ISC License/i.test(text)) return "ISC";
    } catch {
      // try the next name
    }
  }
  return undefined;
}

function licenseFileName(root: string): string | undefined {
  return ["LICENSE", "LICENSE.md", "LICENSE.txt"].find((n) => existsSync(join(root, n)));
}

function badge(id: BadgeId, label: string, image: string, link: string): Badge {
  return { id, label, image, link, markdown: `[![${label}](${image})](${link})` };
}

function workflowBadge(id: BadgeId, label: string, owner: string, repo: string, file: string): Badge {
  const base = `https://github.com/${owner}/${repo}/actions/workflows/${file}`;
  return badge(id, label, `${base}/badge.svg`, base);
}

/** What the badges are built from. `detectBadges` reads it from disk; `ossready init` knows it up front. */
export interface BadgeFacts {
  owner?: string;
  repo: string;
  /** npm package name, only for packages that are published (named and not private) */
  npmName?: string;
  /** SPDX license id */
  license?: string;
  /** LICENSE file the license badge links to (else the SPDX page) */
  licenseFile?: string;
  workflows: { ci: boolean; scorecard: boolean; codeql: boolean };
}

/** Build the badges for `facts`, in display order. Pure; the single source of badge Markdown. */
export function buildBadges(facts: BadgeFacts): { badges: Badge[]; needsOwner: BadgeId[] } {
  const { owner, repo, npmName, license, licenseFile, workflows } = facts;
  const badges: Badge[] = [];
  const needsOwner: BadgeId[] = [];

  if (workflows.ci) {
    if (owner) badges.push(workflowBadge("ci", "CI", owner, repo, "ci.yml"));
    else needsOwner.push("ci");
  }
  if (npmName) {
    const link = `https://www.npmjs.com/package/${npmName}`;
    badges.push(badge("npm-version", "npm version", `https://img.shields.io/npm/v/${npmName}.svg`, link));
    badges.push(badge("npm-downloads", "npm downloads", `https://img.shields.io/npm/dm/${npmName}.svg`, link));
  }
  if (license) {
    const link = licenseFile ?? `https://spdx.org/licenses/${encodeURIComponent(license)}.html`;
    badges.push(
      badge("license", `License: ${license}`, `https://img.shields.io/badge/License-${shieldsEscape(license)}-yellow.svg`, link),
    );
  }
  if (workflows.scorecard) {
    if (owner) {
      badges.push(
        badge(
          "scorecard",
          "OpenSSF Scorecard",
          `https://img.shields.io/ossf-scorecard/github.com/${owner}/${repo}?label=openssf%20scorecard`,
          `https://scorecard.dev/viewer/?uri=github.com/${owner}/${repo}`,
        ),
      );
    } else needsOwner.push("scorecard");
  }
  if (workflows.codeql) {
    if (owner) badges.push(workflowBadge("codeql", "CodeQL", owner, repo, "codeql.yml"));
    else needsOwner.push("codeql");
  }
  return { badges, needsOwner };
}

/**
 * Detect which badges apply to `dir` and build their Markdown. Read-only.
 * Owner: flags, then GitHub URLs in package.json, then the origin remote, the
 * parent's origin remote, and `git config github.user` (the last two optional).
 */
export async function detectBadges(dir: string, options: BadgesOptions = {}): Promise<BadgesResult> {
  const root = resolve(dir);
  const pkg = await readPackageJson(root);
  const urls = packageUrls(pkg);

  let owner: string | undefined;
  let ownerSource: string | undefined;
  let repo: string | undefined;

  if (options.repo) {
    const parts = options.repo.split("/");
    if (parts.length === 2) {
      owner = parts[0];
      ownerSource = "--repo";
      repo = parts[1];
    } else if (parts.length === 1) {
      repo = parts[0];
    }
    if (!repo || !/^[A-Za-z0-9._-]+$/.test(repo)) {
      throw new Error(`Invalid --repo "${options.repo}": use <name> or <owner>/<name>`);
    }
  }
  if (options.githubOwner) {
    owner = options.githubOwner;
    ownerSource = "--github-owner";
  }
  if (owner !== undefined && !GITHUB_OWNER_RE.test(owner)) {
    throw new Error(`Invalid GitHub owner "${owner}"`);
  }
  if (!owner) {
    const fromPkg = urls.map((u) => githubOwnerFromUrl(u)).find(Boolean);
    if (fromPkg) {
      owner = fromPkg;
      ownerSource = "package.json";
    }
  }
  if (!owner) {
    const inferred = await inferGithubOwnerFromGit(root, {
      parent: !options.noParent,
      gitConfig: !options.noGitConfig,
    });
    if (inferred) {
      owner = inferred.owner;
      ownerSource = inferred.source;
    }
  }
  if (!repo) {
    const remote = await gitRemoteUrl(root);
    const pkgName = typeof pkg?.name === "string" ? pkg.name.replace(/^@[^/]+\//, "") : undefined;
    repo =
      urls.map((u) => githubRepoFromUrl(u)).find(Boolean) ??
      (remote ? githubRepoFromUrl(remote) : undefined) ??
      (pkgName || undefined) ??
      basename(root);
  }

  const workflows = join(root, ".github", "workflows");
  const npmName = typeof pkg?.name === "string" && pkg.name.trim() && pkg.private !== true ? pkg.name.trim() : undefined;
  const { badges, needsOwner } = buildBadges({
    owner,
    repo,
    npmName,
    license: await detectLicense(root, pkg),
    licenseFile: licenseFileName(root),
    workflows: {
      ci: existsSync(join(workflows, "ci.yml")),
      scorecard: existsSync(join(workflows, "scorecard.yml")),
      codeql: existsSync(join(workflows, "codeql.yml")),
    },
  });

  return { owner, ownerSource, repo, badges, needsOwner, markdown: renderBadgeBlock(badges) };
}

/**
 * The full managed block, markers included, without a trailing newline. Blank
 * lines around the badges keep it stable under Prettier (the markers are HTML
 * blocks, which Prettier separates from the badge paragraph).
 */
export function renderBadgeBlock(badges: Badge[]): string {
  if (!badges.length) return [BADGES_START, BADGES_END].join("\n");
  return [BADGES_START, "", ...badges.map((b) => b.markdown), "", BADGES_END].join("\n");
}

export type UpsertAction = "inserted" | "updated" | "unchanged";

/**
 * Insert `block` into README text, or replace the existing marked block.
 * Without markers it goes right after the first H1 (outside code fences),
 * or at the top when there is no H1. Running it twice yields no diff.
 */
export function upsertBadgeBlock(readme: string, block: string): { content: string; action: UpsertAction } {
  const eol = readme.includes("\r\n") ? "\r\n" : "\n";
  const normalized = eol === "\n" ? block : block.replace(/\n/g, eol);
  const start = readme.indexOf(BADGES_START);
  if (start !== -1) {
    const end = readme.indexOf(BADGES_END, start);
    if (end === -1) {
      throw new Error(`README has ${BADGES_START} but no ${BADGES_END} after it`);
    }
    const content = readme.slice(0, start) + normalized + readme.slice(end + BADGES_END.length);
    return { content, action: content === readme ? "unchanged" : "updated" };
  }
  if (readme.includes(BADGES_END)) {
    throw new Error(`README has ${BADGES_END} but no ${BADGES_START} before it`);
  }

  const lines = readme.split(eol);
  let inFence = false;
  let h1 = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s{0,3}(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && /^#\s/.test(line)) {
      h1 = i;
      break;
    }
  }
  if (h1 === -1) {
    const rest = readme.length === 0 ? "" : eol + eol + readme.replace(/^(\r?\n)+/, "");
    return { content: normalized + (rest || eol), action: "inserted" };
  }
  const out = [...lines.slice(0, h1 + 1), "", normalized];
  const after = lines.slice(h1 + 1);
  if (after.length === 0 || after[0] !== "") out.push("");
  if (after.length === 0) out.push("");
  out.push(...after);
  return { content: out.join(eol), action: "inserted" };
}

/** How README text compares with `block`: the state the `readme-badges` doctor check reports. */
export type BadgeBlockState = "current" | "missing" | "outdated" | "malformed";

export function badgeBlockState(readme: string, block: string): BadgeBlockState {
  if (!readme.includes(BADGES_START) && !readme.includes(BADGES_END)) return "missing";
  try {
    return upsertBadgeBlock(readme, block).action === "unchanged" ? "current" : "outdated";
  } catch {
    return "malformed";
  }
}

export interface BadgesCommandOptions extends BadgesOptions {
  write?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export interface BadgesCommandOutcome {
  result: BadgesResult;
  readme?: { path: string; action: UpsertAction; written: boolean };
  exitCode: number;
}

/** Core of `ossready badges`, returning what it did (and printing nothing). */
export async function runBadges(dir: string, options: BadgesCommandOptions = {}): Promise<BadgesCommandOutcome> {
  const result = await detectBadges(dir, options);
  if (!options.write) return { result, exitCode: 0 };
  if (!result.owner) return { result, exitCode: 1 };
  const path = join(resolve(dir), "README.md");
  let current = "";
  try {
    current = await readFile(path, "utf8");
  } catch {
    current = "";
  }
  const { content, action } = upsertBadgeBlock(current, result.markdown);
  const written = action !== "unchanged" && !options.dryRun;
  if (written) await writeFile(path, content, "utf8");
  return { result, readme: { path, action, written }, exitCode: 0 };
}

/** CLI entry for `ossready badges [directory]`. */
export async function badgesCommand(dir: string, options: BadgesCommandOptions = {}): Promise<void> {
  const outcome = await runBadges(dir, options);
  const { result, readme } = outcome;
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          owner: result.owner ?? null,
          ownerSource: result.ownerSource ?? null,
          repo: result.repo,
          badges: result.badges,
          needsOwner: result.needsOwner,
          markdown: result.markdown,
          ...(readme ? { readme: { ...readme, dryRun: Boolean(options.dryRun) } } : {}),
          ...(result.owner ? {} : { hint: NO_OWNER_HINT }),
        },
        null,
        2,
      ),
    );
  } else {
    if (!options.write) console.log(result.markdown);
    if (!result.owner) console.error(`\n⚠ ${NO_OWNER_HINT}`);
    if (readme) {
      const verb =
        readme.action === "unchanged"
          ? "already up to date"
          : options.dryRun
            ? `would be ${readme.action} (dry run, nothing written)`
            : readme.action;
      console.log(`README.md badge block ${verb}: ${readme.path}`);
      if (options.dryRun && readme.action !== "unchanged") console.log(result.markdown);
    }
  }
  if (options.write && !result.owner && !options.json) {
    console.error("✖ --write needs a GitHub owner; README.md was not changed.");
  }
  if (outcome.exitCode !== 0) process.exitCode = outcome.exitCode;
}
