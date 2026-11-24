import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commandSpec } from "../src/cliSpec.js";
import { initCommand } from "../src/commands/init.js";
import { pathExists } from "../src/utils/fs.js";
import { gitWorkTreeRoot, initGitRepo } from "../src/utils/git.js";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-git-"));
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function captureLogs(): string[] {
  const logs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
    logs.push(String(msg));
  });
  return logs;
}

const baseFlags = {
  name: "demo",
  license: "mit",
  packageManager: "npm",
  githubOwner: "octo",
} as const;

// Every case assumes the temp folder itself is not inside a git checkout.
const tmpInsideRepo = Boolean(await gitWorkTreeRoot(tmpdir()));

beforeEach(async () => {
  // Ignore the machine's git config (init.defaultBranch, templates, hooks).
  const config = join(await tempDir(), "gitconfig");
  await writeFile(config, "", "utf8");
  vi.stubEnv("GIT_CONFIG_GLOBAL", config);
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe.skipIf(tmpInsideRepo)("ossready init --git", () => {
  it("creates a repository on an unborn main branch without committing", async () => {
    const dir = join(await tempDir(), "my-lib");
    const logs = captureLogs();
    await initCommand(dir, { ...baseFlags, git: true });

    expect(await pathExists(join(dir, ".git"))).toBe(true);
    expect(git(dir, "symbolic-ref", "HEAD")).toBe("refs/heads/main");
    // No commit, so no git identity is needed.
    expect(() => git(dir, "rev-parse", "--verify", "HEAD")).toThrow();
    // The scaffolded .gitignore is honoured: everything written is untracked, nothing ignored by mistake.
    const untracked = git(dir, "status", "--porcelain", "--untracked-files=all");
    expect(untracked).toContain("?? package.json");
    expect(untracked).toContain("?? .github/workflows/ci.yml");

    const out = logs.join("\n");
    expect(out).toContain("Initialized a git repository (branch main)");
    expect(out).toContain('git add -A\n  git commit -m "chore: scaffold with ossready"');
    // The first commit comes after install, so the lockfile is in it.
    expect(out.indexOf("npm install")).toBeLessThan(out.indexOf("git add -A"));
  });

  it("does not run git init without --git", async () => {
    const dir = await tempDir();
    const logs = captureLogs();
    await initCommand(dir, baseFlags);
    expect(await pathExists(join(dir, ".git"))).toBe(false);
    expect(logs.join("\n")).not.toContain("git add -A");
  });

  it("skips git init inside an existing repository (monorepo package, re-run with --force)", async () => {
    const root = await tempDir();
    git(root, "init", "--quiet");
    const dir = join(root, "packages", "my-lib");
    const logs = captureLogs();
    await initCommand(dir, { ...baseFlags, git: true });

    expect(await pathExists(join(dir, "package.json"))).toBe(true);
    expect(await pathExists(join(dir, ".git"))).toBe(false);
    const out = logs.join("\n");
    expect(out).toMatch(/Skipped git init: already inside the git repository at .+/);
    expect(out).not.toContain("git commit");
  });

  it("is idempotent when re-run with --force in the same folder", async () => {
    const dir = await tempDir();
    captureLogs();
    await initCommand(dir, { ...baseFlags, git: true });
    const logs = captureLogs();
    await initCommand(dir, { ...baseFlags, git: true, force: true });
    expect(logs.join("\n")).toContain("Skipped git init");
    expect(git(dir, "symbolic-ref", "HEAD")).toBe("refs/heads/main");
  });

  it("--dry-run reports the git step without writing anything", async () => {
    const dir = join(await tempDir(), "not-yet");
    const logs = captureLogs();
    await initCommand(dir, { ...baseFlags, git: true, dryRun: true });
    expect(await pathExists(dir)).toBe(false);
    expect(logs.join("\n")).toContain("Would run: git init --initial-branch=main");
  });

  it("--dry-run inside an existing repository says git init would be skipped", async () => {
    const root = await tempDir();
    git(root, "init", "--quiet");
    const logs = captureLogs();
    await initCommand(join(root, "pkg", "deep"), { ...baseFlags, git: true, dryRun: true });
    expect(logs.join("\n")).toMatch(/Would skip git init: already inside the git repository at .+/);
  });

  it("fails with a clear message when git is not installed, after writing the files", async () => {
    const dir = await tempDir();
    captureLogs();
    vi.stubEnv("PATH", join(dir, "no-bin-here"));
    await expect(initCommand(dir, { ...baseFlags, git: true })).rejects.toThrow(
      /scaffold was written to .+, but --git could not create a repository: git is not installed or not on PATH\. Run `git init --initial-branch=main` there yourself\./,
    );
    vi.unstubAllEnvs();
    expect(await pathExists(join(dir, "package.json"))).toBe(true);
    expect(await pathExists(join(dir, ".git"))).toBe(false);
  });
});

describe.skipIf(tmpInsideRepo)("initGitRepo", () => {
  it("honours a custom branch name", async () => {
    const dir = await tempDir();
    expect(await initGitRepo(dir, "trunk")).toEqual({ status: "initialized", branch: "trunk" });
    expect(git(dir, "symbolic-ref", "HEAD")).toBe("refs/heads/trunk");
  });

  it("reports the existing work tree root", async () => {
    const root = await tempDir();
    git(root, "init", "--quiet");
    const sub = join(root, "a", "b");
    await mkdir(sub, { recursive: true });
    const result = await initGitRepo(sub);
    expect(result.status).toBe("existing");
    expect(result.status === "existing" && result.root).toBe(git(root, "rev-parse", "--show-toplevel"));
    expect(await readdir(sub)).toEqual([]);
  });
});

describe("init --git option", () => {
  it("is a boolean init flag defaulting to false", () => {
    const option = commandSpec("init").options.find((o) => o.flags === "--git");
    expect(option?.default).toBe(false);
  });
});
