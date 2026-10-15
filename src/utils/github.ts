import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * GitHub owner inference shared by `ossready init` (and its prompt defaults) and
 * `ossready doctor --fix`.
 */

/** Light GitHub login/org check: letters, digits, hyphen; 1–39 chars; no leading/trailing hyphen */
export const GITHUB_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

/** Extract the owner from a GitHub URL (https, git+https, ssh, or `github:owner/repo`). */
export function githubOwnerFromUrl(url: string): string | undefined {
  const m =
    url.match(/github\.com[/:]([A-Za-z0-9-]+)\/[^/\s]+/i) ?? url.match(/^github:([A-Za-z0-9-]+)\//i);
  const owner = m?.[1];
  return owner && GITHUB_OWNER_RE.test(owner) ? owner : undefined;
}

/** URL of the `origin` remote in `<root>/.git/config`, if any. */
export async function gitRemoteUrl(root: string): Promise<string | undefined> {
  try {
    const config = await readFile(join(root, ".git", "config"), "utf8");
    const section = config.split(/^\[/m).find((s) => s.startsWith('remote "origin"'));
    return section?.match(/^\s*url\s*=\s*(.+)$/m)?.[1]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** `git config --global github.user`, when git is installed and the value is a valid owner. */
export function githubUserFromGitConfig(): Promise<string | undefined> {
  return new Promise((resolvePromise) => {
    try {
      execFile(
        "git",
        ["config", "--global", "--get", "github.user"],
        { timeout: 3000, windowsHide: true },
        (err, stdout) => {
          if (err) {
            resolvePromise(undefined);
            return;
          }
          const user = String(stdout).trim();
          resolvePromise(GITHUB_OWNER_RE.test(user) ? user : undefined);
        },
      );
    } catch {
      resolvePromise(undefined);
    }
  });
}

export interface InferredGithubOwner {
  owner: string;
  /** Human-readable origin of the value, e.g. "the origin git remote" */
  source: string;
}

export interface InferGithubOwnerOptions {
  /** Also look at the parent directory's `origin` remote (init into a new subfolder) */
  parent?: boolean;
  /** Fall back to `git config --global github.user` */
  gitConfig?: boolean;
}

/**
 * Infer a GitHub owner from git: the directory's `origin` remote (github.com
 * https or ssh URLs), optionally the parent's, then optionally `github.user`.
 */
export async function inferGithubOwnerFromGit(
  dir: string,
  options: InferGithubOwnerOptions = {},
): Promise<InferredGithubOwner | undefined> {
  const dirs: { path: string; source: string }[] = [{ path: dir, source: "the origin git remote" }];
  const parent = dirname(dir);
  if (options.parent && parent !== dir) {
    dirs.push({ path: parent, source: "the parent directory's origin git remote" });
  }
  for (const { path, source } of dirs) {
    const url = await gitRemoteUrl(path);
    const owner = url ? githubOwnerFromUrl(url) : undefined;
    if (owner) return { owner, source };
  }
  if (options.gitConfig) {
    const user = await githubUserFromGitConfig();
    if (user) return { owner: user, source: "git config github.user" };
  }
  return undefined;
}

/** The exact command that adds package.json links to a scaffold made without an owner. */
export const ADD_LINKS_COMMAND = "ossready doctor --fix --github-owner <you>";
