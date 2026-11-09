import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configCommand,
  formatConfigShow,
  runConfig,
  toConfigShowJson,
} from "../src/commands/config.js";
import { loadOssreadyConfig } from "../src/config.js";
import { runCli } from "../src/program.js";
import { ossreadyrcText } from "../src/templates/ossreadyrc.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-config-cmd-"));
}

async function put(root: string, rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf8");
}

async function run(
  ...args: string[]
): Promise<{ out: string; err: string; exitCode: typeof process.exitCode }> {
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

describe("formatConfigShow / toConfigShowJson", () => {
  it("describes a missing config", () => {
    const dir = "/tmp/example";
    expect(formatConfigShow(dir, undefined)).toContain("No project config found");
    expect(formatConfigShow(dir, undefined)).toContain("ossready config --init");
    expect(toConfigShowJson(dir, undefined)).toEqual({
      directory: dir,
      config: null,
      doctor: {},
    });
  });

  it("prints check/skip with clear empty labels and expands comma lists in JSON", () => {
    const loaded = {
      path: ".ossreadyrc",
      doctor: { skip: "funding,citation", check: undefined as string | undefined },
    };
    const text = formatConfigShow("/tmp/x", loaded);
    expect(text).toContain("Config: .ossreadyrc");
    expect(text).toContain("doctor.check: all checks");
    expect(text).toContain("doctor.skip: funding, citation");

    const json = toConfigShowJson("/tmp/x", {
      path: ".ossreadyrc",
      doctor: { skip: "funding,citation", check: ["readme", "license"] },
    });
    expect(json).toEqual({
      directory: "/tmp/x",
      config: ".ossreadyrc",
      doctor: { check: ["readme", "license"], skip: ["funding", "citation"] },
    });
  });
});

describe("runConfig / configCommand", () => {
  it("shows no config in an empty directory", async () => {
    const dir = await makeTempDir();
    const result = await runConfig(dir);
    expect(result.show).toEqual({ directory: dir, config: null, doctor: {} });
    expect(result.stdout).toContain("No project config found");
  });

  it("shows .ossreadyrc with skip", async () => {
    const dir = await makeTempDir();
    await put(dir, ".ossreadyrc", JSON.stringify({ skip: ["funding", "citation"] }));
    const result = await runConfig(dir);
    expect(result.show).toEqual({
      directory: dir,
      config: ".ossreadyrc",
      doctor: { skip: ["funding", "citation"] },
    });
    expect(result.stdout).toContain("Config: .ossreadyrc");
    expect(result.stdout).toContain("doctor.skip: funding, citation");
    expect(result.stdout).toContain("doctor.check: all checks");
  });

  it("discovers package.json#ossready", async () => {
    const dir = await makeTempDir();
    await put(
      dir,
      "package.json",
      JSON.stringify({ name: "x", ossready: { doctor: { skip: ["citation"] } } }),
    );
    const result = await runConfig(dir, { json: true });
    expect(result.show).toEqual({
      directory: dir,
      config: "package.json#ossready",
      doctor: { skip: ["citation"] },
    });
    const parsed = JSON.parse(result.stdout) as { config: string };
    expect(parsed.config).toBe("package.json#ossready");
  });

  it("--json prints the show shape", async () => {
    const dir = await makeTempDir();
    await put(dir, ".ossreadyrc", JSON.stringify({ check: "readme,license" }));
    const result = await runConfig(dir, { json: true });
    expect(JSON.parse(result.stdout)).toEqual({
      directory: dir,
      config: ".ossreadyrc",
      doctor: { check: ["readme", "license"] },
    });
  });

  it("--init writes starter matching ossreadyrcText()", async () => {
    const dir = await makeTempDir();
    const result = await runConfig(dir, { init: true });
    expect(result.init).toEqual({
      directory: dir,
      written: ".ossreadyrc",
      action: "created",
    });
    expect(await readFile(join(dir, ".ossreadyrc"), "utf8")).toBe(ossreadyrcText());
    expect(result.stdout).toContain("Wrote ");
    expect(result.stdout).toContain(".ossreadyrc");
  });

  it("--init refuses when a config already exists", async () => {
    const dir = await makeTempDir();
    await put(dir, ".ossreadyrc", JSON.stringify({ skip: ["funding"] }));
    await expect(runConfig(dir, { init: true })).rejects.toThrow(/already exists/);
  });

  it("--init refuses when package.json#ossready exists", async () => {
    const dir = await makeTempDir();
    await put(dir, "package.json", JSON.stringify({ name: "x", ossready: { skip: ["funding"] } }));
    await expect(runConfig(dir, { init: true })).rejects.toThrow(/package\.json#ossready/);
  });

  it("--init --force overwrites .ossreadyrc", async () => {
    const dir = await makeTempDir();
    await put(dir, ".ossreadyrc", JSON.stringify({ skip: ["funding"] }));
    const result = await runConfig(dir, { init: true, force: true });
    expect(result.init?.action).toBe("overwritten");
    expect(await readFile(join(dir, ".ossreadyrc"), "utf8")).toBe(ossreadyrcText());
  });

  it("--init --force writes .ossreadyrc when only package.json#ossready exists", async () => {
    const dir = await makeTempDir();
    const pkg = { name: "x", ossready: { skip: ["funding"] } };
    await put(dir, "package.json", JSON.stringify(pkg));
    const result = await runConfig(dir, { init: true, force: true, json: true });
    expect(result.init?.action).toBe("created");
    expect(result.init?.note).toMatch(/package\.json#ossready/);
    expect(await readFile(join(dir, ".ossreadyrc"), "utf8")).toBe(ossreadyrcText());
    // package.json left untouched
    expect(JSON.parse(await readFile(join(dir, "package.json"), "utf8"))).toEqual(pkg);
    // discovery now prefers .ossreadyrc
    const loaded = await loadOssreadyConfig(dir);
    expect(loaded?.path).toBe(".ossreadyrc");
  });
});

describe("config strict", () => {
  it("shows doctor.strict in plain and --json output", async () => {
    const dir = await makeTempDir();
    const off = await runConfig(dir);
    expect(off.stdout).not.toContain("doctor.strict");
    await put(dir, ".ossreadyrc", JSON.stringify({ skip: "funding" }));
    const unset = await runConfig(dir);
    expect(unset.stdout).toContain("doctor.strict: off");
    expect(unset.show?.doctor).toEqual({ skip: ["funding"] });
    await put(dir, ".ossreadyrc", JSON.stringify({ doctor: { strict: true } }));
    const on = await runConfig(dir);
    expect(on.stdout).toContain("doctor.strict: on");
    const json = await runConfig(dir, { json: true });
    expect(JSON.parse(json.stdout)).toEqual({ directory: dir, config: ".ossreadyrc", doctor: { strict: true } });
  });
});

describe("CLI wiring", () => {
  it("ossready config --json on an empty dir", async () => {
    const dir = await makeTempDir();
    const { out, err, exitCode } = await run("config", dir, "--json");
    expect(exitCode).toBeUndefined();
    expect(err).toBe("");
    expect(JSON.parse(out)).toEqual({ directory: dir, config: null, doctor: {} });
  });

  it("ossready config --init refuses without --force (exit 1)", async () => {
    const dir = await makeTempDir();
    await put(dir, ".ossreadyrc", "{}\n");
    const { out, err, exitCode } = await run("config", dir, "--init");
    expect(exitCode).toBe(1);
    expect(out).toBe("");
    expect(err).toContain("✖");
    expect(err).toContain("already exists");
  });

  it("ossready config --init --force --json", async () => {
    const dir = await makeTempDir();
    await put(dir, ".ossreadyrc", JSON.stringify({ skip: ["funding"] }));
    const { out, err, exitCode } = await run("config", dir, "--init", "--force", "--json");
    expect(exitCode).toBeUndefined();
    expect(err).toBe("");
    const parsed = JSON.parse(out) as { written: string; action: string };
    expect(parsed).toMatchObject({ written: ".ossreadyrc", action: "overwritten" });
  });

  it("configCommand prints show output", async () => {
    const dir = await makeTempDir();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      logs.push(parts.map(String).join(" "));
    });
    await configCommand(dir);
    expect(logs.join("\n")).toContain("No project config found");
  });
});

describe("config --config <path> and check-id validation", () => {
  it("shows an explicit config file instead of discovering .ossreadyrc", async () => {
    const dir = await makeTempDir();
    await put(dir, ".ossreadyrc", JSON.stringify({ skip: ["funding"] }));
    await put(dir, "team-ossready.json", JSON.stringify({ skip: ["citation"], strict: true }));
    const result = await runConfig(dir, { config: join(dir, "team-ossready.json") });
    expect(result.stdout).toContain("Config: team-ossready.json");
    expect(result.stdout).toContain("doctor.skip: citation");
    expect(result.stdout).toContain("doctor.strict: on");
    expect(result.show).toEqual({
      directory: dir,
      config: "team-ossready.json",
      doctor: { skip: ["citation"], strict: true },
    });
  });

  it("reads the ossready key when --config points at package.json", async () => {
    const dir = await makeTempDir();
    await put(dir, "package.json", JSON.stringify({ name: "x", ossready: { check: "license,readme" } }));
    const result = await runConfig(dir, { config: join(dir, "package.json"), json: true });
    expect(JSON.parse(result.stdout)).toEqual({
      directory: dir,
      config: "package.json#ossready",
      doctor: { check: ["license", "readme"] },
    });
  });

  it("fails for a missing --config file", async () => {
    const dir = await makeTempDir();
    await expect(runConfig(dir, { config: join(dir, "nope.json") })).rejects.toThrow(
      "Config file not found",
    );
  });

  it("fails for an unknown config key in the --config file", async () => {
    const dir = await makeTempDir();
    await put(dir, "team.json", JSON.stringify({ skipp: ["funding"] }));
    await expect(runConfig(dir, { config: join(dir, "team.json") })).rejects.toThrow(/skip/);
  });

  it("fails for unknown check ids with a did-you-mean, naming the file", async () => {
    const dir = await makeTempDir();
    await put(dir, ".ossreadyrc", JSON.stringify({ skip: ["fundng"] }));
    await expect(runConfig(dir)).rejects.toThrow(
      /^\.ossreadyrc: Unknown doctor check `fundng`\. Did you mean `funding`\?/,
    );
  });

  it("fails when config filters leave no checks to run", async () => {
    const dir = await makeTempDir();
    await put(dir, ".ossreadyrc", JSON.stringify({ check: ["license"], skip: ["license"] }));
    await expect(runConfig(dir)).rejects.toThrow(/No doctor checks left to run/);
  });

  it("refuses --config together with --init", async () => {
    const dir = await makeTempDir();
    await expect(runConfig(dir, { init: true, config: "x.json" })).rejects.toThrow(
      "cannot be combined with `--init`",
    );
    expect(await loadOssreadyConfig(dir)).toBeUndefined();
  });

  it("CLI: ossready config --config <file> --json, and exit 1 on a bad file", async () => {
    const dir = await makeTempDir();
    await put(dir, "team.json", JSON.stringify({ skip: "funding" }));
    const ok = await run("config", dir, "--config", join(dir, "team.json"), "--json");
    expect(ok.exitCode).toBeUndefined();
    expect(JSON.parse(ok.out)).toMatchObject({ config: "team.json", doctor: { skip: ["funding"] } });

    process.exitCode = undefined;
    vi.restoreAllMocks();
    await put(dir, "bad.json", JSON.stringify({ check: ["licence"] }));
    const bad = await run("config", dir, "--config", join(dir, "bad.json"));
    expect(bad.exitCode).toBe(1);
    expect(bad.out).toBe("");
    expect(bad.err).toContain("Unknown doctor check `licence`");
  });
});
