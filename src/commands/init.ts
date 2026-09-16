import { basename, resolve } from "node:path";
import {
  buildScaffoldFiles,
  type ScaffoldOptions,
} from "../templates/index.js";
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
}

const VALID_LICENSES = new Set(["mit", "apache-2.0"]);
const VALID_PMS = new Set(["npm", "pnpm", "bun"]);

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
      `Invalid --package-manager "${flags.packageManager}". Use: npm | pnpm | bun`,
    );
  }

  const name =
    flags.name?.trim() ||
    (directory === "." ? basename(targetDir) : basename(targetDir));

  if (!name || !/^[a-zA-Z0-9._@/-]+$/.test(name) || name === "." || name === "..") {
    throw new Error(
      `Invalid project name "${name}". Pass --name <name> with a valid package name.`,
    );
  }

  const description =
    flags.description?.trim() ||
    `A production-ready TypeScript project scaffolded with ossready.`;

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

  const opts: ScaffoldOptions = {
    name,
    description,
    license: licenseRaw as "mit" | "apache-2.0",
    packageManager: pmRaw as "npm" | "pnpm" | "bun",
    year: new Date().getFullYear(),
    copyrightHolder,
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

  const installCmd =
    opts.packageManager === "pnpm"
      ? "pnpm install"
      : opts.packageManager === "bun"
        ? "bun install"
        : "npm install";

  console.log(`
Next steps:
  cd ${directory === "." ? "." : directory}
  ${installCmd}
  ${opts.packageManager === "npm" ? "npm run" : opts.packageManager === "pnpm" ? "pnpm" : "bun run"} build
`);
}
