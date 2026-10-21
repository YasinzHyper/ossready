import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initCommand } from "../src/commands/init.js";
import { runSync, syncCommand, type SyncReport } from "../src/commands/sync.js";
import {
  buildScaffoldFiles,
  ciWorkflowText,
  codeOfConductText,
  codeqlWorkflowText,
  contributingText,
  dependencyReviewWorkflowText,
  editorconfigText,
  issueTemplateConfigText,
  pullRequestTemplate,
  securityMdText,
  staleWorkflowText,
  type ScaffoldOptions,
} from "../src/templates/index.js";
import {
  isManaged,
  MANAGED_MARKER,
  MARKDOWN_MANAGED_MARKER,
  stripManagedMarker,
} from "../src/templates/managed.js";
import { diffStats, unifiedDiff } from "../src/utils/diff.js";
import { pathExists } from "../src/utils/fs.js";

const STALE = ".github/workflows/stale.yml";
const CODEQL = ".github/workflows/codeql.yml";
const CI = ".github/workflows/ci.yml";
const DEP_REVIEW = ".github/workflows/dependency-review.yml";
const ISSUE_CONFIG = ".github/ISSUE_TEMPLATE/config.yml";
const PR_TEMPLATE = ".github/PULL_REQUEST_TEMPLATE.md";

const MANAGED_PATHS = [
  ".editorconfig",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/dependabot.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/dependency-review.yml",
  ".github/workflows/lock.yml",
  ".github/workflows/publish.yml",
  ".github/workflows/release.yml",
  ".github/workflows/scorecard.yml",
  ".github/workflows/stale.yml",
];

const BASE: ScaffoldOptions = {
  name: "marker-app",
  description: "marker",
  license: "mit",
  packageManager: "npm",
  year: 2026,
  copyrightHolder: "Octo",
  cocEmail: "",
  githubOwner: "octo",
};

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-sync-"));
}

let logs: string[] = [];

beforeEach(async () => {
  // Keep the machine's `git config github.user` out of init's owner inference.
  vi.stubEnv("GIT_CONFIG_GLOBAL", join(await tempDir(), "gitconfig"));
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  logs = [];
  vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
    logs.push(String(msg));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
});

async function scaffold(
  opts: { packageManager?: ScaffoldOptions["packageManager"]; githubOwner?: string } = {},
): Promise<string> {
  const dir = await tempDir();
  await initCommand(dir, { name: "sync-lib", license: "mit", githubOwner: "octo", ...opts });
  logs.length = 0;
  return dir;
}

function file(report: SyncReport, path: string) {
  return report.files.find((f) => f.path === path);
}

async function outdateStale(dir: string): Promise<void> {
  const path = join(dir, STALE);
  const current = await readFile(path, "utf8");
  await writeFile(path, current.replace("actions/stale@v11", "actions/stale@v9"), "utf8");
}

