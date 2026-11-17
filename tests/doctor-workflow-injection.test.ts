import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findScriptInjections,
  formatDoctorMarkdown,
  formatDoctorReport,
  runDoctor,
  scanWorkflowActions,
  untrustedContexts,
} from "../src/commands/doctor.js";
import { applyFix, planFix } from "../src/commands/fix.js";
import { formatDoctorSarif } from "../src/commands/sarif.js";
import { initCommand } from "../src/commands/init.js";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-wfi-"));
}

async function put(root: string, rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf8");
}

// Line numbers matter: keep one entry per line.
const TRIAGE = [
  "name: Triage", // 1
  "on: [issues, pull_request_target]", // 2
  "permissions:", // 3
  "  contents: read", // 4
  "jobs:", // 5
  "  greet:", // 6
  "    if: contains(github.event.issue.title, 'bug')", // 7 an if: is fine
  "    runs-on: ubuntu-latest", // 8
  "    env:", // 9
  "      TITLE: ${{ github.event.issue.title }}", // 10 env: is the fix
  "    steps:", // 11
  '      - run: echo "${{ github.event.issue.title }}"', // 12 inline run
  "      - name: Block", // 13
  "        run: |", // 14
  '          echo "$TITLE"', // 15 safe
  '          git checkout "${{ github.head_ref }}"', // 16 block scalar
  "          echo ${{ github.event.pull_request.number }}", // 17 a number: fine
  "      - uses: actions/github-script@v8", // 18
  "        with:", // 19
  "          body: ${{ github.event.comment.body }}", // 20 another action's input: not judged
  "          script: >-", // 21
  "            console.log(`${{ github.event.pull_request.head.ref }}`)", // 22 github-script
  "      - run: echo done # ${{ github.event.issue.body }}", // 23 still inside the run value
  "",
].join("\n");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("untrustedContexts", () => {
  it("matches GitHub's untrusted github.event fields and github.head_ref", () => {
    for (const ctx of [
      "github.head_ref",
      "github.event.issue.title",
      "github.event.issue.body",
      "github.event.pull_request.title",
      "github.event.pull_request.body",
      "github.event.discussion.title",
      "github.event.comment.body",
      "github.event.review.body",
      "github.event.review_comment.body",
      "github.event.head_commit.message",
      "github.event.head_commit.author.email",
      "github.event.head_commit.committer.name",
      "github.event.workflow_run.head_commit.message",
      "github.event.workflow_run.head_branch",
      "github.event.workflow_run.display_title",
      "github.event.pull_request.head.ref",
      "github.event.pull_request.head.label",
      "github.event.pull_request.head.repo.default_branch",
    ]) {
      expect(untrustedContexts(` ${ctx} `), ctx).toEqual([ctx]);
    }
  });

  it("normalises array and bracket access", () => {
    expect(untrustedContexts("github.event.commits[0].message")).toEqual(["github.event.commits.0.message"]);
    expect(untrustedContexts("github.event.commits.*.author.name")).toEqual(["github.event.commits.*.author.name"]);
    expect(untrustedContexts("github.event.pages[*].page_name")).toEqual(["github.event.pages.*.page_name"]);
    expect(untrustedContexts("github.event['issue']['title']")).toEqual(["github.event.issue.title"]);
    expect(untrustedContexts("toJSON(github . event . issue . body)")).toEqual(["github.event.issue.body"]);
  });

  it("ignores trusted fields and lookalikes", () => {
    for (const expr of [
      "github.event.issue.number",
      "github.event.pull_request.head.sha",
      "github.event.pull_request.base.ref",
      "github.event.repository.default_branch",
      "github.event.issue.title_length",
      "github.ref_name",
      "github.sha",
      "inputs.title",
      "env.TITLE",
      "mygithub.head_ref",
    ]) {
      expect(untrustedContexts(expr), expr).toEqual([]);
    }
  });

  it("reports each untrusted context once per expression, in order", () => {
    expect(
      untrustedContexts("format('{0} {1} {0}', github.event.issue.title, github.head_ref, github.event.issue.title)"),
    ).toEqual(["github.event.issue.title", "github.head_ref"]);
  });
});

