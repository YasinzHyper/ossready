/**
 * `ossready config`: show the discovered project config, or write a starter
 * `.ossreadyrc` with `--init` (same text `ossready init` scaffolds).
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  loadOssreadyConfig,
  OSSREADY_RC_FILES,
  type DoctorConfig,
  type LoadedOssreadyConfig,
} from "../config.js";
import { ossreadyrcText } from "../templates/ossreadyrc.js";
import { pathExists } from "../utils/fs.js";
import { normalizeCheckIdList, resolveCheckSelection } from "./doctor.js";

export interface ConfigFlags {
  json?: boolean;
  init?: boolean;
  force?: boolean;
  /** Explicit config file (`--config <path>`), resolved from cwd like `doctor --config` */
  config?: string;
}

/** Normalized doctor filters for display / `--json`. */
export interface ConfigDoctorView {
  check?: string[];
  skip?: string[];
  /** Config `strict` (present only when the file sets it) */
  strict?: boolean;
}

/** Machine-readable shape for `ossready config` (show). */
export interface ConfigShowJson {
  directory: string;
  config: string | null;
  doctor: ConfigDoctorView;
}

/** Machine-readable shape for `ossready config --init`. */
export interface ConfigInitJson {
  directory: string;
  written: string;
  action: "created" | "overwritten";
  /** Set when an existing package.json#ossready (or other rc) is left in place. */
  note?: string;
}

/** What is already present that would collide with `--init`. */
export interface ExistingConfigPresence {
  /** First rc filename found among OSSREADY_RC_FILES, if any. */
  rcFile?: string;
  /** True when package.json has a top-level `"ossready"` key. */
  packageOssready: boolean;
}

/** Expand config `check` / `skip` the same way doctor expands CLI flags. */
export function normalizeDoctorView(doctor: DoctorConfig): ConfigDoctorView {
  const view: ConfigDoctorView = {};
  if (doctor.check !== undefined) view.check = normalizeCheckIdList(doctor.check);
  if (doctor.skip !== undefined) view.skip = normalizeCheckIdList(doctor.skip);
  if (doctor.strict !== undefined) view.strict = doctor.strict;
  return view;
}

function formatCheckField(check: string[] | undefined): string {
  // Absent / empty check means every check runs.
  if (check === undefined || check.length === 0) return "all checks";
  return check.join(", ");
}

function formatSkipField(skip: string[] | undefined): string {
  if (skip === undefined || skip.length === 0) return "(none)";
  return skip.join(", ");
}

/** Human-readable report for a loaded (or missing) config. */
export function formatConfigShow(
  directory: string,
  loaded: LoadedOssreadyConfig | undefined,
): string {
  if (!loaded) {
    return [
      `No project config found in ${directory}.`,
      "Run `ossready config --init` to write a starter `.ossreadyrc` (or copy one by hand).",
    ].join("\n");
  }
  const doctor = normalizeDoctorView(loaded.doctor);
  return [
    `Config: ${loaded.path}`,
    `doctor.check: ${formatCheckField(doctor.check)}`,
    `doctor.skip: ${formatSkipField(doctor.skip)}`,
    `doctor.strict: ${doctor.strict ? "on" : "off"}`,
  ].join("\n");
}

export function toConfigShowJson(
  directory: string,
  loaded: LoadedOssreadyConfig | undefined,
): ConfigShowJson {
  if (!loaded) {
    return { directory, config: null, doctor: {} };
  }
  return {
    directory,
    config: loaded.path,
    doctor: normalizeDoctorView(loaded.doctor),
  };
}

/**
 * Detect rc files and/or `package.json#ossready` in `root` without parsing
 * (used by `--init` to refuse / explain collisions).
 */
export async function detectExistingConfig(root: string): Promise<ExistingConfigPresence> {
  let rcFile: string | undefined;
  for (const name of OSSREADY_RC_FILES) {
    if (await pathExists(join(root, name))) {
      rcFile = name;
      break;
    }
  }

  let packageOssready = false;
  const pkgPath = join(root, "package.json");
  if (await pathExists(pkgPath)) {
    try {
      const raw: unknown = JSON.parse(await readFile(pkgPath, "utf8"));
      if (raw && typeof raw === "object" && !Array.isArray(raw) && "ossready" in raw) {
        packageOssready = (raw as Record<string, unknown>).ossready !== undefined;
      }
    } catch {
      // Invalid package.json: treat as no ossready key for --init purposes.
    }
  }

  return { rcFile, packageOssready };
}

