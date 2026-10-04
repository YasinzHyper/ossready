import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";
import { lockWorkflowText } from "../src/templates/github.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init lock scaffold", () => {
  it("exposes an idiomatic Lock Threads workflow template", () => {
    const yml = lockWorkflowText();
    expect(yml).toContain("name: Lock Threads");
    expect(yml).toContain('cron: "42 2 * * *"');
    expect(yml).toContain("workflow_dispatch:");
    expect(yml).toContain("issues: write");
    expect(yml).toContain("pull-requests: write");
    expect(yml).toContain("dessant/lock-threads@v6");
    expect(yml).toContain('process-only: "issues, prs"');
    expect(yml).toContain('issue-inactive-days: "45"');
    expect(yml).toContain('pr-inactive-days: "45"');
    expect(yml).toContain('exclude-any-issue-labels: "pinned,security,good first issue"');
    expect(yml).toContain('exclude-any-pr-labels: "pinned,security,good first issue"');
    expect(yml).toContain("issue-comment:");
    expect(yml).toContain("pr-comment:");
    expect(yml).toContain("issue-lock-reason: resolved");
    expect(yml).toContain("pr-lock-reason: resolved");
  });

  it("writes lock.yml into new projects", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "lock-app",
      description: "Lock demo",
      license: "mit",
      packageManager: "npm",
    });

    const yml = await readFile(
      join(dir, ".github/workflows/lock.yml"),
      "utf8",
    );
    expect(yml).toContain("dessant/lock-threads@v6");
    expect(yml).toContain('cron: "42 2 * * *"');
    expect(yml).toContain("issues: write");
    expect(yml).toContain("pull-requests: write");
    expect(yml).toContain('issue-inactive-days: "45"');
    expect(yml).toContain('process-only: "issues, prs"');

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("Lock Threads workflow");
  });
});
