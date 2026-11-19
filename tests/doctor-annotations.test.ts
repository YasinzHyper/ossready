import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  annotationCommand,
  annotationPrefix,
  doctorAnnotations,
  escapeAnnotationData,
  escapeAnnotationProperty,
  formatAnnotation,
  formatDoctorAnnotations,
} from "../src/commands/annotations.js";
import { doctorCommand, formatDoctorReport, runDoctor } from "../src/commands/doctor.js";
import { initCommand } from "../src/commands/init.js";
import { runCli } from "../src/program.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

beforeEach(async () => {
  // Keep the machine's `git config github.user` out of init's owner inference.
  vi.stubEnv("GIT_CONFIG_GLOBAL", join(await mkdtemp(join(tmpdir(), "ossready-annot-git-")), "gitconfig"));
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

/** `<tmp>/pkg`: README plus one workflow with an outdated `actions/checkout` pin on line 6. */
async function outdatedRepo(): Promise<{ parent: string; dir: string }> {
  const parent = await mkdtemp(join(tmpdir(), "ossready-annot-"));
  const dir = join(parent, "pkg");
  await mkdir(join(dir, ".github", "workflows"), { recursive: true });
  await writeFile(join(dir, "README.md"), "# demo\n");
  await writeFile(
    join(dir, ".github", "workflows", "ci.yml"),
    "on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n",
  );
  return { parent, dir };
}

describe("annotation helpers", () => {
  it("maps required checks to ::error and recommended checks to ::warning", () => {
    expect(annotationCommand("required")).toBe("error");
    expect(annotationCommand("recommended")).toBe("warning");
  });

  it("escapes messages and properties like @actions/core", () => {
    expect(escapeAnnotationData("100% done\r\nnext: a, b")).toBe("100%25 done%0D%0Anext: a, b");
    expect(escapeAnnotationProperty("a:b,c%\n")).toBe("a%3Ab%2Cc%25%0A");
  });

  it("prefixes paths with the audited directory only when it is inside cwd", () => {
    expect(annotationPrefix("/repo", "/repo")).toBe("");
    expect(annotationPrefix("/repo/packages/lib", "/repo")).toBe("packages/lib/");
    expect(annotationPrefix("/elsewhere", "/repo")).toBe("");
    expect(annotationPrefix("/repo-other", "/repo")).toBe("");
  });

  it("formats file, optional line and title properties", () => {
    expect(
      formatAnnotation({
        command: "warning",
        checkId: "workflow-actions",
        file: ".github/workflows/ci.yml",
        line: 6,
        title: "ossready workflow-actions (recommended)",
        message: "actions/checkout@v3 is old",
      }),
    ).toBe(
      "::warning file=.github/workflows/ci.yml,line=6,title=ossready workflow-actions (recommended)::actions/checkout@v3 is old",
    );
    expect(
      formatAnnotation({ command: "error", checkId: "license", file: "LICENSE", title: "t", message: "m" }),
    ).toBe("::error file=LICENSE,title=t::m");
  });
});

describe("doctorAnnotations", () => {
  it("has nothing to say about ossready itself", async () => {
    expect(formatDoctorAnnotations(await runDoctor(repoRoot), { cwd: repoRoot })).toEqual([]);
  });

  it("annotates every failing check, with workflow lines and the directory prefix", async () => {
    const { parent, dir } = await outdatedRepo();
    const report = await runDoctor(dir);
    const annotations = doctorAnnotations(report, { cwd: parent });
    const failing = report.results.filter((r) => !r.ok).map((r) => r.id);
    expect([...new Set(annotations.map((a) => a.checkId))]).toEqual(failing);
    expect(annotations.every((a) => a.file.startsWith("pkg/"))).toBe(true);

    const license = annotations.find((a) => a.checkId === "license")!;
    expect(license).toMatchObject({ command: "error", file: "pkg/LICENSE", title: "ossready license (required)" });
    expect(license.line).toBeUndefined();

    const checkout = annotations.find((a) => a.checkId === "workflow-actions")!;
    expect(checkout).toMatchObject({ command: "warning", file: "pkg/.github/workflows/ci.yml", line: 6 });
    expect(checkout.message).toContain("actions/checkout@v3");

    const permissions = annotations.find((a) => a.checkId === "workflow-permissions")!;
    expect(permissions).toMatchObject({ file: "pkg/.github/workflows/ci.yml", line: 3 });

    // Run from inside the audited directory: no prefix.
    expect(doctorAnnotations(report, { cwd: dir }).find((a) => a.checkId === "license")!.file).toBe("LICENSE");
  });

  it("has no annotations for a fresh scaffold with an owner", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-annot-init-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "annot-lib", license: "mit", githubOwner: "octo" });
    expect(formatDoctorAnnotations(await runDoctor(dir), { cwd: dir })).toEqual([]);
  });
});

describe("doctorCommand --annotations", () => {
  it("prints workflow commands, then the plain report, and keeps the exit code", async () => {
    const { parent, dir } = await outdatedRepo();
    vi.spyOn(process, "cwd").mockReturnValue(parent);
    const logs = captureLog();
    const report = await doctorCommand("pkg", { annotations: true });
    const annotations = formatDoctorAnnotations(report, { cwd: parent });
    expect(annotations.length).toBeGreaterThan(0);
    expect(logs).toEqual([...annotations, formatDoctorReport(report)]);
    expect(logs.slice(0, -1).every((l) => /^::(error|warning) file=pkg\//.test(l))).toBe(true);
    expect(report.directory).toBe(dir);
    expect(process.exitCode).toBe(1);
  });

  it("only prints the report when every check passes", async () => {
    const logs = captureLog();
    const report = await doctorCommand(repoRoot, { annotations: true, strict: true });
    expect(logs).toEqual([formatDoctorReport(report)]);
    expect(process.exitCode).toBeUndefined();
  });

  it("rejects --annotations with another output format", async () => {
    await expect(doctorCommand(repoRoot, { json: true, annotations: true })).rejects.toThrow(
      "Use either --json or --annotations, not both.",
    );
    await expect(doctorCommand(repoRoot, { sarif: true, annotations: true })).rejects.toThrow(
      "Use either --sarif or --annotations, not both.",
    );
  });

  it("is wired into the CLI", async () => {
    const logs = captureLog();
    await runCli(["node", "ossready", "doctor", repoRoot, "--annotations", "--check", "readme"]);
    expect(logs.some((l) => l.includes("ossready doctor →"))).toBe(true);
    expect(logs.some((l) => l.startsWith("::"))).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });
});
