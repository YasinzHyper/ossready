import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { checkInfo } from "../checks.js";
import { ADD_LINKS_COMMAND } from "../utils/github.js";

/**
 * npm publish-readiness checks for `ossready doctor`. They only run when the
 * audited directory has a package.json that is not `"private": true`.
 */

export type PackageJson = Record<string, unknown>;

export type PackageJsonState =
  | { kind: "missing" }
  | { kind: "invalid"; error: string }
  | { kind: "ok"; pkg: PackageJson; text: string };

/** Whether the publish-readiness checks ran, and why not when they were skipped. */
export type PackageJsonStatus = { status: "checked" } | { status: "skipped"; reason: string };

export interface PackageJsonCheckDef {
  /** Stable identifier (useful for --json consumers) */
  id: string;
  label: string;
  /** Generic advice; failing results carry a more specific `detail` */
  hint: string;
}

/** Labels come from the check catalogue (src/checks.ts). */
export const PACKAGE_JSON_CHECKS: readonly PackageJsonCheckDef[] = [
  {
    id: "pkg-name-version",
    label: checkInfo("pkg-name-version").title,
    hint: 'Set "name" and a semver "version" (e.g. "0.1.0").',
  },
  {
    id: "pkg-description",
    label: checkInfo("pkg-description").title,
    hint: 'Add a one-line "description"; npm search and the package page show it.',
  },
  {
    id: "pkg-license",
    label: checkInfo("pkg-license").title,
    hint: 'Set "license" to the SPDX id of your LICENSE file (e.g. "MIT").',
  },
  {
    id: "pkg-links",
    label: checkInfo("pkg-links").title,
    hint: `Add "repository", "bugs" and "homepage" so npm links back to your repo (\`${ADD_LINKS_COMMAND}\` adds them).`,
  },
  {
    id: "pkg-engines",
    label: checkInfo("pkg-engines").title,
    hint: 'Declare the supported Node.js range in "engines": { "node": ">=22.12" }.',
  },
  {
    id: "pkg-files",
    label: checkInfo("pkg-files").title,
    hint: 'Add a "files" allowlist (e.g. ["dist"]) or an .npmignore so npm publish does not ship everything.',
  },
  {
    id: "pkg-entry",
    label: checkInfo("pkg-entry").title,
    hint: 'Point "main" / "exports" (libraries) or "bin" (CLIs) at built files that get published.',
  },
  {
    id: "pkg-types",
    label: checkInfo("pkg-types").title,
    hint: 'Ship .d.ts files for library entry points: a "types" condition in each "exports" subpath, or "types" next to "main".',
  },
  {
    id: "pkg-bin",
    label: checkInfo("pkg-bin").title,
    hint: 'Start every "bin" script with "#!/usr/bin/env node" (LF line ending, no BOM), or the shell cannot run it.',
  },
  {
    id: "pkg-publish-access",
    label: checkInfo("pkg-publish-access").title,
    hint: 'Scoped packages publish as restricted by default; set "publishConfig": { "access": "public" }.',
  },
];

export interface PackageJsonOutcome {
  ok: boolean;
  /** What satisfied the check (when ok) */
  foundAt?: string;
  /** Actionable reason (when failing) */
  detail?: string;
}

