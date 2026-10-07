import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCTOR_CHECKS, doctorCommand, runDoctor } from "../src/commands/doctor.js";
import {
  FIX_FILES,
  githubOwnerFromUrl,
  inferScaffoldOptions,
  planFix,
  scaffoldLicense,
} from "../src/commands/fix.js";
import { pathExists } from "../src/utils/fs.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-fix-"));
}

async function put(root: string, rel: string, content = "x\n"): Promise<void> {
  const full = join(root, rel);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf8");
}

const PKG = {
  name: "legacy-lib",
  description: "An old library",
  license: "MIT",
  author: "Jane Doe <jane@example.com> (https://example.com)",
  repository: { type: "git", url: "git+https://github.com/jane-doe/legacy-lib.git" },
};

function quiet(): string[] {
  const logs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
    logs.push(String(msg));
  });
  return logs;
}

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("ossready doctor --fix", () => {
  it("maps every doctor check to scaffold files", () => {
    for (const check of DOCTOR_CHECKS) {
      expect(FIX_FILES[check.id], check.id).toBeDefined();
      expect(FIX_FILES[check.id]).toContain(check.scaffoldPath);
    }
  });

  it("parses GitHub owners and scaffoldable licenses", () => {
    expect(githubOwnerFromUrl("git+https://github.com/YasinzHyper/ossready.git")).toBe("YasinzHyper");
    expect(githubOwnerFromUrl("git@github.com:some-org/repo.git")).toBe("some-org");
    expect(githubOwnerFromUrl("github:octo/thing")).toBe("octo");
    expect(githubOwnerFromUrl("https://gitlab.com/a/b")).toBeUndefined();
    expect(scaffoldLicense("MIT")).toBe("mit");
    expect(scaffoldLicense("Apache-2.0")).toBe("apache-2.0");
    expect(scaffoldLicense("GPL-3.0")).toBeUndefined();
    expect(scaffoldLicense(undefined)).toBeUndefined();
  });

  it("infers options from package.json, lockfiles, and the git remote", async () => {
    const dir = await makeTempDir();
    await put(dir, "package.json", JSON.stringify(PKG));
    await put(dir, "pnpm-lock.yaml", "lockfileVersion: 9\n");
    const { options, licenseKnown } = await inferScaffoldOptions(dir);
    expect(licenseKnown).toBe(true);
    expect(options).toMatchObject({
      name: "legacy-lib",
      description: "An old library",
      license: "mit",
      packageManager: "pnpm",
      githubOwner: "jane-doe",
      author: "Jane Doe",
      copyrightHolder: "Jane Doe",
    });

    const bare = await makeTempDir();
    await put(bare, ".git/config", '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:remote-owner/x.git\n');
    const inferred = await inferScaffoldOptions(bare);
    expect(inferred.options.githubOwner).toBe("remote-owner");
    expect(inferred.licenseKnown).toBe(false);

    const overridden = await inferScaffoldOptions(dir, { githubOwner: "other", license: "apache-2.0" });
    expect(overridden.options.githubOwner).toBe("other");
    expect(overridden.options.license).toBe("apache-2.0");
    await expect(inferScaffoldOptions(dir, { license: "wtfpl" })).rejects.toThrow(/Invalid --license/);
    await expect(inferScaffoldOptions(dir, { githubOwner: "-bad-" })).rejects.toThrow(/Invalid --github-owner/);
  });

  it("fills every missing file so the repo passes doctor --strict", async () => {
    const dir = await makeTempDir();
    await put(dir, "package.json", JSON.stringify(PKG));
    const logs = quiet();

    const report = await doctorCommand(dir, { fix: true, strict: true });
    expect(report.passed).toBe(report.total);
    expect(process.exitCode).toBeUndefined();
    const out = logs.join("\n");
    expect(out).toContain("Created");
    expect(out).toContain("owner jane-doe");

    expect(await readFile(join(dir, "LICENSE"), "utf8")).toContain("Jane Doe");
    expect(await readFile(join(dir, ".github/CODEOWNERS"), "utf8")).toContain("@jane-doe");
    expect(await pathExists(join(dir, ".github/ISSUE_TEMPLATE/config.yml"))).toBe(true);
    // Only files tied to doctor checks are written — no package.json/src churn
    expect(await pathExists(join(dir, "src/index.ts"))).toBe(false);
    expect(await pathExists(join(dir, "tsconfig.json"))).toBe(false);
  });

  it("never overwrites existing files", async () => {
    const dir = await makeTempDir();
    await put(dir, "package.json", JSON.stringify(PKG));
    await put(dir, "README.md", "# My handwritten README\n");
    // config.yml alone does not satisfy the issue-templates check
    await put(dir, ".github/ISSUE_TEMPLATE/config.yml", "blank_issues_enabled: true\n");
    quiet();

    const before = await runDoctor(dir);
    const plan = await planFix(before);
    expect(plan.create).not.toContain("README.md");
    expect(plan.existing).toContain(".github/ISSUE_TEMPLATE/config.yml");
    expect(plan.create).toContain(".github/ISSUE_TEMPLATE/bug_report.yml");

    await doctorCommand(dir, { fix: true });
    expect(await readFile(join(dir, "README.md"), "utf8")).toBe("# My handwritten README\n");
    expect(await readFile(join(dir, ".github/ISSUE_TEMPLATE/config.yml"), "utf8")).toBe(
      "blank_issues_enabled: true\n",
    );
  });

  it("leaves LICENSE alone when the license is unknown", async () => {
    const dir = await makeTempDir();
    await put(dir, "package.json", JSON.stringify({ name: "mystery", license: "GPL-3.0-only" }));
    const logs = quiet();
    const report = await doctorCommand(dir, { fix: true });
    expect(await pathExists(join(dir, "LICENSE"))).toBe(false);
    expect(report.results.find((r) => r.id === "license")?.ok).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(logs.join("\n")).toMatch(/license: choosing a license is your call/);

    process.exitCode = undefined;
    await doctorCommand(dir, { fix: true, license: "apache-2.0" });
    expect(await readFile(join(dir, "LICENSE"), "utf8")).toContain("Apache License");
    expect(process.exitCode).toBeUndefined();
  });

  it("--dry-run writes nothing and reports the plan as JSON", async () => {
    const dir = await makeTempDir();
    await put(dir, "package.json", JSON.stringify(PKG));
    const logs = quiet();
    await doctorCommand(dir, { fix: true, dryRun: true, json: true });
    const parsed = JSON.parse(logs.join("\n")) as {
      ok: boolean;
      passed: number;
      fix: { create: string[]; skipped: unknown[] };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.passed).toBe(0);
    expect(parsed.fix.create).toContain("SECURITY.md");
    expect(parsed.fix.skipped).toEqual([]);
    expect(await pathExists(join(dir, "SECURITY.md"))).toBe(false);
  });
});
