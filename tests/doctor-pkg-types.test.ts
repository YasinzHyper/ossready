import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDoctor, type DoctorReport } from "../src/commands/doctor.js";
import { siblingDeclaration } from "../src/commands/packageJson.js";

const BASE = {
  name: "typed-lib",
  version: "1.0.0",
  description: "x",
  license: "MIT",
  files: ["dist"],
};

async function withPkg(
  pkg: Record<string, unknown>,
  extra: Record<string, string> = {},
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ossready-types-"));
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ ...BASE, ...pkg }, null, 2) + "\n",
    "utf8",
  );
  for (const [rel, content] of Object.entries(extra)) {
    await mkdir(join(dir, rel, ".."), { recursive: true });
    await writeFile(join(dir, rel), content, "utf8");
  }
  return dir;
}

async function typesResult(
  pkg: Record<string, unknown>,
  extra: Record<string, string> = {},
) {
  const report: DoctorReport = await runDoctor(await withPkg(pkg, extra));
  const r = report.results.find((x) => x.id === "pkg-types");
  if (!r) throw new Error("pkg-types did not run");
  return r;
}

describe("doctor: pkg-types", () => {
  it("maps JavaScript files to the declaration TypeScript looks for next to them", () => {
    expect(siblingDeclaration("dist/index.js")).toBe("dist/index.d.ts");
    expect(siblingDeclaration("dist/index.mjs")).toBe("dist/index.d.mts");
    expect(siblingDeclaration("dist/index.cjs")).toBe("dist/index.d.cts");
    expect(siblingDeclaration("lib/index")).toBe("lib/index.d.ts");
  });

  it("passes main + types, and exports with a types condition", async () => {
    expect(
      (
        await typesResult({
          main: "./dist/index.js",
          types: "./dist/index.d.ts",
        })
      ).ok,
    ).toBe(true);
    expect(
      (await typesResult({ main: "dist/index.js", typings: "dist/index.d.ts" }))
        .ok,
    ).toBe(true);
    const exp = await typesResult({
      exports: {
        ".": {
          import: { types: "./dist/index.d.mts", default: "./dist/index.mjs" },
          require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" },
        },
        "./utils": { types: "./dist/utils.d.ts", default: "./dist/utils.js" },
        "./package.json": "./package.json",
        "./styles.css": "./dist/styles.css",
        "./internal/*": null,
      },
    });
    expect(exp).toMatchObject({ ok: true, foundAt: "package.json" });
  });

  it("accepts a built .d.ts next to the JavaScript entry", async () => {
    const main = await typesResult(
      { main: "./dist/index.js" },
      { "dist/index.d.ts": "export {};\n" },
    );
    expect(main.ok).toBe(true);
    const exp = await typesResult(
      { exports: "./dist/index.mjs" },
      { "dist/index.d.mts": "export {};\n" },
    );
    expect(exp.ok).toBe(true);
  });

  it("fails a library main without declarations and suggests the types path", async () => {
    const r = await typesResult({ main: "./dist/index.js" });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain(
      '"main" (dist/index.js) has no type declarations; add "types": "dist/index.d.ts"',
    );
  });

  it("flags exports subpaths without a types condition, even when top-level types is set", async () => {
    const r = await typesResult({
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: {
        ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
        "./utils": "./dist/utils.js",
      },
    });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain(
      '"exports["./utils"]" (dist/utils.js) has no "types" condition and no dist/utils.d.ts next to it',
    );
    expect(r.detail).toContain(
      'TypeScript ignores top-level "types" for packages with "exports"',
    );

    const sugar = await typesResult({
      exports: { import: "./dist/index.mjs", require: "./dist/index.cjs" },
    });
    expect(sugar.detail).toContain(
      '"exports" (dist/index.mjs) has no "types" condition and no dist/index.d.mts next to it',
    );
  });

  it("flags declaration paths that are sources, outside the package, or not published", async () => {
    const src = await typesResult({
      main: "./dist/index.js",
      types: "./src/index.ts",
    });
    expect(src.detail).toContain(
      '"types" (./src/index.ts) should point at a .d.ts / .d.mts / .d.cts declaration file',
    );
    const outside = await typesResult({
      main: "./dist/index.js",
      types: "../index.d.ts",
    });
    expect(outside.detail).toContain("relative path inside the package");
    const unpublished = await typesResult({
      exports: {
        ".": { types: "./types/index.d.ts", default: "./dist/index.js" },
      },
    });
    expect(unpublished.detail).toContain(
      '"exports["."]["types"]" (./types/index.d.ts) is not included in "files"',
    );
  });

  it("flags a types condition that is not first in its condition object", async () => {
    const r = await typesResult({
      exports: {
        ".": { import: "./dist/index.js", types: "./dist/index.d.ts" },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain(
      '"exports["."]["types"]" must be the first condition in its object',
    );
  });

  it("passes CLI-only packages, including a main that is the bin script", async () => {
    const cli = await typesResult({ bin: { tool: "./dist/cli.js" } });
    expect(cli).toMatchObject({
      ok: true,
      foundAt: "package.json (CLI only, no library entry)",
    });
    const cliMain = await typesResult({
      bin: { tool: "./dist/cli.js" },
      main: "./dist/cli.js",
      exports: { ".": "./dist/cli.js", "./schema.json": "./schema.json" },
    });
    expect(cliMain).toMatchObject({
      ok: true,
      foundAt: "package.json (CLI only, no library entry)",
    });
    const none = await typesResult({});
    expect(none).toMatchObject({
      ok: true,
      foundAt: "package.json (no library entry)",
    });
  });
  // Fresh scaffolds (main + types + exports types condition) are covered by
  // "fresh scaffolds are publish-ready" in doctor-package-json.test.ts.
});
