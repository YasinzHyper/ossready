import { COMMANDS, type CommandName } from "./cliSpec.js";

/**
 * Friendly messages for command-line mistakes: unknown commands and options,
 * options without their value, and extra arguments. cac reports these by
 * throwing a `CACError` with a terse message; src/program.ts prints one of
 * these instead (with a did-you-mean suggestion when one is close) and exits 1.
 * Pure: no I/O.
 */

/** Options cac adds to every command (`cli.help()` and `cli.version()`). */
const GLOBAL_FLAGS = ["--help", "--version"] as const;

/** Every ossready command name, in `--help` order. */
export function commandNames(): CommandName[] {
  return COMMANDS.map((c) => c.name);
}

function isCommandName(name: string | undefined): name is CommandName {
  return name !== undefined && COMMANDS.some((c) => c.name === name);
}

/** The long flags a command accepts (e.g. `--strict`), plus `--help` and `--version`. */
export function commandFlags(name?: CommandName): string[] {
  const spec = name === undefined ? undefined : COMMANDS.find((c) => c.name === name);
  const own = (spec?.options ?? []).flatMap((o) => o.flags.match(/--[a-z][a-z-]*/g) ?? []);
  return [...own, ...GLOBAL_FLAGS];
}

/** Edit distance where swapping two adjacent characters counts as one edit. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * The candidate closest to what was typed, or `undefined` when none is close.
 * Leading dashes and case are ignored, and a typed prefix of at least two
 * characters (`doc` for `doctor`, `--dry` for `--dry-run`) counts as a match.
 */
export function closest(input: string, candidates: readonly string[]): string | undefined {
  const typed = input.toLowerCase().replace(/^-+/, "");
  if (typed === "") return undefined;
  const limit = typed.length <= 3 ? 1 : typed.length <= 6 ? 2 : 3;
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const name = candidate.toLowerCase().replace(/^-+/, "");
    const distance = typed.length >= 2 && name.startsWith(typed) ? 0 : editDistance(typed, name);
    if (distance <= limit && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function helpHint(command?: CommandName): string {
  return command
    ? `Run \`ossready ${command} --help\` to see its options.`
    : "Run `ossready --help` to see all commands and options.";
}

/** `ossready doctr` → unknown command, with the closest command name. */
export function unknownCommandMessage(input: string): string {
  const suggestion = closest(input, commandNames());
  return [
    `Unknown command \`${input}\`.${suggestion ? ` Did you mean \`ossready ${suggestion}\`?` : ""}`,
    `Commands: ${commandNames().join(", ")}. Run \`ossready --help\` for usage.`,
  ].join("\n");
}

/** `ossready doctor --strcit` → unknown option, with the closest flag of that command. */
export function unknownOptionMessage(flag: string, command?: CommandName): string {
  const suggestion = closest(flag, commandFlags(command));
  const where = command ? ` for \`ossready ${command}\`` : "";
  return [
    `Unknown option \`${flag}\`${where}.${suggestion ? ` Did you mean \`${suggestion}\`?` : ""}`,
    helpHint(command),
  ].join("\n");
}

/** cac reports `--dry-runn` as `--dryRunn`; turn it back into what was typed. */
function kebabFlag(dashes: string, name: string): string {
  return `${dashes}${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/**
 * The message to print for an error thrown while parsing or running a command.
 * cac's usage errors (`CACError`) get a friendly rewrite; any other error keeps
 * its own message.
 */
export function describeCliError(err: unknown, commandName?: string): string {
  const message = err instanceof Error ? err.message : String(err);
  if (!(err instanceof Error) || err.name !== "CACError") return message;
  const command = isCommandName(commandName) ? commandName : undefined;

  const unknown = /^Unknown option `(-{1,2})([^`]+)`$/.exec(message);
  if (unknown) return unknownOptionMessage(kebabFlag(unknown[1], unknown[2]), command);

  const missing = /^option `([^`]+)` value is missing$/.exec(message);
  if (missing) return [`Option \`${missing[1]}\` needs a value.`, helpHint(command)].join("\n");

  const unused = /^Unused args: (.+)$/.exec(message);
  if (unused) {
    const count = (unused[1].match(/`/g) ?? []).length / 2;
    const usage = COMMANDS.find((c) => c.name === command)?.usage;
    const takes = usage ? ` \`ossready ${usage}\` takes one directory (quote paths that contain spaces).` : "";
    return [`Unexpected argument${count === 1 ? "" : "s"}: ${unused[1]}.${takes}`, helpHint(command)].join("\n");
  }

  return [message, helpHint(command)].join("\n");
}
