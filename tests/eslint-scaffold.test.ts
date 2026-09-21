import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init ESLint scaffold", () => {
  it("writes eslint.config.js, lint/typecheck scripts, and deps", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "eslint-app",
      description: "ESLint demo",
      license: "mit",
      packageManager: "npm",
    });

    const eslintConfig = await readFile(join(dir, "eslint.config.js"), "utf8");
    expect(eslintConfig).toContain("typescript-eslint");
    expect(eslintConfig).toContain("eslint-config-prettier");
    expect(eslintConfig).toContain("@eslint/js");
    expect(eslintConfig).toContain("ignores");
    expect(eslintConfig).toContain("dist/**");

    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.scripts.lint).toBe("eslint .");
    expect(pkg.scripts.typecheck).toBe("tsc --noEmit");
    expect(pkg.devDependencies?.eslint).toMatch(/^\^9/);
    expect(pkg.devDependencies?.["typescript-eslint"]).toMatch(/^\^8/);
    expect(pkg.devDependencies?.["eslint-config-prettier"]).toBeDefined();
    expect(pkg.devDependencies?.["@eslint/js"]).toBeDefined();

    const ci = await readFile(join(dir, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("- run: npm run lint");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("ESLint");
    expect(readme).toContain("typecheck");
    expect(readme).toContain("lint + test + build");
  });

  it("wires lint into pnpm and bun CI workflows", async () => {
    const pnpmDir = await makeTempDir();
    await initCommand(pnpmDir, {
      name: "eslint-pnpm",
      packageManager: "pnpm",
      license: "mit",
    });
    const pnpmCi = await readFile(join(pnpmDir, ".github/workflows/ci.yml"), "utf8");
    expect(pnpmCi).toContain("- run: pnpm lint");

    const bunDir = await makeTempDir();
    await initCommand(bunDir, {
      name: "eslint-bun",
      packageManager: "bun",
      license: "mit",
    });
    const bunCi = await readFile(join(bunDir, ".github/workflows/ci.yml"), "utf8");
    expect(bunCi).toContain("- run: bun run lint");
  });
});
