import { basename, resolve } from "node:path";
import {
  buildScaffoldFiles,
  type ScaffoldOptions,
} from "../templates/index.js";
import { PACKAGE_MANAGERS, pmInstall, pmRun } from "../templates/types.js";
import { assertValidEmail, normalizeOptionalEmail } from "../utils/email.js";
import {
  ensureDir,
  isDirectoryEmpty,
  pathExists,
  writeFileSafe,
} from "../utils/fs.js";

export interface InitFlags {
  name?: string;
  description?: string;
  author?: string;
  license?: string;
  packageManager?: string;
  force?: boolean;
  dryRun?: boolean;
  /** Contact email for scaffolded CODE_OF_CONDUCT.md */
  cocEmail?: string;
  /** Optional private security contact email for scaffolded SECURITY.md */
  securityEmail?: string;
  /** GitHub username or org for real URLs in scaffolded files */
  githubOwner?: string;
}

const VALID_LICENSES = new Set(["mit", "apache-2.0"]);
const VALID_PMS = new Set<string>(PACKAGE_MANAGERS);
export const DEFAULT_COC_EMAIL = "conduct@example.com";
export const DEFAULT_DESCRIPTION =
  "A production-ready TypeScript project scaffolded with ossready.";
const PROJECT_NAME_RE = /^[a-zA-Z0-9._@/-]+$/;
/** Light GitHub login/org check: letters, digits, hyphen; 1–39 chars; no leading/trailing hyphen */
const GITHUB_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

/** Package-name-ish check shared by `--name` and the interactive prompt. */
export function isValidProjectName(name: string): boolean {
  return Boolean(name) && PROJECT_NAME_RE.test(name) && name !== "." && name !== "..";
}

/** GitHub username / org check shared by `--github-owner` and the interactive prompt. */
export function isValidGithubOwner(owner: string): boolean {
  return GITHUB_OWNER_RE.test(owner);
}

export async function initCommand(
  directory: string,
  flags: InitFlags,
): Promise<void> {
  const targetDir = resolve(process.cwd(), directory);
  const force = Boolean(flags.force);
  const dryRun = Boolean(flags.dryRun);

  const licenseRaw = (flags.license ?? "mit").toLowerCase();
  if (!VALID_LICENSES.has(licenseRaw)) {
    throw new Error(
      `Invalid --license "${flags.license}". Use: mit | apache-2.0`,
    );
  }

  const pmRaw = (flags.packageManager ?? "npm").toLowerCase();
  if (!VALID_PMS.has(pmRaw)) {
    throw new Error(
      `Invalid --package-manager "${flags.packageManager}". Use: ${PACKAGE_MANAGERS.join(" | ")}`,
    );
  }

  const name =
    flags.name?.trim() ||
    (directory === "." ? basename(targetDir) : basename(targetDir));

  if (!isValidProjectName(name)) {
    throw new Error(
      `Invalid project name "${name}". Pass --name <name> with a valid package name.`,
    );
  }

  const description = flags.description?.trim() || DEFAULT_DESCRIPTION;

  let githubOwner: string | undefined;
  if (flags.githubOwner !== undefined) {
    const trimmed = flags.githubOwner.trim();
    if (!trimmed || !isValidGithubOwner(trimmed)) {
      throw new Error(
        `Invalid --github-owner "${flags.githubOwner}". Use a GitHub username or org (letters, digits, hyphen; 1–39 characters).`,
      );
    }
    githubOwner = trimmed;
  }

  if (!dryRun) {
    if (await pathExists(targetDir)) {
      const empty = await isDirectoryEmpty(targetDir);
      if (!empty && !force) {
        throw new Error(
          `Directory "${targetDir}" is not empty. Use --force to overwrite existing files, or choose an empty directory.`,
        );
      }
    } else {
      await ensureDir(targetDir);
    }
  }

  const author = flags.author?.trim();
  let copyrightHolder = name === "." ? "Copyright holders" : name;
  // Prefer human-readable copyright when scaffolding into `.` without --name
  if (!flags.name && directory === ".") {
    copyrightHolder = "Copyright holders";
  }
  if (author) {
    copyrightHolder = author;
  }

  const cocEmail = assertValidEmail(
    flags.cocEmail?.trim() || DEFAULT_COC_EMAIL,
    "--coc-email",
  );
  const securityEmail = normalizeOptionalEmail(flags.securityEmail, "--security-email");

  const opts: ScaffoldOptions = {
    name,
    description,
    license: licenseRaw as "mit" | "apache-2.0",
    packageManager: pmRaw as ScaffoldOptions["packageManager"],
    year: new Date().getFullYear(),
    copyrightHolder,
    cocEmail,
    securityEmail,
    githubOwner,
    author: author || undefined,
  };

  const files = buildScaffoldFiles(opts);

  if (dryRun) {
    console.log(`\n✔ Dry run for "${name}" → ${targetDir}\n`);
    console.log(`  Would write (${files.length}):`);
    for (const file of files) {
      console.log(`    + ${file.path}`);
    }
    console.log("\nNo files were written. Re-run without --dry-run to scaffold.\n");
    return;
  }

  const created: string[] = [];
  const overwritten: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const fullPath = resolve(targetDir, file.path);
    const result = await writeFileSafe(fullPath, file.content, force);
    if (result === "created") created.push(file.path);
    else if (result === "overwritten") overwritten.push(file.path);
    else skipped.push(file.path);
  }

  console.log(`\n✔ Scaffolded "${name}" in ${targetDir}\n`);
  if (created.length) {
    console.log(`  Created (${created.length}):`);
    for (const f of created) console.log(`    + ${f}`);
  }
  if (overwritten.length) {
    console.log(`  Overwritten (${overwritten.length}):`);
    for (const f of overwritten) console.log(`    ~ ${f}`);
  }
  if (skipped.length) {
    console.log(`  Skipped (${skipped.length}, already exist — use --force):`);
    for (const f of skipped) console.log(`    · ${f}`);
  }

  // Yarn scaffolds pin modern Yarn in package.json; Corepack provides it.
  const corepackStep = opts.packageManager === "yarn" ? "\n  corepack enable" : "";

  console.log(`
Next steps:
  cd ${directory === "." ? "." : directory}${corepackStep}
  ${pmInstall(opts.packageManager)}
  ${pmRun(opts.packageManager, "build")}
`);
}
