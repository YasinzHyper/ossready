import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DOCTOR_CHECKS,
  doctorCommand,
  formatDoctorReport,
  MANAGED_FILES_CHECK,
  runDoctor,
  type DoctorReport,
  type ManagedFileState,
} from "../src/commands/doctor.js";
import { initCommand } from "../src/commands/init.js";
import { codeqlWorkflowText, staleWorkflowText } from "../src/templates/index.js";
import { stripManagedMarker } from "../src/templates/managed.js";
import { pathExists } from "../src/utils/fs.js";

const STALE = ".github/workflows/stale.yml";
const CODEQL = ".github/workflows/codeql.yml";
const DEP_REVIEW = ".github/workflows/dependency-review.yml";
const PR_TEMPLATE = ".github/PULL_REQUEST_TEMPLATE.md";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-managed-"));
}

let logs: string[] = [];

beforeEach(async () => {
  // Keep the machine's `git config github.user` out of init's owner inference.
  vi.stubEnv("GIT_CONFIG_GLOBAL", join(await tempDir(), "gitconfig"));
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  logs = [];
  vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
    logs.push(String(msg));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
});

async function scaffold(): Promise<string> {
  const dir = await tempDir();
  await initCommand(dir, { name: "managed-lib", license: "mit", githubOwner: "octo" });
  logs.length = 0;
  return dir;
}

/** Change a setting in the managed stale.yml (no action pins, so workflow-actions stays green). */
async function outdateStale(dir: string): Promise<void> {
  const path = join(dir, STALE);
  const current = await readFile(path, "utf8");
  expect(current).toContain("days-before-issue-stale: 60");
  await writeFile(path, current.replace("days-before-issue-stale: 60", "days-before-issue-stale: 30"), "utf8");
}

function checked(report: DoctorReport) {
  if (report.managedFiles.status !== "checked") {
    throw new Error(`managed-files was skipped: ${report.managedFiles.reason}`);
  }
  return report.managedFiles;
}

function state(files: ManagedFileState[], path: string): ManagedFileState | undefined {
  return files.find((f) => f.path === path);
}

function managedCheck(report: DoctorReport) {
  return report.results.find((r) => r.id === "managed-files");
}

