import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOCTOR_CHECKS,
  doctorCommand,
  findActionUses,
  formatDoctorReport,
  runDoctor,
  scanWorkflowActions,
} from "../src/commands/doctor.js";
import { initCommand } from "../src/commands/init.js";
import { classifyActionRef, refMajor } from "../src/templates/actions.js";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-wfa-"));
}

async function put(root: string, rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf8");
}

const SHA = "0123456789abcdef0123456789abcdef01234567";

// Line numbers matter: keep one entry per line.
const CI_YML = [
  "name: CI", // 1
  "on: [push]", // 2
  "jobs:", // 3
  "  build:", // 4
  "    runs-on: ubuntu-latest", // 5
  "    steps:", // 6
  "      - uses: actions/checkout@v4", // 7  outdated
  "      - uses: actions/setup-node@v7", // 8  current
  "      - uses: ./.github/actions/local", // 9  local, skipped
  "      - uses: docker://alpine:3.20", // 10 docker, skipped
  "      - uses: some-org/unknown-action@v1", // 11 unknown, ignored
  "      - name: CodeQL", // 12
  '        uses: "github/codeql-action/init@v3"', // 13 outdated (sub-action, quoted)
  `      - uses: actions/upload-artifact@${SHA} # v4`, // 14 SHA pin, info only
  "      - uses: ossf/scorecard-action@v2.4.4", // 15 same major as v2.5.0 → ok
  "",
].join("\n");

