import { access, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
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
      "SECURITY.md",
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
      ".github/dependabot.yml",
    ];

    for (const rel of expected) {
      const content = await readFile(join(dir, rel), "utf8");
      expect(content.length).toBeGreaterThan(0);
    }

    const security = await readFile(join(dir, "SECURITY.md"), "utf8");
    expect(security).toContain("demo-app");
    expect(security).toMatch(/vulnerabilit/i);

    const dependabot = await readFile(join(dir, ".github/dependabot.yml"), "utf8");
    expect(dependabot).toContain("package-ecosystem: npm");
    expect(dependabot).toContain("interval: weekly");

    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.name).toBe("demo-app");
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();

    const year = String(new Date().getFullYear());
    const license = await readFile(join(dir, "LICENSE"), "utf8");
    expect(license).toContain(year);
    expect(license).toContain("demo-app");
    expect(license).toContain("MIT License");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("# demo-app");
    expect(readme).toContain("A demo application");
  });

  it("uses --author as LICENSE copyright holder", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "authored-app",
      author: "Jane Doe",
      license: "mit",
    });

    const year = String(new Date().getFullYear());
    const license = await readFile(join(dir, "LICENSE"), "utf8");
    expect(license).toContain(`Copyright (c) ${year} Jane Doe`);
    expect(license).not.toMatch(/Copyright \(c\) \d+ authored-app/);
  });

  it("writes Apache-2.0 license when requested", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "apache-demo",
      license: "apache-2.0",
    });
    const year = String(new Date().getFullYear());
    const license = await readFile(join(dir, "LICENSE"), "utf8");
    expect(license).toContain("Apache License");
    expect(license).toContain(year);
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

  it("dry-run plans files without writing anything", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "dry-demo",
      description: "dry run only",
      dryRun: true,
    });

    const entries = await readdir(dir);
    expect(entries).toEqual([]);

    await expect(access(join(dir, "package.json"))).rejects.toThrow();
    await expect(access(join(dir, "LICENSE"))).rejects.toThrow();
  });

  it("dry-run still validates license and package manager", async () => {
    const dir = await makeTempDir();
    await expect(
      initCommand(dir, {
        name: "bad-license",
        license: "gpl-3.0",
        dryRun: true,
      }),
    ).rejects.toThrow(/Invalid --license/i);

    await expect(
      initCommand(dir, {
        name: "bad-pm",
        packageManager: "yarn",
        dryRun: true,
      }),
    ).rejects.toThrow(/Invalid --package-manager/i);
  });
});
