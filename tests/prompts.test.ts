import { access, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { DEFAULT_DESCRIPTION, initCommand, type InitFlags } from "../src/commands/init.js";
import {
  inferPromptDefaults,
  isCI,
  PromptCancelledError,
  promptInitFlags,
  resolveInitFlags,
  shouldPrompt,
} from "../src/prompts.js";

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "ossready-prompts-"));
}

/** Fake terminal: input pre-loaded with answers (one per line), output captured as text. */
function fakeIO(answers: string[], { end = true, terminal = false } = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = "";
  output.on("data", (chunk: Buffer) => {
    text += chunk.toString("utf8");
  });
  if (answers.length) input.write(answers.map((a) => `${a}\n`).join(""));
  if (end) input.end();
  return { io: { input, output, terminal }, input, text: () => text };
}

const ALL_FLAGS: InitFlags = {
  name: "given",
  description: "given description",
  license: "mit",
  packageManager: "npm",
  author: "Given Author",
  githubOwner: "given",
  cocEmail: "coc@example.com",
  securityEmail: "sec@example.com",
};

const TTY = { stdinIsTTY: true, stdoutIsTTY: true, env: {} };

describe("shouldPrompt", () => {
  it("prompts only for an interactive terminal outside CI without --yes", () => {
    expect(shouldPrompt(TTY)).toBe(true);
    expect(shouldPrompt({ ...TTY, yes: true })).toBe(false);
    expect(shouldPrompt({ ...TTY, stdinIsTTY: false })).toBe(false);
    expect(shouldPrompt({ ...TTY, stdoutIsTTY: false })).toBe(false);
    expect(shouldPrompt({ ...TTY, stdinIsTTY: undefined })).toBe(false);
    expect(shouldPrompt({ ...TTY, env: { CI: "true" } })).toBe(false);
    expect(shouldPrompt({ ...TTY, env: { CI: "1" } })).toBe(false);
  });

  it("treats an empty, 0, or false CI variable as unset", () => {
    expect(isCI({})).toBe(false);
    expect(isCI({ CI: "" })).toBe(false);
    expect(isCI({ CI: "0" })).toBe(false);
    expect(isCI({ CI: "false" })).toBe(false);
    expect(isCI({ CI: "true" })).toBe(true);
    expect(shouldPrompt({ ...TTY, env: { CI: "false" } })).toBe(true);
  });
});

describe("resolveInitFlags (non-interactive paths never prompt)", () => {
  const cases = [
    { label: "non-TTY stdin", ctx: { ...TTY, stdinIsTTY: false } },
    { label: "non-TTY stdout", ctx: { ...TTY, stdoutIsTTY: false } },
    { label: "--yes", ctx: { ...TTY, yes: true } },
    { label: "CI=true", ctx: { ...TTY, env: { CI: "true" } } },
  ];

  for (const { label, ctx } of cases) {
    it(`returns the flags untouched and writes nothing for ${label}`, async () => {
      // Input that is never ended: a prompt here would hang the test.
      const { io, text } = fakeIO(["should-not-be-read"], { end: false });
      const flags: InitFlags = { dryRun: true };
      const resolved = await resolveInitFlags("some-dir", flags, { ...ctx, io });
      expect(resolved).toBe(flags);
      expect(text()).toBe("");
    });
  }
});

