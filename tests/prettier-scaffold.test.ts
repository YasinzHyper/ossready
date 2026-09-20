import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init Prettier scaffold", () => {
  it("writes Prettier config, ignore, scripts, and dependency", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "prettier-app",
      description: "Prettier demo",
      license: "mit",
      packageManager: "npm",
    });

    const prettierrc = JSON.parse(await readFile(join(dir, ".prettierrc"), "utf8"));
    expect(prettierrc).toMatchObject({
      semi: true,
      singleQuote: false,
      trailingComma: "all",
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      arrowParens: "always",
      endOfLine: "lf",
    });

    const prettierignore = await readFile(join(dir, ".prettierignore"), "utf8");
    expect(prettierignore).toContain("node_modules");
    expect(prettierignore).toContain("dist");
    expect(prettierignore).toContain("coverage");
    expect(prettierignore).toContain("package-lock.json");
    expect(prettierignore).toContain("pnpm-lock.yaml");
    expect(prettierignore).toContain("yarn.lock");

    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.scripts.format).toBe("prettier --write .");
    expect(pkg.scripts["format:check"]).toBe("prettier --check .");
    expect(pkg.devDependencies?.prettier).toMatch(/^\^3/);

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("Prettier");
    expect(readme).toContain("format:check");
  });
});
