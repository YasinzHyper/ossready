import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { githubOwnerFromUrl, packageManagerFromField, scaffoldLicense } from "./commands/fix.js";
import {
  DEFAULT_COC_EMAIL,
  DEFAULT_DESCRIPTION,
  isValidGithubOwner,
  isValidProjectName,
  type InitFlags,
} from "./commands/init.js";
import { PACKAGE_MANAGERS, type ScaffoldOptions } from "./templates/types.js";
import { assertValidEmail, normalizeOptionalEmail } from "./utils/email.js";
import { pathExists } from "./utils/fs.js";
import { inferGithubOwnerFromGit } from "./utils/github.js";

type License = ScaffoldOptions["license"];
type PackageManager = ScaffoldOptions["packageManager"];

/** Licenses `ossready init` can scaffold, in the order the prompt lists them. */
export const LICENSES: readonly License[] = ["mit", "apache-2.0"];

/** Flags the interactive prompt can fill in when they were not passed. */
export const PROMPTED_FLAGS = [
  "name",
  "description",
  "license",
  "packageManager",
  "author",
  "githubOwner",
  "cocEmail",
  "securityEmail",
] as const;

/** Thrown when the user presses Ctrl+C or input ends (EOF) before every question is answered. */
export class PromptCancelledError extends Error {
  readonly reason: "eof" | "sigint";

  constructor(reason: "eof" | "sigint") {
    super(
      reason === "sigint"
        ? "Cancelled — no files were written."
        : "Input ended before all questions were answered — no files were written.",
    );
    this.name = "PromptCancelledError";
    this.reason = reason;
  }
}

export interface PromptIO {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  /** Treat the streams as a terminal (line editing, Ctrl+C). Default: `output.isTTY`. */
  terminal?: boolean;
}

export interface InteractiveContext {
  /** `--yes` / `-y`: never prompt, use defaults for omitted options */
  yes?: boolean;
  stdinIsTTY?: boolean;
  stdoutIsTTY?: boolean;
  env?: NodeJS.ProcessEnv;
}

/** `CI` counts as set unless it is empty, `0`, or `false`. */
export function isCI(env: NodeJS.ProcessEnv): boolean {
  const value = env.CI?.trim().toLowerCase();
  return value !== undefined && value !== "" && value !== "0" && value !== "false";
}

/**
 * Prompt only for a human at an interactive terminal: stdin and stdout are TTYs,
 * `CI` is not set, and `--yes` was not passed. Scripts and CI never block on input.
 */
export function shouldPrompt(ctx: InteractiveContext): boolean {
  return !ctx.yes && ctx.stdinIsTTY === true && ctx.stdoutIsTTY === true && !isCI(ctx.env ?? {});
}

export interface PromptDefaults {
  name: string;
  description: string;
  license: License;
  packageManager: PackageManager;
  author?: string;
  githubOwner?: string;
  cocEmail: string;
}

interface PackageJsonLike {
  name?: unknown;
  description?: unknown;
  license?: unknown;
  author?: unknown;
  repository?: unknown;
  packageManager?: unknown;
}

