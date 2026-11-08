import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECK_IDS } from "../src/checks.js";
import {
  loadOssreadyConfig,
  mergeDoctorFilters,
  parseOssreadyConfig,
  resolveDoctorStrict,
} from "../src/config.js";
import {
  doctorCommand,
  formatDoctorMarkdown,
  formatDoctorReport,
  runDoctor,
} from "../src/commands/doctor.js";
import { initCommand } from "../src/commands/init.js";
import { runCli } from "../src/program.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-doctor-config-"));
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

describe("parseOssreadyConfig", () => {
  it("reads top-level and nested doctor.check / doctor.skip", () => {
    expect(parseOssreadyConfig({ skip: ["funding", "citation"] }, "t")).toEqual({
      skip: ["funding", "citation"],
    });
    expect(parseOssreadyConfig({ check: "readme,license", skip: "funding" }, "t")).toEqual({
      check: "readme,license",
      skip: "funding",
    });
    expect(parseOssreadyConfig({ doctor: { skip: ["funding"] }, skip: ["citation"] }, "t")).toEqual({
      skip: ["funding"],
    });
    expect(parseOssreadyConfig({ doctor: { check: ["readme"] }, check: "license" }, "t")).toEqual({
      check: ["readme"],
    });
    expect(parseOssreadyConfig({ $schema: "https://example.test/schema.json" }, "t")).toEqual({});
  });

  it("rejects non-objects, bad list types, and unknown keys (with did-you-mean)", () => {
    expect(() => parseOssreadyConfig([], "t")).toThrow(/expected a JSON object/);
    expect(() => parseOssreadyConfig({ skip: 1 }, "t")).toThrow(/Invalid "skip"/);
    expect(() => parseOssreadyConfig({ check: [1] }, "t")).toThrow(/Invalid "check"/);
    expect(() => parseOssreadyConfig({ doctor: "nope" }, "t")).toThrow(/Invalid "doctor"/);
    expect(() => parseOssreadyConfig({ skipp: ["funding"] }, "t")).toThrow(
      /Unknown config key `skipp`.*Did you mean `skip`/s,
    );
    expect(() => parseOssreadyConfig({ doctor: { chek: ["readme"] } }, "t")).toThrow(
      /Unknown "doctor" key `chek`.*Did you mean `check`/s,
    );
  });
});

describe("mergeDoctorFilters", () => {
  it("lets CLI --check replace config check and unions skips", () => {
    const loaded = {
      path: ".ossreadyrc",
      doctor: { check: ["readme", "license", "funding"], skip: ["funding"] },
    };
    const merged = mergeDoctorFilters({ check: "readme", skip: "citation" }, loaded);
    expect(merged.check).toEqual("readme");
    expect(merged.skip).toEqual(["funding", "citation"]);
    expect(merged.configPath).toBe(".ossreadyrc");
    expect(merged.fromConfig).toBe(true);
  });

  it("passes CLI through when there is no config", () => {
    expect(mergeDoctorFilters({ skip: "funding" }, undefined)).toEqual({
      check: undefined,
      skip: "funding",
      fromConfig: false,
    });
  });
});

describe("loadOssreadyConfig", () => {
  it("discovers .ossreadyrc before package.json#ossready", async () => {
    const dir = await makeTempDir();
    await put(dir, ".ossreadyrc", JSON.stringify({ skip: ["funding"] }));
    await put(
      dir,
      "package.json",
      JSON.stringify({ name: "x", ossready: { skip: ["citation"] } }),
    );
    const loaded = await loadOssreadyConfig(dir);
    expect(loaded?.path).toBe(".ossreadyrc");
    expect(loaded?.doctor).toEqual({ skip: ["funding"] });
  });

  it("falls back to package.json#ossready", async () => {
    const dir = await makeTempDir();
    await put(
      dir,
      "package.json",
      JSON.stringify({ name: "x", version: "1.0.0", ossready: { doctor: { skip: "citation" } } }),
    );
    const loaded = await loadOssreadyConfig(dir);
    expect(loaded?.path).toBe("package.json#ossready");
    expect(loaded?.doctor).toEqual({ skip: "citation" });
  });

  it("honors --config and --ignore-config", async () => {
    const dir = await makeTempDir();
    await put(dir, ".ossreadyrc", JSON.stringify({ skip: ["funding"] }));
    await put(dir, "custom.json", JSON.stringify({ skip: ["citation"] }));
    expect(await loadOssreadyConfig(dir, { noConfig: true })).toBeUndefined();
    const explicit = await loadOssreadyConfig(dir, {
      noConfig: true,
      config: join(dir, "custom.json"),
    });
    expect(explicit?.doctor).toEqual({ skip: ["citation"] });
    await expect(loadOssreadyConfig(dir, { config: join(dir, "missing.json") })).rejects.toThrow(
      /Config file not found/,
    );
  });

  it("errors on invalid JSON in an rc file", async () => {
    const dir = await makeTempDir();
    await put(dir, ".ossreadyrc", "{not json");
    await expect(loadOssreadyConfig(dir)).rejects.toThrow(/Invalid JSON/);
  });
});

