import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BADGES_END,
  BADGES_START,
  BADGES_WRITE_COMMAND,
  detectBadges,
  renderBadgeBlock,
} from "../src/commands/badges.js";
import {
  DOCTOR_CHECKS,
  README_BADGES_CHECK,
  doctorCommand,
  formatDoctorReport,
  runDoctor,
} from "../src/commands/doctor.js";
import { initCommand } from "../src/commands/init.js";
import { licenseText } from "../src/templates/license.js";
import { scaffoldBadgeBlock } from "../src/templates/readme.js";
import { PACKAGE_MANAGERS } from "../src/templates/types.js";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-readme-badges-"));
}

async function put(root: string, rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf8");
}

function quiet(): string[] {
  const logs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
    logs.push(String(msg));
  });
  return logs;
}

const MIT_LICENSE = licenseText({
  name: "badge-lib",
  description: "x",
  license: "mit",
  packageManager: "npm",
  year: 2026,
  copyrightHolder: "Octo",
  cocEmail: "",
});

// `private: true` keeps the npm publish-readiness checks (and npm badges) out of the way.
const PKG = {
  name: "badge-lib",
  private: true,
  description: "Badges",
  license: "MIT",
  repository: { type: "git", url: "git+https://github.com/octo/badge-lib.git" },
};

const ALL = ["ci", "npm-version", "npm-downloads", "license", "scorecard", "codeql"];

beforeEach(async () => {
  // Never let the machine's `git config github.user` leak into owner inference.
  vi.stubEnv("GIT_CONFIG_GLOBAL", join(await tempDir(), "gitconfig"));
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
});

describe("doctor readme-badges check", () => {
  it("is a recommended check that is skipped (not counted) without a root README.md", async () => {
    expect(README_BADGES_CHECK).toMatchObject({ id: "readme-badges", level: "recommended", group: "readme-badges" });
    expect(DOCTOR_CHECKS.some((c) => c.id === "readme-badges")).toBe(false);

    const report = await runDoctor(await tempDir());
    expect(report.readmeBadges).toEqual({ status: "skipped", reason: "no README.md" });
    expect(report.results.some((r) => r.id === "readme-badges")).toBe(false);
    expect(report.total).toBe(DOCTOR_CHECKS.length);
    expect(formatDoctorReport(report)).toContain("README badges: skipped — no README.md");
  });

  for (const packageManager of PACKAGE_MANAGERS) {
    it(`passes on a fresh ${packageManager} scaffold with an owner`, async () => {
      quiet();
      const dir = await tempDir();
      await initCommand(dir, { name: "rb-lib", githubOwner: "octo", packageManager });
      const report = await runDoctor(dir);
      expect(report.readmeBadges).toEqual({
        status: "checked",
        state: "current",
        owner: "octo",
        badges: ALL,
        needsOwner: [],
      });
      expect(report.results.find((r) => r.id === "readme-badges")).toMatchObject({ ok: true, foundAt: "README.md" });
      expect(formatDoctorReport(report)).toContain("✔ README badges (6 badges, current)");

      // The scaffold's block is exactly what `ossready badges` generates for it, right after the H1.
      const block = scaffoldBadgeBlock({ name: "rb-lib", license: "mit", githubOwner: "octo" });
      expect(block).toBe((await detectBadges(dir, { noGitConfig: true })).markdown);
      const readme = await readFile(join(dir, "README.md"), "utf8");
      expect(readme.startsWith(`# rb-lib\n\n${block}\n\n`)).toBe(true);
    });
  }

  it("passes on a scaffold without an owner, which only gets the npm and license badges", async () => {
    quiet();
    const dir = await tempDir();
    await initCommand(dir, { name: "rb-plain" });
    const report = await runDoctor(dir);
    expect(report.readmeBadges).toEqual({
      status: "checked",
      state: "current",
      badges: ["npm-version", "npm-downloads", "license"],
      needsOwner: ["ci", "scorecard", "codeql"],
    });
    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain(BADGES_START);
    expect(readme).toContain(BADGES_END);
    expect(readme).not.toContain("actions/workflows");
    expect(readme).not.toContain("OWNER");
  });

  it("passes on a scoped package scaffold (repo name without the scope)", async () => {
    quiet();
    const dir = await tempDir();
    await initCommand(dir, { name: "@octo/scoped-kit", githubOwner: "octo" });
    const report = await runDoctor(dir);
    expect(report.results.find((r) => r.id === "readme-badges")?.ok).toBe(true);
    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("https://github.com/octo/scoped-kit/actions/workflows/ci.yml/badge.svg");
    expect(readme).toContain("https://img.shields.io/npm/v/@octo/scoped-kit.svg");
  });

  it("warns when README.md has no badge markers, naming the command", async () => {
    const dir = await tempDir();
    await put(dir, "package.json", JSON.stringify(PKG));
    await put(dir, "LICENSE", MIT_LICENSE);
    await put(dir, "README.md", "# badge-lib\n\nHello\n");
    const report = await runDoctor(dir);
    expect(report.readmeBadges).toMatchObject({ status: "checked", state: "missing", owner: "octo" });
    const r = report.results.find((x) => x.id === "readme-badges");
    expect(r).toMatchObject({ ok: false, level: "recommended", group: "readme-badges" });
    expect(r?.detail).toContain(BADGES_START);
    expect(r?.detail).toContain("`ossready badges --write`");
    expect(formatDoctorReport(report)).toContain("⚠ README badges — README.md has no");
  });

  it("warns when the block is out of date", async () => {
    const dir = await tempDir();
    await put(dir, "package.json", JSON.stringify(PKG));
    await put(dir, "LICENSE", MIT_LICENSE);
    await put(dir, "README.md", `# badge-lib\n\n${renderBadgeBlock([])}\n\nHello\n`);
    const report = await runDoctor(dir);
    expect(report.readmeBadges).toMatchObject({ status: "checked", state: "outdated", badges: ["license"] });
    expect(report.results.find((x) => x.id === "readme-badges")?.detail).toContain(
      "doesn't match what `ossready badges` generates",
    );
  });

  it("warns on a half-marked README, and --fix leaves it alone", async () => {
    const dir = await tempDir();
    await put(dir, "package.json", JSON.stringify(PKG));
    const text = `# badge-lib\n\n${BADGES_START}\nstale\n`;
    await put(dir, "README.md", text);
    const report = await runDoctor(dir);
    expect(report.readmeBadges).toMatchObject({ status: "checked", state: "malformed" });
    expect(report.results.find((x) => x.id === "readme-badges")?.detail).toContain("fix the markers by hand");

    const logs = quiet();
    await doctorCommand(dir, { fix: true, dryRun: true, json: true });
    const parsed = JSON.parse(logs.join("\n")) as { fix: { skipped: { id: string; reason: string }[] } };
    expect(parsed.fix.skipped.find((s) => s.id === "readme-badges")?.reason).toContain("by hand");
    expect(await readFile(join(dir, "README.md"), "utf8")).toBe(text);
  });
});

