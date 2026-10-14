import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOCTOR_CHECKS,
  doctorCommand,
  formatDoctorReport,
  PACKAGE_JSON_CHECKS,
  runDoctor,
  type DoctorReport,
} from "../src/commands/doctor.js";
import { githubRepoFromUrl } from "../src/commands/fix.js";
import { initCommand } from "../src/commands/init.js";
import { detectLicenseSpdx } from "../src/commands/packageJson.js";
import { licenseText } from "../src/templates/license.js";
import { PACKAGE_MANAGERS, type ScaffoldOptions } from "../src/templates/types.js";

const PKG_IDS = [
  "pkg-name-version",
  "pkg-description",
  "pkg-license",
  "pkg-links",
  "pkg-engines",
  "pkg-files",
  "pkg-entry",
  "pkg-publish-access",
];

const READY = {
  name: "ready-lib",
  version: "1.2.3",
  description: "Ready to publish",
  license: "MIT",
  main: "./dist/index.js",
  types: "./dist/index.d.ts",
  exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" }, "./package.json": "./package.json" },
  bin: { ready: "./dist/cli.js" },
  files: ["dist"],
  engines: { node: ">=22.12" },
  repository: { type: "git", url: "git+https://github.com/octo/ready-lib.git" },
  bugs: { url: "https://github.com/octo/ready-lib/issues" },
  homepage: "https://github.com/octo/ready-lib#readme",
};

const MIT: ScaffoldOptions = {
  name: "x",
  description: "x",
  license: "mit",
  packageManager: "npm",
  year: 2026,
  copyrightHolder: "Octo",
  cocEmail: "",
};

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-pkg-"));
}

