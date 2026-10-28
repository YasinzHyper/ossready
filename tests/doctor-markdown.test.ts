import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { doctorCommand, formatDoctorMarkdown, markdownCell, runDoctor } from "../src/commands/doctor.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function captureLog(): string[] {
  const logs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
    logs.push(String(message));
  });
  return logs;
}

async function readmeOnlyRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ossready-doctor-md-"));
  await writeFile(join(dir, "README.md"), "# demo\n");
  return dir;
}

describe("formatDoctorMarkdown", () => {
  it("renders ossready's own report as a passing table, one row per check", async () => {
    const report = await runDoctor(repoRoot);
    const md = formatDoctorMarkdown(report);
    expect(md.split("\n")[0]).toBe(`## ossready doctor: ${report.passed}/${report.total} checks passed`);
    expect(report.passed).toBe(report.total);
    expect(md).toContain("✅ Looks open-source ready!");
    expect(md).toContain("| Status | Check | Level | Details |\n| --- | --- | --- | --- |");
    const rows = md.split("\n").filter((line) => line.startsWith("| ✅ | "));
    expect(rows).toHaveLength(report.total);
    for (const r of report.results) {
      expect(md).toContain(`| ✅ | ${r.label} (\`${r.id}\`) | ${r.level} | found: `);
    }
    // No absolute runner paths in job summaries.
    expect(md).not.toContain(report.directory);
  });

  it("marks missing required checks ❌, missing recommended ones ⚠️, and lists skipped groups", async () => {
    const report = await runDoctor(await readmeOnlyRepo());
    const md = formatDoctorMarkdown(report);
    expect(report.missingRequired).toBeGreaterThan(0);
    expect(md).toContain(
      `❌ Missing: ${report.missingRequired} required, ${report.missingRecommended} recommended. Run \`ossready doctor --fix\``,
    );
    const license = report.results.find((r) => r.id === "license");
    expect(license?.ok).toBe(false);
    expect(md).toContain(`| ❌ | ${license?.label} (\`license\`) | required | missing LICENSE. `);
    const changelog = report.results.find((r) => r.id === "changelog");
    expect(md).toContain(`| ⚠️ | ${changelog?.label} (\`changelog\`) | recommended | missing CHANGELOG.md. `);
    const readme = report.results.find((r) => r.id === "readme");
    expect(md).toContain(`| ✅ | ${readme?.label} (\`readme\`) | required | found: README.md |`);
    expect(md).toContain("Skipped (not counted):");
    expect(md).toContain("- npm publish readiness (`package.json`): ");
    expect(md).toContain("- GitHub Actions versions (`workflow-actions`): ");
  });

  it("keeps every row on one line and escapes backslashes then pipes", async () => {
    const report = await runDoctor(await readmeOnlyRepo());
    const first = report.results[0]!;
    report.results[0] = { ...first, ok: false, detail: "a | b\n  c" };
    const md = formatDoctorMarkdown(report);
    expect(md).toContain("| a \\| b c |");
    expect(markdownCell(" x|y \r\n z ")).toBe("x\\|y z");
    expect(markdownCell("a\\b|c")).toBe("a\\\\b\\|c");
  });
});

describe("doctorCommand --markdown", () => {
  it("prints only the Markdown report on stdout and keeps the exit code", async () => {
    const logs = captureLog();
    const report = await doctorCommand(repoRoot, { markdown: true });
    expect(logs).toEqual([formatDoctorMarkdown(report)]);
    expect(process.exitCode).toBeUndefined();
  });

  it("exits 1 when required checks are missing", async () => {
    const logs = captureLog();
    await doctorCommand(await readmeOnlyRepo(), { markdown: true });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/^## ossready doctor: \d+\/\d+ checks passed/);
    expect(process.exitCode).toBe(1);
  });

  it("sends the --fix plan to stderr so stdout stays Markdown", async () => {
    const logs = captureLog();
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((message?: unknown) => {
      errors.push(String(message));
    });
    await doctorCommand(await readmeOnlyRepo(), { markdown: true, fix: true, dryRun: true, license: "mit" });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/^## ossready doctor: /);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects --json together with --markdown", async () => {
    captureLog();
    await expect(doctorCommand(repoRoot, { json: true, markdown: true })).rejects.toThrow(
      "Use either --json or --markdown, not both.",
    );
  });
});
