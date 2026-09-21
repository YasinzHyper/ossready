import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

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
  });

  it("keeps OWNER placeholders when --github-owner is omitted", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "plain-app",
      description: "No owner",
      license: "mit",
      packageManager: "npm",
    });

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("https://github.com/OWNER/plain-app/actions/workflows/ci.yml");
    expect(readme).toMatch(/Replace `OWNER`/);

    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.repository).toBeUndefined();
    expect(pkg.bugs).toBeUndefined();
    expect(pkg.homepage).toBeUndefined();

    const codeowners = await readFile(join(dir, ".github/CODEOWNERS"), "utf8");
    expect(codeowners).toContain("@YOUR_GITHUB_USERNAME");
    expect(codeowners).not.toMatch(/^\* @/m);
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
