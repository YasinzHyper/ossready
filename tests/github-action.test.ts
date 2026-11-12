import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const actionYml = join(repoRoot, "action.yml");

/** The `run: |` blocks of action.yml, dedented, keyed by the step `name:` above them. */
function runBlocks(text: string): Map<string, string> {
  const lines = text.split("\n");
  const blocks = new Map<string, string>();
  let step = "";
  for (let i = 0; i < lines.length; i++) {
    const name = /^\s*- name:\s*(.+)$/.exec(lines[i]!)?.[1];
    if (name) step = name.trim();
    const run = /^(\s*)run: \|\s*$/.exec(lines[i]!);
    if (!run) continue;
    const indent = run[1]!.length;
    const body: string[] = [];
    for (i++; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trim() && line.length - line.trimStart().length <= indent) {
        i--;
        break;
      }
      body.push(line);
    }
    const pad = Math.min(
      ...body
        .filter((l) => l.trim())
        .map((l) => l.length - l.trimStart().length),
    );
    blocks.set(
      step,
      body
        .map((l) => l.slice(pad))
        .join("\n")
        .trimEnd() + "\n",
    );
  }
  return blocks;
}

/** `inputs:` names declared in action.yml. */
function inputNames(text: string): string[] {
  const section = /^inputs:\n([\s\S]*?)^\S/m.exec(text)?.[1] ?? "";
  return [...section.matchAll(/^ {2}([a-z-]+):$/gm)].map((m) => m[1]!);
}

let text: string;
let buildDir: string;
let doctorScript: string;

beforeAll(async () => {
  text = await readFile(actionYml, "utf8");
  doctorScript = runBlocks(text).get("ossready doctor")!;
  // Compile into a private dir (not dist/) so this file never races other
  // suites that build or run dist/. Inside node_modules so `cac` resolves.
  buildDir = await mkdtemp(
    join(repoRoot, "node_modules", ".ossready-action-test-"),
  );
  execFileSync(
    process.execPath,
    [
      join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
      "--outDir",
      join(buildDir, "dist"),
    ],
    {
      cwd: repoRoot,
      stdio: "pipe",
    },
  );
  await copyFile(
    join(repoRoot, "package.json"),
    join(buildDir, "package.json"),
  );
}, 120_000);

afterAll(async () => {
  if (buildDir) await rm(buildDir, { recursive: true, force: true });
});

type Inputs = Partial<
  Record<
    | "directory"
    | "strict"
    | "check"
    | "skip"
    | "config"
    | "job-summary"
    | "sarif-file",
    string
  >
>;