describe("promptInitFlags", () => {
  it("accepts the bracketed defaults when Enter is pressed", async () => {
    const dir = join(await makeTempDir(), "my-lib");
    const { io, text } = fakeIO(["", "", "", "", "", "", "", ""]);
    const result = await promptInitFlags(dir, {}, io, {});

    expect(result.name).toBe("my-lib");
    expect(result.description).toBe(DEFAULT_DESCRIPTION);
    expect(result.license).toBe("mit");
    expect(result.packageManager).toBe("npm");
    expect(result.author).toBeUndefined();
    expect(result.githubOwner).toBeUndefined();
    expect(result.cocEmail).toBe("conduct@example.com");
    expect(result.securityEmail).toBeUndefined();

    const out = text();
    expect(out).toContain("Project name [my-lib]");
    expect(out).toContain("License (mit / apache-2.0) [mit]");
    expect(out).toContain("Package manager (npm / pnpm / yarn / bun) [npm]");
    expect(out).toContain("Code of Conduct contact email [conduct@example.com]");
    expect(out).toContain("--yes");
  });

  it("uses typed answers over defaults (license by number, case-insensitive pm)", async () => {
    const dir = join(await makeTempDir(), "ignored");
    const { io } = fakeIO([
      "cool-cli",
      "Does one thing well",
      "2",
      "PNPM",
      "Jane Doe",
      "octo",
      "mods@example.org",
      "security@example.org",
    ]);
    const result = await promptInitFlags(dir, {}, io, {});
    expect(result).toEqual({
      name: "cool-cli",
      description: "Does one thing well",
      license: "apache-2.0",
      packageManager: "pnpm",
      author: "Jane Doe",
      githubOwner: "octo",
      cocEmail: "mods@example.org",
      securityEmail: "security@example.org",
    });
  });

  it("asks only for options not given as flags", async () => {
    const { cocEmail: _omit, ...flags } = ALL_FLAGS;
    const { io, text } = fakeIO([""]);
    const result = await promptInitFlags("unused", { ...flags, dryRun: true }, io, {});
    expect(result).toEqual({ ...ALL_FLAGS, cocEmail: "conduct@example.com", dryRun: true });
    const out = text();
    expect(out).toContain("Code of Conduct contact email");
    expect(out).not.toContain("Project name");
    expect(out).not.toContain("License");
  });

  it("does not prompt at all when every option is a flag", async () => {
    const { io, text } = fakeIO([], { end: false });
    const result = await promptInitFlags("unused", ALL_FLAGS, io, {});
    expect(result).toEqual(ALL_FLAGS);
    expect(text()).toBe("");
  });

  it("re-asks on an invalid email, license, or name", async () => {
    const { name: _n, license: _l, cocEmail: _c, securityEmail: _s, ...flags } = ALL_FLAGS;
    const { io, text } = fakeIO([
      "bad name!",
      "good-name",
      "gpl-3.0",
      "apache-2.0",
      "not-an-email",
      "mods@example.org",
      "also@bad",
      "",
    ]);
    const result = await promptInitFlags("unused", flags, io, {});
    expect(result.name).toBe("good-name");
    expect(result.license).toBe("apache-2.0");
    expect(result.cocEmail).toBe("mods@example.org");
    expect(result.securityEmail).toBeUndefined();

    const out = text();
    expect(out).toContain('Invalid project name "bad name!"');
    expect(out).toContain('Unknown license "gpl-3.0"');
    expect(out).toContain('Invalid email "not-an-email"');
    expect(out).toContain('Invalid email "also@bad"');
    expect(out.split("Code of Conduct contact email").length - 1).toBe(2);
    expect(out.split("Private security contact email").length - 1).toBe(2);
  });

  it("rejects with PromptCancelledError on EOF before all answers", async () => {
    const { io } = fakeIO(["only-a-name"]);
    const err = await promptInitFlags("unused", {}, io, {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PromptCancelledError);
    expect((err as PromptCancelledError).reason).toBe("eof");
  });

  it("rejects with PromptCancelledError on Ctrl+C in a terminal", async () => {
    const { io, input } = fakeIO([], { end: false, terminal: true });
    const pending = promptInitFlags("unused", {}, io, {});
    setTimeout(() => input.write("\x03"), 10);
    const err = await pending.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PromptCancelledError);
    expect((err as PromptCancelledError).reason).toBe("sigint");
  });

  it("infers defaults from an existing package.json and lockfile", async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "from-pkg",
        description: "Package description",
        license: "Apache-2.0",
        author: "Ann Author <ann@example.com>",
        repository: { type: "git", url: "git+https://github.com/octo-org/from-pkg.git" },
      }),
      "utf8",
    );
    await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");

    expect(await inferPromptDefaults(dir, {})).toEqual({
      name: "from-pkg",
      description: "Package description",
      license: "apache-2.0",
      packageManager: "pnpm",
      author: "Ann Author",
      githubOwner: "octo-org",
      cocEmail: "conduct@example.com",
    });
  });

  it("infers the package manager from packageManager or the npm user agent", async () => {
    const withField = await makeTempDir();
    await writeFile(
      join(withField, "package.json"),
      JSON.stringify({ packageManager: "yarn@4.18.1" }),
      "utf8",
    );
    expect((await inferPromptDefaults(withField, {})).packageManager).toBe("yarn");

    const empty = await makeTempDir();
    const ua = { npm_config_user_agent: "bun/1.2.0 npm/? node/v22.12.0 linux x64" };
    expect((await inferPromptDefaults(empty, ua)).packageManager).toBe("bun");
    expect((await inferPromptDefaults(empty, {})).packageManager).toBe("npm");
  });
});

describe("interactive init end to end", () => {
  it("works with --dry-run: prompts, then writes nothing", async () => {
    const dir = await makeTempDir();
    const { io } = fakeIO(["dry-prompted", "", "", "", "", "", "", ""]);
    const flags = await resolveInitFlags(dir, { dryRun: true }, { ...TTY, io });
    expect(flags.name).toBe("dry-prompted");
    await initCommand(dir, flags);
    expect(await readdir(dir)).toEqual([]);
  });

  it("scaffolds with the answers given", async () => {
    const dir = join(await makeTempDir(), "answered");
    const { io } = fakeIO(["", "Answered via prompts", "apache-2.0", "", "Jane Doe", "octo", "", ""]);
    const flags = await resolveInitFlags(dir, {}, { ...TTY, io });
    await initCommand(dir, flags);
    const { readFile } = await import("node:fs/promises");
    const license = await readFile(join(dir, "LICENSE"), "utf8");
    expect(license).toContain("Apache License");
    expect(license).toContain("Jane Doe");
    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("# answered");
    expect(readme).toContain("Answered via prompts");
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.repository.url).toContain("github.com/octo/answered");
  });

  it("leaves no partial writes when input ends mid-way", async () => {
    const dir = join(await makeTempDir(), "never-created");
    const { io } = fakeIO(["half", "answered"]);
    await expect(resolveInitFlags(dir, {}, { ...TTY, io })).rejects.toBeInstanceOf(
      PromptCancelledError,
    );
    await expect(access(dir)).rejects.toThrow();
  });
});
