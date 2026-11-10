import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CHECK_IDS } from "../src/checks.js";
import { COMMANDS } from "../src/cliSpec.js";
import {
  SHELLS,
  bashCompletion,
  completionModel,
  completionScript,
  fishCompletion,
  parseOption,
  resolveShell,
  zshCompletion,
} from "../src/commands/completion.js";
import { runCli } from "../src/program.js";

async function run(
  ...args: string[]
): Promise<{ out: string; err: string; exitCode: typeof process.exitCode }> {
  const out: string[] = [];
  const err: string[] = [];
  const capture =
    (into: string[]) =>
    (...parts: unknown[]) => {
      into.push(parts.map(String).join(" "));
    };
  vi.spyOn(console, "log").mockImplementation(capture(out));
  vi.spyOn(console, "error").mockImplementation(capture(err));
  await runCli(["node", "ossready", ...args]);
  return {
    out: out.join("\n"),
    err: err.join("\n"),
    exitCode: process.exitCode,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

/** Whether `shell` is on PATH (zsh and fish are optional; bash is always there on CI). */
function has(shell: string): boolean {
  return spawnSync(shell, ["-c", "exit 0"], { stdio: "ignore" }).status === 0;
}

let dir: string;
const files: Record<string, string> = {};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ossready-completion-"));
  for (const shell of SHELLS) {
    files[shell] = join(dir, `ossready.${shell}`);
    await writeFile(files[shell], completionScript(shell), "utf8");
  }
});

/** What bash completes for `line` (a trailing space starts a new, empty word). */
function bashComplete(line: string): string[] {
  const words = line.split(" ");
  const script = [
    `source ${JSON.stringify(files.bash)}`,
    `COMP_WORDS=(${words.map((w) => JSON.stringify(w)).join(" ")})`,
    `COMP_CWORD=${words.length - 1}`,
    "_ossready",
    'printf "%s\\n" "${COMPREPLY[@]}"',
  ].join("\n");
  const result = spawnSync("bash", ["--norc", "--noprofile", "-c", script], {
    cwd: dir,
    encoding: "utf8",
  });
  expect(result.stderr).toBe("");
  return result.stdout.split("\n").filter(Boolean).sort();
}

describe("resolveShell", () => {
  it("takes the argument (any case) or the basename of $SHELL", () => {
    expect(resolveShell("bash", undefined)).toBe("bash");
    expect(resolveShell("ZSH", "/bin/bash")).toBe("zsh");
    expect(resolveShell(undefined, "/usr/bin/fish")).toBe("fish");
    expect(resolveShell(undefined, "/opt/homebrew/bin/zsh")).toBe("zsh");
  });

  it("rejects unknown shells, suggesting only near-misses", () => {
    expect(() => resolveShell("bsh", undefined)).toThrow(
      "Unknown shell `bsh`. Did you mean `bash`?",
    );
    expect(() => resolveShell("pwsh", undefined)).toThrow(
      /^Unknown shell `pwsh`\. Supported shells: bash, zsh, fish\.$/,
    );
  });

  it("asks for a shell when $SHELL is missing or unsupported", () => {
    expect(() => resolveShell(undefined, undefined)).toThrow(
      "Could not detect your shell. Pass one of: bash, zsh, fish",
    );
    expect(() => resolveShell(undefined, "/bin/tcsh")).toThrow(
      "(`$SHELL` is tcsh)",
    );
  });
});

describe("completion model", () => {
  it("parses short flags, long flags and value placeholders", () => {
    expect(
      parseOption({ flags: "-y, --yes", description: "Yes" }),
    ).toMatchObject({
      long: "--yes",
      short: "-y",
      takesValue: false,
    });
    expect(
      parseOption({ flags: "--license <license>", description: "L" }),
    ).toMatchObject({
      long: "--license",
      short: undefined,
      takesValue: true,
      value: { kind: "words", words: ["mit", "apache-2.0"] },
    });
    expect(
      parseOption({ flags: "--check <id>", description: "C" }),
    ).toMatchObject({
      repeatable: true,
      value: { kind: "words", words: CHECK_IDS, commaList: true },
    });
    expect(
      parseOption({ flags: "--config <path>", description: "C" }).value,
    ).toEqual({ kind: "file" });
  });

  it("covers every command and option in cliSpec, plus --help / --version", () => {
    const model = completionModel();
    expect(model.map((c) => c.name)).toEqual(COMMANDS.map((c) => c.name));
    for (const [i, spec] of COMMANDS.entries()) {
      const longs = model[i].options.map((o) => o.long);
      for (const option of spec.options)
        expect(longs).toContain(/--[a-z][a-z-]*/.exec(option.flags)![0]);
      expect(longs).toContain("--help");
      expect(longs).toContain("--version");
    }
    expect(model.find((c) => c.name === "doctor")!.positional).toBe(
      "directory",
    );
    expect(model.find((c) => c.name === "completion")!.positional).toBe(
      "shell",
    );
  });

  it("every script names every command and long flag", () => {
    for (const script of [
      bashCompletion(),
      zshCompletion(),
      fishCompletion(),
    ]) {
      for (const command of completionModel()) {
        expect(script).toContain(command.name);
        for (const option of command.options) {
          // fish writes `-l name`; bash and zsh write `--name`
          expect(
            script.includes(option.long) ||
              script.includes(`-l ${option.long.slice(2)}`),
            option.long,
          ).toBe(true);
        }
      }
    }
  });
});

