import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECK_CATALOG } from "../src/checks.js";
import { doctorCommand, runDoctor } from "../src/commands/doctor.js";
import { initCommand } from "../src/commands/init.js";
import {
  CHECKS_DOC_URI,
  formatDoctorSarif,
  SARIF_FINGERPRINT_KEY,
  SARIF_SCHEMA,
  sarifLevel,
  sarifRules,
  sarifUri,
  type SarifLog,
} from "../src/commands/sarif.js";
import { getVersion } from "../src/version.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

beforeEach(async () => {
  // Keep the machine's `git config github.user` out of init's owner inference.
  vi.stubEnv("GIT_CONFIG_GLOBAL", join(await mkdtemp(join(tmpdir(), "ossready-sarif-git-")), "gitconfig"));
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
});

function captureLog(): string[] {
  const logs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
    logs.push(String(message));
  });
  return logs;
}

/** README plus one workflow with an outdated `actions/checkout` pin on line 6. */
async function outdatedRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ossready-sarif-"));
  await writeFile(join(dir, "README.md"), "# demo\n");
  await mkdir(join(dir, ".github", "workflows"), { recursive: true });
  await writeFile(
    join(dir, ".github", "workflows", "ci.yml"),
    "on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n",
  );
  return dir;
}

function results(log: SarifLog) {
  return log.runs[0]!.results;
}

describe("sarif helpers", () => {
  it("maps required checks to errors and recommended checks to warnings", () => {
    expect(sarifLevel("required")).toBe("error");
    expect(sarifLevel("recommended")).toBe("warning");
  });

  it("normalises repo-relative paths into SARIF URIs", () => {
    expect(sarifUri("README.md")).toBe("README.md");
    expect(sarifUri("./.github/workflows/ci.yml")).toBe(".github/workflows/ci.yml");
    expect(sarifUri(".github\\CODEOWNERS")).toBe(".github/CODEOWNERS");
    expect(sarifUri(".github/")).toBe(".github");
    expect(sarifUri("docs/my file#1.md")).toBe("docs/my%20file%231.md");
  });

  it("has one rule per catalogued check, in catalogue order, linking to docs/checks.md", () => {
    const rules = sarifRules();
    expect(rules.map((r) => r.id)).toEqual(CHECK_CATALOG.map((c) => c.id));
    for (const [i, rule] of rules.entries()) {
      const c = CHECK_CATALOG[i]!;
      expect(rule.shortDescription.text).toBe(c.title);
      expect(rule.fullDescription.text).not.toContain("`");
      expect(rule.help.text).not.toContain("`");
      expect(rule.helpUri).toBe(`${CHECKS_DOC_URI}#${c.id}`);
      expect(rule.defaultConfiguration.level).toBe(sarifLevel(c.level));
      expect(rule.name).toMatch(/^[A-Z][A-Za-z]*$/);
    }
    expect(rules.find((r) => r.id === "code-of-conduct")?.name).toBe("CodeOfConduct");
  });
});

