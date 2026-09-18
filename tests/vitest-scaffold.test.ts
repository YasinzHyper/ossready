import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init Vitest scaffold", () => {
  it("writes Vitest config, smoke test, and vitest script", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "vitest-app",
      description: "Vitest demo",
      license: "mit",
      packageManager: "npm",
    });

    const vitestConfig = await readFile(join(dir, "vitest.config.ts"), "utf8");
    expect(vitestConfig).toContain("defineConfig");
    expect(vitestConfig).toContain("src/**/*.test.ts");

    const srcTest = await readFile(join(dir, "src/index.test.ts"), "utf8");
    expect(srcTest).toContain('from "./index.js"');
    expect(srcTest).toContain("greet");

    const srcIndex = await readFile(join(dir, "src/index.ts"), "utf8");
    expect(srcIndex).toContain("export function greet");
    expect(srcIndex).not.toMatch(/console\.log/);

    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.scripts.test).toContain("vitest");
    expect(pkg.devDependencies?.vitest).toBeDefined();

    const tsconfig = JSON.parse(await readFile(join(dir, "tsconfig.json"), "utf8"));
    expect(tsconfig.exclude).toContain("**/*.test.ts");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("Vitest");
  });

  it("uses bun run test in CI when packageManager is bun", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "bun-app",
      packageManager: "bun",
      license: "mit",
    });

    const ci = await readFile(join(dir, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("- run: bun run test");
    expect(ci).not.toMatch(/^\s+- run: bun test\s*$/m);
    expect(ci).toContain("- run: bun install");
    expect(ci).toContain("- run: bun run build");
  });
});
