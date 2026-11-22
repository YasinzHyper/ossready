import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findUntrustedCheckouts,
  formatDoctorMarkdown,
  formatDoctorReport,
  runDoctor,
  scanWorkflowActions,
  workflowTriggers,
} from "../src/commands/doctor.js";
import { formatDoctorAnnotations } from "../src/commands/annotations.js";
import { applyFix, planFix } from "../src/commands/fix.js";
import { formatDoctorSarif } from "../src/commands/sarif.js";
import { initCommand } from "../src/commands/init.js";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-wuc-"));
}

async function put(root: string, rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf8");
}

// Line numbers matter: keep one entry per line.
const PREVIEW = [
  "name: Preview", // 1
  "on:", // 2
  "  pull_request_target:", // 3
  "    types: [opened, synchronize]", // 4
  "permissions:", // 5
  "  contents: read", // 6
  "jobs:", // 7
  "  build:", // 8
  "    runs-on: ubuntu-latest", // 9
  "    steps:", // 10
  "      - uses: actions/checkout@v5", // 11
  "        with:", // 12
  "          ref: ${{ github.event.pull_request.head.sha }} # the pwn request", // 13
  "      - name: Base branch is fine", // 14
  "        uses: actions/checkout@v5", // 15
  "        with:", // 16
  "          ref: ${{ github.event.pull_request.base.ref }}", // 17
  "      - name: Fork", // 18
  "        uses: actions/checkout@v5", // 19
  "        with:", // 20
  "          repository: ${{ github.event.pull_request.head.repo.full_name }}", // 21
  "          ref: ${{ github.head_ref }}", // 22
  "          persist-credentials: false", // 23
  "      - uses: actions/setup-node@v6", // 24
  "        with:", // 25
  "          ref: ${{ github.event.pull_request.head.sha }}", // 26 not a checkout step
  "      - run: echo ${{ github.event.pull_request.head.sha }}", // 27
  "",
].join("\n");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workflowTriggers", () => {
  it("reads scalar, flow list, flow map and block forms of on:", () => {
    expect(workflowTriggers("on: pull_request_target\njobs: {}\n")).toEqual(["pull_request_target"]);
    expect(workflowTriggers('"on": [push, "workflow_run"] # ci\n')).toEqual(["push", "workflow_run"]);
    expect(workflowTriggers("on: { issue_comment: { types: [created] }, push: {} }\n")).toEqual([
      "issue_comment",
      "push",
    ]);
    expect(workflowTriggers("on:\n  push:\n    branches: [main]\n  # pull_request_target:\n  workflow_run:\n    workflows: [CI]\njobs:\n")).toEqual([
      "push",
      "workflow_run",
    ]);
    expect(workflowTriggers("on:\n  - push\n  - pull_request_target\n")).toEqual(["push", "pull_request_target"]);
    expect(workflowTriggers("name: x\njobs: {}\n")).toEqual([]);
  });
});

describe("findUntrustedCheckouts", () => {
  it("flags checkout ref / repository inputs that name pull request code", () => {
    expect(findUntrustedCheckouts(PREVIEW)).toEqual([
      { line: 13, triggers: ["pull_request_target"], input: "ref", value: "${{ github.event.pull_request.head.sha }}" },
      {
        line: 21,
        triggers: ["pull_request_target"],
        input: "repository",
        value: "${{ github.event.pull_request.head.repo.full_name }}",
      },
      { line: 22, triggers: ["pull_request_target"], input: "ref", value: "${{ github.head_ref }}" },
    ]);
  });

  it("covers workflow_run head SHAs and refs/pull/ refs under issue_comment", () => {
    const wr = "on:\n  workflow_run:\n    workflows: [CI]\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v5\n        with:\n          ref: ${{ github.event.workflow_run.head_sha }}\n";
    expect(findUntrustedCheckouts(wr).map((f) => [f.line, f.triggers])).toEqual([[9, ["workflow_run"]]]);
    const ic = 'on: issue_comment\njobs:\n  a:\n    steps:\n      -   uses: "actions/checkout@v5"\n          with:\n            ref: "refs/pull/${{ github.event.issue.number }}/head"\n';
    expect(findUntrustedCheckouts(ic)).toEqual([
      { line: 7, triggers: ["issue_comment"], input: "ref", value: "refs/pull/${{ github.event.issue.number }}/head" },
    ]);
    const bracket = "on: pull_request_target\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v5\n        with:\n          ref: ${{ github.event['pull_request'].head.sha }}\n";
    expect(findUntrustedCheckouts(bracket).map((f) => f.line)).toEqual([7]);
  });

  it("ignores unprivileged triggers, base refs and other steps", () => {
    expect(findUntrustedCheckouts(PREVIEW.replace("pull_request_target:", "pull_request:"))).toEqual([]);
    expect(
      findUntrustedCheckouts(
        "on: pull_request_target\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v5\n      - uses: other/action@v1\n        with:\n          ref: ${{ github.head_ref }}\n",
      ),
    ).toEqual([]);
  });
});

