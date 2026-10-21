import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DOCTOR_CHECKS, PACKAGE_JSON_CHECKS, runDoctor } from "../src/commands/doctor.js";
import { runSync } from "../src/commands/sync.js";
import {
  bugReportTemplate,
  codeOfConductText,
  codeownersText,
  codeqlWorkflowText,
  dependabotYmlText,
  editorconfigText,
  featureRequestTemplate,
  issueTemplateConfigText,
  lockWorkflowText,
  publishWorkflowText,
  pullRequestTemplate,
  scorecardWorkflowText,
  securityMdText,
  staleWorkflowText,
} from "../src/templates/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Options ossready uses when dogfooding its own templates. */
const OSSREADY = { name: "ossready", cocEmail: "", githubOwner: "YasinzHyper" };

/** Repo-root files that must stay byte-identical to what ossready scaffolds. */
const DOGFOODED: Record<string, () => string> = {
  "CODE_OF_CONDUCT.md": () => codeOfConductText(OSSREADY),
  "SECURITY.md": () => securityMdText(OSSREADY),
  ".github/PULL_REQUEST_TEMPLATE.md": () => pullRequestTemplate(),
  ".github/CODEOWNERS": () => codeownersText(OSSREADY),
  ".github/dependabot.yml": () => dependabotYmlText(),
  ".editorconfig": () => editorconfigText(),
  ".github/workflows/codeql.yml": () => codeqlWorkflowText(),
  ".github/workflows/lock.yml": () => lockWorkflowText(),
  ".github/workflows/stale.yml": () => staleWorkflowText(),
  ".github/workflows/scorecard.yml": () => scorecardWorkflowText(),
  ".github/workflows/publish.yml": () => publishWorkflowText("npm"),
  ".github/ISSUE_TEMPLATE/bug_report.yml": () => bugReportTemplate(),
  ".github/ISSUE_TEMPLATE/feature_request.yml": () => featureRequestTemplate(),
  ".github/ISSUE_TEMPLATE/config.yml": () => issueTemplateConfigText(OSSREADY),
};

describe("ossready dogfoods its own scaffold", () => {
  it("passes every `ossready doctor` check on this repository", async () => {
    const report = await runDoctor(repoRoot);
    const failing = report.results.filter((r) => !r.ok).map((r) => [r.id, r.detail ?? r.hint]);
    expect(failing).toEqual([]);
    expect(report.passed).toBe(report.total);
  });

  it("runs the package.json, workflow-actions, readme-badges, and managed-files checks on itself (30/30)", async () => {
    const report = await runDoctor(repoRoot);
    expect(report.packageJson).toEqual({ status: "checked" });
    expect(report.results.filter((r) => r.group === "package-json").map((r) => r.id)).toEqual(
      PACKAGE_JSON_CHECKS.map((c) => c.id),
    );
    expect(report.workflowActions).toMatchObject({ status: "checked", outdated: [] });
    expect(report.results.filter((r) => r.group === "workflow-actions").map((r) => r.id)).toEqual([
      "workflow-actions",
    ]);
    expect(report.readmeBadges).toMatchObject({ status: "checked", state: "current", owner: "YasinzHyper" });
    expect(report.results.filter((r) => r.group === "readme-badges").map((r) => r.id)).toEqual([
      "readme-badges",
    ]);
    expect(report.managedFiles).toMatchObject({ status: "checked", stale: [] });
    expect(report.results.filter((r) => r.group === "managed-files").map((r) => r.id)).toEqual([
      "managed-files",
    ]);
    expect(report.total).toBe(DOCTOR_CHECKS.length + PACKAGE_JSON_CHECKS.length + 3);
    expect(report.total).toBe(30);
  });

  it("passes `ossready sync` (a dry run with nothing pending)", async () => {
    const report = await runSync(repoRoot);
    expect(report.options).toMatchObject({ name: "ossready", packageManager: "npm", githubOwner: "YasinzHyper" });
    const status = Object.fromEntries(report.files.map((f) => [f.path, f.status]));
    // ossready's own ci.yml is not the CI template: it adds the doctor / sync
    // dogfood steps, the scaffold e2e jobs, and the packed-install job. It has no
    // marker line, so sync reports it as skipped and never rewrites it.
    expect(status[".github/workflows/ci.yml"]).toBe("skipped");
    // ossready doesn't use these two templates; sync would create them only
    // with --add-missing.
    expect(status[".github/workflows/release.yml"]).toBe("missing");
    expect(status[".github/workflows/dependency-review.yml"]).toBe("missing");
    // The Markdown PR template and .editorconfig are managed too.
    expect(status[".github/PULL_REQUEST_TEMPLATE.md"]).toBe("up-to-date");
    expect(status[".editorconfig"]).toBe("up-to-date");
    for (const path of Object.keys(DOGFOODED).filter((p) => p in status)) {
      expect(status[path], path).toBe("up-to-date");
    }
    expect(report.files.filter((f) => f.status === "up-to-date")).toHaveLength(11);
    expect(report.pending).toBe(0);
  });

  for (const [path, render] of Object.entries(DOGFOODED)) {
    it(`keeps ${path} in sync with its template`, async () => {
      const actual = await readFile(join(repoRoot, path), "utf8");
      expect(actual, `${path} drifted from its template — regenerate it`).toBe(render());
    });
  }
});
