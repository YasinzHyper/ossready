import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testsDir, "..");

/** `npm run build` / `pnpm run build` … spelled as an execFile/spawn argument list. */
const RUN_BUILD = /\[\s*["']run["']\s*,\s*["']build["']/;
/** Running the TypeScript compiler binary (`typescript/bin/tsc` or a bare `"tsc"` command). */
const TSC_CALL = /["']typescript["']\s*,\s*["']bin["']\s*,\s*["']tsc["']|exec\w*\(\s*["']tsc["']|spawn\w*\(\s*["']tsc["']/;

describe("tests build dist/ once (tests/global-setup.ts)", () => {
  it("vitest.config.ts registers the global setup", async () => {
    const config = await readFile(join(repoRoot, "vitest.config.ts"), "utf8");
    expect(config).toMatch(/globalSetup:\s*\[\s*["']tests\/global-setup\.ts["']\s*\]/);
  });

  it("the global setup runs `npm run build`", async () => {
    const setup = await readFile(join(testsDir, "global-setup.ts"), "utf8");
    expect(setup).toMatch(RUN_BUILD);
    expect(setup).toMatch(/export default function setup/);
  });

  it("no test file rebuilds dist/ itself (parallel builds race suites that run dist/cli.js)", async () => {
    const files = (await readdir(testsDir)).filter((f) => f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(1);
    const offenders: string[] = [];
    for (const file of files) {
      if (file === "test-build.test.ts") continue;
      const text = await readFile(join(testsDir, file), "utf8");
      if (RUN_BUILD.test(text)) offenders.push(`${file}: runs the build script (dist/ is built by tests/global-setup.ts)`);
      // Compiling into a private --outDir (tests/github-action.test.ts) is fine; tsc into dist/ is not.
      if (TSC_CALL.test(text) && !text.includes('"--outDir"')) {
        offenders.push(`${file}: runs tsc without --outDir (would rewrite dist/)`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