describe("runDoctor with project config", () => {
  it("applies .ossreadyrc skip and records filter.config", async () => {
    const dir = await makeTempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "cfg-lib", githubOwner: "YasinzHyper" });
    await put(dir, ".ossreadyrc", JSON.stringify({ skip: ["funding", "citation"] }, null, 2));
    const report = await runDoctor(dir);
    expect(report.filter?.skip).toEqual(["funding", "citation"]);
    expect(report.filter?.config).toBe(".ossreadyrc");
    expect(report.results.some((r) => r.id === "funding")).toBe(false);
    expect(report.total).toBe(CHECK_IDS.length - 2);
    expect(report.passed).toBe(report.total);
    const plain = formatDoctorReport(report);
    expect(plain).toContain("via .ossreadyrc");
    const md = formatDoctorMarkdown(report);
    expect(md).toContain("via `.ossreadyrc`");
  });

  it("unions CLI --skip with config skip; CLI --check replaces config check", async () => {
    const dir = await makeTempDir();
    await put(dir, "README.md", "# hi\n");
    await put(dir, "LICENSE", "MIT\n");
    await put(
      dir,
      ".ossreadyrc",
      JSON.stringify({ check: ["readme", "license", "funding"], skip: ["funding"] }),
    );
    const report = await runDoctor(dir, { check: "readme,license", skip: "license" });
    expect(report.results.map((r) => r.id)).toEqual(["readme"]);
    expect(report.filter).toMatchObject({
      check: ["readme", "license"],
      skip: ["funding", "license"],
      selected: ["readme"],
      config: ".ossreadyrc",
    });
  });

  it("lets --ignore-config ignore a local .ossreadyrc", async () => {
    const dir = await makeTempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "nocfg", githubOwner: "YasinzHyper" });
    await put(dir, ".ossreadyrc", JSON.stringify({ skip: ["funding"] }));
    const withCfg = await runDoctor(dir);
    expect(withCfg.total).toBe(CHECK_IDS.length - 1);
    const without = await runDoctor(dir, { noConfig: true });
    expect(without.filter).toBeUndefined();
    expect(without.total).toBe(CHECK_IDS.length);
  });

  it("fails --strict without config, then passes when config skips the missing check", async () => {
    const dir = await makeTempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "strict-cfg", githubOwner: "YasinzHyper" });
    const { readFile, unlink } = await import("node:fs/promises");
    await unlink(join(dir, ".github/FUNDING.yml"));
    process.exitCode = undefined;
    await doctorCommand(dir, { strict: true, noConfig: true });
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    await put(dir, ".ossreadyrc", JSON.stringify({ skip: ["funding"] }));
    await doctorCommand(dir, { strict: true });
    expect(process.exitCode).toBeUndefined();
    // package.json#ossready also works once the rc file is gone.
    await unlink(join(dir, ".ossreadyrc"));
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as Record<string, unknown>;
    pkg.ossready = { skip: ["funding"] };
    await put(dir, "package.json", `${JSON.stringify(pkg, null, 2)}\n`);
    process.exitCode = undefined;
    await doctorCommand(dir, { strict: true });
    expect(process.exitCode).toBeUndefined();
    const report = await runDoctor(dir);
    expect(report.filter?.config).toBe("package.json#ossready");
  });
});

describe("CLI wiring for doctor config", () => {
  it("loads .ossreadyrc through the real CLI and exposes filter.config in --json", async () => {
    const dir = await makeTempDir();
    await put(dir, "README.md", "# hi\n");
    await put(dir, ".ossreadyrc", JSON.stringify({ check: ["readme"] }));
    const { out, err, exitCode } = await run("doctor", dir, "--json");
    expect(err).toBe("");
    expect(exitCode).toBeUndefined();
    const json = JSON.parse(out) as {
      total: number;
      filter: { check: string[]; config: string; selected: string[] };
      ok: boolean;
    };
    expect(json.total).toBe(1);
    expect(json.filter).toMatchObject({
      check: ["readme"],
      selected: ["readme"],
      config: ".ossreadyrc",
    });
    expect(json.ok).toBe(true);
  });

  it("shows --config and --ignore-config in doctor --help", async () => {
    const { out, exitCode } = await run("doctor", "--help");
    expect(exitCode).toBeUndefined();
    expect(out).toContain("--config");
    expect(out).toContain("--ignore-config");
    expect(out).toContain("ossready doctor . --strict --ignore-config");
  });

  it("fails when --config points at a missing file", async () => {
    const { err, exitCode } = await run("doctor", ".", "--config", "/tmp/ossready-missing-config-xyz.json");
    expect(exitCode).toBe(1);
    expect(err).toContain("Config file not found");
  });

  it("fails on an unknown config key with a did-you-mean suggestion", async () => {
    const dir = await makeTempDir();
    await put(dir, "README.md", "# hi\n");
    await put(dir, ".ossreadyrc", JSON.stringify({ skipp: ["funding"] }));
    const { err, exitCode } = await run("doctor", dir, "--json");
    expect(exitCode).toBe(1);
    expect(err).toMatch(/Unknown config key `skipp`/);
    expect(err).toMatch(/Did you mean `skip`/);
  });
});

