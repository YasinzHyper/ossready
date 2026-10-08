import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";
import { scorecardWorkflowText } from "../src/templates/github.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init scorecard scaffold", () => {
  it("exposes an idiomatic OpenSSF Scorecard workflow template", () => {
    const yml = scorecardWorkflowText();
    expect(yml).toContain("name: Scorecard supply-chain security");
    expect(yml).toContain("branch_protection_rule:");
    expect(yml).toContain('cron: "30 1 * * 6"');
    expect(yml).toContain("branches: [main]");
    expect(yml).toContain("permissions: read-all");
    expect(yml).toContain("security-events: write");
    expect(yml).toContain("id-token: write");
    expect(yml).toContain("actions/checkout@v7");
    expect(yml).toContain("persist-credentials: false");
    expect(yml).toContain("ossf/scorecard-action@v2.4.4");
    expect(yml).toContain("results_format: sarif");
    expect(yml).toContain("publish_results: true");
    expect(yml).toContain("actions/upload-artifact@v7");
    expect(yml).toContain("github/codeql-action/upload-sarif@v4");
  });

  it("writes scorecard.yml into new projects", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "scorecard-app",
      description: "Scorecard demo",
      license: "mit",
      packageManager: "npm",
    });

    const yml = await readFile(
      join(dir, ".github/workflows/scorecard.yml"),
      "utf8",
    );
    expect(yml).toContain("ossf/scorecard-action@v2.4.4");
    expect(yml).toContain("publish_results: true");
    expect(yml).toContain("id-token: write");
    expect(yml).toContain("actions/checkout@v7");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("OpenSSF Scorecard");
  });
});