describe("doctor workflow-untrusted-checkout check", () => {
  it("flags each checkout with its line in every output format, and --fix leaves it alone", async () => {
    const root = await tempDir();
    await put(root, ".github/workflows/preview.yml", PREVIEW);
    await put(
      root,
      ".github/workflows/ci.yml",
      "on: [push, pull_request]\npermissions: {}\njobs:\n  a:\n    runs-on: x\n    steps:\n      - uses: actions/checkout@v5\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n",
    );

    const status = await scanWorkflowActions(root);
    expect(status.status === "checked" && status.untrustedCheckouts.map((f) => [f.file, f.line])).toEqual([
      [".github/workflows/preview.yml", 13],
      [".github/workflows/preview.yml", 21],
      [".github/workflows/preview.yml", 22],
    ]);

    const report = await runDoctor(root);
    const r = report.results.find((x) => x.id === "workflow-untrusted-checkout");
    expect(r).toMatchObject({ ok: false, level: "recommended", group: "workflow-actions" });
    expect(r?.detail).toContain(
      "ref: ${{ github.event.pull_request.head.sha }} on pull_request_target (.github/workflows/preview.yml:13)",
    );
    expect(report.results.find((x) => x.id === "workflow-injection")?.ok).toBe(true);

    const plain = formatDoctorReport(report);
    expect(plain).toContain("⚠ Untrusted checkout in privileged workflows — 3 checkouts of pull request code:");
    expect(plain).toContain("      ref: ${{ github.head_ref }} on pull_request_target (.github/workflows/preview.yml:22)");
    expect(formatDoctorMarkdown(report)).toContain("(`workflow-untrusted-checkout`) | recommended |");

    const sarif = formatDoctorSarif(report, { version: "0.0.0" }) as unknown as {
      runs: {
        results: {
          ruleId: string;
          level: string;
          message: { text: string };
          locations: { physicalLocation: { artifactLocation: { uri: string }; region?: { startLine: number } } }[];
        }[];
      }[];
    };
    const alerts = sarif.runs[0]!.results.filter((x) => x.ruleId === "workflow-untrusted-checkout");
    expect(alerts.map((a) => [a.level, a.locations[0]!.physicalLocation.region?.startLine])).toEqual([
      ["warning", 13],
      ["warning", 21],
      ["warning", 22],
    ]);
    expect(alerts[0]!.message.text).toContain("checks out pull request code in a workflow triggered by pull_request_target");

    const annotations = formatDoctorAnnotations(report).join("\n");
    expect(annotations).toContain(
      "::warning file=.github/workflows/preview.yml,line=13,title=ossready workflow-untrusted-checkout (recommended)::",
    );

    const plan = await planFix(report, {});
    expect(plan.skipped.find((s) => s.id === "workflow-untrusted-checkout")?.reason).toContain(
      "3 checkouts of pull request code",
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    await applyFix(report, {});
    expect(await readFile(join(root, ".github/workflows/preview.yml"), "utf8")).toBe(PREVIEW);
  });

  it("can be selected or skipped on its own, and is skipped without workflows", async () => {
    const root = await tempDir();
    await put(root, ".github/workflows/p.yml", PREVIEW);
    const only = await runDoctor(root, { check: "workflow-untrusted-checkout" });
    expect(only.results.map((r) => r.id)).toEqual(["workflow-untrusted-checkout"]);
    expect(formatDoctorReport(only)).not.toContain("Workflow script injection");

    const skipped = await runDoctor(root, { skip: "workflow-untrusted-checkout" });
    expect(skipped.results.some((r) => r.id === "workflow-untrusted-checkout")).toBe(false);
    expect(formatDoctorReport(skipped)).not.toContain("Untrusted checkout");

    const none = await runDoctor(await tempDir());
    expect(none.results.some((r) => r.id === "workflow-untrusted-checkout")).toBe(false);
  });

  it("passes every workflow a fresh ossready init scaffolds", async () => {
    const dir = await tempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "wuc-lib", githubOwner: "octo" });
    const report = await runDoctor(dir);
    expect(report.workflowActions).toMatchObject({ status: "checked", untrustedCheckouts: [] });
    expect(report.results.find((r) => r.id === "workflow-untrusted-checkout")?.ok).toBe(true);
  });
});