const RELEASE_YAML = [
  "name: Release", // 1
  "on:", // 2
  "  push:", // 3
  "jobs:", // 4
  "  release:", // 5
  "    steps:", // 6
  "      - uses: softprops/action-gh-release@v2", // 7 outdated
  "",
].join("\n");

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("doctor workflow-actions check", () => {
  it("parses uses: lines with line numbers, skipping local and docker actions", () => {
    expect(findActionUses(CI_YML)).toEqual([
      { line: 7, action: "actions/checkout", ref: "v4" },
      { line: 8, action: "actions/setup-node", ref: "v7" },
      { line: 11, action: "some-org/unknown-action", ref: "v1" },
      { line: 13, action: "github/codeql-action/init", ref: "v3" },
      { line: 14, action: "actions/upload-artifact", ref: SHA },
      { line: 15, action: "ossf/scorecard-action", ref: "v2.4.4" },
    ]);
  });

  it("classifies refs by major version against the recommended map", () => {
    expect(refMajor("v4")).toBe(4);
    expect(refMajor("v2.5.0")).toBe(2);
    expect(refMajor("main")).toBeUndefined();
    expect(classifyActionRef("actions/checkout", "v4")).toEqual({ kind: "outdated", recommended: "v7" });
    expect(classifyActionRef("actions/checkout", "v7").kind).toBe("current");
    expect(classifyActionRef("actions/checkout", "v8").kind).toBe("current");
    expect(classifyActionRef("actions/checkout", SHA).kind).toBe("sha");
    expect(classifyActionRef("actions/checkout", "main").kind).toBe("unversioned");
    expect(classifyActionRef("github/codeql-action/analyze", "v3").kind).toBe("outdated");
    expect(classifyActionRef("nobody/knows", "v1").kind).toBe("unknown");
  });

  it("flags outdated majors across multiple files with file:line, SHA pins as info only", async () => {
    const dir = await tempDir();
    await put(dir, ".github/workflows/ci.yml", CI_YML);
    await put(dir, ".github/workflows/release.yaml", RELEASE_YAML);
    await put(dir, ".github/workflows/notes.txt", "uses: actions/checkout@v1\n");

    const scan = await scanWorkflowActions(dir);
    expect(scan.status).toBe("checked");
    if (scan.status !== "checked") return;
    expect(scan.files).toEqual([".github/workflows/ci.yml", ".github/workflows/release.yaml"]);
    expect(scan.outdated.map((f) => `${f.action}@${f.ref}->${f.recommended}@${f.file}:${f.line}`)).toEqual([
      "actions/checkout@v4->v7@.github/workflows/ci.yml:7",
      "github/codeql-action/init@v3->v4@.github/workflows/ci.yml:13",
      "softprops/action-gh-release@v2->v3@.github/workflows/release.yaml:7",
    ]);
    expect(scan.shaPinned).toHaveLength(1);
    expect(scan.shaPinned[0]).toMatchObject({ action: "actions/upload-artifact", line: 14 });

    const report = await runDoctor(dir);
    const r = report.results.find((x) => x.id === "workflow-actions");
    expect(r).toMatchObject({ ok: false, level: "recommended", group: "workflow-actions" });
    expect(r?.detail).toContain("actions/checkout@v4 → v7 (.github/workflows/ci.yml:7)");
    expect(r?.detail).toContain("Dependabot");
    const text = formatDoctorReport(report);
    expect(text).toContain("softprops/action-gh-release@v2 → v3 (.github/workflows/release.yaml:7)");
    expect(text).toContain("1 SHA-pinned action not version-checked");
  });

  it("passes when every known action is current or SHA-pinned", async () => {
    const dir = await tempDir();
    await put(
      dir,
      ".github/workflows/ci.yml",
      `on: [push]\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v7\n      - uses: actions/setup-node@${SHA}\n      - uses: ./local\n`,
    );
    const report = await runDoctor(dir);
    const r = report.results.find((x) => x.id === "workflow-actions");
    expect(r).toMatchObject({ ok: true, foundAt: ".github/workflows" });
    expect(report.workflowActions).toMatchObject({ status: "checked", outdated: [] });
  });

  it("is skipped (not counted) without a workflows directory", async () => {
    const dir = await tempDir();
    const report = await runDoctor(dir);
    expect(report.workflowActions).toEqual({ status: "skipped", reason: "no .github/workflows/*.yml files" });
    expect(report.results.some((r) => r.id === "workflow-actions")).toBe(false);
    expect(report.total).toBe(DOCTOR_CHECKS.length);
    expect(formatDoctorReport(report)).toContain("GitHub Actions versions (workflows): skipped");
  });

  it("fails --strict, appears in --json, and --fix leaves workflows untouched", async () => {
    const dir = await tempDir();
    await put(dir, ".github/workflows/release.yaml", RELEASE_YAML);
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });
    await doctorCommand(dir, { json: true, fix: true, dryRun: true, license: "mit" });
    const parsed = JSON.parse(logs.join("\n")) as {
      workflowActions: { status: string; outdated: { line: number }[] };
      results: { id: string; ok: boolean }[];
      fix: { skipped: { id: string; reason: string }[] };
    };
    expect(parsed.workflowActions.status).toBe("checked");
    expect(parsed.workflowActions.outdated[0]?.line).toBe(7);
    expect(parsed.results.find((r) => r.id === "workflow-actions")?.ok).toBe(false);
    const skip = parsed.fix.skipped.find((s) => s.id === "workflow-actions");
    expect(skip?.reason).toMatch(/Dependabot \(github-actions ecosystem\)/);
  });

  for (const packageManager of ["npm", "pnpm", "yarn", "bun"] as const) {
    it(`passes on a fresh ${packageManager} scaffold`, async () => {
      const dir = await tempDir();
      vi.spyOn(console, "log").mockImplementation(() => {});
      await initCommand(dir, { name: "wfa-lib", githubOwner: "octo", packageManager });
      const report = await runDoctor(dir);
      expect(report.workflowActions).toMatchObject({ status: "checked", outdated: [], shaPinned: [] });
      expect(report.results.find((r) => r.id === "workflow-actions")?.ok).toBe(true);
      expect(report.results.filter((r) => !r.ok).map((r) => r.id)).toEqual([]);
    });
  }
});