async function withPkg(pkg: unknown, extra: Record<string, string> = {}): Promise<string> {
  const dir = await tempDir();
  await writeFile(join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf8");
  for (const [rel, content] of Object.entries(extra)) {
    await mkdir(join(dir, rel, ".."), { recursive: true });
    await writeFile(join(dir, rel), content, "utf8");
  }
  return dir;
}

function byId(report: DoctorReport) {
  return Object.fromEntries(report.results.map((r) => [r.id, r]));
}

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

describe("doctor: package.json publish readiness", () => {
  it("exposes stable check ids that do not clash with the file checks", () => {
    expect(PACKAGE_JSON_CHECKS.map((c) => c.id)).toEqual(PKG_IDS);
    const fileIds = new Set(DOCTOR_CHECKS.map((c) => c.id));
    for (const id of PKG_IDS) expect(fileIds.has(id)).toBe(false);
  });

  it("is skipped without a package.json", async () => {
    const report = await runDoctor(await tempDir());
    expect(report.packageJson).toEqual({ status: "skipped", reason: "no package.json" });
    expect(report.results.some((r) => r.id.startsWith("pkg-"))).toBe(false);
    expect(report.total).toBe(DOCTOR_CHECKS.length);
    expect(formatDoctorReport(report)).toContain("npm publish readiness (package.json): skipped");
  });

  it('is skipped for "private": true packages and invalid JSON', async () => {
    const priv = await runDoctor(await withPkg({ name: "app", private: true }));
    expect(priv.packageJson.status).toBe("skipped");
    expect(priv.packageJson).toMatchObject({ reason: expect.stringContaining("private") });
    expect(priv.results.some((r) => r.id.startsWith("pkg-"))).toBe(false);

    const dir = await tempDir();
    await writeFile(join(dir, "package.json"), "{ nope", "utf8");
    const bad = await runDoctor(dir);
    expect(bad.packageJson).toMatchObject({ status: "skipped", reason: expect.stringContaining("not valid JSON") });
  });

  it("passes every check on a publish-ready package", async () => {
    const dir = await withPkg(READY, { LICENSE: licenseText(MIT) });
    const report = await runDoctor(dir);
    expect(report.packageJson).toEqual({ status: "checked" });
    const pkg = report.results.filter((r) => r.group === "package-json");
    expect(pkg.map((r) => r.id)).toEqual(PKG_IDS);
    expect(pkg.filter((r) => !r.ok).map((r) => [r.id, r.detail])).toEqual([]);
    expect(pkg.every((r) => r.level === "recommended")).toBe(true);
    expect(byId(report)["pkg-files"].foundAt).toBe("package.json#files");
    expect(report.total).toBe(DOCTOR_CHECKS.length + PKG_IDS.length);
  });

  it("flags a bare scoped package with actionable messages", async () => {
    const dir = await withPkg({ name: "@octo/bare" });
    const report = await runDoctor(dir);
    const r = byId(report);
    for (const id of PKG_IDS) expect(r[id].ok, id).toBe(false);
    expect(r["pkg-name-version"].detail).toContain('"version"');
    expect(r["pkg-description"].detail).toContain('"description"');
    expect(r["pkg-license"].detail).toContain('"license"');
    expect(r["pkg-links"].detail).toContain('"repository", "bugs", "homepage"');
    expect(r["pkg-links"].detail).toContain("--fix");
    expect(r["pkg-engines"].detail).toContain("engines");
    expect(r["pkg-files"].detail).toContain(".npmignore");
    expect(r["pkg-entry"].detail).toContain('"bin"');
    expect(r["pkg-publish-access"].detail).toContain('"access": "public"');
    // Recommended only: no exit code without --strict, failure with it.
    quiet();
    await doctorCommand(dir, {});
    expect(report.missingRecommended).toBeGreaterThanOrEqual(PKG_IDS.length);
    expect(formatDoctorReport(report)).toContain("⚠ publishConfig.access for scoped packages");
  });

  it("rejects non-semver versions", async () => {
    const report = await runDoctor(await withPkg({ ...READY, version: "latest" }));
    expect(byId(report)["pkg-name-version"]).toMatchObject({ ok: false, detail: expect.stringContaining("semver") });
  });

  it("checks the license against a recognisable LICENSE file", async () => {
    const mismatch = await runDoctor(await withPkg({ ...READY, license: "Apache-2.0" }, { LICENSE: licenseText(MIT) }));
    expect(byId(mismatch)["pkg-license"]).toMatchObject({ ok: false, detail: expect.stringContaining("LICENSE looks like MIT") });

    const apache = licenseText({ ...MIT, license: "apache-2.0" });
    expect(detectLicenseSpdx(apache)).toBe("Apache-2.0");
    const ok = await runDoctor(await withPkg({ ...READY, license: "apache-2.0" }, { LICENSE: apache }));
    expect(byId(ok)["pkg-license"].ok).toBe(true);

    // Unrecognised text or SPDX expressions are not second-guessed.
    const custom = await runDoctor(await withPkg({ ...READY, license: "ISC" }, { LICENSE: "Custom terms\n" }));
    expect(byId(custom)["pkg-license"].ok).toBe(true);
    const dual = await runDoctor(await withPkg({ ...READY, license: "(MIT OR Apache-2.0)" }, { LICENSE: licenseText(MIT) }));
    expect(byId(dual)["pkg-license"].ok).toBe(true);
  });

  it("accepts an .npmignore instead of files", async () => {
    const { files: _files, ...noFiles } = READY;
    const report = await runDoctor(await withPkg(noFiles, { ".npmignore": "src\ntests\n" }));
    expect(byId(report)["pkg-files"]).toMatchObject({ ok: true, foundAt: ".npmignore" });
  });

  it("flags entry points that point at sources, escape the package, or are not published", async () => {
    const ts = await runDoctor(await withPkg({ ...READY, main: "src/index.ts" }));
    expect(byId(ts)["pkg-entry"].detail).toContain('"main" (src/index.ts) points at TypeScript source');

    const outside = await runDoctor(await withPkg({ ...READY, bin: "../cli.js" }));
    expect(byId(outside)["pkg-entry"].detail).toContain("relative path inside the package");

    const unpublished = await runDoctor(await withPkg({ ...READY, bin: { ready: "./bin/ready.js" } }));
    expect(byId(unpublished)["pkg-entry"].detail).toContain('"bin.ready" (./bin/ready.js) is not included in "files"');

    const cliOnly = await runDoctor(
      await withPkg({ ...READY, main: undefined, exports: undefined, bin: "./dist/cli.js" }),
    );
    expect(byId(cliOnly)["pkg-entry"].ok).toBe(true);
  });

  it("accepts scoped packages with publishConfig.access", async () => {
    const report = await runDoctor(await withPkg({ ...READY, name: "@octo/ready", publishConfig: { access: "public" } }));
    expect(byId(report)["pkg-publish-access"].ok).toBe(true);
  });

  it("includes the checks and their status in --json", async () => {
    const dir = await withPkg({ ...READY, description: "" });
    const logs = quiet();
    await doctorCommand(dir, { json: true });
    const parsed = JSON.parse(logs.join("\n")) as {
      packageJson: { status: string };
      results: { id: string; ok: boolean; detail?: string; group?: string }[];
    };
    expect(parsed.packageJson.status).toBe("checked");
    const desc = parsed.results.find((r) => r.id === "pkg-description");
    expect(desc).toMatchObject({ ok: false, group: "package-json" });
    expect(desc?.detail).toContain("description");
  });
});

describe("doctor --fix and package.json", () => {
  it("parses owner and repo from GitHub URLs", () => {
    expect(githubRepoFromUrl("git+https://github.com/octo/thing.git")).toEqual({ owner: "octo", repo: "thing" });
    expect(githubRepoFromUrl("https://github.com/octo/thing#readme")).toEqual({ owner: "octo", repo: "thing" });
    expect(githubRepoFromUrl("git@github.com:octo/my.repo.git")).toEqual({ owner: "octo", repo: "my.repo" });
    expect(githubRepoFromUrl("https://gitlab.com/a/b")).toBeUndefined();
  });

  it("adds missing repository/bugs/homepage from the git remote without touching other values", async () => {
    const { repository: _r, bugs: _b, ...rest } = READY;
    const pkg = { ...rest, homepage: "https://ready.example.com" };
    const dir = await withPkg(pkg, {
      ".git/config": '[remote "origin"]\n\turl = git@github.com:remote-owner/ready-repo.git\n',
    });
    const logs = quiet();
    await doctorCommand(dir, { fix: true });
    const after = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(after.repository).toEqual({ type: "git", url: "git+https://github.com/remote-owner/ready-repo.git" });
    expect(after.bugs).toEqual({ url: "https://github.com/remote-owner/ready-repo/issues" });
    expect(after.homepage).toBe("https://ready.example.com");
    expect(after.version).toBe("1.2.3");
    expect(logs.join("\n")).toContain("Added to package.json: repository, bugs");
  });

  it("uses --github-owner and the package name when there is no remote", async () => {
    const dir = await withPkg({ name: "@octo/scoped-thing", version: "0.1.0" });
    quiet();
    await doctorCommand(dir, { fix: true, githubOwner: "octo" });
    const after = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(after.homepage).toBe("https://github.com/octo/scoped-thing#readme");
    const report = await runDoctor(dir);
    expect(byId(report)["pkg-links"].ok).toBe(true);
  });

  it("leaves package.json alone when the owner is unknown, and reports why", async () => {
    const dir = await withPkg({ name: "lonely", version: "0.1.0" });
    const before = await readFile(join(dir, "package.json"), "utf8");
    const logs = quiet();
    await doctorCommand(dir, { fix: true, json: true });
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(before);
    const parsed = JSON.parse(logs.join("\n")) as { fix: { skipped: { id: string; reason: string }[]; packageJson?: unknown } };
    expect(parsed.fix.packageJson).toBeUndefined();
    expect(parsed.fix.skipped.find((s) => s.id === "pkg-links")?.reason).toContain("--github-owner");
    expect(parsed.fix.skipped.find((s) => s.id === "pkg-engines")?.reason).toContain("edit package.json by hand");
  });

  it("--dry-run reports the package.json fields without writing", async () => {
    const dir = await withPkg({ name: "dry", version: "0.1.0" });
    const before = await readFile(join(dir, "package.json"), "utf8");
    const logs = quiet();
    await doctorCommand(dir, { fix: true, dryRun: true, githubOwner: "octo" });
    expect(await readFile(join(dir, "package.json"), "utf8")).toBe(before);
    expect(logs.join("\n")).toContain("Would add to package.json: repository, bugs, homepage");
  });
});

describe("fresh scaffolds are publish-ready", () => {
  for (const pm of PACKAGE_MANAGERS) {
    it(`passes doctor --strict for a ${pm} scaffold`, async () => {
      quiet();
      const dir = await tempDir();
      await initCommand(dir, { name: `pkg-${pm}`, packageManager: pm, githubOwner: "octo" });
      const report = await doctorCommand(dir, { strict: true });
      expect(report.packageJson).toEqual({ status: "checked" });
      expect(report.results.filter((r) => !r.ok).map((r) => [r.id, r.detail])).toEqual([]);
      expect(process.exitCode).toBeUndefined();
    });
  }
});
