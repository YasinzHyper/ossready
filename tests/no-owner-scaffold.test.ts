import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BADGES_END, BADGES_START } from "../src/commands/badges.js";
import { doctorCommand, runDoctor } from "../src/commands/doctor.js";
import { inferScaffoldOptions } from "../src/commands/fix.js";
import { initCommand } from "../src/commands/init.js";
import { inferPromptDefaults } from "../src/prompts.js";
import { ADD_LINKS_COMMAND, inferGithubOwnerFromGit } from "../src/utils/github.js";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-no-owner-"));
}

async function put(root: string, rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf8");
}

function remote(url: string): string {
  return `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`;
}

function quiet(): string[] {
  const logs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
    logs.push(String(msg));
  });
  return logs;
}

async function readPkg(dir: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as Record<string, unknown>;
}

/** Point git's global config at an empty (or given) file so the machine's `github.user` never leaks in. */
async function isolateGitConfig(content?: string): Promise<void> {
  const file = join(await tempDir(), "gitconfig");
  if (content !== undefined) await writeFile(file, content, "utf8");
  vi.stubEnv("GIT_CONFIG_GLOBAL", file);
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
}

beforeEach(async () => {
  await isolateGitConfig();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
});

describe("ossready init without a GitHub owner", () => {
  it("explains how to add the links, and doctor --fix --github-owner makes doctor --strict pass", async () => {
    const dir = join(await tempDir(), "no-owner-app");
    const logs = quiet();
    await initCommand(dir, { name: "no-owner-app" });

    const out = logs.join("\n");
    expect(ADD_LINKS_COMMAND).toBe("ossready doctor --fix --github-owner <you>");
    expect(out).toContain("No GitHub owner was given or found");
    expect(out).toContain("without CI, CodeQL or Scorecard");
    expect(out).toContain(ADD_LINKS_COMMAND);
    expect(out).not.toContain("GitHub owner: ");

    const pkg = await readPkg(dir);
    expect(pkg.repository).toBeUndefined();
    expect(pkg.bugs).toBeUndefined();
    expect(pkg.homepage).toBeUndefined();

    // README gets the badges that don't need an owner, between the managed markers.
    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme.startsWith(`# no-owner-app\n\n${BADGES_START}\n`)).toBe(true);
    expect(readme).toContain(BADGES_END);
    expect(readme).toContain("https://img.shields.io/npm/v/no-owner-app.svg");
    expect(readme).toContain("https://img.shields.io/npm/dm/no-owner-app.svg");
    expect(readme).toContain("https://img.shields.io/badge/License-MIT-yellow.svg");
    expect(readme).not.toContain("actions/workflows/ci.yml");
    expect(readme).not.toContain("OWNER");

    // Only pkg-links fails, and it names the exact command to run.
    const before = await runDoctor(dir);
    expect(before.results.filter((r) => !r.ok).map((r) => r.id)).toEqual(["pkg-links"]);
    expect(before.results.find((r) => r.id === "readme-badges")?.ok).toBe(true);
    const links = before.results.find((r) => r.id === "pkg-links");
    expect(links?.detail).toContain(ADD_LINKS_COMMAND);

    // Plain --fix cannot guess the owner and says how to pass it.
    const plain = quiet();
    await doctorCommand(dir, { fix: true });
    expect(plain.join("\n")).toContain(`pkg-links: could not infer the GitHub owner — run \`${ADD_LINKS_COMMAND}\``);
    expect((await readPkg(dir)).repository).toBeUndefined();
    expect(await readFile(join(dir, "README.md"), "utf8")).toBe(readme);
    process.exitCode = undefined;

    // The documented path: links and the owner-bound badges in one go.
    const fixLogs = quiet();
    await doctorCommand(dir, { fix: true, githubOwner: "example" });
    const fixOut = fixLogs.join("\n");
    expect(fixOut).toContain("Added to package.json: repository, bugs, homepage");
    expect(fixOut).toContain("README.md badge block updated");
    const after = await readPkg(dir);
    expect(after.repository).toEqual({ type: "git", url: "git+https://github.com/example/no-owner-app.git" });
    expect(after.bugs).toEqual({ url: "https://github.com/example/no-owner-app/issues" });
    expect(after.homepage).toBe("https://github.com/example/no-owner-app#readme");
    expect(after.name).toBe("no-owner-app");
    const fixedReadme = await readFile(join(dir, "README.md"), "utf8");
    expect(fixedReadme).toContain("https://github.com/example/no-owner-app/actions/workflows/ci.yml/badge.svg");
    expect(fixedReadme).toContain("https://github.com/example/no-owner-app/actions/workflows/codeql.yml/badge.svg");
    expect(fixedReadme).toContain("https://scorecard.dev/viewer/?uri=github.com/example/no-owner-app");
    // Only the managed block changed.
    expect(fixedReadme.slice(fixedReadme.indexOf(BADGES_END))).toBe(readme.slice(readme.indexOf(BADGES_END)));

    process.exitCode = undefined;
    quiet();
    const report = await doctorCommand(dir, { strict: true });
    expect(report.results.filter((r) => !r.ok).map((r) => [r.id, r.detail])).toEqual([]);
    expect(report.passed).toBe(report.total);
    expect(process.exitCode).toBeUndefined();
  });

  it("prints the hint in --dry-run too", async () => {
    const dir = join(await tempDir(), "dry-no-owner");
    const logs = quiet();
    await initCommand(dir, { name: "dry-no-owner", dryRun: true });
    expect(logs.join("\n")).toContain(ADD_LINKS_COMMAND);
  });
});