async function readPackageJson(dir: string): Promise<PackageJsonLike> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as PackageJsonLike) : {};
  } catch {
    return {};
  }
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function authorFrom(author: unknown): string | undefined {
  // "Name <email> (url)" → "Name"
  if (typeof author === "string") return nonEmpty(author.split(/[<(]/, 1)[0]);
  if (author && typeof author === "object" && "name" in author) {
    return nonEmpty((author as { name?: unknown }).name);
  }
  return undefined;
}

function repositoryUrl(repository: unknown): string | undefined {
  if (typeof repository === "string") return repository;
  if (repository && typeof repository === "object" && "url" in repository) {
    return nonEmpty((repository as { url?: unknown }).url);
  }
  return undefined;
}

async function detectPackageManager(
  dir: string,
  pkg: PackageJsonLike,
  env: NodeJS.ProcessEnv,
): Promise<PackageManager> {
  if (await pathExists(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if ((await pathExists(join(dir, "bun.lockb"))) || (await pathExists(join(dir, "bun.lock")))) {
    return "bun";
  }
  if ((await pathExists(join(dir, "yarn.lock"))) || (await pathExists(join(dir, ".yarnrc.yml")))) {
    return "yarn";
  }
  if (await pathExists(join(dir, "package-lock.json"))) return "npm";
  // `pnpm dlx` / `yarn dlx` / `bunx` set npm_config_user_agent, e.g. "pnpm/9.15.0 npm/? node/v22…"
  return (
    packageManagerFromField(pkg.packageManager) ??
    packageManagerFromField(env.npm_config_user_agent?.split("/", 1)[0]) ??
    "npm"
  );
}

/**
 * Defaults offered by the prompt, inferred from the target directory (its
 * package.json, lockfiles) and, for the GitHub owner, the same git inference
 * `ossready init` uses: the target's or parent's origin remote, then `github.user`.
 */
export async function inferPromptDefaults(
  targetDir: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PromptDefaults> {
  const pkg = await readPackageJson(targetDir);
  const repo = repositoryUrl(pkg.repository);
  const githubOwner =
    (repo ? githubOwnerFromUrl(repo) : undefined) ??
    (await inferGithubOwnerFromGit(targetDir, { parent: true, gitConfig: true }))?.owner;
  return {
    name: nonEmpty(pkg.name) ?? basename(targetDir),
    description: nonEmpty(pkg.description) ?? DEFAULT_DESCRIPTION,
    license: scaffoldLicense(nonEmpty(pkg.license)) ?? "mit",
    packageManager: await detectPackageManager(targetDir, pkg, env),
    author: authorFrom(pkg.author),
    githubOwner,
    cocEmail: DEFAULT_COC_EMAIL,
  };
}

interface LineReader {
  ask(question: string): Promise<string>;
  close(): void;
}

/**
 * Line reader on top of node:readline/promises. Lines are queued, so piped or
 * pre-buffered input (tests) is never lost between questions; EOF and Ctrl+C
 * reject the pending question with PromptCancelledError.
 */
function createLineReader(io: PromptIO): LineReader {
  const terminal = io.terminal ?? (io.output as { isTTY?: boolean }).isTTY === true;
  const rl = createInterface({ input: io.input, output: io.output, terminal });
  const queue: string[] = [];
  let waiter: { resolve: (line: string) => void; reject: (err: Error) => void } | undefined;
  let closed = false;
  let failure: PromptCancelledError | undefined;

  const fail = (err: PromptCancelledError) => {
    failure ??= err;
    const pending = waiter;
    waiter = undefined;
    pending?.reject(failure);
  };

  rl.on("line", (line: string) => {
    const pending = waiter;
    if (pending) {
      waiter = undefined;
      pending.resolve(line);
    } else {
      queue.push(line);
    }
  });
  rl.on("SIGINT", () => {
    queue.length = 0;
    io.output.write("\n");
    fail(new PromptCancelledError("sigint"));
    rl.close();
  });
  rl.on("close", () => {
    closed = true;
    fail(new PromptCancelledError("eof"));
  });

  return {
    ask(question: string): Promise<string> {
      if (failure?.reason === "sigint") return Promise.reject(failure);
      if (closed) {
        io.output.write(question);
      } else {
        rl.setPrompt(question);
        rl.prompt();
      }
      const queued = queue.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      if (failure) {
        io.output.write("\n");
        return Promise.reject(failure);
      }
      return new Promise<string>((resolvePromise, rejectPromise) => {
        waiter = { resolve: resolvePromise, reject: rejectPromise };
      });
    },
    close() {
      if (!closed) rl.close();
    },
  };
}

/** Ask until `parse` accepts the answer; Enter (blank) uses the fallback shown in brackets. */
async function askUntilValid<T>(
  reader: LineReader,
  output: NodeJS.WritableStream,
  label: string,
  fallback: string | undefined,
  parse: (value: string) => T,
): Promise<T> {
  const hint = fallback ? ` [${fallback}]` : " (optional, Enter to skip)";
  for (;;) {
    const answer = (await reader.ask(`? ${label}${hint}: `)).trim();
    try {
      return parse(answer || fallback || "");
    } catch (err) {
      output.write(`  ✖ ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}

/** Accept an option name (case-insensitive) or its 1-based number in the list. */
function choice<T extends string>(options: readonly T[], what: string): (value: string) => T {
  return (value) => {
    const v = value.trim().toLowerCase();
    const match = (/^\d+$/.test(v) ? options[Number(v) - 1] : undefined) ?? options.find((o) => o === v);
    if (!match) {
      throw new Error(`Unknown ${what} "${value}". Choose one of: ${options.join(", ")}.`);
    }
    return match;
  };
}

function optionalText(value: string): string | undefined {
  return value.trim() || undefined;
}

/**
 * Ask for every init option the user did not pass as a flag. Flags always win and
 * are never asked about. Resolves with the merged flags; nothing is written to disk.
 */
export async function promptInitFlags(
  directory: string,
  flags: InitFlags,
  io: PromptIO,
  env: NodeJS.ProcessEnv = process.env,
): Promise<InitFlags> {
  const result: InitFlags = { ...flags };
  if (PROMPTED_FLAGS.every((key) => flags[key] !== undefined)) return result;

  const defaults = await inferPromptDefaults(resolve(process.cwd(), directory), env);
  const { output } = io;
  const reader = createLineReader(io);
  output.write(
    "\nossready init — press Enter to accept the [default]. Pass --yes to skip these questions.\n\n",
  );

  try {
    if (flags.name === undefined) {
      result.name = await askUntilValid(reader, output, "Project name", defaults.name, (v) => {
        if (!isValidProjectName(v)) {
          throw new Error(`Invalid project name "${v}". Use letters, digits, and . _ @ / -`);
        }
        return v;
      });
    }
    if (flags.description === undefined) {
      result.description = await askUntilValid(
        reader,
        output,
        "Description",
        defaults.description,
        (v) => v,
      );
    }
    if (flags.license === undefined) {
      result.license = await askUntilValid(
        reader,
        output,
        `License (${LICENSES.join(" / ")})`,
        defaults.license,
        choice(LICENSES, "license"),
      );
    }
    if (flags.packageManager === undefined) {
      result.packageManager = await askUntilValid(
        reader,
        output,
        `Package manager (${PACKAGE_MANAGERS.join(" / ")})`,
        defaults.packageManager,
        choice(PACKAGE_MANAGERS, "package manager"),
      );
    }
    if (flags.author === undefined) {
      const author = await askUntilValid(
        reader,
        output,
        "Author / copyright holder",
        defaults.author,
        optionalText,
      );
      if (author !== undefined) result.author = author;
    }
    if (flags.githubOwner === undefined) {
      const owner = await askUntilValid(
        reader,
        output,
        "GitHub owner (user or org)",
        defaults.githubOwner,
        (v) => {
          if (!v) return undefined;
          if (!isValidGithubOwner(v)) {
            throw new Error(
              `Invalid GitHub owner "${v}". Use letters, digits, and hyphens (1–39 characters).`,
            );
          }
          return v;
        },
      );
      if (owner !== undefined) result.githubOwner = owner;
    }
    if (flags.cocEmail === undefined) {
      result.cocEmail = await askUntilValid(
        reader,
        output,
        "Code of Conduct contact email",
        defaults.cocEmail,
        (v) => assertValidEmail(v, "email"),
      );
    }
    if (flags.securityEmail === undefined) {
      const securityEmail = await askUntilValid(
        reader,
        output,
        "Private security contact email",
        undefined,
        (v) => normalizeOptionalEmail(v, "email"),
      );
      if (securityEmail !== undefined) result.securityEmail = securityEmail;
    }
  } finally {
    reader.close();
  }

  output.write("\n");
  return result;
}

export interface ResolveInitFlagsOptions extends InteractiveContext {
  io: PromptIO;
}

/**
 * Entry point for the CLI: prompt for omitted options when the session is
 * interactive (see {@link shouldPrompt}); otherwise return the flags untouched
 * so `initCommand` applies the same defaults as always.
 */
export async function resolveInitFlags(
  directory: string,
  flags: InitFlags,
  options: ResolveInitFlagsOptions,
): Promise<InitFlags> {
  if (!shouldPrompt(options)) return flags;
  return promptInitFlags(directory, flags, options.io, options.env ?? process.env);
}