describe("ossready marker line", () => {
  it("starts every template-owned file, and nothing else", () => {
    for (const packageManager of ["npm", "pnpm", "yarn", "bun"] as const) {
      const files = buildScaffoldFiles({ ...BASE, packageManager });
      const managed = files.filter((f) => isManaged(f.content));
      expect(managed.map((f) => f.path).sort(), packageManager).toEqual(MANAGED_PATHS);
      for (const f of managed) {
        const marker = f.path.endsWith(".md") ? `${MARKDOWN_MANAGED_MARKER}\n\n` : `${MANAGED_MARKER}\n`;
        expect(f.content.startsWith(marker), f.path).toBe(true);
      }
    }
    expect(stripManagedMarker(codeqlWorkflowText()).startsWith("name: CodeQL\n")).toBe(true);
    expect(stripManagedMarker(editorconfigText()).startsWith("root = true\n")).toBe(true);
    expect(stripManagedMarker("name: x\n")).toBe("name: x\n");
  });

  it("marks the PR template with an HTML comment and a blank line", () => {
    const text = pullRequestTemplate();
    expect(isManaged(text)).toBe(true);
    expect(text.startsWith(`${MARKDOWN_MANAGED_MARKER}\n\n## Summary\n`)).toBe(true);
    expect(stripManagedMarker(text).startsWith("## Summary\n")).toBe(true);
    expect(isManaged("<!-- Managed by ossready — older wording -->\n\n## x\n")).toBe(true);
    expect(isManaged("<!-- some other comment -->\n## x\n")).toBe(false);
    expect(isManaged("## Summary\n")).toBe(false);
  });

  it("leaves community docs with repo-specific or hand-edited content unmarked", () => {
    // Contact emails can't be recovered from the repo, and these are meant to be rewritten.
    expect(isManaged(securityMdText({ name: "x", githubOwner: "octo" }))).toBe(false);
    expect(isManaged(codeOfConductText({ name: "x", cocEmail: "", githubOwner: "octo" }))).toBe(false);
    expect(isManaged(contributingText(BASE))).toBe(false);
  });

  it("names `ossready sync` and doesn't claim edits get lost", () => {
    for (const marker of [MANAGED_MARKER, MARKDOWN_MANAGED_MARKER]) {
      expect(marker).toContain("Managed by ossready");
      expect(marker).toContain("`ossready sync`");
      expect(marker).toContain("edit freely");
      expect(marker).toContain("delete this line to opt out");
      expect(marker).not.toMatch(/overwrit|lost|do not edit|don't edit/i);
    }
    expect(MANAGED_MARKER.startsWith("# Managed by ossready")).toBe(true);
    expect(MARKDOWN_MANAGED_MARKER.startsWith("<!-- Managed by ossready")).toBe(true);
    expect(MARKDOWN_MANAGED_MARKER.endsWith(" -->")).toBe(true);
    // "--" is not allowed inside an HTML comment.
    expect(MARKDOWN_MANAGED_MARKER.slice(4, -3)).not.toContain("--");
  });
});

describe("unifiedDiff", () => {
  it("produces standard hunks with context and stats", () => {
    expect(unifiedDiff("a\nb\nc\n", "a\nB\nc\n", "x", "y")).toBe(
      "--- x\n+++ y\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n",
    );
    expect(unifiedDiff("same\n", "same\n", "x", "y")).toBe("");
    const old = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n") + "\n";
    const next = old.replace("l1\n", "L1\n").replace("l18\n", "L18\n");
    const diff = unifiedDiff(old, next, "x", "y");
    expect(diff.match(/^@@ /gm)).toHaveLength(2);
    expect(diff).toContain("@@ -1,5 +1,5 @@\n l0\n-l1\n+L1\n l2\n");
    expect(diffStats(old, next)).toEqual({ added: 2, removed: 2 });
    expect(diffStats("a\n", "a\nb\n")).toEqual({ added: 1, removed: 0 });
  });
});

describe("ossready sync", () => {
  for (const packageManager of ["npm", "pnpm", "yarn", "bun"] as const) {
    it(`reports a fresh ${packageManager} scaffold as up to date (exit 0)`, async () => {
      const dir = await scaffold({ packageManager });
      const report = await syncCommand(dir);
      expect(process.exitCode).toBeUndefined();
      expect(report.options).toEqual({ name: "sync-lib", packageManager, githubOwner: "octo" });
      expect(report.files.map((f) => f.path).sort()).toEqual(MANAGED_PATHS);
      expect(report.files.filter((f) => f.status !== "up-to-date")).toEqual([]);
      expect(report.pending).toBe(0);
      expect(report.written).toBe(0);
      const out = logs.join("\n");
      expect(out).toContain("ossready sync (dry run)");
      expect(out).toContain(`${CI} — up to date`);
      expect(out).toContain(`${PR_TEMPLATE} — up to date`);
      expect(out).toContain("Everything ossready manages is up to date.");
    });
  }

  it("never touches README, LICENSE, package.json, SECURITY, CODE_OF_CONDUCT, CONTRIBUTING or source", async () => {
    const dir = await scaffold();
    const before = await readFile(join(dir, "README.md"), "utf8");
    await writeFile(join(dir, "README.md"), `${before}\nlocal notes\n`, "utf8");
    await writeFile(join(dir, "src/index.ts"), "export const x = 1;\n", "utf8");
    await writeFile(join(dir, "SECURITY.md"), "# Our policy\n", "utf8");
    const report = await syncCommand(dir, { write: true, force: true, addMissing: true });
    const paths = report.files.map((f) => f.path);
    for (const p of [
      "README.md",
      "LICENSE",
      "package.json",
      "SECURITY.md",
      "CODE_OF_CONDUCT.md",
      "CONTRIBUTING.md",
      "src/index.ts",
    ]) {
      expect(paths).not.toContain(p);
    }
    expect(report.written).toBe(0);
    expect(await readFile(join(dir, "README.md"), "utf8")).toBe(`${before}\nlocal notes\n`);
    expect(await readFile(join(dir, "src/index.ts"), "utf8")).toBe("export const x = 1;\n");
    expect(await readFile(join(dir, "SECURITY.md"), "utf8")).toBe("# Our policy\n");
  });

  it("updates a stale managed PR template, and leaves one whose marker was deleted alone", async () => {
    const dir = await scaffold();
    const stale = pullRequestTemplate().replace("## Related issues", "## Linked issues");
    await writeFile(join(dir, PR_TEMPLATE), stale, "utf8");

    const report = await syncCommand(dir);
    expect(process.exitCode).toBe(1);
    expect(file(report, PR_TEMPLATE)).toMatchObject({ status: "outdated", pending: true, added: 1, removed: 1 });
    expect(file(report, PR_TEMPLATE)?.diff).toContain("\n-## Linked issues\n+## Related issues\n");
    expect(report.pending).toBe(1);

    process.exitCode = undefined;
    await syncCommand(dir, { write: true });
    expect(process.exitCode).toBeUndefined();
    expect(await readFile(join(dir, PR_TEMPLATE), "utf8")).toBe(pullRequestTemplate());

    // Opting out: delete the marker line (and edit freely).
    const own = `${stripManagedMarker(pullRequestTemplate())}\n## Screenshots\n`;
    await writeFile(join(dir, PR_TEMPLATE), own, "utf8");
    const optedOut = await syncCommand(dir, { write: true });
    expect(file(optedOut, PR_TEMPLATE)).toMatchObject({ status: "skipped", pending: false, written: false });
    expect(file(optedOut, PR_TEMPLATE)?.reason).toBe("not managed by ossready: no marker line; --force overwrites it");
    expect(await readFile(join(dir, PR_TEMPLATE), "utf8")).toBe(own);

    // An unmarked PR template identical to the template body can be adopted with --force.
    await writeFile(join(dir, PR_TEMPLATE), stripManagedMarker(pullRequestTemplate()), "utf8");
    const adoptable = await runSync(dir);
    expect(file(adoptable, PR_TEMPLATE)?.reason).toContain("matches the template, so --force safely adopts it");
    const adopted = await runSync(dir, { force: true, write: true });
    expect(file(adopted, PR_TEMPLATE)).toMatchObject({ status: "outdated", written: true, added: 2, removed: 0 });
    expect(await readFile(join(dir, PR_TEMPLATE), "utf8")).toBe(pullRequestTemplate());
  });

  it("shows a diff and exits 1 for an outdated managed workflow; --write fixes it and a rerun exits 0", async () => {
    const dir = await scaffold();
    await outdateStale(dir);

    const report = await syncCommand(dir);
    expect(process.exitCode).toBe(1);
    expect(file(report, STALE)).toMatchObject({
      status: "outdated",
      pending: true,
      written: false,
      added: 1,
      removed: 1,
    });
    const diff = file(report, STALE)?.diff ?? "";
    expect(diff).toContain(`--- a/${STALE}\n+++ b/${STALE}\n@@ `);
    expect(diff).toContain("\n-        uses: actions/stale@v9\n");
    expect(diff).toContain("\n+        uses: actions/stale@v11\n");
    expect(report.files.filter((f) => f.path !== STALE).every((f) => f.status === "up-to-date")).toBe(true);
    expect(report.pending).toBe(1);
    const out = logs.join("\n");
    expect(out).toContain(`~ ${STALE} — would update (+1 -1)`);
    expect(out).toContain("+        uses: actions/stale@v11");
    expect(out).toContain("Run `ossready sync --write` to apply 1 change.");
    // A dry run writes nothing.
    expect(await readFile(join(dir, STALE), "utf8")).toContain("actions/stale@v9");

    process.exitCode = undefined;
    logs.length = 0;
    const written = await syncCommand(dir, { write: true });
    expect(process.exitCode).toBeUndefined();
    expect(file(written, STALE)).toMatchObject({ status: "outdated", pending: true, written: true });
    expect(written.written).toBe(1);
    expect(logs.join("\n")).toContain(`${STALE} — updated (+1 -1)`);
    expect(await readFile(join(dir, STALE), "utf8")).toBe(staleWorkflowText());

    const again = await syncCommand(dir);
    expect(process.exitCode).toBeUndefined();
    expect(again.pending).toBe(0);
  });

  it("--quiet prints a summary line instead of the diff", async () => {
    const dir = await scaffold();
    await outdateStale(dir);
    await syncCommand(dir, { quiet: true });
    expect(process.exitCode).toBe(1);
    const out = logs.join("\n");
    expect(out).toContain(`${STALE} — would update (+1 -1)`);
    expect(out).not.toContain("@@ ");
    expect(out).not.toContain("actions/stale@v11");
  });

  it("skips a file without the marker line, and --force overwrites it", async () => {
    const dir = await scaffold();
    const custom = `${stripManagedMarker(codeqlWorkflowText())}# my own tweak\n`;
    await writeFile(join(dir, CODEQL), custom, "utf8");

    const report = await syncCommand(dir, { write: true });
    expect(process.exitCode).toBeUndefined();
    expect(file(report, CODEQL)).toMatchObject({ status: "skipped", pending: false, written: false });
    expect(file(report, CODEQL)?.reason).toBe("not managed by ossready: no marker line; --force overwrites it");
    const out = logs.join("\n");
    expect(out).toContain(`· ${CODEQL} — skipped (not managed by ossready`);
    expect(out).toContain("--force updates them too");
    expect(await readFile(join(dir, CODEQL), "utf8")).toBe(custom);

    const dry = await syncCommand(dir, { force: true });
    expect(process.exitCode).toBe(1);
    expect(file(dry, CODEQL)).toMatchObject({ status: "outdated", pending: true });
    expect(file(dry, CODEQL)?.diff).toContain(`\n+${MANAGED_MARKER}\n`);
    expect(file(dry, CODEQL)?.diff).toContain("\n-# my own tweak\n");

    process.exitCode = undefined;
    await syncCommand(dir, { force: true, write: true });
    expect(process.exitCode).toBeUndefined();
    expect(await readFile(join(dir, CODEQL), "utf8")).toBe(codeqlWorkflowText());
  });

  it("says when an unmarked file matches the template, so --force can adopt it", async () => {
    const dir = await scaffold();
    await writeFile(join(dir, CODEQL), stripManagedMarker(codeqlWorkflowText()), "utf8");
    const report = await runSync(dir);
    expect(file(report, CODEQL)).toMatchObject({ status: "skipped", pending: false });
    expect(file(report, CODEQL)?.reason).toContain("matches the template, so --force safely adopts it");
    const adopted = await runSync(dir, { force: true });
    expect(file(adopted, CODEQL)).toMatchObject({ status: "outdated", added: 1, removed: 0 });
  });

  it("reports missing files and creates them only with --add-missing", async () => {
    const dir = await scaffold();
    await rm(join(dir, DEP_REVIEW));

    const report = await syncCommand(dir, { write: true });
    expect(process.exitCode).toBeUndefined();
    expect(file(report, DEP_REVIEW)).toMatchObject({
      status: "missing",
      pending: false,
      written: false,
      reason: "would create only with --add-missing",
    });
    expect(logs.join("\n")).toContain(`+ ${DEP_REVIEW} — missing (would create only with --add-missing)`);
    expect(await pathExists(join(dir, DEP_REVIEW))).toBe(false);

    const dry = await syncCommand(dir, { addMissing: true });
    expect(process.exitCode).toBe(1);
    expect(file(dry, DEP_REVIEW)).toMatchObject({ status: "missing", pending: true, written: false });
    expect(await pathExists(join(dir, DEP_REVIEW))).toBe(false);

    process.exitCode = undefined;
    logs.length = 0;
    const created = await syncCommand(dir, { addMissing: true, write: true });
    expect(process.exitCode).toBeUndefined();
    expect(file(created, DEP_REVIEW)).toMatchObject({ status: "missing", written: true });
    expect(logs.join("\n")).toContain(`${DEP_REVIEW} — created`);
    expect(await readFile(join(dir, DEP_REVIEW), "utf8")).toBe(dependencyReviewWorkflowText());
    expect((await runSync(dir)).pending).toBe(0);
  });

  it("--json prints a machine-readable report", async () => {
    const dir = await scaffold();
    await outdateStale(dir);
    await syncCommand(dir, { json: true });
    expect(process.exitCode).toBe(1);
    const parsed = JSON.parse(logs.join("\n")) as SyncReport & { ok: boolean };
    expect(parsed).toMatchObject({
      ok: false,
      write: false,
      pending: 1,
      written: 0,
      options: { name: "sync-lib", packageManager: "npm", githubOwner: "octo" },
    });
    expect(parsed.files.map((f) => f.path).sort()).toEqual(MANAGED_PATHS);
    const stale = parsed.files.find((f) => f.path === STALE);
    expect(stale).toMatchObject({ status: "outdated", pending: true, written: false, added: 1, removed: 1 });
    expect(stale?.diff).toContain("+        uses: actions/stale@v11");
    expect(parsed.files.find((f) => f.path === CODEQL)).toEqual({
      path: CODEQL,
      status: "up-to-date",
      pending: false,
      written: false,
    });

    process.exitCode = undefined;
    logs.length = 0;
    await syncCommand(dir, { json: true, write: true, quiet: true });
    expect(process.exitCode).toBeUndefined();
    expect(JSON.parse(logs.join("\n"))).toMatchObject({ ok: true, write: true, pending: 1, written: 1 });
  });

  it("without a GitHub owner, compares against placeholders and never replaces a real owner", async () => {
    const dir = await scaffold({ githubOwner: undefined });
    const report = await syncCommand(dir);
    expect(process.exitCode).toBeUndefined();
    expect(report.options).toEqual({ name: "sync-lib", packageManager: "npm" });
    expect(report.pending).toBe(0);
    expect(file(report, ISSUE_CONFIG)?.status).toBe("up-to-date");
    expect(await readFile(join(dir, ISSUE_CONFIG), "utf8")).toContain("https://github.com/OWNER/sync-lib/");
    expect(logs.join("\n")).toContain("no GitHub owner");

    // A config.yml that already names a real owner can't be re-rendered without it.
    const real = issueTemplateConfigText({ name: "sync-lib", githubOwner: "someone" });
    await writeFile(join(dir, ISSUE_CONFIG), real, "utf8");
    const skipped = await syncCommand(dir, { write: true, force: true });
    expect(process.exitCode).toBeUndefined();
    expect(file(skipped, ISSUE_CONFIG)).toMatchObject({ status: "skipped", pending: false, written: false });
    expect(file(skipped, ISSUE_CONFIG)?.reason).toContain("--github-owner");
    expect(await readFile(join(dir, ISSUE_CONFIG), "utf8")).toBe(real);

    // --github-owner renders the real values: same owner is current, another one is an update.
    expect(file(await runSync(dir, { githubOwner: "someone" }), ISSUE_CONFIG)?.status).toBe("up-to-date");
    const other = await runSync(dir, { githubOwner: "other-org" });
    expect(file(other, ISSUE_CONFIG)).toMatchObject({ status: "outdated", pending: true });
    expect(file(other, ISSUE_CONFIG)?.diff).toContain(
      "+    url: https://github.com/other-org/sync-lib/security/advisories/new",
    );
    await expect(runSync(dir, { githubOwner: "-bad-" })).rejects.toThrow(/Invalid --github-owner/);
  });

  it("--package-manager overrides detection and is validated", async () => {
    const dir = await scaffold();
    const pnpm = await runSync(dir, { packageManager: "PNPM" });
    expect(pnpm.options.packageManager).toBe("pnpm");
    expect(file(pnpm, CI)).toMatchObject({ status: "outdated", pending: true });
    expect(file(pnpm, CI)?.diff).toContain("+      - uses: pnpm/action-setup@v6");
    await syncCommand(dir, { packageManager: "pnpm", write: true });
    expect(await readFile(join(dir, CI), "utf8")).toBe(ciWorkflowText({ ...BASE, packageManager: "pnpm" }));
    await expect(runSync(dir, { packageManager: "deno" })).rejects.toThrow("Use: npm | pnpm | yarn | bun");
    await expect(runSync(join(dir, "nope"))).rejects.toThrow(/does not exist/);
  });

  it("uses the lockfile over the managed ci.yml once one exists", async () => {
    const dir = await scaffold({ packageManager: "pnpm" });
    expect((await runSync(dir)).options.packageManager).toBe("pnpm");
    await writeFile(join(dir, "bun.lock"), "{}\n", "utf8");
    const bun = await runSync(dir);
    expect(bun.options.packageManager).toBe("bun");
    expect(file(bun, CI)?.status).toBe("outdated");
  });
});