/** Run the action's doctor step the way the runner would: bash, inputs in env. */
async function runAction(inputs: Inputs) {
  const tmp = await mkdtemp(join(tmpdir(), "ossready-action-"));
  const outputFile = join(tmp, "output");
  const summaryFile = join(tmp, "summary");
  await writeFile(outputFile, "");
  await writeFile(summaryFile, "");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GITHUB_OUTPUT: outputFile,
    GITHUB_STEP_SUMMARY: summaryFile,
    OSSREADY_CLI: join(buildDir, "dist", "cli.js"),
    INPUT_DIRECTORY: inputs.directory ?? ".",
    INPUT_STRICT: inputs.strict ?? "false",
    INPUT_CHECK: inputs.check ?? "",
    INPUT_SKIP: inputs.skip ?? "",
    INPUT_CONFIG: inputs.config ?? "",
    INPUT_JOB_SUMMARY: inputs["job-summary"] ?? "true",
    INPUT_SARIF_FILE: inputs["sarif-file"] ?? "",
  };
  const r = spawnSync(
    "bash",
    ["--noprofile", "--norc", "-e", "-c", doctorScript],
    {
      cwd: repoRoot,
      env,
      encoding: "utf8",
    },
  );
  const outputs = Object.fromEntries(
    (await readFile(outputFile, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  return {
    status: r.status,
    stdout: r.stdout,
    outputs,
    summary: await readFile(summaryFile, "utf8"),
    tmp,
  };
}

describe("action.yml (GitHub Action)", () => {
  it("is a composite action with a build step and a doctor step", () => {
    expect(text).toMatch(/^runs:\n {2}using: composite$/m);
    const blocks = runBlocks(text);
    expect([...blocks.keys()]).toEqual([
      "Build ossready from this action's checkout",
      "ossready doctor",
    ]);
    expect(blocks.get("Build ossready from this action's checkout")).toContain(
      "npm install",
    );
    expect(
      blocks.get("Build ossready from this action's checkout"),
    ).not.toContain("npm ci");
  });

  it("never interpolates inputs inside run scripts (no shell injection)", () => {
    for (const [step, script] of runBlocks(text)) {
      expect(script, step).not.toContain("${{");
    }
  });

  it("passes every input to the doctor step through env", () => {
    const names = inputNames(text);
    expect(names).toEqual([
      "directory",
      "strict",
      "check",
      "skip",
      "config",
      "job-summary",
      "sarif-file",
    ]);
    for (const name of names) {
      const env = `INPUT_${name.toUpperCase().replace(/-/g, "_")}`;
      expect(text).toContain(`${env}: \${{ inputs.${name} }}`);
      expect(doctorScript).toContain(env);
    }
  });

  it("documents every input in the README", async () => {
    const readme = await readFile(join(repoRoot, "README.md"), "utf8");
    for (const name of inputNames(text))
      expect(readme).toContain(`| \`${name}\``);
  });

  it("passes on this repo, writes the job summary and a SARIF report", async () => {
    const sarifPath = join(
      await mkdtemp(join(tmpdir(), "ossready-action-sarif-")),
      "ossready.sarif",
    );
    const r = await runAction({ strict: "true", "sarif-file": sarifPath });
    expect(r.status, r.stdout).toBe(0);
    expect(r.outputs).toEqual({ "sarif-file": sarifPath, result: "passed" });
    expect(r.summary).toContain("ossready doctor");
    const sarif = JSON.parse(await readFile(sarifPath, "utf8")) as {
      version: string;
      runs: { results: unknown[] }[];
    };
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]!.results).toEqual([]);
  });

  it("fails on an empty repo and still writes the reports", async () => {
    const empty = await mkdtemp(join(tmpdir(), "ossready-action-empty-"));
    const sarifPath = join(empty, "out.sarif");
    const r = await runAction({ directory: empty, "sarif-file": sarifPath });
    expect(r.status).toBe(1);
    expect(r.outputs.result).toBe("failed");
    expect(r.summary).toMatch(/license/i);
    const sarif = JSON.parse(await readFile(sarifPath, "utf8")) as {
      runs: { results: unknown[] }[];
    };
    expect(sarif.runs[0]!.results.length).toBeGreaterThan(0);
  });

  it("honours check, skip and job-summary", async () => {
    const empty = await mkdtemp(join(tmpdir(), "ossready-action-filter-"));
    await writeFile(join(empty, "LICENSE"), "MIT License\n");
    const only = await runAction({
      directory: empty,
      check: "license",
      "job-summary": "false",
    });
    expect(only.status, only.stdout).toBe(0);
    expect(only.outputs).toEqual({ "sarif-file": "", result: "passed" });
    expect(only.summary).toBe("");

    const skipped = await runAction({
      directory: empty,
      check: "license,readme",
      skip: "readme",
    });
    expect(skipped.status, skipped.stdout).toBe(0);
  });

  it("reads check/skip from an explicit config file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-action-config-"));
    await mkdir(join(dir, "cfg"));
    await writeFile(join(dir, "LICENSE"), "MIT License\n");
    await writeFile(
      join(dir, "cfg", "ossready.json"),
      JSON.stringify({ check: ["license"] }),
    );
    const r = await runAction({
      directory: dir,
      config: join(dir, "cfg", "ossready.json"),
    });
    expect(r.status, r.stdout).toBe(0);
  });

  it("rejects a non-boolean strict / job-summary", async () => {
    const strict = await runAction({ strict: "yes" });
    expect(strict.status).toBe(1);
    expect(strict.stdout).toContain(
      "::error title=ossready::input `strict` must be true or false, got `yes`",
    );
    const summary = await runAction({ "job-summary": "1" });
    expect(summary.status).toBe(1);
    expect(summary.stdout).toContain(
      "input `job-summary` must be true or false",
    );
  });

  it("fails with result=failed on an unknown check id", async () => {
    const r = await runAction({ check: "nope" });
    expect(r.status).toBe(1);
    expect(r.outputs.result).toBe("failed");
  });
});
