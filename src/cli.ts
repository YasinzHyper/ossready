#!/usr/bin/env node
import { cac } from "cac";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { commandSpec, type CommandName } from "./cliSpec.js";
import { badgesCommand } from "./commands/badges.js";
import { doctorCommand, listChecksCommand } from "./commands/doctor.js";
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

/**
 * Register a command and its options from src/cliSpec.ts, the same definitions
 * docs/commands.md is generated from (`npm run docs:gen`).
 */
function defineCommand(name: CommandName) {
  const spec = commandSpec(name);
  const command = cli.command(spec.usage, spec.description);
  for (const option of spec.options) {
    command.option(
      option.flags,
      option.description,
      option.default === undefined ? undefined : { default: option.default },
    );
  }
  return command;
}

defineCommand("init").action(async (directory: string | undefined, flags) => {
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

defineCommand("doctor").action(async (directory: string | undefined, flags) => {
  try {
    if (flags.list) {
      // The catalogue only: no directory is audited.
      listChecksCommand({ json: Boolean(flags.json) });
      return;
    }
    await doctorCommand(directory ?? ".", {
      json: flags.json,
      markdown: flags.markdown,
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

defineCommand("sync").action(async (directory: string | undefined, flags) => {
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

defineCommand("badges").action(async (directory: string | undefined, flags) => {
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
