import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// dist/ is built once by tests/global-setup.ts before any test file runs.
const cliJs = join(repoRoot, "dist", "cli.js");

/** Linux util-linux `script` gives the child a real PTY so `process.stdin.isTTY` is true. */
const canPty = process.platform === "linux";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-init-cli-"));
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

interface RunResult {
  code: number | null;
  out: string;
  err: string;
}

/** One prompt the CLI should show, and the line to type once it is on screen. */
interface Turn {
  prompt: string;
  answer: string;
}

/** How long to wait for a prompt (or for the CLI to exit) before failing with the transcript. */
const STEP_TIMEOUT_MS = 20_000;

/**
 * Run `node dist/cli.js init …` and hold a conversation with it.
 *
 * Each answer is typed only after its prompt is on screen, and stdin is closed only when
 * `endInput` says so (by default not until the CLI has exited). The old helper wrote
 * every answer up front and closed stdin at once, which left the outcome to timing: the
 * bytes reached the terminal's line buffer before readline switched it to raw mode, and
 * util-linux `script` turns the end of its stdin into an EOF (Ctrl+D) for the child after
 * waiting at most ~2 s for the child to read what came before, whether or not it has.
 * On loaded CI runners the "typed answers" test intermittently exited 1 after ~2 s with
 * nothing in the failure to say why. A prompt on screen means readline is already
 * reading, so typed lines (and EOF) arrive the way a person's would, and every
 * assertion on the exit code prints the CLI's output.
 *
 * When `pty` is true, wrap with `script -qefc` so stdin/stdout are TTYs (and clear `CI`
 * so shouldPrompt allows the interactive path). No new dependencies.
 */