function existingConfigLabel(presence: ExistingConfigPresence): string {
  const parts: string[] = [];
  if (presence.rcFile) parts.push(presence.rcFile);
  if (presence.packageOssready) parts.push("package.json#ossready");
  return parts.join(" and ");
}

/**
 * Fail on unknown `check` / `skip` ids (with did-you-mean), or filters that
 * leave nothing to run — the same errors `ossready doctor` would raise —
 * prefixed with the config path so the bad file is obvious.
 */
export function validateConfigCheckIds(loaded: LoadedOssreadyConfig): void {
  try {
    resolveCheckSelection({ check: loaded.doctor.check, skip: loaded.doctor.skip });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${loaded.path}: ${message}`);
  }
}

/**
 * Pure core of `ossready config` (no console). Returns what to print.
 * Throws when `--init` is refused (caller / program.ts maps that to exit 1).
 */
export async function runConfig(
  directory: string,
  flags: ConfigFlags = {},
): Promise<{
  stdout: string;
  show?: ConfigShowJson;
  init?: ConfigInitJson;
}> {
  const targetDir = resolve(process.cwd(), directory);

  if (flags.init && flags.config !== undefined) {
    throw new Error(
      "`--config` cannot be combined with `--init` (`--init` always writes `.ossreadyrc` in the target directory).",
    );
  }

  if (flags.init) {
    const presence = await detectExistingConfig(targetDir);
    const hasExisting = Boolean(presence.rcFile) || presence.packageOssready;

    if (hasExisting && !flags.force) {
      const label = existingConfigLabel(presence);
      throw new Error(
        [
          `Project config already exists (${label}).`,
          "Use `--force` to write `.ossreadyrc` anyway (it wins discovery order; package.json#ossready is left untouched).",
        ].join("\n"),
      );
    }

    const outPath = join(targetDir, ".ossreadyrc");
    const alreadyHadDotOssreadyrc = await pathExists(outPath);
    await writeFile(outPath, ossreadyrcText(), "utf8");
    const action: "created" | "overwritten" = alreadyHadDotOssreadyrc ? "overwritten" : "created";

    const notes: string[] = [];
    if (presence.packageOssready) {
      notes.push(
        "package.json#ossready is still present; `.ossreadyrc` wins discovery order and will be used by doctor.",
      );
    }
    if (presence.rcFile && presence.rcFile !== ".ossreadyrc") {
      notes.push(
        `${presence.rcFile} is still present; \`.ossreadyrc\` wins discovery order and will be used by doctor.`,
      );
    }

    const init: ConfigInitJson = {
      directory: targetDir,
      written: ".ossreadyrc",
      action,
      ...(notes.length ? { note: notes.join(" ") } : {}),
    };

    if (flags.json) {
      return { stdout: JSON.stringify(init, null, 2), init };
    }

    const lines = [
      action === "overwritten" ? `Overwrote ${outPath}` : `Wrote ${outPath}`,
    ];
    if (init.note) lines.push(init.note);
    return { stdout: lines.join("\n"), init };
  }

  // Same loader as `doctor --config`: a missing or invalid file throws (exit 1),
  // so `ossready config --config <path>` doubles as a validator.
  const loaded = await loadOssreadyConfig(
    targetDir,
    flags.config !== undefined ? { config: flags.config } : {},
  );
  if (loaded) validateConfigCheckIds(loaded);
  const show = toConfigShowJson(targetDir, loaded);
  if (flags.json) {
    return { stdout: JSON.stringify(show, null, 2), show };
  }
  return { stdout: formatConfigShow(targetDir, loaded), show };
}

/** CLI entry for `ossready config [directory]`. */
export async function configCommand(directory: string, flags: ConfigFlags = {}): Promise<void> {
  const result = await runConfig(directory, flags);
  if (result.stdout) console.log(result.stdout);
}
