import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BADGES_END, BADGES_START } from "../src/commands/badges.js";
import { initCommand } from "../src/commands/init.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

beforeEach(async () => {
  // Point git's global config at an empty temp file so the machine's
  // `github.user` can't be inferred as the owner when --github-owner is omitted.
  vi.stubEnv("GIT_CONFIG_GLOBAL", join(await makeTempDir(), "gitconfig"));
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("ossready init --github-owner", () => {
  it("writes real GitHub URLs when --github-owner is set", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "owned-app",
      description: "Owner demo",
      license: "mit",
      packageManager: "npm",
      githubOwner: "YasinzHyper",
    });

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain(
      "https://github.com/YasinzHyper/owned-app/actions/workflows/ci.yml",
    );
    expect(readme).toContain("https://github.com/YasinzHyper/owned-app/actions/workflows/codeql.yml");
    expect(readme).toContain("https://scorecard.dev/viewer/?uri=github.com/YasinzHyper/owned-app");
    expect(readme.indexOf(BADGES_START)).toBeLessThan(readme.indexOf("Owner demo"));
    expect(readme.indexOf(BADGES_END)).toBeLessThan(readme.indexOf("Owner demo"));
    expect(readme).not.toContain("github.com/OWNER/");
    expect(readme).not.toMatch(/Replace `OWNER`/);

    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.repository).toEqual({
      type: "git",
      url: "git+https://github.com/YasinzHyper/owned-app.git",
    });
    expect(pkg.bugs).toEqual({
      url: "https://github.com/YasinzHyper/owned-app/issues",
    });
    expect(pkg.homepage).toBe(
      "https://github.com/YasinzHyper/owned-app#readme",
    );

    const codeowners = await readFile(join(dir, ".github/CODEOWNERS"), "utf8");
    expect(codeowners).toContain("* @YasinzHyper");
    expect(codeowners).not.toContain("@YOUR_GITHUB_USERNAME");

    const funding = await readFile(join(dir, ".github/FUNDING.yml"), "utf8");
    expect(funding).toContain("github: [YasinzHyper]");
    expect(funding).not.toContain("YOUR_GITHUB_USERNAME");

    const support = await readFile(join(dir, "SUPPORT.md"), "utf8");
    expect(support).toContain("https://github.com/YasinzHyper/owned-app/issues");
    expect(support).not.toContain("https://github.com/OWNER/");
  });

  it("leaves owner-bound README badges out and keeps placeholders elsewhere when --github-owner is omitted", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "plain-app",
      description: "No owner",
      license: "mit",
      packageManager: "npm",
    });

    // Like `ossready badges` without an owner: npm + license only, no OWNER URLs.
    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain(BADGES_START);
    expect(readme).toContain("https://img.shields.io/npm/v/plain-app.svg");
    expect(readme).toContain("https://img.shields.io/badge/License-MIT-yellow.svg");
    expect(readme).not.toContain("actions/workflows/ci.yml");
    expect(readme).not.toContain("OWNER");

    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.repository).toBeUndefined();
    expect(pkg.bugs).toBeUndefined();
    expect(pkg.homepage).toBeUndefined();

    const codeowners = await readFile(join(dir, ".github/CODEOWNERS"), "utf8");
    expect(codeowners).toContain("@YOUR_GITHUB_USERNAME");
    expect(codeowners).not.toMatch(/^\* @/m);

    const funding = await readFile(join(dir, ".github/FUNDING.yml"), "utf8");
    expect(funding).toContain("# github: [YOUR_GITHUB_USERNAME]");
    expect(funding).not.toMatch(/^github:/m);
  });

  it("rejects invalid --github-owner values", async () => {
    const dir = await makeTempDir();
    await expect(
      initCommand(dir, {
        name: "bad-owner",
        githubOwner: "!!!",
        dryRun: true,
      }),
    ).rejects.toThrow(/Invalid --github-owner/i);

    await expect(
      initCommand(dir, {
        name: "bad-owner",
        githubOwner: "",
        dryRun: true,
      }),
    ).rejects.toThrow(/Invalid --github-owner/i);

    await expect(
      initCommand(dir, {
        name: "bad-owner",
        githubOwner: "-leading",
        dryRun: true,
      }),
    ).rejects.toThrow(/Invalid --github-owner/i);
  });
});
