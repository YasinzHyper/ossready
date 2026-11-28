import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatDoctorReport, runDoctor } from "../src/commands/doctor.js";
import { ignoredDirs } from "../src/commands/packageJson.js";
import { packageJsonText } from "../src/templates/package.js";

const BASE = {
  name: "lib-tool",
  version: "1.0.0",
  description: "x",
  license: "MIT",
  files: ["dist"],
  main: "./dist/index.js",
  types: "./dist/index.d.ts",
};

async function withPkg(
  pkg: Record<string, unknown>,
  extra: Record<string, string> = { ".gitignore": "dist/\n" },
) {
  const dir = await mkdtemp(join(tmpdir(), "ossready-prepack-"));
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

async function prepackResult(
  pkg: Record<string, unknown>,
  extra?: Record<string, string>,
) {
  const report = await runDoctor(await withPkg(pkg, extra));
  const r = report.results.find((x) => x.id === "pkg-prepack");
  if (!r) throw new Error("pkg-prepack did not run");
  return { r, report };
}

describe("ignoredDirs", () => {
  it("reads simple directory patterns from .gitignore", () => {
    const dirs = ignoredDirs(
      "# Build\ndist/\n/build\nlib/**\nout\r\n*.log\nsrc/gen/\n.cache/\n",
    );
    expect([...dirs].sort()).toEqual(["build", "dist", "lib", "out"]);
  });

  it("drops a directory that has a negation (part of it is committed)", () => {
    expect(ignoredDirs("dist/\n!dist/index.js\n").has("dist")).toBe(false);
  });
});

describe("doctor: pkg-prepack", () => {
  it("fails when entry points are in a git-ignored dist/ and nothing builds before pack", async () => {
    const { r, report } = await prepackResult({
      scripts: { build: "tsc", test: "vitest run" },
    });
    expect(r.ok).toBe(false);
    expect(r.level).toBe("recommended");
    expect(r.detail).toContain(
      '"main" (dist/index.js) is under dist/, which .gitignore excludes',
    );
    expect(r.detail).toContain('add "prepack": "npm run build"');
    expect(formatDoctorReport(report)).toContain(
      "⚠ Build before pack / publish",
    );
  });

  it("asks for a build command when there is no build script either", async () => {
    const { r } = await prepackResult({ scripts: {} });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('"prepack": "<your build command>"');
  });

  it.each([
    ["prepack", "npm run build"],
    ["prepare", "pnpm build"],
    ["prepublishOnly", "yarn build"],
    ["prepack", "tsup src/index.ts"],
    ["prepack", "npm run compile"],
    ["prepack", "tsc -p tsconfig.build.json"],
  ])("passes with %s: %s", async (script, command) => {
    const { r } = await prepackResult({
      scripts: {
        build: "tsc -p tsconfig.build.json",
        compile: "tsc",
        [script]: command,
      },
    });
    expect(r).toMatchObject({
      ok: true,
      foundAt: `package.json#scripts.${script}`,
    });
  });

  it("fails when the lifecycle script does not run the build", async () => {
    const { r } = await prepackResult({
      scripts: { build: "tsc", prepack: "clean-package", prepare: "husky" },
    });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain(
      '"prepack": "clean-package", "prepare": "husky" does not look like it runs the build',
    );
  });

  it("does not count test or lint scripts as a build", async () => {
    const { r } = await prepackResult({
      scripts: { test: "vitest run", prepublishOnly: "npm run test" },
    });
    expect(r.ok).toBe(false);
  });

  it("checks bin, exports and types too", async () => {
    const { r } = await prepackResult(
      {
        main: undefined,
        types: undefined,
        bin: { tool: "./build/cli.js" },
        scripts: {},
      },
      { ".gitignore": "/build\n" },
    );
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('"bin.tool" (build/cli.js) is under build/');
    const exp = await prepackResult(
      {
        main: undefined,
        types: undefined,
        exports: { ".": { import: "./out/index.js" } },
        files: ["out"],
        scripts: {},
      },
      { ".gitignore": "out/\n" },
    );
    expect(exp.r.detail).toContain(
      '"exports["."]["import"]" (out/index.js) is under out/',
    );
  });

  it("passes when entry points are committed files", async () => {
    const { r } = await prepackResult({
      main: "./index.js",
      types: "./index.d.ts",
      files: ["index.js", "index.d.ts"],
    });
    expect(r).toMatchObject({
      ok: true,
      foundAt: "package.json (entry points are committed files)",
    });
  });

  it("passes without a .gitignore (nothing says the output is not committed)", async () => {
    const { r } = await prepackResult({ scripts: {} }, {});
    expect(r).toMatchObject({
      ok: true,
      foundAt: "package.json (no .gitignore)",
    });
  });

  it.each(["npm", "pnpm", "yarn", "bun"] as const)(
    "a fresh %s scaffold's package.json passes",
    async (pm) => {
      const text = packageJsonText({
        name: "demo",
        description: "d",
        license: "mit",
        packageManager: pm,
        githubOwner: "octo",
        year: 2026,
      } as Parameters<typeof packageJsonText>[0]);
      const pkg = JSON.parse(text) as Record<string, unknown>;
      expect((pkg.scripts as Record<string, string>).prepack).toBe(
        {
          npm: "npm run build",
          pnpm: "pnpm build",
          yarn: "yarn build",
          bun: "bun run build",
        }[pm],
      );
      const dir = await mkdtemp(join(tmpdir(), "ossready-prepack-scaffold-"));
      await writeFile(join(dir, "package.json"), text, "utf8");
      await writeFile(
        join(dir, ".gitignore"),
        "node_modules/\ndist/\n",
        "utf8",
      );
      const report = await runDoctor(dir);
      expect(report.results.find((x) => x.id === "pkg-prepack")).toMatchObject({
        ok: true,
        foundAt: "package.json#scripts.prepack",
      });
    },
  );
});
