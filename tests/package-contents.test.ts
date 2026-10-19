import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Size budget for the published tarball (gzipped, unpacked, and number of files). */
const MAX_PACKED_BYTES = 400 * 1024;
const MAX_UNPACKED_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 300;

/** Files outside dist/ that the tarball must ship, and the only ones it may ship. */
const ROOT_FILES = ["package.json", "README.md", "LICENSE", "CHANGELOG.md"];

/** Paths that must never end up in the published package. */
const FORBIDDEN: RegExp[] = [
  /^src\//,
  /^tests?\//,
  /^\.github\//,
  /(^|\/)tsconfig[^/]*\.json$/,
  /^coverage\//,
  /(^|\/)node_modules\//,
  /(^|\/)\.env(\..*)?$/,
  /(^|\/)\.npmrc$/,
  /\.(pem|key|p12)$/,
  /\.test\.[cm]?[jt]s$/,
  /^vitest\.config\./,
  /\.tgz$/,
];

interface PackFile {
  path: string;
  size: number;
}

interface PackResult {
  name: string;
  version: string;
  size: number;
  unpackedSize: number;
  entryCount: number;
  files: PackFile[];
}

type Pkg = {
  name: string;
  version: string;
  bin?: string | Record<string, string>;
  main?: string;
  exports?: unknown;
  types?: string;
  typings?: string;
  engines?: { node?: string };
  scripts?: Record<string, string>;
};

function npm(args: string[]): string {
  return execFileSync("npm", args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
}

const norm = (p: string) => p.trim().replace(/^\.\//, "");

function binTargets(pkg: Pkg): Record<string, string> {
  if (typeof pkg.bin === "string") return { [pkg.name]: pkg.bin };
  return { ...(pkg.bin ?? {}) };
}

function exportTargets(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => exportTargets(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => exportTargets(x, out));
  return out;
}

let pkg: Pkg;
let pack: PackResult;
let paths: string[];

beforeAll(async () => {
  pkg = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")) as Pkg;
  // Build first so the guard checks the dist/ a publish would ship (prepack does the
  // same for a real `npm pack` / `npm publish`), then list the tarball without writing it.
  npm(["run", "build"]);
  const parsed: unknown = JSON.parse(npm(["pack", "--dry-run", "--json", "--ignore-scripts"]));
  pack = (Array.isArray(parsed) ? parsed[0] : parsed) as PackResult;
  paths = pack.files.map((f) => f.path).sort();
}, 180_000);

describe("published npm tarball (npm pack --dry-run)", () => {
  it("is the package.json name and version", () => {
    expect(pack.name).toBe(pkg.name);
    expect(pack.version).toBe(pkg.version);
  });

  it("contains package.json, README.md, LICENSE and CHANGELOG.md", () => {
    for (const file of ROOT_FILES) expect(paths, `${file} missing from the tarball`).toContain(file);
  });

  it("contains the compiled output (.js and .d.ts) for every source file", async () => {
    const sources = (await readdir(join(repoRoot, "src"), { recursive: true }))
      .map((p) => String(p).replace(/\\/g, "/"))
      .filter((p) => p.endsWith(".ts") && !p.endsWith(".d.ts"));
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) {
      const base = `dist/${src.replace(/\.ts$/, "")}`;
      expect(paths, `${base}.js missing (built from src/${src})`).toContain(`${base}.js`);
      expect(paths, `${base}.d.ts missing (built from src/${src})`).toContain(`${base}.d.ts`);
    }
  });

  it("ships the CLI entry from bin with a node shebang", async () => {
    const bins = Object.entries(binTargets(pkg));
    expect(bins.map(([name]) => name)).toContain("ossready");
    for (const [name, target] of bins) {
      expect(paths, `bin.${name} (${target}) is not in the tarball`).toContain(norm(target));
      const text = await readFile(join(repoRoot, norm(target)), "utf8");
      expect(text.split("\n")[0], `bin.${name} (${target}) needs a shebang`).toBe("#!/usr/bin/env node");
    }
  });

  it("resolves main, exports and types to files in the tarball, and declares engines.node", () => {
    const refs: [string, string][] = [];
    if (pkg.main) refs.push(["main", pkg.main]);
    if (pkg.types) refs.push(["types", pkg.types]);
    if (pkg.typings) refs.push(["typings", pkg.typings]);
    for (const target of exportTargets(pkg.exports)) refs.push(["exports", target]);
    expect(refs.length).toBeGreaterThan(0);
    for (const [field, target] of refs) {
      expect(paths, `${field} (${target}) is not in the tarball`).toContain(norm(target));
    }
    expect(pkg.engines?.node).toMatch(/^>=\d+\.\d+/);
  });

  it("ships only dist/ plus the package docs: no sources, tests, CI config, coverage or secrets", () => {
    for (const path of paths) {
      for (const re of FORBIDDEN) expect(path, `${path} must not be published (${re})`).not.toMatch(re);
      expect(
        path.startsWith("dist/") || ROOT_FILES.includes(path),
        `${path} is outside the "files" allowlist`,
      ).toBe(true);
    }
  });

  it("stays within the size budget", () => {
    expect(pack.size, "packed (gzipped) size").toBeLessThan(MAX_PACKED_BYTES);
    expect(pack.unpackedSize, "unpacked size").toBeLessThan(MAX_UNPACKED_BYTES);
    expect(pack.entryCount, "file count").toBeLessThan(MAX_ENTRIES);
  });

  it("builds dist before every npm pack and npm publish (prepack)", () => {
    expect(pkg.scripts?.prepack).toBe("npm run build");
    expect(pkg.scripts?.build).toBe("tsc");
  });
});