function runInit(
  args: string[],
  {
    pty,
    turns = [],
    input = "",
    endInput = "at-exit",
  }: {
    pty: boolean;
    /** Prompts to answer, in order. */
    turns?: Turn[];
    /** Raw bytes written to stdin before any prompt (the non-TTY test). */
    input?: string;
    /**
     * When to close stdin: "at-exit" (default) only once the CLI has exited, like a person
     * who never presses Ctrl+D, or `{ beforePrompt }` as soon as that prompt is shown
     * (input ends mid-question).
     */
    endInput?: "at-exit" | { beforePrompt: string };
  },
): Promise<RunResult> {
  const env = { ...process.env, CI: "", TERM: "xterm-256color" };
  const nodeArgs = [cliJs, "init", ...args];
  const child = pty
    ? spawn("script", ["-qefc", `node ${nodeArgs.map(shellQuote).join(" ")}`, "/dev/null"], {
        cwd: repoRoot,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      })
    : spawn(process.execPath, nodeArgs, {
        cwd: repoRoot,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

  let out = "";
  let err = "";
  let exited = false;
  /** Output already matched by a prompt, so a repeated label must be shown again. */
  let cursor = 0;
  let wake: (() => void) | undefined;
  const onOutput = () => {
    const pending = wake;
    wake = undefined;
    pending?.();
  };
  child.stdout.on("data", (chunk: Buffer) => {
    out += chunk.toString("utf8");
    onOutput();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    err += chunk.toString("utf8");
    onOutput();
  });
  // The CLI may exit before reading everything (e.g. a failure); that is for the assertions.
  child.stdin.on("error", () => {});

  const transcript = () => `\n--- stdout ---\n${out}\n--- stderr ---\n${err}`;

  const closed = new Promise<number | null>((resolveClose, rejectClose) => {
    child.on("error", rejectClose);
    child.on("close", (code) => {
      exited = true;
      onOutput();
      resolveClose(code);
    });
  });

  async function waitForPrompt(prompt: string): Promise<void> {
    const deadline = Date.now() + STEP_TIMEOUT_MS;
    for (;;) {
      const at = out.indexOf(prompt, cursor);
      if (at !== -1) {
        cursor = at + prompt.length;
        return;
      }
      if (exited) throw new Error(`CLI exited before prompting "${prompt}"${transcript()}`);
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`Timed out waiting for prompt "${prompt}"${transcript()}`);
      await new Promise<void>((resolveWake) => {
        const timer = setTimeout(resolveWake, left);
        wake = () => {
          clearTimeout(timer);
          resolveWake();
        };
      });
    }
  }

  async function converse(): Promise<void> {
    if (input) child.stdin.write(input);
    for (const turn of turns) {
      await waitForPrompt(turn.prompt);
      child.stdin.write(`${turn.answer}\n`);
    }
    if (typeof endInput === "object") {
      await waitForPrompt(endInput.beforePrompt);
      child.stdin.end();
    }
  }

  return (async () => {
    let timer: NodeJS.Timeout | undefined;
    try {
      await converse();
      const code = await Promise.race([
        closed,
        new Promise<never>((_, rejectTimeout) => {
          timer = setTimeout(
            () => rejectTimeout(new Error(`Timed out waiting for the CLI to exit${transcript()}`)),
            STEP_TIMEOUT_MS,
          );
        }),
      ]);
      return { code, out, err };
    } catch (error) {
      child.kill("SIGKILL");
      throw error;
    } finally {
      clearTimeout(timer);
      if (!child.stdin.writableEnded) child.stdin.end();
    }
  })();
}

/** Assertion message with everything the CLI printed, so a CI failure explains itself. */
function shown(result: RunResult): string {
  return `CLI exit code ${result.code}\n--- stdout ---\n${result.out}\n--- stderr ---\n${result.err}`;
}

const PROMPTS = {
  name: "? Project name",
  description: "? Description",
  license: "? License",
  packageManager: "? Package manager",
  author: "? Author / copyright holder",
  githubOwner: "? GitHub owner",
  cocEmail: "? Code of Conduct contact email",
  securityEmail: "? Private security contact email",
} as const;

/** Every question, in the order init asks them, with the given answers (default: Enter). */
function answerAll(answers: Partial<Record<keyof typeof PROMPTS, string>> = {}): Turn[] {
  return (Object.keys(PROMPTS) as (keyof typeof PROMPTS)[]).map((key) => ({
    prompt: PROMPTS[key],
    answer: answers[key] ?? "",
  }));
}

describe("interactive init via the real CLI (non-TTY pipe never prompts)", () => {
  it("uses defaults without reading stdin when there is no TTY", async () => {
    const dir = join(await makeTempDir(), "piped");
    const result = await runInit([dir, "--dry-run"], {
      pty: false,
      input: "should-never-be-read\n",
    });
    expect(result.code, shown(result)).toBe(0);
    expect(result.out + result.err).not.toContain("press Enter to accept");
    expect(result.out + result.err).toContain('Dry run for "piped"');
    expect(result.out + result.err).toContain("Would write");
  });
});

describe.skipIf(!canPty)("interactive init via the real CLI (pseudo-TTY)", () => {
  it("prompts under a PTY, accepts Enter defaults, and dry-runs without writing", async () => {
    const parent = await makeTempDir();
    const dir = join(parent, "pty-defaults");
    const result = await runInit([dir, "--dry-run"], {
      pty: true,
      turns: answerAll(),
    });
    const combined = result.out + result.err;

    expect(result.code, shown(result)).toBe(0);
    expect(combined).toContain("press Enter to accept");
    expect(combined).toContain("Project name [pty-defaults]");
    expect(combined).toContain("License (mit / apache-2.0) [mit]");
    expect(combined).toContain("Package manager (npm / pnpm / yarn / bun) [npm]");
    expect(combined).toContain('Dry run for "pty-defaults"');
    expect(combined).toContain("Would write");
    await expect(access(dir)).rejects.toThrow();
  });

  it("scaffolds with the answers typed at the prompts", async () => {
    const dir = join(await makeTempDir(), "answered");
    const result = await runInit([dir], {
      pty: true,
      turns: answerAll({
        // name: Enter → "answered" (the folder); securityEmail: Enter → skipped
        description: "Built through a PTY",
        license: "apache-2.0",
        packageManager: "npm",
        author: "Ada Lovelace",
        githubOwner: "octo",
        cocEmail: "mods@example.org",
      }),
    });
    const combined = result.out + result.err;

    expect(result.code, shown(result)).toBe(0);
    expect(combined).toContain("press Enter to accept");
    expect(combined).toMatch(/✔.*answered/);

    const license = await readFile(join(dir, "LICENSE"), "utf8");
    expect(license).toContain("Apache License");
    expect(license).toContain("Ada Lovelace");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("# answered");
    expect(readme).toContain("Built through a PTY");

    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as {
      name: string;
      repository?: { url?: string };
    };
    expect(pkg.name).toBe("answered");
    expect(pkg.repository?.url).toContain("github.com/octo/answered");

    const coc = await readFile(join(dir, "CODE_OF_CONDUCT.md"), "utf8");
    expect(coc).toContain("mods@example.org");

    const files = await readdir(join(dir, ".github", "ISSUE_TEMPLATE"));
    expect(files).toEqual(
      expect.arrayContaining(["bug_report.yml", "feature_request.yml", "config.yml"]),
    );
  });

  it("exits non-zero and writes nothing when input ends mid-prompt", async () => {
    const dir = join(await makeTempDir(), "never-created");
    const result = await runInit([dir], {
      pty: true,
      turns: [
        { prompt: PROMPTS.name, answer: "half" },
        { prompt: PROMPTS.description, answer: "answered" },
      ],
      // Ctrl+D at the third question, while readline is waiting for it.
      endInput: { beforePrompt: PROMPTS.license },
    });
    const combined = result.out + result.err;

    expect(result.code, shown(result)).not.toBe(0);
    expect(combined).toMatch(
      /Input ended before all questions were answered|no files were written/i,
    );
    await expect(access(dir)).rejects.toThrow();
  });

  it("skips prompts with --yes even under a PTY", async () => {
    const dir = join(await makeTempDir(), "yes-skip");
    // Nothing is typed and stdin stays open: with --yes the CLI must finish on its own.
    const result = await runInit([dir, "--yes", "--dry-run"], { pty: true });
    const combined = result.out + result.err;

    expect(result.code, shown(result)).toBe(0);
    expect(combined).not.toContain("press Enter to accept");
    expect(combined).toContain('Dry run for "yes-skip"');
    expect(combined).toContain("Would write");
  });
});
