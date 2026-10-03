import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";
import { staleWorkflowText } from "../src/templates/github.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init stale scaffold", () => {
  it("exposes an idiomatic Stale workflow template", () => {
    const yml = staleWorkflowText();
    expect(yml).toContain("name: Stale");
    expect(yml).toContain('cron: "37 1 * * *"');
    expect(yml).toContain("workflow_dispatch:");
    expect(yml).toContain("issues: write");
    expect(yml).toContain("pull-requests: write");
    expect(yml).toContain("actions/stale@v9");
    expect(yml).toContain("days-before-issue-stale: 60");
    expect(yml).toContain("days-before-pr-stale: 90");
    expect(yml).toContain("days-before-issue-close: 14");
    expect(yml).toContain("days-before-pr-close: 14");
    expect(yml).toContain("exempt-issue-labels: pinned,security,good first issue");
    expect(yml).toContain("exempt-pr-labels: pinned,security,good first issue");
    expect(yml).toContain("exempt-all-milestones: true");
    expect(yml).toContain("stale-issue-message:");
    expect(yml).toContain("close-issue-message:");
    expect(yml).toContain("stale-pr-message:");
    expect(yml).toContain("close-pr-message:");
  });

  it("writes stale.yml into new projects", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "stale-app",
      description: "Stale demo",
      license: "mit",
      packageManager: "npm",
    });

    const yml = await readFile(
      join(dir, ".github/workflows/stale.yml"),
      "utf8",
    );
    expect(yml).toContain("actions/stale@v9");
    expect(yml).toContain('cron: "37 1 * * *"');
    expect(yml).toContain("issues: write");
    expect(yml).toContain("pull-requests: write");
    expect(yml).toContain("exempt-all-milestones: true");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("Stale workflow");
  });
});
