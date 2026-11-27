import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatDoctorReport, runDoctor } from "../src/commands/doctor.js";
import { binSourceCandidates, shebangProblem } from "../src/commands/packageJson.js";

const BASE = {
  name: "cli-tool",
  version: "1.0.0",
  description: "x",
  license: "MIT",
  files: ["dist"],
};

const SHEBANG = "#!/usr/bin/env node\nconsole.log('hi');\n";

async function withPkg(pkg: Record<string, unknown>, extra: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ossready-bin-"));
  await writeFile(join(dir, "package.json"), JSON.stringify({ ...BASE, ...pkg }, null, 2) + "\n", "utf8");
  for (const [rel, content] of Object.entries(extra)) {
    await mkdir(join(dir, rel, ".."), { recursive: true });
    await writeFile(join(dir, rel), content, "utf8");
  }
  return dir;
}

async function binResult(pkg: Record<string, unknown>, extra: Record<string, string> = {}) {
  const report = await runDoctor(await withPkg(pkg, extra));
  const r = report.results.find((x) => x.id === "pkg-bin");
  if (!r) throw new Error("pkg-bin did not run");
  return { r, report };
}

describe("shebangProblem", () => {
  it("accepts env-based and non-node interpreters", () => {
    expect(shebangProblem(SHEBANG)).toBeUndefined();
    expect(shebangProblem("#!/usr/bin/env -S node --no-warnings\n")).toBeUndefined();
    expect(shebangProblem("#! /usr/bin/env node\n")).toBeUndefined();
    expect(shebangProblem("#!/bin/sh\nexec node x.js\n")).toBeUndefined();
    expect(shebangProblem("#!/usr/bin/env node")).toBeUndefined();
  });

  it("flags a missing line, a BOM, CRLF, an empty line and a hard-coded node path", () => {
    expect(shebangProblem("console.log(1);\n")).toContain("has no #! line");
    expect(shebangProblem("")).toContain("has no #! line");
    expect(shebangProblem("\n#!/usr/bin/env node\n")).toContain("has no #! line");
    expect(shebangProblem("\uFEFF#!/usr/bin/env node\n")).toContain("byte order mark");
    expect(shebangProblem("#!/usr/bin/env node\r\nx\r\n")).toContain("CRLF");
    expect(shebangProblem("#!\n")).toContain("empty #! line");
    expect(shebangProblem("#!/usr/bin/node\n")).toContain("hard-codes /usr/bin/node");
    expect(shebangProblem("#!/usr/local/bin/nodejs\n")).toContain("hard-codes /usr/local/bin/nodejs");
  });
});

describe("binSourceCandidates", () => {
  it("maps build output to src/ and to a TypeScript file next to it", () => {
    expect(binSourceCandidates("dist/cli.js")).toEqual([
      "src/cli.ts",
      "src/cli.mts",
      "src/cli.cts",
      "src/cli.tsx",
      "src/cli.js",
      "src/cli.mjs",
      "src/cli.cjs",
      "dist/cli.ts",
      "dist/cli.mts",
      "dist/cli.cts",
      "dist/cli.tsx",
    ]);
    expect(binSourceCandidates("build/bin/run.mjs")[0]).toBe("src/bin/run.ts");
    expect(binSourceCandidates("cli.js")).toEqual(["cli.ts", "cli.mts", "cli.cts", "cli.tsx"]);
  });
});

describe("doctor: pkg-bin", () => {
  it("passes packages without bin", async () => {
    const { r } = await binResult({ main: "./dist/index.js" });
    expect(r).toMatchObject({ ok: true, foundAt: "package.json (no bin)" });
  });

  it("passes built bin files that start with #!/usr/bin/env node", async () => {
    const { r } = await binResult(
      { bin: { tool: "./dist/cli.js", t: "dist/cli.js", other: "./dist/other.mjs" } },
      { "dist/cli.js": SHEBANG, "dist/other.mjs": SHEBANG },
    );
    expect(r).toMatchObject({ ok: true, foundAt: "dist/cli.js, dist/other.mjs" });
  });

  it("checks the TypeScript source when the bin file is not built", async () => {
    const ok = await binResult({ bin: "./dist/cli.js" }, { "src/cli.ts": SHEBANG });
    expect(ok.r).toMatchObject({ ok: true, foundAt: "src/cli.ts" });

    const bad = await binResult({ bin: "./dist/cli.js" }, { "src/cli.ts": "import x from './x.js';\n" });
    expect(bad.r.ok).toBe(false);
    expect(bad.r.detail).toContain('"bin" (dist/cli.js, source src/cli.ts) has no #! line');
  });

  it("prefers the built file over the source", async () => {
    const { r } = await binResult(
      { bin: "./dist/cli.js" },
      { "dist/cli.js": "console.log(1);\n", "src/cli.ts": SHEBANG },
    );
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('"bin" (dist/cli.js) has no #! line');
  });

  it("passes with a note when neither the bin file nor its source exists", async () => {
    const { r } = await binResult({ bin: { tool: "./dist/cli.js" } });
    expect(r).toMatchObject({ ok: true, foundAt: "package.json (not built yet: dist/cli.js)" });
  });

  it("reports every broken bin script with its field, and shows up in the report", async () => {
    const { r, report } = await binResult(
      { bin: { a: "./dist/a.js", b: "./dist/b.js", c: "./dist/c.js" } },
      {
        "dist/a.js": "#!/usr/bin/env node\r\nconsole.log(1);\r\n",
        "dist/b.js": "\uFEFF#!/usr/bin/env node\n",
        "dist/c.js": "#!/usr/bin/node\n",
      },
    );
    expect(r.ok).toBe(false);
    expect(r.level).toBe("recommended");
    expect(r.detail).toContain('"bin.a" (dist/a.js) ends its #! line with a Windows line ending (CRLF)');
    expect(r.detail).toContain('"bin.b" (dist/b.js) starts with a byte order mark');
    expect(r.detail).toContain('"bin.c" (dist/c.js) hard-codes /usr/bin/node');
    expect(formatDoctorReport(report)).toContain("⚠ CLI bin scripts (shebang)");
  });

  it("leaves paths outside the package to pkg-entry", async () => {
    const { r, report } = await binResult({ bin: "../elsewhere/cli.js" });
    expect(r.ok).toBe(true);
    expect(report.results.find((x) => x.id === "pkg-entry")?.ok).toBe(false);
  });
});
