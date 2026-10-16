import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DOCTOR_CHECKS, PACKAGE_JSON_CHECKS, runDoctor } from "../src/commands/doctor.js";
import {
  codeOfConductText,
  codeownersText,
  codeqlWorkflowText,
  dependabotYmlText,
  editorconfigText,
  pullRequestTemplate,
  securityMdText,
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
};

describe("ossready dogfoods its own scaffold", () => {
  it("passes every `ossready doctor` check on this repository", async () => {
    const report = await runDoctor(repoRoot);
    const failing = report.results.filter((r) => !r.ok).map((r) => [r.id, r.detail ?? r.hint]);
    expect(failing).toEqual([]);
    expect(report.passed).toBe(report.total);
  });

  it("runs the package.json and workflow-actions checks on itself (28/28)", async () => {
    const report = await runDoctor(repoRoot);
    expect(report.packageJson).toEqual({ status: "checked" });
    expect(report.results.filter((r) => r.group === "package-json").map((r) => r.id)).toEqual(
      PACKAGE_JSON_CHECKS.map((c) => c.id),
    );
    expect(report.workflowActions).toMatchObject({ status: "checked", outdated: [] });
    expect(report.results.filter((r) => r.group === "workflow-actions").map((r) => r.id)).toEqual([
      "workflow-actions",
    ]);
    expect(report.total).toBe(DOCTOR_CHECKS.length + PACKAGE_JSON_CHECKS.length + 1);
    expect(report.total).toBe(28);
  });

  for (const [path, render] of Object.entries(DOGFOODED)) {
    it(`keeps ${path} in sync with its template`, async () => {
      const actual = await readFile(join(repoRoot, path), "utf8");
      expect(actual, `${path} drifted from its template — regenerate it`).toBe(render());
    });
  }
});
