import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECK_IDS } from "../src/checks.js";
import {
  doctorCommand,
  formatDoctorMarkdown,
  formatDoctorReport,
  normalizeCheckIdList,
  resolveCheckSelection,
  runDoctor,
  unknownCheckIdMessage,
} from "../src/commands/doctor.js";
import { initCommand } from "../src/commands/init.js";
import { runCli } from "../src/program.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-doctor-filter-"));
}

async function put(root: string, rel: string, content = "x\n"): Promise<void> {
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

describe("normalizeCheckIdList / resolveCheckSelection", () => {
  it("flattens strings, arrays, and comma-separated tokens (de-duplicated, first-seen order)", () => {
    expect(normalizeCheckIdList(undefined)).toEqual([]);
    expect(normalizeCheckIdList("readme")).toEqual(["readme"]);
    expect(normalizeCheckIdList("readme,license")).toEqual(["readme", "license"]);
    expect(normalizeCheckIdList(["readme", "license,ci"])).toEqual(["readme", "license", "ci"]);
    expect(normalizeCheckIdList(["readme", "readme", " license "])).toEqual(["readme", "license"]);
    expect(normalizeCheckIdList("readme,, ,license")).toEqual(["readme", "license"]);
  });

  it("resolves --check / --skip into report-ordered selected ids", () => {
    const only = resolveCheckSelection({ check: ["license", "readme"] });
    expect(only.active).toBe(true);
    expect(only.check).toEqual(["license", "readme"]);
    expect(only.skip).toEqual([]);
    // Catalogue order, not flag order.
    expect(only.selected).toEqual(["readme", "license"]);

    const skipped = resolveCheckSelection({ skip: "funding,citation" });
    expect(skipped.active).toBe(true);
    expect(skipped.selected).not.toContain("funding");
    expect(skipped.selected).not.toContain("citation");
    expect(skipped.selected).toHaveLength(CHECK_IDS.length - 2);

    const both = resolveCheckSelection({
      check: "readme,license,funding",
      skip: ["funding"],
    });
    expect(both.selected).toEqual(["readme", "license"]);
  });

  it("rejects unknown ids with a did-you-mean suggestion", () => {
    expect(unknownCheckIdMessage("readm")).toContain("Did you mean `readme`?");
    expect(unknownCheckIdMessage("nope")).toContain("Unknown doctor check `nope`");
    expect(unknownCheckIdMessage("nope")).toContain("ossready doctor --list");
    expect(() => resolveCheckSelection({ check: "readm" })).toThrow(/Did you mean `readme`/);
    expect(() => resolveCheckSelection({ skip: "fundin" })).toThrow(/Did you mean `funding`/);
  });

  it("rejects an empty --check and a filter that leaves nothing", () => {
    expect(() => resolveCheckSelection({ check: " , ," })).toThrow(/`--check` needs at least one/);
    expect(() => resolveCheckSelection({ check: "readme", skip: "readme" })).toThrow(
      /No doctor checks left/,
    );
    expect(() =>
      resolveCheckSelection({ check: "readme,license", skip: ["readme", "license"] }),
    ).toThrow(/No doctor checks left/);
  });

  it("is inactive when neither flag is set", () => {
    const none = resolveCheckSelection({});
    expect(none.active).toBe(false);
    expect(none.selected).toEqual([...CHECK_IDS]);
  });
});

describe("runDoctor --check / --skip", () => {
  it("runs only the named checks and records the filter on the report", async () => {
    const dir = await makeTempDir();
    await put(dir, "README.md", "# hi\n");
    const report = await runDoctor(dir, { check: ["readme", "license"] });
    expect(report.results.map((r) => r.id)).toEqual(["readme", "license"]);
    expect(report.total).toBe(2);
    expect(report.passed).toBe(1);
    expect(report.missingRequired).toBe(1);
    expect(report.filter).toEqual({
      check: ["readme", "license"],
      skip: [],
      selected: ["readme", "license"],
    });
    // No package.json → the group was already skipped for that reason (not the filter).
    expect(report.packageJson.status).toBe("skipped");
    expect(report.packageJson).not.toMatchObject({ reason: "filtered out by --check/--skip or config" });
  });

  it("marks conditional groups as filtered out when their checks were excluded", async () => {
    const dir = await makeTempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "filter-groups", githubOwner: "YasinzHyper" });
    const report = await runDoctor(dir, { check: "readme" });
    expect(report.results.map((r) => r.id)).toEqual(["readme"]);
    expect(report.packageJson).toEqual({
      status: "skipped",
      reason: "filtered out by --check/--skip or config",
    });
    expect(report.workflowActions).toEqual({
      status: "skipped",
      reason: "filtered out by --check/--skip or config",
    });
    expect(report.readmeBadges).toEqual({
      status: "skipped",
      reason: "filtered out by --check/--skip or config",
    });
    expect(report.managedFiles).toEqual({
      status: "skipped",
      reason: "filtered out by --check/--skip or config",
    });
  });

  it("skips named checks and still scores the rest", async () => {
    const dir = await makeTempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "filter-lib", githubOwner: "YasinzHyper" });
    // Drop two recommended checks that a scaffold still passes — score stays full on the rest.
    const report = await runDoctor(dir, { skip: ["funding", "citation"] });
    expect(report.filter?.skip).toEqual(["funding", "citation"]);
    expect(report.results.some((r) => r.id === "funding")).toBe(false);
    expect(report.results.some((r) => r.id === "citation")).toBe(false);
    expect(report.total).toBe(CHECK_IDS.length - 2);
    expect(report.passed).toBe(report.total);
    expect(report.missingRequired).toBe(0);
    expect(report.missingRecommended).toBe(0);
  });

  it("lets --strict pass when auditing only the required checks that are present", async () => {
    const dir = await makeTempDir();
    await put(dir, "README.md", "# hi\n");
    await put(dir, "LICENSE", "MIT\n");
    await put(dir, "CODE_OF_CONDUCT.md");
    await put(dir, "CONTRIBUTING.md");
    await put(dir, "SECURITY.md");
    await put(dir, ".github/ISSUE_TEMPLATE/bug.md");
    await put(dir, ".github/PULL_REQUEST_TEMPLATE.md");
    await put(dir, ".github/workflows/ci.yml", "on:\n  push:\n  pull_request:\njobs: {}\n");
    // Without a filter, recommended checks (funding, badges, …) still fail under --strict.
    const full = await runDoctor(dir);
    expect(full.missingRecommended).toBeGreaterThan(0);
    process.exitCode = undefined;
    vi.spyOn(console, "log").mockImplementation(() => {});
    await doctorCommand(dir, {
      strict: true,
      check: "readme,license,code-of-conduct,contributing,security,issue-templates,pr-template,ci",
    });
    expect(process.exitCode).toBeUndefined();
  });

  it("lets --skip ignore a failing recommended check under --strict", async () => {
    const dir = await makeTempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "skip-lib", githubOwner: "YasinzHyper" });
    // Break funding so --strict would fail, then skip it.
    const { unlink } = await import("node:fs/promises");
    await unlink(join(dir, ".github/FUNDING.yml"));
    const before = await runDoctor(dir);
    expect(before.results.find((r) => r.id === "funding")?.ok).toBe(false);
    process.exitCode = undefined;
    await doctorCommand(dir, { strict: true });
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    await doctorCommand(dir, { strict: true, skip: "funding" });
    expect(process.exitCode).toBeUndefined();
  });

  it("mentions the filter in plain and Markdown reports", async () => {
    const dir = await makeTempDir();
    await put(dir, "README.md", "# hi\n");
    const report = await runDoctor(dir, { check: "readme", skip: undefined });
    const plain = formatDoctorReport(report);
    expect(plain).toContain("Filter: --check readme (1 of 30 checks)");
    expect(plain).toContain("Score: 1/1 checks passed");
    expect(plain).not.toMatch(/Required:\n\n/);
    const md = formatDoctorMarkdown(report);
    expect(md).toContain("Filter: `--check readme` (1 of 30 checks).");
    expect(md).toContain("| ✅ | README (`readme`) |");
  });

  it("only fixes the selected failing checks with --fix", async () => {
    const dir = await makeTempDir();
    await put(dir, "README.md", "# already\n");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const report = await doctorCommand(dir, {
      check: ["license"],
      fix: true,
      license: "mit",
      dryRun: true,
    });
    expect(report.results.map((r) => r.id)).toEqual(["license"]);
    expect(report.missingRequired).toBe(1);
  });
});

