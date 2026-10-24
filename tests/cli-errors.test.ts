import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closest,
  commandFlags,
  commandNames,
  describeCliError,
  editDistance,
  unknownCommandMessage,
  unknownOptionMessage,
} from "../src/cliErrors.js";
import { getVersion, runCli } from "../src/program.js";

function cacError(message: string): Error {
  return Object.assign(new Error(message), { name: "CACError" });
}

/** Run the CLI in-process and capture what it prints. */
async function run(...args: string[]): Promise<{ out: string; err: string; exitCode: typeof process.exitCode }> {
  const out: string[] = [];
  const err: string[] = [];
  const capture = (into: string[]) => (...parts: unknown[]) => {
    into.push(parts.map(String).join(" "));
  };
  vi.spyOn(console, "log").mockImplementation(capture(out));
  vi.spyOn(console, "info").mockImplementation(capture(out));
  vi.spyOn(console, "error").mockImplementation(capture(err));
  await runCli(["node", "ossready", ...args]);
  return { out: out.join("\n"), err: err.join("\n"), exitCode: process.exitCode };
}

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("did-you-mean suggestions", () => {
  it("counts insertions, deletions, substitutions and adjacent swaps", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("strcit", "strict")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("same", "same")).toBe(0);
  });

  it("suggests the closest command", () => {
    expect(commandNames()).toEqual(["init", "doctor", "sync", "badges"]);
    expect(closest("doctr", commandNames())).toBe("doctor");
    expect(closest("sycn", commandNames())).toBe("sync");
    expect(closest("Init", commandNames())).toBe("init");
    expect(closest("badge", commandNames())).toBe("badges");
    expect(closest("doc", commandNames())).toBe("doctor");
    expect(closest("deploy", commandNames())).toBeUndefined();
    expect(closest("", commandNames())).toBeUndefined();
  });

  it("suggests the closest flag of the command", () => {
    expect(commandFlags("doctor")).toContain("--strict");
    expect(commandFlags("init")).toContain("--yes");
    expect(commandFlags("init")).not.toContain("--strict");
    expect(commandFlags()).toEqual(["--help", "--version"]);
    expect(closest("--strcit", commandFlags("doctor"))).toBe("--strict");
    expect(closest("--dry", commandFlags("init"))).toBe("--dry-run");
    expect(closest("--github", commandFlags("sync"))).toBe("--github-owner");
    expect(closest("--licence", commandFlags("init"))).toBe("--license");
    expect(closest("--strict", commandFlags("init"))).toBeUndefined();
  });
});

describe("usage error messages", () => {
  it("names the unknown command and lists the real ones", () => {
    expect(unknownCommandMessage("doctr")).toBe(
      "Unknown command `doctr`. Did you mean `ossready doctor`?\nCommands: init, doctor, sync, badges. Run `ossready --help` for usage.",
    );
    expect(unknownCommandMessage("deploy")).toBe(
      "Unknown command `deploy`.\nCommands: init, doctor, sync, badges. Run `ossready --help` for usage.",
    );
  });

  it("names the unknown option and the command's help", () => {
    expect(unknownOptionMessage("--strcit", "doctor")).toBe(
      "Unknown option `--strcit` for `ossready doctor`. Did you mean `--strict`?\nRun `ossready doctor --help` to see its options.",
    );
    expect(unknownOptionMessage("--foo")).toBe(
      "Unknown option `--foo`.\nRun `ossready --help` to see all commands and options.",
    );
  });

  it("rewrites cac's errors", () => {
    expect(describeCliError(cacError("Unknown option `--dryRunn`"), "init")).toBe(
      "Unknown option `--dry-runn` for `ossready init`. Did you mean `--dry-run`?\nRun `ossready init --help` to see its options.",
    );
    expect(describeCliError(cacError("Unknown option `-x`"), "sync")).toBe(
      "Unknown option `-x` for `ossready sync`.\nRun `ossready sync --help` to see its options.",
    );
    expect(describeCliError(cacError("option `--name <name>` value is missing"), "init")).toBe(
      "Option `--name <name>` needs a value.\nRun `ossready init --help` to see its options.",
    );
    expect(describeCliError(cacError("Unused args: `b`"), "doctor")).toBe(
      "Unexpected argument: `b`. `ossready doctor [directory]` takes one directory (quote paths that contain spaces).\nRun `ossready doctor --help` to see its options.",
    );
    expect(describeCliError(cacError("Unused args: `b`, `c`"), "sync")).toMatch(/^Unexpected arguments: `b`, `c`\./);
    expect(describeCliError(cacError("something else"))).toBe(
      "something else\nRun `ossready --help` to see all commands and options.",
    );
  });

  it("keeps other errors as they are", () => {
    expect(describeCliError(new Error("Directory does not exist"), "doctor")).toBe("Directory does not exist");
    expect(describeCliError("plain", "doctor")).toBe("plain");
  });
});

