import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init Vitest coverage scaffold", () => {
  it("writes coverage config, script, dependency, and npm CI step", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "coverage-app",
      description: "Coverage demo",
      license: "mit",
      packageManager: "npm",
    });

    const vitestConfig = await readFile(join(dir, "vitest.config.ts"), "utf8");
    expect(vitestConfig).toContain("coverage");
    expect(vitestConfig).toContain('provider: "v8"');
    expect(vitestConfig).toContain('"text"');
    expect(vitestConfig).toContain('"html"');
    expect(vitestConfig).toContain("thresholds");
    expect(vitestConfig).toContain("lines: 80");
    expect(vitestConfig).toContain("functions: 80");
    expect(vitestConfig).toContain("branches: 80");
    expect(vitestConfig).toContain("statements: 80");

    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.scripts["test:coverage"]).toBe("vitest run --coverage");
    expect(pkg.devDependencies?.["@vitest/coverage-v8"]).toMatch(/^\^3/);

    const gitignore = await readFile(join(dir, ".gitignore"), "utf8");
    expect(gitignore).toContain("coverage/");

    const ci = await readFile(join(dir, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("- run: npm test");
    expect(ci).toContain("- run: npm run test:coverage");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("test:coverage");
    expect(readme).toContain("coverage");
  });

  it("wires test:coverage into pnpm and bun CI workflows", async () => {
    const pnpmDir = await makeTempDir();
    await initCommand(pnpmDir, {
      name: "coverage-pnpm",
      packageManager: "pnpm",
      license: "mit",
    });
    const pnpmCi = await readFile(join(pnpmDir, ".github/workflows/ci.yml"), "utf8");
    expect(pnpmCi).toContain("- run: pnpm test");
    expect(pnpmCi).toContain("- run: pnpm test:coverage");

    const bunDir = await makeTempDir();
    await initCommand(bunDir, {
      name: "coverage-bun",
      packageManager: "bun",
      license: "mit",
    });
    const bunCi = await readFile(join(bunDir, ".github/workflows/ci.yml"), "utf8");
    expect(bunCi).toContain("- run: bun run test");
    expect(bunCi).toContain("- run: bun run test:coverage");
  });
});
