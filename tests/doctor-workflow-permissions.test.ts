import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatDoctorMarkdown,
  formatDoctorReport,
  runDoctor,
  scanWorkflowActions,
  workflowPermissions,
} from "../src/commands/doctor.js";
import { planFix } from "../src/commands/fix.js";
import { formatDoctorSarif } from "../src/commands/sarif.js";
import { initCommand } from "../src/commands/init.js";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-wfp-"));
}

async function put(root: string, rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf8");
}

// Line numbers matter: keep one entry per line.
const NO_PERMS = [
  "name: CI", // 1
  "on: [push]", // 2
  "jobs:", // 3
  "  build:", // 4
  "    runs-on: ubuntu-latest", // 5
  "    steps:", // 6
  "      - run: |", // 7
  "          permissions: not-a-key", // 8 inside a block scalar
  "  test:", // 9
  "    permissions:", // 10
  "      contents: read", // 11
  "    runs-on: ubuntu-latest", // 12
  "  'lint': # quoted job key", // 13
  "    runs-on: ubuntu-latest", // 14
  "    steps:", // 15
  "      - with:", // 16
  "          permissions: write", // 17 a step input, not the job key
  "        uses: some/action@v1", // 18
  "",
].join("\n");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workflowPermissions", () => {
  it("finds a top-level permissions key", () => {
    expect(workflowPermissions("on: push\npermissions: read-all\njobs:\n  a:\n    runs-on: x\n").topLevel).toBe(true);
    expect(workflowPermissions("on: push\npermissions: {}\n").topLevel).toBe(true);
    expect(workflowPermissions('"permissions":\n  contents: read\n').topLevel).toBe(true);
  });

  it("reports each job and whether it declares its own permissions", () => {
    const p = workflowPermissions(NO_PERMS);
    expect(p.topLevel).toBe(false);
    expect(p.jobs).toEqual([
      { name: "build", line: 4, permissions: false },
      { name: "test", line: 9, permissions: true },
      { name: "lint", line: 13, permissions: false },
    ]);
  });

  it("ignores comments, CRLF line endings and permissions nested under other top-level keys", () => {
    const text = [
      "# permissions: read-all",
      "on:",
      "  push:",
      "env:",
      "  permissions: x",
      "jobs:",
      "  # comment",
      "    # deeper comment",
      "  a:",
      "    runs-on: x",
      "",
    ].join("\r\n");
    expect(workflowPermissions(text)).toEqual({
      topLevel: false,
      jobs: [{ name: "a", line: 9, permissions: false }],
    });
  });

  it("reports no jobs for flow-style jobs", () => {
    expect(workflowPermissions("on: push\njobs: { a: { runs-on: x } }\n").jobs).toEqual([]);
  });
});

describe("doctor workflow-permissions check", () => {
  it("passes a workflow with only job-level permissions, and flags uncovered jobs with their lines", async () => {
    const root = await tempDir();
    await put(root, ".github/workflows/ci.yml", NO_PERMS);
    await put(
      root,
      ".github/workflows/codeql.yml",
      "on: push\njobs:\n  analyze:\n    permissions:\n      security-events: write\n    runs-on: x\n",
    );
    await put(
      root,
      ".github/workflows/top.yaml",
      "on: push\npermissions:\n  contents: read\njobs:\n  a:\n    runs-on: x\n",
    );

    const status = await scanWorkflowActions(root);
    expect(status).toMatchObject({
      status: "checked",
      missingPermissions: [
        {
          file: ".github/workflows/ci.yml",
          jobs: [
            { name: "build", line: 4 },
            { name: "lint", line: 13 },
          ],
        },
      ],
    });

    const report = await runDoctor(root);
    const r = report.results.find((x) => x.id === "workflow-permissions");
    expect(r).toMatchObject({
      ok: false,
      level: "recommended",
      group: "workflow-actions",
    });
    expect(r?.detail).toContain(".github/workflows/ci.yml (jobs build:4, lint:13)");

    const plain = formatDoctorReport(report);
    expect(plain).toContain("⚠ Workflow token permissions — 1 workflow without permissions:");
    expect(plain).toContain("      .github/workflows/ci.yml (jobs build:4, lint:13)");
    expect(formatDoctorMarkdown(report)).toContain("(`workflow-permissions`) | recommended |");

    const sarif = formatDoctorSarif(report, {
      version: "0.0.0",
    }) as unknown as {
      runs: {
        results: {
          ruleId: string;
          level: string;
          locations: {
            physicalLocation: {
              artifactLocation: { uri: string };
              region?: { startLine: number };
            };
          }[];
        }[];
      }[];
    };
    const alerts = sarif.runs[0]!.results.filter((x) => x.ruleId === "workflow-permissions");
    expect(
      alerts.map((a) => [
        a.level,
        a.locations[0]!.physicalLocation.artifactLocation.uri,
        a.locations[0]!.physicalLocation.region?.startLine,
      ]),
    ).toEqual([
      ["warning", ".github/workflows/ci.yml", 4],
      ["warning", ".github/workflows/ci.yml", 13],
    ]);

    const plan = await planFix(report, {});
    expect(plan.skipped.find((s) => s.id === "workflow-permissions")?.reason).toContain(
      "1 workflow without `permissions:`",
    );
  });

  it("can be selected alone without printing the action-versions line", async () => {
    const root = await tempDir();
    await put(
      root,
      ".github/workflows/ci.yml",
      "on: push\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n",
    );
    const report = await runDoctor(root, { check: "workflow-permissions" });
    expect(report.results.map((r) => r.id)).toEqual(["workflow-permissions"]);
    const plain = formatDoctorReport(report);
    expect(plain).toContain("Workflow token permissions");
    expect(plain).not.toContain("Current GitHub Action versions");

    const versionsOnly = formatDoctorReport(await runDoctor(root, { check: "workflow-actions" }));
    expect(versionsOnly).toContain("Current GitHub Action versions");
    expect(versionsOnly).not.toContain("Workflow token permissions");
  });

  it("is skipped without workflow files", async () => {
    const report = await runDoctor(await tempDir());
    expect(report.results.some((r) => r.id === "workflow-permissions")).toBe(false);
  });

  it("passes every workflow a fresh ossready init scaffolds", async () => {
    const dir = await tempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "wfp-lib", githubOwner: "octo" });
    const report = await runDoctor(dir);
    expect(report.workflowActions).toMatchObject({
      status: "checked",
      missingPermissions: [],
    });
    expect(report.results.find((r) => r.id === "workflow-permissions")?.ok).toBe(true);
  });
});
