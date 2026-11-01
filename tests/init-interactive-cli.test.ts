import { execFileSync, spawn } from "node:child_process";
import { access, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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

/**
 * Run `node dist/cli.js …` with the given stdin lines.
 * When `pty` is true, wrap with `script -qefc` so stdin/stdout are TTYs (and
 * clear `CI` so shouldPrompt allows the interactive path). No new dependencies.
 */
function runInit(
  args: string[],
  answers: string[],
  { pty }: { pty: boolean },
): Promise<RunResult> {
  const env = { ...process.env, CI: "", TERM: "xterm-256color" };
  const nodeArgs = [cliJs, "init", ...args];
  const child = pty
    ? spawn(
        "script",
        ["-qefc", `node ${[cliJs, "init", ...args].map(shellQuote).join(" ")}`, "/dev/null"],
        { cwd: repoRoot, env, stdio: ["pipe", "pipe", "pipe"] },
      )
    : spawn(process.execPath, nodeArgs, {
        cwd: repoRoot,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

  let out = "";
  let err = "";
  child.stdout.on("data", (chunk: Buffer) => {
    out += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    err += chunk.toString("utf8");
  });

  if (answers.length) child.stdin.write(answers.map((a) => `${a}\n`).join(""));
  child.stdin.end();

  return new Promise((resolvePromise, rejectPromise) => {
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise({ code, out, err }));
  });
}

/** Eight Enter presses: accept every interactive default. */
const ALL_DEFAULTS = ["", "", "", "", "", "", "", ""];

beforeAll(() => {
  // CI runs `npm test` before `npm run build`; this file needs dist/cli.js.
  execFileSync("npm", ["run", "build"], {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
  });
}, 120_000);

describe("interactive init via the real CLI (non-TTY pipe never prompts)", () => {
  it("uses defaults without reading stdin when there is no TTY", async () => {
    const dir = join(await makeTempDir(), "piped");
    const result = await runInit([dir, "--dry-run"], ["should-never-be-read"], { pty: false });
    expect(result.code).toBe(0);
    expect(result.out + result.err).not.toContain("press Enter to accept");
    expect(result.out + result.err).toContain('Dry run for "piped"');
    expect(result.out + result.err).toContain("Would write");
  });
});

describe.skipIf(!canPty)("interactive init via the real CLI (pseudo-TTY)", () => {
  it("prompts under a PTY, accepts Enter defaults, and dry-runs without writing", async () => {
    const parent = await makeTempDir();
    const dir = join(parent, "pty-defaults");
    const result = await runInit([dir, "--dry-run"], ALL_DEFAULTS, { pty: true });
    const combined = result.out + result.err;

    expect(result.code).toBe(0);
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
    const result = await runInit(
      [dir],
      [
        "", // name → answered (folder)
        "Built through a PTY",
        "apache-2.0",
        "npm",
        "Ada Lovelace",
        "octo",
        "mods@example.org",
        "", // skip security email
      ],
      { pty: true },
    );
    const combined = result.out + result.err;

    expect(result.code).toBe(0);
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
    const result = await runInit([dir], ["half", "answered"], { pty: true });
    const combined = result.out + result.err;

    expect(result.code).not.toBe(0);
    expect(combined).toMatch(/Input ended before all questions were answered|no files were written/i);
    await expect(access(dir)).rejects.toThrow();
  });

  it("skips prompts with --yes even under a PTY", async () => {
    const dir = join(await makeTempDir(), "yes-skip");
    const result = await runInit(
      [dir, "--yes", "--dry-run"],
      ["should-not-be-read", "nor-this"],
      { pty: true },
    );
    const combined = result.out + result.err;

    expect(result.code).toBe(0);
    expect(combined).not.toContain("press Enter to accept");
    expect(combined).toContain('Dry run for "yes-skip"');
    expect(combined).toContain("Would write");
  });
});
