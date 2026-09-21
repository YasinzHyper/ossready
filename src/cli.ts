#!/usr/bin/env node
import { cac } from "cac";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initCommand } from "./commands/init.js";

function getVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

const cli = cac("ossready");

cli
  .command("init [directory]", "Scaffold a production-ready GitHub repo")
  .option("--name <name>", "Project / package name")
  .option("--description <text>", "Short project description")
  .option("--author <name>", "Copyright holder for LICENSE")
  .option("--license <license>", "License: mit | apache-2.0", {
    default: "mit",
  })
  .option("--package-manager <pm>", "Package manager: npm | pnpm | bun", {
    default: "npm",
  })
  .option("--coc-email <email>", "Code of Conduct contact email", {
    default: "conduct@example.com",
  })
  .option("--github-owner <owner>", "GitHub username or org for scaffolded URLs")
  .option("--force", "Overwrite existing files", { default: false })
  .option("--dry-run", "Print planned files without writing", { default: false })
  .action(async (directory: string | undefined, flags) => {
    try {
      await initCommand(directory ?? ".", {
        name: flags.name,
        description: flags.description,
        author: flags.author,
        license: flags.license,
        packageManager: flags.packageManager,
        cocEmail: flags.cocEmail,
        githubOwner: flags.githubOwner,
        force: flags.force,
        dryRun: flags.dryRun,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\n✖ ${message}\n`);
      process.exitCode = 1;
    }
  });

cli.help();
cli.version(getVersion());

cli.parse();
