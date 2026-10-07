#!/usr/bin/env node
import { cac } from "cac";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { doctorCommand } from "./commands/doctor.js";
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
  .option("--author <name>", "Copyright holder for LICENSE and CITATION.cff authors")
  .option("--license <license>", "License: mit | apache-2.0", {
    default: "mit",
  })
  .option("--package-manager <pm>", "Package manager: npm | pnpm | bun", {
    default: "npm",
  })
  .option("--coc-email <email>", "Code of Conduct contact email", {
    default: "conduct@example.com",
  })
  .option("--github-owner <owner>", "GitHub username or org for URLs, CODEOWNERS, FUNDING.yml, CITATION.cff, SUPPORT.md, and SECURITY.md")
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

cli
  .command("doctor [directory]", "Audit an existing repo for missing OSS-readiness files")
  .option("--json", "Print the report as JSON", { default: false })
  .option("--strict", "Also fail (exit 1) when recommended checks are missing", {
    default: false,
  })
  .option("--fix", "Write missing files from ossready's templates (never overwrites)", {
    default: false,
  })
  .option("--dry-run", "With --fix: list files that would be written", { default: false })
  .option("--github-owner <owner>", "With --fix: GitHub owner (default: from package.json or git remote)")
  .option("--author <name>", "With --fix: copyright holder (default: package.json author)")
  .option("--license <license>", "With --fix: mit | apache-2.0 (default: package.json license)")
  .option("--coc-email <email>", "With --fix: Code of Conduct contact email")
  .action(async (directory: string | undefined, flags) => {
    try {
      await doctorCommand(directory ?? ".", {
        json: flags.json,
        strict: flags.strict,
        fix: flags.fix,
        dryRun: flags.dryRun,
        githubOwner: flags.githubOwner,
        author: flags.author,
        license: flags.license,
        cocEmail: flags.cocEmail,
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