describe("doctor managed-files check", () => {
  it("passes on a fresh scaffold, counting the YAML and Markdown managed files", async () => {
    const dir = await scaffold();
    const report = await runDoctor(dir);
    expect(managedCheck(report)).toMatchObject({ ok: true, level: "recommended", group: "managed-files" });
    const mf = checked(report);
    expect(mf.stale).toEqual([]);
    expect(mf.files.every((f) => f.status === "up-to-date" && f.managed)).toBe(true);
    const managed = mf.files.map((f) => f.path);
    for (const p of [STALE, CODEQL, PR_TEMPLATE, ".editorconfig", ".github/dependabot.yml"]) {
      expect(managed).toContain(p);
    }
    expect(report.results.filter((r) => !r.ok).map((r) => r.id)).toEqual([]);
    expect(formatDoctorReport(report)).toContain(
      `✔ ${MANAGED_FILES_CHECK.label} (${managed.length} files with the ossready marker)`,
    );
  });

  it("warns on a stale managed workflow; --fix updates it and the rerun passes", async () => {
    const dir = await scaffold();
    await outdateStale(dir);

    const before = await runDoctor(dir);
    expect(before.results.filter((r) => !r.ok).map((r) => r.id)).toEqual(["managed-files"]);
    const check = managedCheck(before);
    expect(check?.detail).toContain(STALE);
    expect(check?.detail).toContain("`ossready sync --write`");
    expect(checked(before).stale).toEqual([STALE]);
    const text = formatDoctorReport(before);
    expect(text).toContain(`⚠ ${MANAGED_FILES_CHECK.label} — 1 stale:`);
    expect(text).toContain(`${STALE} (+1 -1)`);

    await doctorCommand(dir, { fix: true, strict: true });
    expect(process.exitCode).toBeUndefined();
    const out = logs.join("\n");
    expect(out).toContain("Updated stale ossready-managed files (1, as `ossready sync --write`):");
    expect(out).toContain(`~ ${STALE}`);
    expect(await readFile(join(dir, STALE), "utf8")).toBe(staleWorkflowText());

    const after = await runDoctor(dir);
    expect(managedCheck(after)?.ok).toBe(true);
    expect(after.passed).toBe(after.total);
  });

  it("--fix --dry-run lists the stale file without writing it", async () => {
    const dir = await scaffold();
    await outdateStale(dir);
    await doctorCommand(dir, { fix: true, dryRun: true, json: true });
    const parsed = JSON.parse(logs.join("\n")) as { fix: { managedFiles?: { update: string[] } } };
    expect(parsed.fix.managedFiles).toEqual({ update: [STALE] });
    expect(await readFile(join(dir, STALE), "utf8")).toContain("days-before-issue-stale: 30");
  });

  it("never fails on, or touches, unmarked customised files and missing files", async () => {
    const dir = await scaffold();
    const custom = `${stripManagedMarker(codeqlWorkflowText())}# my own tweak\n`;
    await writeFile(join(dir, CODEQL), custom, "utf8");
    await rm(join(dir, DEP_REVIEW));

    const report = await runDoctor(dir);
    expect(managedCheck(report)?.ok).toBe(true);
    const mf = checked(report);
    expect(state(mf.files, CODEQL)).toMatchObject({ status: "skipped", managed: false });
    expect(state(mf.files, CODEQL)?.reason).toContain("not managed by ossready");
    expect(state(mf.files, DEP_REVIEW)).toMatchObject({ status: "missing", managed: false });

    // A stale managed file is updated; the unmarked and missing ones are left alone.
    await outdateStale(dir);
    expect(checked(await runDoctor(dir)).stale).toEqual([STALE]);
    await doctorCommand(dir, { fix: true });
    expect(await readFile(join(dir, CODEQL), "utf8")).toBe(custom);
    expect(await pathExists(join(dir, DEP_REVIEW))).toBe(false);
    expect(await readFile(join(dir, STALE), "utf8")).toBe(staleWorkflowText());
    expect(managedCheck(await runDoctor(dir))?.ok).toBe(true);
  });

  it("is skipped (not counted) when no file carries the marker", async () => {
    const empty = await runDoctor(await tempDir());
    expect(empty.managedFiles).toEqual({ status: "skipped", reason: "no files carry the ossready marker line" });
    expect(empty.results.some((r) => r.id === "managed-files")).toBe(false);
    expect(empty.total).toBe(DOCTOR_CHECKS.length);

    const dir = await tempDir();
    await mkdir(join(dir, ".github"), { recursive: true });
    await writeFile(join(dir, ".github/dependabot.yml"), "version: 2\nupdates: []\n", "utf8");
    await writeFile(join(dir, PR_TEMPLATE), "## What changed\n", "utf8");
    const unmarked = await runDoctor(dir);
    expect(unmarked.managedFiles.status).toBe("skipped");
    expect(unmarked.results.some((r) => r.id === "managed-files")).toBe(false);
    expect(unmarked.total).toBe(DOCTOR_CHECKS.length);
    expect(formatDoctorReport(unmarked)).toContain(
      "ossready-managed files: skipped — no files carry the ossready marker line",
    );
  });

  it("--json includes the per-file status", async () => {
    const dir = await scaffold();
    await outdateStale(dir);
    await doctorCommand(dir, { json: true });
    // Recommended only: no failing exit code without --strict.
    expect(process.exitCode).toBeUndefined();
    const parsed = JSON.parse(logs.join("\n")) as {
      ok: boolean;
      managedFiles: { status: string; stale: string[]; files: ManagedFileState[] };
      results: { id: string; ok: boolean; group?: string; detail?: string }[];
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.managedFiles.status).toBe("checked");
    expect(parsed.managedFiles.stale).toEqual([STALE]);
    expect(state(parsed.managedFiles.files, STALE)).toEqual({
      path: STALE,
      status: "outdated",
      managed: true,
      added: 1,
      removed: 1,
    });
    expect(state(parsed.managedFiles.files, PR_TEMPLATE)).toEqual({
      path: PR_TEMPLATE,
      status: "up-to-date",
      managed: true,
    });
    expect(parsed.results.find((r) => r.id === "managed-files")).toMatchObject({
      ok: false,
      group: "managed-files",
    });
  });

  it("points the workflow-actions --fix hint at `ossready sync --write`", async () => {
    const dir = await tempDir();
    await mkdir(join(dir, ".github/workflows"), { recursive: true });
    await writeFile(
      join(dir, ".github/workflows/release.yml"),
      "on: [push]\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n",
      "utf8",
    );
    await doctorCommand(dir, { fix: true, dryRun: true, json: true, license: "mit" });
    const parsed = JSON.parse(logs.join("\n")) as {
      fix: { skipped: { id: string; reason: string }[]; managedFiles?: unknown };
    };
    const reason = parsed.fix.skipped.find((s) => s.id === "workflow-actions")?.reason;
    expect(reason).toMatch(/Dependabot \(github-actions ecosystem\)/);
    expect(reason).toContain("`ossready sync --write`");
    expect(parsed.fix.managedFiles).toBeUndefined();
  });
});
