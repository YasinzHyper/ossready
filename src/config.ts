/**
 * Project-level ossready config: persistent `doctor` check filters so you do
 * not have to pass `--check` / `--skip` on every run.
 *
 * Discovery order (first hit wins):
 *   1. an explicit `--config <path>`
 *   2. `.ossreadyrc` in the audited directory
 *   3. `.ossreadyrc.json`
 *   4. `.ossready.json`
 *   5. the `"ossready"` key in `package.json`
 *
 * Shape (JSON object):
 *   { "skip": ["funding", "citation"], "check": ["readme", "license"], "strict": true }
 * or nested under `"doctor"`:
 *   { "doctor": { "skip": ["funding"] } }
 * `skip` / `check` accept a string, a comma-separated string, or a string array
 * (same tokens as the CLI flags). `strict: true` makes doctor fail on missing
 * recommended checks too, like `--strict`. An optional `"$schema"` points editors at the
 * JSON Schema shipped in this package (`schema/ossreadyrc.schema.json`). Unknown
 * keys fail with a did-you-mean suggestion.
 */

import { readFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { closest } from "./cliErrors.js";
import { pathExists } from "./utils/fs.js";

/** Filenames looked for in the audited directory, in order. */
export const OSSREADY_RC_FILES = [".ossreadyrc", ".ossreadyrc.json", ".ossready.json"] as const;

/**
 * Path of the JSON Schema shipped in the npm package (and this repo), relative
 * to the package / repo root. Referenced from `$schema` in docs and examples.
 */
export const OSSREADY_RC_SCHEMA_PATH = "schema/ossreadyrc.schema.json";

/** Canonical GitHub raw URL for the schema on `main` (editor-friendly `$schema`). */
export const OSSREADY_RC_SCHEMA_URL =
  "https://raw.githubusercontent.com/YasinzHyper/ossready/main/schema/ossreadyrc.schema.json";

/** Allowed top-level keys in an rc file / `package.json#ossready` object. */
export const OSSREADY_RC_ROOT_KEYS = ["$schema", "check", "skip", "strict", "doctor"] as const;

/** Allowed keys under the nested `"doctor"` object. */
export const OSSREADY_RC_DOCTOR_KEYS = ["check", "skip", "strict"] as const;

/** The doctor-related fields we read from a config file. */
export interface DoctorConfig {
  /** Only run these check ids (same meaning as `--check`). */
  check?: string | string[];
  /** Skip these check ids (same meaning as `--skip`). */
  skip?: string | string[];
  /** Also fail on missing recommended checks (same meaning as `--strict`). */
  strict?: boolean;
}

/** A loaded config plus where it came from (for reports / errors). */
export interface LoadedOssreadyConfig {
  /** Display path: relative to the audited root, or `package.json#ossready`. */
  path: string;
  doctor: DoctorConfig;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accept a string, string[], or undefined; reject other JSON types. */
function readIdList(value: unknown, field: string, source: string): string | string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (!value.every((v) => typeof v === "string")) {
      throw new Error(
        `Invalid ${field} in ${source}: expected a string, a comma-separated string, or an array of strings.`,
      );
    }
    return value as string[];
  }
  throw new Error(
    `Invalid ${field} in ${source}: expected a string, a comma-separated string, or an array of strings.`,
  );
}

/** Reject typos like `"skipp"` with the same did-you-mean helper the CLI uses. */
function assertKnownKeys(
  raw: Record<string, unknown>,
  allowed: readonly string[],
  source: string,
  where: string,
): void {
  const unknown = Object.keys(raw).filter((k) => !allowed.includes(k));
  if (unknown.length === 0) return;
  const messages = unknown.map((key) => {
    const suggestion = closest(key, allowed);
    const hint = suggestion ? ` Did you mean \`${suggestion}\`?` : "";
    return `Unknown ${where} key \`${key}\` in ${source}.${hint}`;
  });
  const allowedList = allowed.map((k) => `\`${k}\``).join(", ");
  throw new Error(`${messages.join("\n")} Allowed keys: ${allowedList}.`);
}

/**
 * Pull `doctor.check` / `doctor.skip` (or top-level `check` / `skip`) out of a
 * parsed JSON value. Throws when the root is not an object, a field has the
 * wrong type, or an unknown key is present (except the optional `"$schema"`).
 */
export function parseOssreadyConfig(raw: unknown, source: string): DoctorConfig {
  if (!isPlainObject(raw)) {
    throw new Error(`Invalid config in ${source}: expected a JSON object.`);
  }

  assertKnownKeys(raw, OSSREADY_RC_ROOT_KEYS, source, "config");

  let checkRaw: unknown = raw.check;
  let skipRaw: unknown = raw.skip;
  let strictRaw: unknown = raw.strict;
  if (raw.doctor !== undefined) {
    if (!isPlainObject(raw.doctor)) {
      throw new Error(`Invalid "doctor" in ${source}: expected an object.`);
    }
    assertKnownKeys(raw.doctor, OSSREADY_RC_DOCTOR_KEYS, source, `"doctor"`);
    // Nested doctor.* wins over a top-level twin when both are present.
    if (raw.doctor.check !== undefined) checkRaw = raw.doctor.check;
    if (raw.doctor.skip !== undefined) skipRaw = raw.doctor.skip;
    if (raw.doctor.strict !== undefined) strictRaw = raw.doctor.strict;
  }

  const doctor: DoctorConfig = {};
  const check = readIdList(checkRaw, '"check"', source);
  const skip = readIdList(skipRaw, '"skip"', source);
  if (check !== undefined) doctor.check = check;
  if (skip !== undefined) doctor.skip = skip;
  if (strictRaw !== undefined) {
    if (typeof strictRaw !== "boolean") {
      throw new Error(`Invalid "strict" in ${source}: expected true or false.`);
    }
    doctor.strict = strictRaw;
  }
  return doctor;
}