describe("findScriptInjections", () => {
  it("finds untrusted values in inline and block run: values and github-script script: inputs", () => {
    expect(findScriptInjections(TRIAGE)).toEqual([
      { line: 12, key: "run", expression: "${{ github.event.issue.title }}", context: "github.event.issue.title" },
      { line: 16, key: "run", expression: "${{ github.head_ref }}", context: "github.head_ref" },
      {
        line: 22,
        key: "script",
        expression: "${{ github.event.pull_request.head.ref }}",
        context: "github.event.pull_request.head.ref",
      },
      { line: 23, key: "run", expression: "${{ github.event.issue.body }}", context: "github.event.issue.body" },
    ]);
  });

  it("ends a block scalar at the first line indented no deeper than its key, and handles CRLF and blank lines", () => {
    const text = [
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: |-",
      "          echo one",
      "",
      "          echo ${{ github.event.comment.body }}",
      "        env:",
      "          X: ${{ github.event.comment.body }}",
      '      - "run": echo ${{ github.event.review.body }}',
      "",
    ].join("\r\n");
    expect(findScriptInjections(text).map((f) => [f.line, f.context])).toEqual([
      [7, "github.event.comment.body"],
      [10, "github.event.review.body"],
    ]);
  });

  it("ignores comments and workflows without untrusted values", () => {
    expect(findScriptInjections("jobs:\n  a:\n    steps:\n      - run: echo ${{ github.sha }}\n")).toEqual([]);
    expect(findScriptInjections("      # run: echo ${{ github.event.issue.title }}\n")).toEqual([]);
    expect(findScriptInjections("      - run: # ${{ github.event.issue.title }}\n")).toEqual([]);
  });
});

describe("doctor workflow-injection check", () => {
  it("flags each untrusted value with its line in every output format, and --fix leaves it alone", async () => {
    const root = await tempDir();
    await put(root, ".github/workflows/triage.yml", TRIAGE);
    await put(
      root,
      ".github/workflows/ci.yaml",
      "on: push\npermissions: {}\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: echo ${{ github.ref_name }}\n",
    );

    const status = await scanWorkflowActions(root);
    expect(status).toMatchObject({ status: "checked", missingPermissions: [] });
    expect(status.status === "checked" && status.injections.map((f) => [f.file, f.line])).toEqual([
      [".github/workflows/triage.yml", 12],
      [".github/workflows/triage.yml", 16],
      [".github/workflows/triage.yml", 22],
      [".github/workflows/triage.yml", 23],
    ]);

    const report = await runDoctor(root);
    const r = report.results.find((x) => x.id === "workflow-injection");
    expect(r).toMatchObject({ ok: false, level: "recommended", group: "workflow-actions" });
    expect(r?.detail).toContain("github.event.issue.title in run: (.github/workflows/triage.yml:12)");
    expect(r?.detail).toContain("github.event.pull_request.head.ref in script: (.github/workflows/triage.yml:22)");
    expect(report.results.find((x) => x.id === "workflow-permissions")?.ok).toBe(true);

    const plain = formatDoctorReport(report);
    expect(plain).toContain("⚠ Workflow script injection — 4 untrusted values in scripts:");
    expect(plain).toContain("      github.head_ref in run: (.github/workflows/triage.yml:16)");
    expect(formatDoctorMarkdown(report)).toContain("(`workflow-injection`) | recommended |");

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
    const alerts = sarif.runs[0]!.results.filter((x) => x.ruleId === "workflow-injection");
    expect(alerts.map((a) => [a.level, a.locations[0]!.physicalLocation.region?.startLine])).toEqual([
      ["warning", 12],
      ["warning", 16],
      ["warning", 22],
      ["warning", 23],
    ]);
    expect(alerts[0]!.message.text).toContain("interpolates github.event.issue.title into a run: script");

    const plan = await planFix(report, {});
    expect(plan.skipped.find((s) => s.id === "workflow-injection")?.reason).toContain(
      "4 untrusted `${{ }}` values in `run:` / `script:`",
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    await applyFix(report, {});
    expect(await readFile(join(root, ".github/workflows/triage.yml"), "utf8")).toBe(TRIAGE);
  });

  it("can be selected or skipped on its own", async () => {
    const root = await tempDir();
    await put(root, ".github/workflows/t.yml", TRIAGE);
    const only = await runDoctor(root, { check: "workflow-injection" });
    expect(only.results.map((r) => r.id)).toEqual(["workflow-injection"]);
    const plain = formatDoctorReport(only);
    expect(plain).toContain("Workflow script injection");
    expect(plain).not.toContain("Workflow token permissions");

    const skipped = await runDoctor(root, { skip: "workflow-injection" });
    expect(skipped.results.some((r) => r.id === "workflow-injection")).toBe(false);
    expect(formatDoctorReport(skipped)).not.toContain("Workflow script injection");
  });

  it("is skipped without workflow files", async () => {
    const report = await runDoctor(await tempDir());
    expect(report.results.some((r) => r.id === "workflow-injection")).toBe(false);
  });

  it("passes every workflow a fresh ossready init scaffolds", async () => {
    const dir = await tempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "wfi-lib", githubOwner: "octo" });
    const report = await runDoctor(dir);
    expect(report.workflowActions).toMatchObject({ status: "checked", injections: [] });
    expect(report.results.find((r) => r.id === "workflow-injection")?.ok).toBe(true);
  });
});
