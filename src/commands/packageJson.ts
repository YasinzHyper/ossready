import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

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

export const PACKAGE_JSON_CHECKS: readonly PackageJsonCheckDef[] = [
  {
    id: "pkg-name-version",
    label: "package.json name and version",
    hint: 'Set "name" and a semver "version" (e.g. "0.1.0").',
  },
  {
    id: "pkg-description",
    label: "package.json description",
    hint: 'Add a one-line "description"; npm search and the package page show it.',
  },
  {
    id: "pkg-license",
    label: "package.json license",
    hint: 'Set "license" to the SPDX id of your LICENSE file (e.g. "MIT").',
  },
  {
    id: "pkg-links",
    label: "package.json repository, bugs and homepage",
    hint: 'Add "repository", "bugs" and "homepage" so npm links back to your repo.',
  },
  {
    id: "pkg-engines",
    label: "package.json engines.node",
    hint: 'Declare the supported Node.js range in "engines": { "node": ">=22.12" }.',
  },
  {
    id: "pkg-files",
    label: "Published files allowlist",
    hint: 'Add a "files" allowlist (e.g. ["dist"]) or an .npmignore so npm publish does not ship everything.',
  },
  {
    id: "pkg-entry",
    label: "Entry points (main / exports / bin)",
    hint: 'Point "main" / "exports" (libraries) or "bin" (CLIs) at built files that get published.',
  },
  {
    id: "pkg-publish-access",
    label: "publishConfig.access for scoped packages",
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
        `add ${missingLinks.map((k) => `"${k}"`).join(", ")} to package.json (\`ossready doctor --fix\` fills them when the GitHub owner is known)`,
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
