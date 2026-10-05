import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOCTOR_CHECKS,
  doctorCommand,
  formatDoctorReport,
  runDoctor,
} from "../src/commands/doctor.js";
import { initCommand } from "../src/commands/init.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-doctor-"));
}

async function put(root: string, rel: string, content = "x\n"): Promise<void> {
  const full = join(root, rel);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf8");
}

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("ossready doctor", () => {
  it("defines unique check ids with required and recommended levels", () => {
    const ids = DOCTOR_CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DOCTOR_CHECKS.some((c) => c.level === "required")).toBe(true);
    expect(DOCTOR_CHECKS.some((c) => c.level === "recommended")).toBe(true);
    for (const id of ["readme", "license", "security", "ci", "support", "citation"]) {
      expect(ids).toContain(id);
    }
  });

  it("reports everything missing in an empty directory", async () => {
    const dir = await makeTempDir();
    const report = await runDoctor(dir);
    expect(report.passed).toBe(0);
    expect(report.total).toBe(DOCTOR_CHECKS.length);
    expect(report.missingRequired).toBe(
      DOCTOR_CHECKS.filter((c) => c.level === "required").length,
    );
    expect(report.results.every((r) => !r.ok && r.foundAt === undefined)).toBe(true);
  });

  it("passes every check on a fresh ossready scaffold", async () => {
    const dir = await makeTempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "doc-lib", githubOwner: "YasinzHyper" });
    const report = await runDoctor(dir);
    const failing = report.results.filter((r) => !r.ok).map((r) => r.id);
    expect(failing).toEqual([]);
    expect(report.passed).toBe(report.total);
    expect(formatDoctorReport(report)).toContain("Looks open-source ready");
  });

  it("finds community health files in .github/ and docs/ case-insensitively", async () => {
    const dir = await makeTempDir();
    await put(dir, ".github/security.md");
    await put(dir, "docs/CONTRIBUTING.md");
    await put(dir, "LICENSE.txt");
    const report = await runDoctor(dir);
    const byId = Object.fromEntries(report.results.map((r) => [r.id, r]));
    expect(byId.security.ok).toBe(true);
    expect(byId.security.foundAt).toBe(".github/security.md");
    expect(byId.contributing.foundAt).toBe("docs/CONTRIBUTING.md");
    expect(byId.license.foundAt).toBe("LICENSE.txt");
  });

  it("detects CI, CodeQL, and Scorecard by workflow contents", async () => {
    const dir = await makeTempDir();
    await put(dir, ".github/workflows/test.yaml", "on:\n  pull_request:\njobs: {}\n");
    await put(
      dir,
      ".github/workflows/security.yml",
      "on: [push]\njobs:\n  a:\n    steps:\n      - uses: github/codeql-action/init@v3\n      - uses: ossf/scorecard-action@v2.4.4\n",
    );
    const report = await runDoctor(dir);
    const byId = Object.fromEntries(report.results.map((r) => [r.id, r]));
    expect(byId.ci.ok).toBe(true);
    expect(byId.codeql.foundAt).toBe(".github/workflows/security.yml");
    expect(byId.scorecard.foundAt).toBe(".github/workflows/security.yml");
  });

  it("does not count ISSUE_TEMPLATE/config.yml alone as issue templates", async () => {
    const dir = await makeTempDir();
    await put(dir, ".github/ISSUE_TEMPLATE/config.yml", "blank_issues_enabled: false\n");
    let report = await runDoctor(dir);
    expect(report.results.find((r) => r.id === "issue-templates")?.ok).toBe(false);
    await put(dir, ".github/ISSUE_TEMPLATE/bug_report.yml", "name: Bug\n");
    report = await runDoctor(dir);
    expect(report.results.find((r) => r.id === "issue-templates")?.ok).toBe(true);
  });

  it("sets exit code 1 when required checks are missing and prints JSON", async () => {
    const dir = await makeTempDir();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });
    await doctorCommand(dir, { json: true });
    expect(process.exitCode).toBe(1);
    const parsed = JSON.parse(logs.join("\n")) as { ok: boolean; results: unknown[] };
    expect(parsed.ok).toBe(false);
    expect(parsed.results).toHaveLength(DOCTOR_CHECKS.length);
  });

  it("--strict fails on missing recommended checks only", async () => {
    const dir = await makeTempDir();
    for (const c of DOCTOR_CHECKS.filter((c) => c.level === "required")) {
      const content = c.id === "ci" ? "on:\n  push:\n" : "x\n";
      await put(dir, c.scaffoldPath, content);
    }
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });

    const report = await doctorCommand(dir);
    expect(report.missingRequired).toBe(0);
    expect(report.missingRecommended).toBeGreaterThan(0);
    expect(process.exitCode).toBeUndefined();
    expect(logs.join("\n")).toContain("⚠");

    await doctorCommand(dir, { strict: true });
    expect(process.exitCode).toBe(1);
  });

  it("throws for a missing directory", async () => {
    const dir = await makeTempDir();
    await expect(runDoctor(join(dir, "nope"))).rejects.toThrow(/does not exist/);
  });
});
