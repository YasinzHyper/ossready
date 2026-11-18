import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dependabotEcosystems,
  formatDoctorMarkdown,
  formatDoctorReport,
  readDependabotConfig,
  runDoctor,
  scanWorkflowActions,
} from "../src/commands/doctor.js";
import { applyFix, planFix } from "../src/commands/fix.js";
import { formatDoctorSarif } from "../src/commands/sarif.js";
import { initCommand } from "../src/commands/init.js";
import { dependabotYmlText } from "../src/templates/index.js";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-dba-"));
}

async function put(root: string, rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf8");
}

const WORKFLOW = "on: push\npermissions: {}\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: echo hi\n";

// Line numbers matter: keep one entry per line.
const NPM_ONLY = [
  "version: 2", // 1
  "# - package-ecosystem: github-actions (commented out: does not count)", // 2
  "updates:", // 3
  "  - package-ecosystem: npm", // 4
  '    directory: "/"', // 5
  "    schedule:", // 6
  "      interval: weekly", // 7
  "",
].join("\n");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dependabotEcosystems", () => {
  it("lists each package-ecosystem once, in order, with the updates: line", () => {
    expect(dependabotEcosystems(NPM_ONLY)).toEqual({ ecosystems: ["npm"], updatesLine: 3 });
    expect(
      dependabotEcosystems(
        [
          "version: 2",
          "updates: # all of them",
          '  - package-ecosystem: "npm"',
          "    directory: /a",
          "  - package-ecosystem: 'npm'",
          "    directory: /b",
          "  - directory: /",
          "    package-ecosystem: GitHub-Actions # case-insensitive",
        ].join("\r\n"),
      ),
    ).toEqual({ ecosystems: ["npm", "github-actions"], updatesLine: 2 });
  });

  it("returns no ecosystems (and no line) for an empty or unrelated file", () => {
    expect(dependabotEcosystems("")).toEqual({ ecosystems: [] });
    expect(dependabotEcosystems("version: 2\n  updates:\n")).toEqual({ ecosystems: [] });
  });

  it("finds github-actions in the dependabot.yml ossready scaffolds", () => {
    expect(dependabotEcosystems(dependabotYmlText()).ecosystems).toContain("github-actions");
  });
});

describe("readDependabotConfig", () => {
  it("reads .github/dependabot.yml, then .yaml, and is undefined without either", async () => {
    const root = await tempDir();
    expect(await readDependabotConfig(root)).toBeUndefined();
    await put(root, ".github/dependabot.yaml", NPM_ONLY);
    expect(await readDependabotConfig(root)).toEqual({
      file: ".github/dependabot.yaml",
      ecosystems: ["npm"],
      coversActions: false,
      line: 3,
    });
    await put(root, ".github/dependabot.yml", "version: 2\nupdates:\n  - package-ecosystem: github-actions\n");
    expect(await readDependabotConfig(root)).toMatchObject({ file: ".github/dependabot.yml", coversActions: true });
  });
});

describe("doctor dependabot-actions check", () => {
  it("flags a config without github-actions in every output format, and --fix leaves it alone", async () => {
    const root = await tempDir();
    await put(root, ".github/workflows/ci.yml", WORKFLOW);
    await put(root, ".github/dependabot.yml", NPM_ONLY);

    const status = await scanWorkflowActions(root);
    expect(status).toMatchObject({
      status: "checked",
      dependabot: { file: ".github/dependabot.yml", ecosystems: ["npm"], coversActions: false, line: 3 },
    });

    const report = await runDoctor(root);
    const r = report.results.find((x) => x.id === "dependabot-actions");
    expect(r).toMatchObject({ ok: false, level: "recommended", group: "workflow-actions" });
    expect(r?.detail).toContain(".github/dependabot.yml has no github-actions entry (ecosystems: npm)");
    expect(report.results.find((x) => x.id === "dependabot")?.ok).toBe(true);

    const plain = formatDoctorReport(report);
    expect(plain).toContain(
      "⚠ Dependabot updates for GitHub Actions — .github/dependabot.yml has no github-actions entry (ecosystems: npm)",
    );
    expect(formatDoctorMarkdown(report)).toContain("(`dependabot-actions`) | recommended |");

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
    const alerts = sarif.runs[0]!.results.filter((x) => x.ruleId === "dependabot-actions");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.level).toBe("warning");
    expect(alerts[0]!.locations[0]!.physicalLocation.artifactLocation.uri).toBe(".github/dependabot.yml");
    expect(alerts[0]!.locations[0]!.physicalLocation.region?.startLine).toBe(3);
    expect(alerts[0]!.message.text).toContain("never get update pull requests");

    const plan = await planFix(report, {});
    expect(plan.skipped.find((s) => s.id === "dependabot-actions")?.reason).toContain(
      ".github/dependabot.yml has no `github-actions` entry",
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    await applyFix(report, {});
    expect(await readFile(join(root, ".github/dependabot.yml"), "utf8")).toBe(NPM_ONLY);
  });

  it("passes when the config lists github-actions", async () => {
    const root = await tempDir();
    await put(root, ".github/workflows/ci.yml", WORKFLOW);
    await put(root, ".github/dependabot.yml", `${NPM_ONLY}  - package-ecosystem: github-actions\n    directory: "/"\n`);
    const report = await runDoctor(root, { check: "dependabot-actions" });
    expect(report.results).toMatchObject([{ id: "dependabot-actions", ok: true, foundAt: ".github/dependabot.yml" }]);
    const plain = formatDoctorReport(report);
    expect(plain).toContain("✔ Dependabot updates for GitHub Actions (.github/dependabot.yml)");
    expect(plain).not.toContain("Workflow script injection");
  });

  it("does not run without workflows or without a Dependabot config", async () => {
    const noWorkflows = await tempDir();
    await put(noWorkflows, ".github/dependabot.yml", NPM_ONLY);
    expect((await runDoctor(noWorkflows)).results.some((r) => r.id === "dependabot-actions")).toBe(false);

    const noConfig = await tempDir();
    await put(noConfig, ".github/workflows/ci.yml", WORKFLOW);
    const report = await runDoctor(noConfig);
    expect(report.results.some((r) => r.id === "dependabot-actions")).toBe(false);
    expect(report.results.find((r) => r.id === "dependabot")?.ok).toBe(false);
    expect(report.workflowActions).not.toHaveProperty("dependabot");
  });

  it("can be skipped on its own", async () => {
    const root = await tempDir();
    await put(root, ".github/workflows/ci.yml", WORKFLOW);
    await put(root, ".github/dependabot.yml", NPM_ONLY);
    const report = await runDoctor(root, { skip: "dependabot-actions" });
    expect(report.results.some((r) => r.id === "dependabot-actions")).toBe(false);
    expect(formatDoctorReport(report)).not.toContain("Dependabot updates for GitHub Actions");
  });

  it("passes the dependabot.yml a fresh ossready init scaffolds", async () => {
    const dir = await tempDir();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "dba-lib", githubOwner: "octo" });
    const report = await runDoctor(dir);
    expect(report.results.find((r) => r.id === "dependabot-actions")).toMatchObject({ ok: true });
  });
});
