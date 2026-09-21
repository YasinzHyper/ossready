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
      "CODE_OF_CONDUCT.md",
      ".gitignore",
      ".editorconfig",
      "eslint.config.js",
      "package.json",
      "tsconfig.json",
      "vitest.config.ts",
      "CONTRIBUTING.md",
      "CHANGELOG.md",
      "src/index.ts",
      "src/index.test.ts",
      ".github/workflows/ci.yml",
      ".github/workflows/release.yml",
      ".github/workflows/codeql.yml",
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

    const coc = await readFile(join(dir, "CODE_OF_CONDUCT.md"), "utf8");
    expect(coc).toContain("Contributor Covenant");
    expect(coc).toContain("demo-app");
    expect(coc).toContain("conduct@example.com");

    const contributing = await readFile(join(dir, "CONTRIBUTING.md"), "utf8");
    expect(contributing).toContain("CODE_OF_CONDUCT.md");

    const ci = await readFile(join(dir, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("- run: npm install");
    expect(ci).not.toContain("- run: npm ci");
    // cache: npm must not be a setup-node with: key (comment may mention it)
    expect(ci).not.toMatch(/^\s+cache: npm\s*$/m);
    expect(ci).toMatch(/lockfile/i);
    expect(ci).toContain("- run: npm run lint");

    const editorconfig = await readFile(join(dir, ".editorconfig"), "utf8");
    expect(editorconfig).toContain("root = true");
    expect(editorconfig).toContain("indent_size = 2");
    expect(editorconfig).toContain("end_of_line = lf");

    const codeql = await readFile(join(dir, ".github/workflows/codeql.yml"), "utf8");
    expect(codeql).toContain("github/codeql-action");
    expect(codeql).toContain("javascript-typescript");
    expect(codeql).toContain("security-events: write");

    const dependabot = await readFile(join(dir, ".github/dependabot.yml"), "utf8");
    expect(dependabot).toContain("package-ecosystem: npm");
    expect(dependabot).toContain("interval: weekly");

    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.name).toBe("demo-app");
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.test).toContain("vitest");
    expect(pkg.scripts.lint).toBe("eslint .");
    expect(pkg.scripts.typecheck).toBe("tsc --noEmit");
    expect(pkg.devDependencies?.vitest).toBeDefined();
    expect(pkg.devDependencies?.eslint).toBeDefined();
    expect(pkg.publishConfig?.access).toBe("public");
    expect(pkg.files).toContain("CHANGELOG.md");

    const year = String(new Date().getFullYear());
    const license = await readFile(join(dir, "LICENSE"), "utf8");
    expect(license).toContain(year);
    expect(license).toContain("demo-app");
    expect(license).toContain("MIT License");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("# demo-app");
    expect(readme).toContain("A demo application");
    expect(readme).toContain("Code of Conduct");
    expect(readme).toContain("CodeQL");
    expect(readme).toContain("EditorConfig");
    expect(readme).toContain("ESLint");
  });

  it("uses --coc-email in CODE_OF_CONDUCT.md", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "coc-app",
      cocEmail: "mods@example.org",
      license: "mit",
    });

    const coc = await readFile(join(dir, "CODE_OF_CONDUCT.md"), "utf8");
    expect(coc).toContain("mods@example.org");
    expect(coc).toContain("coc-app");
    expect(coc).not.toContain("conduct@example.com");
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