describe("config strict", () => {
  it("parses strict (top-level and nested, nested wins) and rejects non-booleans", () => {
    expect(parseOssreadyConfig({ strict: true }, "t")).toEqual({ strict: true });
    expect(parseOssreadyConfig({ strict: true, doctor: { strict: false } }, "t")).toEqual({ strict: false });
    expect(() => parseOssreadyConfig({ strict: "true" }, "t")).toThrow(/Invalid "strict" in t: expected true or false/);
    expect(() => parseOssreadyConfig({ strikt: true }, "t")).toThrow(/Did you mean `strict`/);
  });

  it("resolveDoctorStrict: --strict wins, then config strict", () => {
    const on = { path: ".ossreadyrc", doctor: { strict: true } };
    const off = { path: ".ossreadyrc", doctor: { strict: false } };
    expect(resolveDoctorStrict(undefined, undefined)).toEqual({ strict: false });
    expect(resolveDoctorStrict(false, on)).toEqual({ strict: true, source: ".ossreadyrc" });
    expect(resolveDoctorStrict(true, off)).toEqual({ strict: true, source: "--strict" });
    expect(resolveDoctorStrict(true, on)).toEqual({ strict: true, source: "--strict" });
    expect(resolveDoctorStrict(false, off)).toEqual({ strict: false });
  });

  it("config strict fails the run on a missing recommended check; --ignore-config drops it", async () => {
    const dir = await makeTempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "strict-rc", githubOwner: "YasinzHyper" });
    const { unlink } = await import("node:fs/promises");
    await unlink(join(dir, ".github/FUNDING.yml"));

    process.exitCode = undefined;
    await doctorCommand(dir);
    expect(process.exitCode).toBeUndefined();

    await put(dir, ".ossreadyrc", JSON.stringify({ strict: true }));
    process.exitCode = undefined;
    const report = await doctorCommand(dir);
    expect(process.exitCode).toBe(1);
    expect(report.strict).toBe(true);
    expect(report.strictSource).toBe(".ossreadyrc");
    // strict alone does not narrow the audit
    expect(report.filter).toBeUndefined();
    expect(formatDoctorReport(report)).toContain("Strict: on via .ossreadyrc");
    expect(formatDoctorMarkdown(report)).toContain("Strict: on via `.ossreadyrc`");

    process.exitCode = undefined;
    const ignored = await doctorCommand(dir, { noConfig: true });
    expect(process.exitCode).toBeUndefined();
    expect(ignored.strict).toBe(false);
    expect(ignored.strictSource).toBeUndefined();

    // Persistent skip + strict together: passes again.
    await put(dir, "package.json", JSON.stringify({ name: "x" }));
    await put(dir, ".ossreadyrc", JSON.stringify({ doctor: { strict: true, skip: ["funding"] } }));
    const skipped = await runDoctor(dir);
    expect(skipped.strict).toBe(true);
    expect(skipped.filter?.config).toBe(".ossreadyrc");
  });

  it("reports --strict as the source and exposes strict in --json through the CLI", async () => {
    const dir = await makeTempDir();
    await put(dir, "README.md", "# hi\n");
    await put(dir, ".ossreadyrc", JSON.stringify({ check: ["readme"], strict: true }));
    const viaConfig = await run("doctor", dir, "--json");
    expect(viaConfig.exitCode).toBeUndefined();
    const json = JSON.parse(viaConfig.out) as { strict: boolean; strictSource: string; ok: boolean };
    expect(json).toMatchObject({ strict: true, strictSource: ".ossreadyrc", ok: true });
    vi.restoreAllMocks();
    const viaFlag = await run("doctor", dir, "--json", "--strict");
    expect(JSON.parse(viaFlag.out)).toMatchObject({ strict: true, strictSource: "--strict" });
    const plain = formatDoctorReport(await runDoctor(dir, { strict: true }));
    expect(plain).toContain("Strict: on (missing recommended checks fail the run)");
  });
});