/** Prefer a path relative to the audited root; fall back to cwd, then absolute. */
function displayPath(filePath: string, root: string): string {
  const fromRoot = relative(root, filePath);
  if (fromRoot === "") return basename(filePath);
  if (!fromRoot.startsWith("..")) return fromRoot;
  const fromCwd = relative(process.cwd(), filePath);
  if (fromCwd === "") return basename(filePath);
  if (!fromCwd.startsWith("..")) return fromCwd;
  return filePath;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (err) {
    throw new Error(
      `Could not read config file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(
      `Invalid JSON in ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Load the project config for `root` (the audited directory).
 *
 * - `explicitPath` (`--config <path>`): resolved from cwd; missing file → error.
 * - `noConfig` (`--ignore-config`): skip discovery (an explicit `--config` still wins).
 * Returns `undefined` when nothing is found.
 */
export async function loadOssreadyConfig(
  root: string,
  options: { config?: string; noConfig?: boolean } = {},
): Promise<LoadedOssreadyConfig | undefined> {
  if (options.config) {
    const filePath = resolve(process.cwd(), options.config);
    if (!(await pathExists(filePath))) {
      throw new Error(`Config file not found: ${filePath}`);
    }
    const raw = await readJsonFile(filePath);
    // When --config points at package.json, read the "ossready" key.
    if (basename(filePath) === "package.json") {
      if (!isPlainObject(raw)) {
        throw new Error(`Invalid package.json in ${filePath}: expected a JSON object.`);
      }
      if (raw.ossready === undefined) {
        throw new Error(`No "ossready" key in ${filePath}.`);
      }
      const label = `${displayPath(filePath, root)}#ossready`;
      return { path: label, doctor: parseOssreadyConfig(raw.ossready, label) };
    }
    const label = displayPath(filePath, root);
    return { path: label, doctor: parseOssreadyConfig(raw, label) };
  }

  if (options.noConfig) return undefined;

  for (const name of OSSREADY_RC_FILES) {
    const filePath = join(root, name);
    if (!(await pathExists(filePath))) continue;
    const label = displayPath(filePath, root);
    const raw = await readJsonFile(filePath);
    return { path: label, doctor: parseOssreadyConfig(raw, label) };
  }

  const pkgPath = join(root, "package.json");
  if (await pathExists(pkgPath)) {
    let raw: unknown;
    try {
      raw = await readJsonFile(pkgPath);
    } catch (err) {
      // Invalid package.json is already reported by the package.json checks;
      // do not fail the whole audit just for config discovery.
      if (err instanceof Error && err.message.startsWith("Invalid JSON")) {
        return undefined;
      }
      throw err;
    }
    if (isPlainObject(raw) && raw.ossready !== undefined) {
      const label = `${displayPath(pkgPath, root)}#ossready`;
      return { path: label, doctor: parseOssreadyConfig(raw.ossready, label) };
    }
  }

  return undefined;
}

/**
 * Merge config doctor fields with CLI `--check` / `--skip`.
 *
 * - CLI `--check` replaces config `check` (explicit wins).
 * - CLI `--skip` is **added** to config `skip` (persistent skips stay on;
 *   the flag only adds more).
 * - Absent config leaves the CLI values alone.
 */
export function mergeDoctorFilters(
  cli: { check?: string | string[]; skip?: string | string[] },
  loaded: LoadedOssreadyConfig | undefined,
): {
  check?: string | string[];
  skip?: string | string[];
  configPath?: string;
  /** True when the loaded config contributed at least one check or skip id. */
  fromConfig: boolean;
} {
  if (!loaded) {
    return { check: cli.check, skip: cli.skip, fromConfig: false };
  }

  const cfgCheck = loaded.doctor.check;
  const cfgSkip = loaded.doctor.skip;
  const hasCfgCheck = cfgCheck !== undefined;
  const hasCfgSkip = cfgSkip !== undefined;
  const fromConfig = hasCfgCheck || hasCfgSkip;

  const check = cli.check !== undefined ? cli.check : cfgCheck;

  let skip: string | string[] | undefined = cli.skip;
  if (hasCfgSkip) {
    const parts: Array<string | string[]> = [];
    if (cfgSkip !== undefined) parts.push(cfgSkip);
    if (cli.skip !== undefined) parts.push(cli.skip);
    skip = parts.flatMap((p) => (Array.isArray(p) ? p : [p]));
  }

  return {
    check,
    skip,
    ...(fromConfig ? { configPath: loaded.path } : {}),
    fromConfig,
  };
}

/**
 * Effective `--strict` for doctor: the CLI flag turns it on; otherwise the
 * config's `strict` decides. `source` names where it came from (`--strict` or
 * the config display path) and is only set when strict is on. A config
 * `"strict": false` cannot switch off an explicit `--strict`; use
 * `--ignore-config` to drop a config `"strict": true` for one run.
 */
export function resolveDoctorStrict(
  cliStrict: boolean | undefined,
  loaded: LoadedOssreadyConfig | undefined,
): { strict: boolean; source?: string } {
  if (cliStrict) return { strict: true, source: "--strict" };
  if (loaded?.doctor.strict === true) return { strict: true, source: loaded.path };
  return { strict: false };
}
