import { execFile } from "node:child_process";

/** Default branch for repositories created by `ossready init --git`. */
export const DEFAULT_GIT_BRANCH = "main";

export type GitInitResult =
  /** A new repository was created with `branch` as its unborn default branch. */
  | { status: "initialized"; branch: string }
  /** `dir` is already inside a git work tree (its top level is `root`), so nothing was run. */
  | { status: "existing"; root: string };

interface GitRun {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** git is not installed (spawn ENOENT) */
  missing: boolean;
}

function runGit(args: string[], cwd: string): Promise<GitRun> {
  return new Promise((resolvePromise) => {
    execFile(
      "git",
      args,
      { cwd, timeout: 10_000, windowsHide: true },
      (err, stdout, stderr) => {
        const code = (err as NodeJS.ErrnoException | null)?.code;
        resolvePromise({
          ok: !err,
          stdout: String(stdout).trim(),
          stderr: String(stderr).trim(),
          missing: code === "ENOENT",
        });
      },
    );
  });
}

/**
 * The top level of the git work tree that contains `dir`, or `undefined` when
 * `dir` is not inside one (or git is not installed).
 */
export async function gitWorkTreeRoot(dir: string): Promise<string | undefined> {
  const result = await runGit(["rev-parse", "--show-toplevel"], dir);
  return result.ok && result.stdout ? result.stdout : undefined;
}

/**
 * `git init` in `dir` with `branch` as the default branch, unless `dir` is
 * already inside a git work tree (a monorepo, or a re-run with `--force`).
 * Never commits, so it needs no git identity. Throws with a readable message
 * when git is missing or `git init` fails.
 */
export async function initGitRepo(
  dir: string,
  branch: string = DEFAULT_GIT_BRANCH,
): Promise<GitInitResult> {
  const probe = await runGit(["rev-parse", "--show-toplevel"], dir);
  if (probe.missing) {
    throw new Error("git is not installed or not on PATH");
  }
  if (probe.ok && probe.stdout) {
    return { status: "existing", root: probe.stdout };
  }

  // --initial-branch needs git 2.28+; older versions get a plain init and the
  // same unborn branch via symbolic-ref.
  const init = await runGit(["init", "--quiet", `--initial-branch=${branch}`], dir);
  if (!init.ok) {
    const plain = await runGit(["init", "--quiet"], dir);
    if (!plain.ok) {
      throw new Error(`git init failed: ${plain.stderr || init.stderr || "unknown error"}`);
    }
    const ref = await runGit(["symbolic-ref", "HEAD", `refs/heads/${branch}`], dir);
    if (!ref.ok) {
      throw new Error(`git symbolic-ref HEAD refs/heads/${branch} failed: ${ref.stderr || "unknown error"}`);
    }
  }
  return { status: "initialized", branch };
}
