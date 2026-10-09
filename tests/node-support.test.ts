import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildScaffoldFiles, type ScaffoldOptions } from "../src/templates/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const BASE: ScaffoldOptions = {
  name: "node-support-app",
  description: "node support parity",
  license: "mit",
  packageManager: "npm",
  year: 2026,
  copyrightHolder: "Octo",
  cocEmail: "",
  githubOwner: "octo",
};

/** Supported Node majors: active/maintenance LTS only (18 and 20 are end-of-life). */
const SUPPORTED = [22, 24];

function matrixOf(yml: string): number[] {
  const m = yml.match(/node-version:\s*\[([^\]]*)\]/);
  expect(m, "CI workflow has no node-version matrix").not.toBeNull();
  return m![1].split(",").map((v) => Number(v.trim()));
}

function scaffold(packageManager: ScaffoldOptions["packageManager"]) {
  const files = buildScaffoldFiles({ ...BASE, packageManager });
  const get = (path: string) => {
    const file = files.find((f) => f.path === path);
    expect(file, `${path} not scaffolded`).toBeDefined();
    return file!.content;
  };
  return {
    ci: get(".github/workflows/ci.yml"),
    nvmrc: get(".nvmrc"),
    pkg: JSON.parse(get("package.json")),
  };
}

describe("supported Node versions", () => {
  for (const pm of ["npm", "pnpm", "bun"] as const) {
    it(`scaffolds a Node ${SUPPORTED.join("/")} CI matrix, engines >=22.12 and .nvmrc 22 (${pm})`, () => {
      const { ci, nvmrc, pkg } = scaffold(pm);
      expect(matrixOf(ci)).toEqual(SUPPORTED);
      expect(pkg.engines.node).toBe(">=22.12");
      expect(nvmrc.trim()).toBe("22");
      expect(SUPPORTED).toContain(Number(nvmrc.trim()));
    });
  }

  it("scaffolds vitest and @vitest/coverage-v8 on the same version", () => {
    const { pkg } = scaffold("npm");
    expect(pkg.devDependencies["@vitest/coverage-v8"]).toBe(pkg.devDependencies.vitest);
    expect(pkg.devDependencies.vitest).toMatch(/^\^5\./);
  });

  it("tests ossready itself on the same Node matrix and engines it scaffolds", async () => {
    const ci = await readFile(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
    expect(matrixOf(ci)).toEqual(matrixOf(scaffold("npm").ci));
    const pkg = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
    expect(pkg.engines.node).toBe(scaffold("npm").pkg.engines.node);
  });
});
