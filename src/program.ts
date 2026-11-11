import { cac, type CAC } from "cac";
import { describeCliError, unknownCommandMessage } from "./cliErrors.js";
import { commandSpec, type CommandName } from "./cliSpec.js";
import { badgesCommand } from "./commands/badges.js";
import { completionCommand } from "./commands/completion.js";
import { configCommand } from "./commands/config.js";
import { doctorCommand, listChecksCommand } from "./commands/doctor.js";
import { initCommand } from "./commands/init.js";
import { syncCommand } from "./commands/sync.js";
import { PromptCancelledError, resolveInitFlags } from "./prompts.js";
import { getVersion } from "./version.js";

export { getVersion };

/** Print `✖ message` to stderr and make the process exit with code 1. */
function fail(message: string): void {
  console.error(`\n✖ ${message}\n`);
  process.exitCode = 1;
}

/**
 * A fresh cac instance with every ossready command registered from
 * src/cliSpec.ts, the same definitions docs/commands.md is generated from
 * (`npm run docs:gen`).
 */
export function createCli(): CAC {
  const cli = cac("ossready");

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
    // Same examples as docs/commands.md (from cliSpec), so `ossready <cmd> --help` shows them.
    for (const example of spec.examples) {
      command.example(example);
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
      fail(err instanceof Error ? err.message : String(err));
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
        sarif: flags.sarif,
        strict: flags.strict,
        fix: flags.fix,
        dryRun: flags.dryRun,
        githubOwner: flags.githubOwner,
        author: flags.author,
        license: flags.license,
        cocEmail: flags.cocEmail,
        securityEmail: flags.securityEmail,
        check: flags.check,
        skip: flags.skip,
        config: flags.config === undefined ? undefined : String(flags.config),
        noConfig: Boolean(flags.ignoreConfig),
      });
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
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
      fail(err instanceof Error ? err.message : String(err));
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
      fail(err instanceof Error ? err.message : String(err));
    }
  });

  defineCommand("config").action(async (directory: string | undefined, flags) => {
    try {
      await configCommand(directory ?? ".", {
        json: Boolean(flags.json),
        init: Boolean(flags.init),
        force: Boolean(flags.force),
        config: flags.config === undefined ? undefined : String(flags.config),
      });
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  });

  defineCommand("completion").action((shell: string | undefined) => {
    try {
      completionCommand(shell === undefined ? undefined : String(shell));
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  });

  cli.help();
  cli.version(getVersion());
  return cli;
}

/**
 * Run ossready with `argv` (`[node, script, ...args]`, like `process.argv`).
 * Never throws: usage mistakes (unknown command or option, an option without
 * its value, extra arguments) print a friendly error and set exit code 1, and
 * running with no command prints the help.
 */
export async function runCli(argv: readonly string[] = process.argv): Promise<void> {
  const cli = createCli();
  try {
    const { args, options } = cli.parse([...argv], { run: false });
    // cac has already printed --help (for any command) and --version.
    if (options.help) return;
    if (!cli.matchedCommand) {
      if (options.version) return;
      const [first] = args;
      if (first !== undefined) {
        fail(unknownCommandMessage(String(first)));
        return;
      }
      // No command: reject unknown flags such as `ossready --strict`, else show the help.
      cli.globalCommand.checkUnknownOptions();
      cli.outputHelp();
      return;
    }
    await cli.runMatchedCommand();
  } catch (err) {
    fail(describeCliError(err, cli.matchedCommandName));
  }
}