export async function readPackageJson(root: string): Promise<PackageJsonState> {
  let text: string;
  try {
    text = await readFile(join(root, "package.json"), "utf8");
  } catch {
    return { kind: "missing" };
  }
  try {
    const pkg: unknown = JSON.parse(text);
    if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) {
      return { kind: "invalid", error: "package.json is not a JSON object" };
    }
    return { kind: "ok", pkg: pkg as PackageJson, text };
  } catch (err) {
    return {
      kind: "invalid",
      error: `package.json is not valid JSON (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

/** Decide whether the checks apply; returns the skip reason when they do not. */
export function packageJsonSkipReason(state: PackageJsonState): string | undefined {
  if (state.kind === "missing") return "no package.json";
  if (state.kind === "invalid") return state.error;
  if (state.pkg.private === true) return '"private": true, so this package is not published to npm';
  return undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/** A `repository` / `bugs` value: a non-empty string, or an object with a non-empty `url`. */
export function linkUrl(v: unknown): string | undefined {
  if (nonEmpty(v)) return v.trim();
  if (isObject(v) && nonEmpty(v.url)) return v.url.trim();
  return undefined;
}

const LICENSE_FILE_RE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;

async function licenseFile(root: string): Promise<{ name: string; text: string } | undefined> {
  let names: string[] = [];
  try {
    names = (await readdir(root, { withFileTypes: true }))
      .filter((e) => e.isFile() && LICENSE_FILE_RE.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return undefined;
  }
  const name = names[0];
  if (!name) return undefined;
  try {
    return { name, text: await readFile(join(root, name), "utf8") };
  } catch {
    return undefined;
  }
}

/** SPDX id of a LICENSE text when it is recognisable (MIT or Apache-2.0); undefined otherwise. */
export function detectLicenseSpdx(text: string): string | undefined {
  if (/^\s*MIT License/i.test(text) || /Permission is hereby granted, free of charge/i.test(text)) {
    return "MIT";
  }
  if (/Apache License/i.test(text) && /Version 2\.0/i.test(text)) return "Apache-2.0";
  return undefined;
}

/** Files npm always publishes, whatever `files` says. */
const ALWAYS_PUBLISHED = /^(package\.json|readme(\..*)?|licen[cs]e(\..*)?)$/i;

function coveredByFiles(path: string, files: string[]): boolean {
  if (ALWAYS_PUBLISHED.test(path)) return true;
  return files.some((raw) => {
    if (raw.startsWith("!")) return false;
    const f = raw.trim().replace(/^\.\//, "").replace(/\/+$/, "");
    if (!f) return false;
    // Globs are matched leniently rather than re-implementing npm's matcher.
    if (f.includes("*")) return true;
    return path === f || path.startsWith(`${f}/`);
  });
}

interface EntryRef {
  field: string;
  path: unknown;
}

function collectExports(v: unknown, field: string, out: EntryRef[]): void {
  if (v === null) return; // `null` blocks a subpath on purpose
  if (Array.isArray(v)) {
    v.forEach((x, i) => collectExports(x, `${field}[${i}]`, out));
  } else if (isObject(v)) {
    for (const [key, x] of Object.entries(v)) collectExports(x, `${field}["${key}"]`, out);
  } else {
    out.push({ field, path: v });
  }
}

function entryRefs(pkg: PackageJson): EntryRef[] {
  const out: EntryRef[] = [];
  if (pkg.main !== undefined) out.push({ field: "main", path: pkg.main });
  if (isObject(pkg.bin)) {
    for (const [key, v] of Object.entries(pkg.bin)) out.push({ field: `bin.${key}`, path: v });
  } else if (pkg.bin !== undefined) {
    out.push({ field: "bin", path: pkg.bin });
  }
  if (pkg.exports !== undefined) collectExports(pkg.exports, "exports", out);
  return out;
}

function entryProblem(ref: EntryRef, files: string[] | undefined): string | undefined {
  const { field, path } = ref;
  if (!nonEmpty(path)) return `"${field}" must be a non-empty path string`;
  const p = path.trim();
  const norm = p.replace(/^\.\//, "");
  if (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p) || norm.split(/[\\/]/).includes("..")) {
    return `"${field}" (${p}) must be a relative path inside the package`;
  }
  if (/\.(ts|tsx|mts|cts)$/i.test(norm) && !/\.d\.(ts|mts|cts)$/i.test(norm)) {
    return `"${field}" (${p}) points at TypeScript source; point it at the built .js output`;
  }
  if (files && files.length > 0 && !coveredByFiles(norm, files)) {
    return `"${field}" (${p}) is not included in "files", so it would be missing from the published package`;
  }
  return undefined;
}

const JS_TARGET_RE = /\.(js|mjs|cjs|jsx)$/i;
const DTS_RE = /\.d\.(ts|mts|cts)$/i;

/** `./dist/index.js` -> `dist/index.js` (undefined for non-strings). */
function normPath(v: unknown): string | undefined {
  return nonEmpty(v) ? v.trim().replace(/^\.\//, "") : undefined;
}

/** A JavaScript file TypeScript would need declarations for (patterns and non-JS assets are skipped). */
function isJsTarget(path: string): boolean {
  return !path.includes("*") && (JS_TARGET_RE.test(path) || !/\.[A-Za-z0-9]+$/.test(path.split("/").pop() ?? ""));
}

/** The declaration file TypeScript picks up next to a JavaScript file (`x.js` -> `x.d.ts`, `x.mjs` -> `x.d.mts`). */
export function siblingDeclaration(path: string): string {
  const m = /\.(m|c)?jsx?$/i.exec(path);
  if (!m) return `${path}.d.ts`;
  const flavour = (m[1] ?? "").toLowerCase();
  return `${path.slice(0, m.index)}.d.${flavour}ts`;
}

interface ExportTargets {
  /** Every non-`types` string target under the subpath, with its field path */
  targets: { field: string; path: string }[];
  /** `types` condition values found under the subpath */
  types: { field: string; path: unknown }[];
  /** Condition objects where `types` comes after another condition (it must be first) */
  late: string[];
}

function collectSubpath(v: unknown, field: string, out: ExportTargets): void {
  if (v === null || v === undefined) return;
  if (Array.isArray(v)) {
    v.forEach((x, i) => collectSubpath(x, `${field}[${i}]`, out));
  } else if (isObject(v)) {
    const keys = Object.keys(v);
    const typesAt = keys.findIndex((k) => k === "types" || k.startsWith("types@"));
    if (typesAt > 0) out.late.push(`${field}["${keys[typesAt]}"]`);
    for (const [key, x] of Object.entries(v)) {
      const f = `${field}["${key}"]`;
      if (key === "types" || key.startsWith("types@")) collectTypes(x, f, out);
      else collectSubpath(x, f, out);
    }
  } else if (nonEmpty(v)) {
    out.targets.push({ field, path: v.trim().replace(/^\.\//, "") });
  }
}

function collectTypes(v: unknown, field: string, out: ExportTargets): void {
  if (v === null || v === undefined) return;
  if (isObject(v) || Array.isArray(v)) {
    // Nested conditions under "types" (rare): every string inside is a declaration path.
    const inner: ExportTargets = { targets: [], types: [], late: [] };
    collectSubpath(v, field, inner);
    for (const t of inner.targets) out.types.push({ field: t.field, path: t.path });
    out.types.push(...inner.types);
  } else {
    out.types.push({ field, path: v });
  }
}

/**
 * Split `exports` into subpaths with the field name used in messages:
 * `{ ".": ..., "./x": ... }` gives one per key; strings, arrays and condition
 * maps are the "." subpath written as plain `exports`.
 */
function exportSubpaths(exp: unknown): [field: string, value: unknown][] {
  if (isObject(exp)) {
    const keys = Object.keys(exp);
    if (keys.length > 0 && keys.every((k) => k.startsWith("."))) {
      return Object.entries(exp).map(([k, v]) => [`exports["${k}"]`, v]);
    }
  }
  return [["exports", exp]];
}

function declarationProblem(field: string, path: unknown, files: string[] | undefined): string | undefined {
  if (!nonEmpty(path)) return `"${field}" must be a non-empty path string`;
  const p = path.trim();
  const norm = p.replace(/^\.\//, "");
  if (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p) || norm.split(/[\\/]/).includes("..")) {
    return `"${field}" (${p}) must be a relative path inside the package`;
  }
  if (!norm.includes("*") && !DTS_RE.test(norm)) {
    return `"${field}" (${p}) should point at a .d.ts / .d.mts / .d.cts declaration file`;
  }
  if (files && files.length > 0 && !coveredByFiles(norm, files)) {
    return `"${field}" (${p}) is not included in "files", so TypeScript users would not get it`;
  }
  return undefined;
}

async function exists(root: string, path: string): Promise<boolean> {
  try {
    await access(join(root, path));
    return true;
  } catch {
    return false;
  }
}

/**
 * pkg-types: library entry points (`main`, `exports` JavaScript targets that are
 * not also `bin` scripts) need declarations TypeScript can find.
 */
async function evaluateTypes(
  root: string,
  pkg: PackageJson,
  files: string[] | undefined,
): Promise<PackageJsonOutcome> {
  const binTargets = new Set<string>();
  if (isObject(pkg.bin)) {
    for (const v of Object.values(pkg.bin)) {
      const n = normPath(v);
      if (n) binTargets.add(n);
    }
  } else {
    const n = normPath(pkg.bin);
    if (n) binTargets.add(n);
  }
  const isLibTarget = (path: string) => isJsTarget(path) && !binTargets.has(path);
  const topField = pkg.types !== undefined ? "types" : pkg.typings !== undefined ? "typings" : undefined;
  const topTypes = topField ? pkg[topField] : undefined;
  const problems: string[] = [];

  if (topField) {
    const p = declarationProblem(topField, topTypes, files);
    if (p) problems.push(p);
  }

  let libEntries = 0;
  if (pkg.exports !== undefined && pkg.exports !== null) {
    for (const [field, value] of exportSubpaths(pkg.exports)) {
      const found: ExportTargets = { targets: [], types: [], late: [] };
      collectSubpath(value, field, found);
      for (const t of found.types) {
        const p = declarationProblem(t.field, t.path, files);
        if (p) problems.push(p);
      }
      for (const f of found.late) {
        problems.push(`"${f}" must be the first condition in its object; conditions match in order, so TypeScript never reaches it`);
      }
      const lib = found.targets.filter((t) => isLibTarget(t.path));
      if (lib.length === 0) continue;
      libEntries++;
      if (found.types.length > 0) continue;
      const missing: string[] = [];
      for (const t of lib) {
        if (!(await exists(root, siblingDeclaration(t.path)))) missing.push(t.path);
      }
      if (missing.length === 0) continue;
      const shown = missing[0] ?? "";
      problems.push(
        `"${field}" (${shown}) has no "types" condition and no ${siblingDeclaration(shown)} next to it` +
          (topField ? `; TypeScript ignores top-level "${topField}" for packages with "exports"` : ""),
      );
    }
  } else {
    const main = normPath(pkg.main);
    if (main && isLibTarget(main)) {
      libEntries++;
      if (!topField && !(await exists(root, siblingDeclaration(main)))) {
        problems.push(
          `"main" (${main}) has no type declarations; add "types": "${siblingDeclaration(main)}" (emit it with tsc --declaration)`,
        );
      }
    }
  }

  if (problems.length) {
    return {
      ok: false,
      detail: problems.slice(0, 3).join("; ") + (problems.length > 3 ? ` (+${problems.length - 3} more)` : ""),
    };
  }
  if (libEntries === 0) {
    return {
      ok: true,
      foundAt: binTargets.size > 0 ? "package.json (CLI only, no library entry)" : "package.json (no library entry)",
    };
  }
  return { ok: true, foundAt: "package.json" };
}

/** Built-output directories whose sources usually live under `src/`. */
const OUT_DIR_RE = /^(dist|build|lib|out|bin)\//;
const SOURCE_EXTS = [".ts", ".mts", ".cts", ".tsx", ".js", ".mjs", ".cjs"];

/**
 * Where the source of a built bin file may live when the build output is not
 * there yet: `dist/cli.js` -> `src/cli.ts` (and `.mts` / `.cts` / `.tsx` / `.js`),
 * plus a TypeScript file next to it (`bin/cli.js` -> `bin/cli.ts`).
 */
export function binSourceCandidates(path: string): string[] {
  const stem = path.replace(/\.(m|c)?jsx?$/i, "");
  const out: string[] = [];
  if (OUT_DIR_RE.test(stem)) {
    const rest = stem.replace(OUT_DIR_RE, "");
    for (const ext of SOURCE_EXTS) out.push(`src/${rest}${ext}`);
  }
  for (const ext of [".ts", ".mts", ".cts", ".tsx"]) out.push(`${stem}${ext}`);
  return [...new Set(out)].filter((c) => c !== path);
}

/** What is wrong with a bin script's first line, or undefined when it is a usable shebang. */
export function shebangProblem(text: string): string | undefined {
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = bom ? text.slice(1) : text;
  const nl = body.indexOf("\n");
  const first = nl === -1 ? body : body.slice(0, nl);
  if (!first.startsWith("#!")) {
    if (bom && body.startsWith("#!")) return "starts with a byte order mark, so the #! line is not recognised";
    return "has no #! line, so the shell would run it as a shell script; add #!/usr/bin/env node as the first line";
  }
  if (bom) return "starts with a byte order mark, so the #! line is not recognised";
  if (first.endsWith("\r")) {
    return 'ends its #! line with a Windows line ending (CRLF), so the shell looks for "node\\r"; save it with LF line endings';
  }
  const parts = first.slice(2).trim().split(/\s+/);
  const interpreter = parts[0] ?? "";
  if (!interpreter) return "has an empty #! line; use #!/usr/bin/env node";
  const base = interpreter.split("/").pop() ?? "";
  if (/^node(js)?$/.test(base) && interpreter.includes("/")) {
    return `hard-codes ${interpreter} in its #! line, which breaks where node lives elsewhere (nvm, Homebrew, Windows); use #!/usr/bin/env node`;
  }
  return undefined;
}