describe("doctor --fix and readme-badges", () => {
  it("writes the block when the owner is inferable, keeps the README text, and then passes --strict", async () => {
    const dir = await tempDir();
    await put(dir, "package.json", JSON.stringify(PKG));
    await put(dir, "README.md", "# badge-lib\n\nHello\n");
    const logs = quiet();
    const report = await doctorCommand(dir, { fix: true, strict: true });
    expect(report.results.filter((r) => !r.ok).map((r) => [r.id, r.detail])).toEqual([]);
    expect(report.passed).toBe(report.total);
    expect(process.exitCode).toBeUndefined();
    expect(logs.join("\n")).toContain("README.md badge block inserted");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    const block = (await detectBadges(dir, { noGitConfig: true })).markdown;
    expect(readme).toBe(`# badge-lib\n\n${block}\n\nHello\n`);
    expect(block).toContain("https://github.com/octo/badge-lib/actions/workflows/ci.yml/badge.svg");

    // Second run: nothing left to do, no diff.
    quiet();
    await doctorCommand(dir, { fix: true, strict: true });
    expect(await readFile(join(dir, "README.md"), "utf8")).toBe(readme);
  });

  it("reports 'not fixed automatically' with the badges --write hint when there is no owner", async () => {
    const dir = await tempDir();
    await put(dir, "LICENSE", MIT_LICENSE);
    await put(dir, "README.md", "# lonely\n");

    const jsonLogs = quiet();
    await doctorCommand(dir, { fix: true, dryRun: true, json: true });
    const parsed = JSON.parse(jsonLogs.join("\n")) as {
      fix: { skipped: { id: string; reason: string }[]; readmeBadges?: unknown };
    };
    expect(parsed.fix.readmeBadges).toBeUndefined();
    expect(parsed.fix.skipped.find((s) => s.id === "readme-badges")?.reason).toBe(
      `could not infer the GitHub owner — run \`${BADGES_WRITE_COMMAND}\``,
    );
    vi.restoreAllMocks();

    const logs = quiet();
    await doctorCommand(dir, { fix: true });
    const out = logs.join("\n");
    expect(out).toContain("Not fixed automatically");
    expect(out).toContain(`readme-badges: could not infer the GitHub owner — run \`${BADGES_WRITE_COMMAND}\``);
    expect(await readFile(join(dir, "README.md"), "utf8")).toBe("# lonely\n");
    expect(BADGES_WRITE_COMMAND).toBe("ossready badges --write --github-owner <you>");
  });

  it("uses doctor --github-owner for the expected block, and --fix --github-owner fills it in", async () => {
    quiet();
    const dir = await tempDir();
    await initCommand(dir, { name: "rb-later" });
    expect((await runDoctor(dir)).results.find((r) => r.id === "readme-badges")?.ok).toBe(true);

    const withOwner = await runDoctor(dir, { githubOwner: "octo" });
    expect(withOwner.readmeBadges).toMatchObject({ status: "checked", state: "outdated", owner: "octo" });
    await expect(runDoctor(dir, { githubOwner: "-bad-" })).rejects.toThrow(/Invalid --github-owner/);

    const logs = quiet();
    const report = await doctorCommand(dir, { fix: true, githubOwner: "octo", strict: true });
    expect(report.results.filter((r) => !r.ok).map((r) => r.id)).toEqual([]);
    const out = logs.join("\n");
    expect(out).toContain("Added to package.json: repository, bugs, homepage");
    expect(out).toContain("README.md badge block updated");
    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("https://github.com/octo/rb-later/actions/workflows/ci.yml/badge.svg");
    expect(readme).toContain("https://scorecard.dev/viewer/?uri=github.com/octo/rb-later");

    // Without the flag, the owner now comes from the package.json links.
    process.exitCode = undefined;
    quiet();
    const plain = await doctorCommand(dir, { strict: true });
    expect(plain.passed).toBe(plain.total);
    expect(process.exitCode).toBeUndefined();
  });

  it("--dry-run reports the badge block without writing it", async () => {
    const dir = await tempDir();
    await put(dir, "package.json", JSON.stringify(PKG));
    await put(dir, "README.md", "# badge-lib\n");
    const logs = quiet();
    await doctorCommand(dir, { fix: true, dryRun: true });
    expect(logs.join("\n")).toContain("Would write the README.md badge block");
    expect(await readFile(join(dir, "README.md"), "utf8")).toBe("# badge-lib\n");
  });
});