describe("runCli", () => {
  it("rejects an unknown command with exit code 1 and a suggestion", async () => {
    const { out, err, exitCode } = await run("doctr", ".");
    expect(exitCode).toBe(1);
    expect(out).toBe("");
    expect(err).toContain("✖ Unknown command `doctr`. Did you mean `ossready doctor`?");
  });

  it("rejects an unknown option before running the command", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-cli-"));
    const { out, err, exitCode } = await run("doctor", dir, "--strcit");
    expect(exitCode).toBe(1);
    expect(out).toBe("");
    expect(err).toContain("✖ Unknown option `--strcit` for `ossready doctor`. Did you mean `--strict`?");
    expect(err).not.toMatch(/\bat \S+:\d+/);
  });

  it("rejects an unknown kebab-case option as typed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-cli-"));
    const { err, exitCode } = await run("badges", dir, "--dry-runn");
    expect(exitCode).toBe(1);
    expect(err).toContain("Unknown option `--dry-runn` for `ossready badges`. Did you mean `--dry-run`?");
  });

  it("rejects an option without its value", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-cli-"));
    const { err, exitCode } = await run("init", dir, "--name");
    expect(exitCode).toBe(1);
    expect(err).toContain("✖ Option `--name <name>` needs a value.");
  });

  it("rejects extra arguments", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-cli-"));
    const { out, err, exitCode } = await run("doctor", dir, "extra");
    expect(exitCode).toBe(1);
    expect(out).toBe("");
    expect(err).toContain("✖ Unexpected argument: `extra`. `ossready doctor [directory]` takes one directory");
  });

  it("rejects an unknown option with no command", async () => {
    const { out, err, exitCode } = await run("--strict");
    expect(exitCode).toBe(1);
    expect(out).toBe("");
    expect(err).toContain("✖ Unknown option `--strict`.");
  });

  it("prints the help with no command", async () => {
    const { out, err, exitCode } = await run();
    expect(exitCode).toBeUndefined();
    expect(err).toBe("");
    expect(out).toContain("Commands:");
    expect(out).toContain("doctor [directory]");
  });

  it("still prints --help and --version", async () => {
    let result = await run("--help");
    expect(result.exitCode).toBeUndefined();
    expect(result.out).toContain("init [directory]");
    vi.restoreAllMocks();

    result = await run("doctor", "--help");
    expect(result.exitCode).toBeUndefined();
    expect(result.out).toContain("--strict");
    vi.restoreAllMocks();

    result = await run("--version");
    expect(result.exitCode).toBeUndefined();
    expect(result.out).toContain(`ossready/${getVersion()}`);
  });

  it("still runs commands", async () => {
    const { out, err, exitCode } = await run("doctor", "--list", "--json");
    expect(exitCode).toBeUndefined();
    expect(err).toBe("");
    const parsed = JSON.parse(out) as { total: number; checks: unknown[] };
    expect(parsed.checks).toHaveLength(parsed.total);
  });

  it("keeps reporting command errors the same way", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-cli-"));
    const { err, exitCode } = await run("doctor", join(dir, "nope"));
    expect(exitCode).toBe(1);
    expect(err).toMatch(/✖ .*does not exist/);
  });
});