describe("ossready init infers the GitHub owner", () => {
  it("from the target directory's origin remote (https)", async () => {
    const dir = await tempDir();
    await put(dir, ".git/config", remote("https://github.com/remote-owner/thing.git"));
    const logs = quiet();
    await initCommand(dir, { name: "thing", force: true });
    const pkg = await readPkg(dir);
    expect(pkg.homepage).toBe("https://github.com/remote-owner/thing#readme");
    const out = logs.join("\n");
    expect(out).toContain("GitHub owner: remote-owner (inferred from the origin git remote");
    expect(out).not.toContain(ADD_LINKS_COMMAND);
    expect(await readFile(join(dir, "README.md"), "utf8")).toContain(
      "https://github.com/remote-owner/thing/actions/workflows/ci.yml/badge.svg",
    );

    quiet();
    const report = await doctorCommand(dir, { strict: true });
    expect(report.results.filter((r) => !r.ok).map((r) => r.id)).toEqual([]);
  });

  it("from the parent directory's origin remote (ssh)", async () => {
    const parent = await tempDir();
    await put(parent, ".git/config", remote("git@github.com:parent-owner/mono.git"));
    const dir = join(parent, "child-lib");
    const logs = quiet();
    await initCommand(dir, { name: "child-lib" });
    expect((await readPkg(dir)).bugs).toEqual({ url: "https://github.com/parent-owner/child-lib/issues" });
    expect(logs.join("\n")).toContain("inferred from the parent directory's origin git remote");
  });

  it("from git config github.user when there is no GitHub remote", async () => {
    await isolateGitConfig("[github]\n\tuser = cfg-user\n");
    const parent = await tempDir();
    await put(parent, ".git/config", remote("https://gitlab.com/someone/elsewhere.git"));
    const dir = join(parent, "cfg-app");
    const logs = quiet();
    await initCommand(dir, { name: "cfg-app" });
    expect((await readPkg(dir)).homepage).toBe("https://github.com/cfg-user/cfg-app#readme");
    expect(logs.join("\n")).toContain("inferred from git config github.user");
  });

  it("never overrides an explicit --github-owner", async () => {
    const dir = await tempDir();
    await put(dir, ".git/config", remote("https://github.com/remote-owner/thing.git"));
    const logs = quiet();
    await initCommand(dir, { name: "thing", force: true, githubOwner: "flag-owner" });
    expect((await readPkg(dir)).homepage).toBe("https://github.com/flag-owner/thing#readme");
    expect(logs.join("\n")).not.toContain("inferred from");
  });

  it("offers the inferred owner as the prompt default", async () => {
    const parent = await tempDir();
    await put(parent, ".git/config", remote("git@github.com:prompt-owner/repo.git"));
    const defaults = await inferPromptDefaults(join(parent, "new-thing"), {});
    expect(defaults.githubOwner).toBe("prompt-owner");

    const empty = await inferPromptDefaults(join(await tempDir(), "nothing"), {});
    expect(empty.githubOwner).toBeUndefined();
  });
});

describe("inferGithubOwnerFromGit (shared by init and doctor --fix)", () => {
  it("reads only the directory itself unless asked to look further", async () => {
    await isolateGitConfig("[github]\n\tuser = cfg-user\n");
    const parent = await tempDir();
    await put(parent, ".git/config", remote("https://github.com/parent-owner/x.git"));
    const child = join(parent, "child");
    await mkdir(child);

    expect(await inferGithubOwnerFromGit(child)).toBeUndefined();
    expect(await inferGithubOwnerFromGit(child, { parent: true })).toEqual({
      owner: "parent-owner",
      source: "the parent directory's origin git remote",
    });
    expect(await inferGithubOwnerFromGit(join(child, "grandchild"), { parent: true })).toBeUndefined();
    expect(await inferGithubOwnerFromGit(join(child, "grandchild"), { parent: true, gitConfig: true })).toEqual({
      owner: "cfg-user",
      source: "git config github.user",
    });

    // The target's own remote wins over the parent's.
    await put(child, ".git/config", remote("git@github.com:child-owner/y.git"));
    expect((await inferGithubOwnerFromGit(child, { parent: true, gitConfig: true }))?.owner).toBe("child-owner");
  });

  it("keeps doctor --fix on the repo's own remote (no github.user fallback)", async () => {
    await isolateGitConfig("[github]\n\tuser = cfg-user\n");
    const dir = await tempDir();
    expect((await inferScaffoldOptions(dir)).options.githubOwner).toBeUndefined();
    await put(dir, ".git/config", remote("git@github.com:remote-owner/x.git"));
    expect((await inferScaffoldOptions(dir)).options.githubOwner).toBe("remote-owner");
  });
});
