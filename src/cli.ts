#!/usr/bin/env node
import { cac } from "cac";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { badgesCommand } from "./commands/badges.js";
import { doctorCommand } from "./commands/doctor.js";
import { initCommand } from "./commands/init.js";
import { syncCommand } from "./commands/sync.js";
import { PromptCancelledError, resolveInitFlags } from "./prompts.js";

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

// No cac defaults for --license / --package-manager / --coc-email: an omitted flag
// must stay `undefined` so the interactive prompt knows to ask. initCommand applies
// the same defaults (mit / npm / conduct@example.com) when nothing is given.
cli
  .command("init [directory]", "Scaffold a production-ready GitHub repo")
  .option("--name <name>", "Project / package name")
  .option("--description <text>", "Short project description")
  .option("--author <name>", "Copyright holder for LICENSE and CITATION.cff authors")
  .option("--license <license>", "License: mit | apache-2.0 (default: mit)")
  .option("--package-manager <pm>", "Package manager: npm | pnpm | yarn | bun (default: npm)")
  .option("--coc-email <email>", "Code of Conduct contact email (default: conduct@example.com)")
  .option("--security-email <email>", "Private security contact email for SECURITY.md")
  .option("--github-owner <owner>", "GitHub username or org for README badges, URLs, CODEOWNERS, FUNDING.yml, CITATION.cff, SUPPORT.md, and SECURITY.md")
  .option("-y, --yes", "Skip interactive prompts and use defaults for omitted options", {
    default: false,
  })
  .option("--force", "Overwrite existing files", { default: false })
  .option("--dry-run", "Print planned files without writing", { default: false })
  .action(async (directory: string | undefined, flags) => {
    const dir = directory ?? ".";
    try {
      const resolved = await resolveInitFlags(
        dir,
        {
          name: flags.name,
          description: flags.description,
          author: flags.author,
          license: flags.license,
          packageManager: flags.packageManager,
          cocEmail: flags.cocEmail,
          securityEmail: flags.securityEmail,
          githubOwner: flags.githubOwner,
          force: flags.force,
          dryRun: flags.dryRun,
        },
        {
          yes: Boolean(flags.yes),
          stdinIsTTY: process.stdin.isTTY === true,
          stdoutIsTTY: process.stdout.isTTY === true,
          env: process.env,
          io: { input: process.stdin, output: process.stdout },
        },
      );
      await initCommand(dir, resolved);
    } catch (err) {
      if (err instanceof PromptCancelledError) {
        console.error(`\n✖ ${err.message}\n`);
        // 130 = conventional exit code for Ctrl+C (128 + SIGINT)
        process.exitCode = err.reason === "sigint" ? 130 : 1;
        return;
      }
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
  .option("--github-owner <owner>", "GitHub owner for --fix and the readme-badges check (default: from package.json or git remote)")
  .option("--author <name>", "With --fix: copyright holder (default: package.json author)")
  .option("--license <license>", "With --fix: mit | apache-2.0 (default: package.json license)")
  .option("--coc-email <email>", "With --fix: Code of Conduct contact email")
  .option("--security-email <email>", "With --fix: private security contact email for SECURITY.md")
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
        securityEmail: flags.securityEmail,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\n✖ ${message}\n`);
      process.exitCode = 1;
    }
  });

cli
  .command(
    "sync [directory]",
    "Update ossready-managed workflows, Dependabot and Issue Forms to the current templates (dry run unless --write)",
  )
  .option("--write", "Apply the changes (default: dry run with a diff per file; exits 1 when changes are pending)", {
    default: false,
  })
  .option("--add-missing", "Also create managed files that don't exist yet", { default: false })
  .option("--force", "Also overwrite files without the ossready marker line", { default: false })
  .option("--quiet", "One summary line per file instead of diffs", { default: false })
  .option("--json", "Print the result as JSON", { default: false })
  .option("--github-owner <owner>", "GitHub owner for owner-bound files (default: package.json links or the origin remote)")
  .option("--package-manager <pm>", "npm | pnpm | yarn | bun (default: from lockfiles or package.json packageManager)")
  .action(async (directory: string | undefined, flags) => {
    try {
      await syncCommand(directory ?? ".", {
        write: flags.write,
        addMissing: flags.addMissing,
        force: flags.force,
        quiet: flags.quiet,
        json: flags.json,
        githubOwner: flags.githubOwner === undefined ? undefined : String(flags.githubOwner),
        packageManager: flags.packageManager === undefined ? undefined : String(flags.packageManager),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\n✖ ${message}\n`);
      process.exitCode = 1;
    }
  });

cli
  .command("badges [directory]", "Print README badges (CI, npm, license, Scorecard, CodeQL) for a repo")
  .option("--write", "Insert or update the badge block in README.md between ossready markers", {
    default: false,
  })
  .option("--dry-run", "With --write: show what would change without writing", { default: false })
  .option("--json", "Print the badges as JSON", { default: false })
  .option("--github-owner <owner>", "GitHub owner (default: package.json links, git remotes, or git config github.user)")
  .option("--repo <repo>", "Repository name or <owner>/<name> (default: from package.json links or the origin remote)")
  .action(async (directory: string | undefined, flags) => {
    try {
      await badgesCommand(directory ?? ".", {
        write: flags.write,
        dryRun: flags.dryRun,
        json: flags.json,
        githubOwner: flags.githubOwner,
        repo: flags.repo === undefined ? undefined : String(flags.repo),
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