describe("formatDoctorSarif", () => {
  it("emits a SARIF 2.1.0 log with no results for ossready itself", async () => {
    const report = await runDoctor(repoRoot);
    const log = formatDoctorSarif(report, { version: "1.2.3" });
    expect(log.$schema).toBe(SARIF_SCHEMA);
    expect(log.version).toBe("2.1.0");
    expect(log.runs).toHaveLength(1);
    expect(log.runs[0]!.tool.driver).toMatchObject({ name: "ossready", version: "1.2.3", semanticVersion: "1.2.3" });
    expect(results(log)).toEqual([]);
    // No absolute runner paths anywhere.
    expect(JSON.stringify(log)).not.toContain(report.directory);
  });

  it("reports each failing check at the file it wants, with levels and stable rule indexes", async () => {
    const report = await runDoctor(await outdatedRepo());
    const log = formatDoctorSarif(report, { version: "0.0.0" });
    const rules = log.runs[0]!.tool.driver.rules;
    const failing = report.results.filter((r) => !r.ok).map((r) => r.id);
    expect(new Set(results(log).map((r) => r.ruleId))).toEqual(new Set(failing));
    expect(results(log).some((r) => r.ruleId === "readme")).toBe(false);
    for (const r of results(log)) {
      expect(rules[r.ruleIndex]!.id).toBe(r.ruleId);
      expect(r.locations[0]!.physicalLocation.artifactLocation.uriBaseId).toBe("%SRCROOT%");
      expect(r.partialFingerprints[SARIF_FINGERPRINT_KEY]).toMatch(/^[0-9a-f]{32}$/);
      expect(r.message.text).not.toContain(report.directory);
    }
    const license = results(log).find((r) => r.ruleId === "license");
    expect(license).toMatchObject({ level: "error", message: { text: expect.stringMatching(/^Missing LICENSE\. /) } });
    expect(license?.locations[0]!.physicalLocation.artifactLocation.uri).toBe("LICENSE");
    const changelog = results(log).find((r) => r.ruleId === "changelog");
    expect(changelog?.level).toBe("warning");
    expect(changelog?.locations[0]!.physicalLocation.artifactLocation.uri).toBe("CHANGELOG.md");
  });

  it("points outdated workflow actions at their uses: line", async () => {
    const report = await runDoctor(await outdatedRepo());
    const actions = results(formatDoctorSarif(report, { version: "0.0.0" })).filter(
      (r) => r.ruleId === "workflow-actions",
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]!.locations[0]!.physicalLocation).toEqual({
      artifactLocation: { uri: ".github/workflows/ci.yml", uriBaseId: "%SRCROOT%" },
      region: { startLine: 6 },
    });
    expect(actions[0]!.message.text).toMatch(/^actions\/checkout@v3 is older than the recommended v\d+\. /);
  });

  it("points stale managed files at each file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-sarif-managed-"));
    captureLog();
    await initCommand(dir, { name: "sarif-lib", license: "mit", githubOwner: "octo" });
    const stale = join(dir, ".github/workflows/stale.yml");
    const text = await readFile(stale, "utf8");
    await writeFile(stale, text.replace("days-before-issue-stale: 60", "days-before-issue-stale: 30"));
    const report = await runDoctor(dir);
    const managed = results(formatDoctorSarif(report, { version: "0.0.0" })).filter(
      (r) => r.ruleId === "managed-files",
    );
    expect(managed).toHaveLength(1);
    expect(managed[0]!.level).toBe("warning");
    expect(managed[0]!.locations[0]!.physicalLocation.artifactLocation.uri).toBe(".github/workflows/stale.yml");
    expect(managed[0]!.message.text).toMatch(/^\.github\/workflows\/stale\.yml differs from the current ossready template \(\+1 -1\)\. /);
  });

  it("keeps fingerprints stable across runs and distinct across findings", async () => {
    const dir = await outdatedRepo();
    const a = results(formatDoctorSarif(await runDoctor(dir), { version: "0.0.0" }));
    const b = results(formatDoctorSarif(await runDoctor(dir), { version: "9.9.9" }));
    const fp = (rs: typeof a) => rs.map((r) => r.partialFingerprints[SARIF_FINGERPRINT_KEY]);
    expect(fp(a)).toEqual(fp(b));
    expect(new Set(fp(a)).size).toBe(a.length);
  });

  it("only reports the checks a --check filter selected", async () => {
    const report = await runDoctor(await outdatedRepo(), { check: "license,changelog" });
    const ids = results(formatDoctorSarif(report, { version: "0.0.0" })).map((r) => r.ruleId);
    expect(ids).toEqual(["license", "changelog"]);
  });
});

describe("doctorCommand --sarif", () => {
  it("prints only the SARIF log on stdout and keeps the exit code", async () => {
    const logs = captureLog();
    const report = await doctorCommand(repoRoot, { sarif: true });
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0]!)).toEqual(formatDoctorSarif(report, { version: getVersion() }));
    expect(process.exitCode).toBeUndefined();
  });

  it("exits 1 when required checks are missing", async () => {
    const logs = captureLog();
    await doctorCommand(await outdatedRepo(), { sarif: true });
    expect(logs).toHaveLength(1);
    expect(results(JSON.parse(logs[0]!) as SarifLog).length).toBeGreaterThan(0);
    expect(process.exitCode).toBe(1);
  });

  it("sends the --fix plan to stderr so stdout stays SARIF", async () => {
    const logs = captureLog();
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((message?: unknown) => {
      errors.push(String(message));
    });
    await doctorCommand(await outdatedRepo(), { sarif: true, fix: true, dryRun: true, license: "mit" });
    expect(logs).toHaveLength(1);
    expect(() => JSON.parse(logs[0]!)).not.toThrow();
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects --sarif together with --json or --markdown", async () => {
    captureLog();
    await expect(doctorCommand(repoRoot, { json: true, sarif: true })).rejects.toThrow(
      "Use either --json or --sarif, not both.",
    );
    await expect(doctorCommand(repoRoot, { markdown: true, sarif: true })).rejects.toThrow(
      "Use either --markdown or --sarif, not both.",
    );
    await expect(doctorCommand(repoRoot, { json: true, markdown: true, sarif: true })).rejects.toThrow(
      "Use only one of --json, --markdown or --sarif.",
    );
  });
});
