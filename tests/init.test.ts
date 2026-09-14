import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init", () => {
  it("creates expected scaffold files in a temp directory", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "demo-app",
      description: "A demo application",
      license: "mit",
      packageManager: "npm",
    });

    const expected = [
      "LICENSE",
      "README.md",
      ".gitignore",
      "package.json",
      "tsconfig.json",
      "CONTRIBUTING.md",
      "CHANGELOG.md",
      "src/index.ts",
      ".github/workflows/ci.yml",
      ".github/workflows/release.yml",
      ".github/ISSUE_TEMPLATE/bug_report.md",
      ".github/ISSUE_TEMPLATE/feature_request.md",
      ".github/PULL_REQUEST_TEMPLATE.md",
      ".github/CODEOWNERS",
    ];

    for (const rel of expected) {
      const content = await readFile(join(dir, rel), "utf8");
      expect(content.length).toBeGreaterThan(0);
    }

    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.name).toBe("demo-app");
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();

    const license = await readFile(join(dir, "LICENSE"), "utf8");
    expect(license).toContain("2026");
    expect(license).toContain("demo-app");
    expect(license).toContain("MIT License");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("# demo-app");
    expect(readme).toContain("A demo application");
  });

  it("writes Apache-2.0 license when requested", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "apache-demo",
      license: "apache-2.0",
    });
    const license = await readFile(join(dir, "LICENSE"), "utf8");
    expect(license).toContain("Apache License");
    expect(license).toContain("2026");
    expect(license).toContain("apache-demo");
  });

  it("refuses non-empty directory without --force", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "existing.txt"), "keep me", "utf8");

    await expect(
      initCommand(dir, { name: "blocked", force: false }),
    ).rejects.toThrow(/not empty/i);
  });

  it("overwrites with --force", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "README.md"), "old content", "utf8");
    await initCommand(dir, {
      name: "forced-app",
      description: "forced",
      force: true,
    });
    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("# forced-app");
    expect(readme).not.toBe("old content");
  });
});