describe("bash completion", () => {
  it("is valid bash", () => {
    expect(spawnSync("bash", ["-n", files.bash]).status).toBe(0);
  });

  it("completes commands, flags and values", () => {
    expect(bashComplete("ossready ")).toEqual(
      [
        ...COMMANDS.map((c) => c.name),
        "--help",
        "--version",
        "-h",
        "-v",
      ].sort(),
    );
    expect(bashComplete("ossready do")).toEqual(["doctor"]);
    expect(bashComplete("ossready doctor --st")).toEqual(["--strict"]);
    expect(bashComplete("ossready init --license ")).toEqual([
      "apache-2.0",
      "mit",
    ]);
    expect(bashComplete("ossready sync --package-manager p")).toEqual(["pnpm"]);
    expect(bashComplete("ossready completion ")).toEqual([...SHELLS].sort());
    expect(bashComplete("ossready init --name ")).toEqual([]);
  });

  it("completes doctor check ids, including inside a comma-separated list", () => {
    expect(bashComplete("ossready doctor --check readme")).toEqual([
      "readme",
      "readme-badges",
    ]);
    expect(bashComplete("ossready doctor . --skip funding,cit")).toEqual([
      "funding,citation",
    ]);
    expect(bashComplete("ossready doctor --check ")).toEqual(
      [...CHECK_IDS].sort(),
    );
  });

  it("completes directories for [directory] and files for --config", async () => {
    await writeFile(join(dir, "team-ossready.json"), "{}\n", "utf8");
    expect(bashComplete("ossready doctor ossready.")).toEqual([]);
    expect(bashComplete("ossready doctor --config team")).toEqual([
      "team-ossready.json",
    ]);
  });
});

describe.skipIf(!has("zsh"))("zsh completion", () => {
  it("is valid zsh", () => {
    expect(spawnSync("zsh", ["-n", files.zsh]).status).toBe(0);
  });
});

describe.skipIf(!has("fish"))("fish completion", () => {
  function fishComplete(line: string): string[] {
    const result = spawnSync(
      "fish",
      [
        "--no-config",
        "-c",
        `source ${JSON.stringify(files.fish)}; complete -C ${JSON.stringify(line)}`,
      ],
      { cwd: dir, encoding: "utf8" },
    );
    return result.stdout
      .split("\n")
      .filter(Boolean)
      .map((l) => l.split("\t")[0])
      .sort();
  }

  it("is valid fish", () => {
    expect(spawnSync("fish", ["-n", files.fish]).status).toBe(0);
  });

  it("completes commands, values and comma-separated check ids", () => {
    expect(fishComplete("ossready do")).toEqual(["doctor"]);
    expect(fishComplete("ossready init --license ")).toEqual([
      "apache-2.0",
      "mit",
    ]);
    expect(fishComplete("ossready doctor --check readme,lic")).toEqual([
      "readme,license",
    ]);
    expect(fishComplete("ossready completion ")).toEqual([...SHELLS].sort());
  });
});

describe("ossready completion (CLI)", () => {
  it("prints the script for the named shell", async () => {
    const { out, exitCode } = await run("completion", "bash");
    expect(exitCode).toBeUndefined();
    expect(out).toBe(bashCompletion().trimEnd());
    expect(
      (await run("completion", "zsh")).out.startsWith("#compdef ossready\n"),
    ).toBe(true);
  });

  it("falls back to $SHELL", async () => {
    vi.stubEnv("SHELL", "/usr/bin/fish");
    try {
      const { out, exitCode } = await run("completion");
      expect(exitCode).toBeUndefined();
      expect(out).toBe(fishCompletion().trimEnd());
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("exits 1 for an unknown shell or an extra argument", async () => {
    let result = await run("completion", "powershell");
    expect(result.exitCode).toBe(1);
    expect(result.err).toContain("Unknown shell `powershell`");
    expect(result.out).toBe("");
    vi.restoreAllMocks();
    process.exitCode = undefined;
    result = await run("completion", "bash", "zsh");
    expect(result.exitCode).toBe(1);
    expect(result.err).toContain(
      "`ossready completion [shell]` takes one argument.",
    );
  });
});