describe("CLI wiring for doctor --check / --skip", () => {
  it("accepts repeated and comma-separated flags through the real CLI", async () => {
    const dir = await makeTempDir();
    await put(dir, "README.md", "# hi\n");
    const { out, err, exitCode } = await run(
      "doctor",
      dir,
      "--check",
      "readme,license",
      "--json",
    );
    expect(err).toBe("");
    expect(exitCode).toBe(1); // license missing
    const json = JSON.parse(out) as {
      total: number;
      results: { id: string }[];
      filter: { check: string[]; selected: string[] };
      ok: boolean;
    };
    expect(json.results.map((r) => r.id)).toEqual(["readme", "license"]);
    expect(json.filter.check).toEqual(["readme", "license"]);
    expect(json.filter.selected).toEqual(["readme", "license"]);
    expect(json.ok).toBe(false);
  });

  it("fails on an unknown check id with a suggestion", async () => {
    const { out, err, exitCode } = await run("doctor", ".", "--check", "readm");
    expect(out).toBe("");
    expect(exitCode).toBe(1);
    expect(err).toContain("Unknown doctor check `readm`");
    expect(err).toContain("Did you mean `readme`?");
  });

  it("shows --check and --skip in doctor --help", async () => {
    const { out, exitCode } = await run("doctor", "--help");
    expect(exitCode).toBeUndefined();
    expect(out).toContain("--check");
    expect(out).toContain("--skip");
    expect(out).toContain("ossready doctor . --check readme --check license");
    expect(out).toContain("ossready doctor . --strict --skip funding --skip citation");
  });
});