async function readText(root: string, path: string): Promise<string | undefined> {
  try {
    return await readFile(join(root, path), "utf8");
  } catch {
    return undefined;
  }
}

/** pkg-bin: every `bin` script starts with a usable `#!` line. */
async function evaluateBin(root: string, pkg: PackageJson): Promise<PackageJsonOutcome> {
  const bins: { field: string; path: string }[] = [];
  if (isObject(pkg.bin)) {
    for (const [key, v] of Object.entries(pkg.bin)) {
      const n = normPath(v);
      if (n) bins.push({ field: `bin.${key}`, path: n });
    }
  } else {
    const n = normPath(pkg.bin);
    if (n) bins.push({ field: "bin", path: n });
  }
  if (bins.length === 0) return { ok: true, foundAt: "package.json (no bin)" };

  const problems: string[] = [];
  const checked: string[] = [];
  const notBuilt: string[] = [];
  const seen = new Set<string>();
  for (const { field, path } of bins) {
    // Absolute / outside-the-package / .ts targets are pkg-entry's job.
    if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.split(/[\\/]/).includes("..")) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    let file = path;
    let text = await readText(root, path);
    if (text === undefined) {
      for (const candidate of binSourceCandidates(path)) {
        text = await readText(root, candidate);
        if (text !== undefined) {
          file = candidate;
          break;
        }
      }
    }
    if (text === undefined) {
      notBuilt.push(path);
      continue;
    }
    const p = shebangProblem(text);
    if (p) problems.push(`"${field}" (${file === path ? path : `${path}, source ${file}`}) ${p}`);
    else checked.push(file);
  }

  if (problems.length) {
    return {
      ok: false,
      detail: problems.slice(0, 3).join("; ") + (problems.length > 3 ? ` (+${problems.length - 3} more)` : ""),
    };
  }
  if (checked.length === 0 && notBuilt.length > 0) {
    return { ok: true, foundAt: `package.json (not built yet: ${notBuilt.join(", ")})` };
  }
  return { ok: true, foundAt: checked.join(", ") || "package.json" };
}

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** Run every publish-readiness check against a parsed package.json. Keyed by check id. */
export async function evaluatePackageJson(
  root: string,
  pkg: PackageJson,
): Promise<Record<string, PackageJsonOutcome>> {
  const out: Record<string, PackageJsonOutcome> = {};
  const fail = (detail: string): PackageJsonOutcome => ({ ok: false, detail });
  const pass = (foundAt = "package.json"): PackageJsonOutcome => ({ ok: true, foundAt });

  // name + version
  const missingNV = ["name", "version"].filter((k) => !nonEmpty(pkg[k]));
  if (missingNV.length) {
    out["pkg-name-version"] = fail(
      `add ${missingNV.map((k) => `"${k}"`).join(" and ")} to package.json; npm cannot publish without them`,
    );
  } else if (!SEMVER_RE.test(String(pkg.version).trim())) {
    out["pkg-name-version"] = fail(`"version" (${String(pkg.version)}) is not semver; use e.g. "0.1.0"`);
  } else {
    out["pkg-name-version"] = pass();
  }

  // description
  out["pkg-description"] = nonEmpty(pkg.description)
    ? pass()
    : fail('add a one-line "description"; npm search and the package page show it');

  // license (and agreement with the LICENSE file when recognisable)
  if (!nonEmpty(pkg.license)) {
    out["pkg-license"] = fail(
      isObject(pkg.license)
        ? '"license" must be an SPDX string such as "MIT" (the object form is deprecated)'
        : 'add "license" with the SPDX id of your LICENSE file (e.g. "MIT" or "Apache-2.0")',
    );
  } else {
    const declared = pkg.license.trim();
    const file = await licenseFile(root);
    const detected = file ? detectLicenseSpdx(file.text) : undefined;
    const isExpression = /\s(OR|AND|WITH)\s|[()]/i.test(declared);
    if (file && detected && !isExpression && declared.toLowerCase() !== detected.toLowerCase()) {
      out["pkg-license"] = fail(
        `package.json says "${declared}" but ${file.name} looks like ${detected}; make them match`,
      );
    } else {
      out["pkg-license"] = pass();
    }
  }

  // repository / bugs / homepage
  const missingLinks: string[] = [];
  if (!linkUrl(pkg.repository)) missingLinks.push("repository");
  if (!linkUrl(pkg.bugs)) missingLinks.push("bugs");
  if (!nonEmpty(pkg.homepage)) missingLinks.push("homepage");
  out["pkg-links"] = missingLinks.length
    ? fail(
        `add ${missingLinks.map((k) => `"${k}"`).join(", ")} to package.json: run \`${ADD_LINKS_COMMAND}\` to fill them (plain \`ossready doctor --fix\` works when the owner can be inferred from existing GitHub links or the origin git remote)`,
      )
    : pass();

  // engines.node
  out["pkg-engines"] =
    isObject(pkg.engines) && nonEmpty(pkg.engines.node)
      ? pass()
      : fail('declare the supported Node.js range, e.g. "engines": { "node": ">=22.12" }');

  // files / .npmignore
  const files = Array.isArray(pkg.files)
    ? pkg.files.filter((f): f is string => typeof f === "string")
    : undefined;
  let npmignore = false;
  try {
    npmignore = (await readdir(root)).includes(".npmignore");
  } catch {
    npmignore = false;
  }
  if (files && files.length > 0) out["pkg-files"] = pass("package.json#files");
  else if (npmignore) out["pkg-files"] = pass(".npmignore");
  else {
    out["pkg-files"] = fail(
      'add a "files" allowlist (e.g. ["dist"]) or an .npmignore so npm publish does not ship tests, sources and config',
    );
  }

  // main / exports / bin
  const refs = entryRefs(pkg);
  if (refs.length === 0) {
    out["pkg-entry"] = fail('set "main" / "exports" (library) or "bin" (CLI) so consumers can load the package');
  } else {
    const problems = refs.map((r) => entryProblem(r, files)).filter((p): p is string => Boolean(p));
    out["pkg-entry"] = problems.length
      ? fail(problems.slice(0, 3).join("; ") + (problems.length > 3 ? ` (+${problems.length - 3} more)` : ""))
      : pass();
  }

  // type declarations for library entry points
  out["pkg-types"] = await evaluateTypes(root, pkg, files);

  // #! line on bin scripts
  out["pkg-bin"] = await evaluateBin(root, pkg);

  // publishConfig.access for scoped names
  const name = nonEmpty(pkg.name) ? pkg.name.trim() : "";
  if (!name.startsWith("@")) {
    out["pkg-publish-access"] = pass("package.json (unscoped name)");
  } else {
    const access = isObject(pkg.publishConfig) ? pkg.publishConfig.access : undefined;
    out["pkg-publish-access"] =
      access === "public" || access === "restricted"
        ? pass()
        : fail(
            `"${name}" is scoped, so npm publishes it as restricted by default; set "publishConfig": { "access": "public" }`,
          );
  }

  return out;
}
