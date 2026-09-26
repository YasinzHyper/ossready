import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";
import { dependencyReviewWorkflowText } from "../src/templates/github.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init dependency-review scaffold", () => {
  it("exposes an idiomatic dependency-review workflow template", () => {
    const yml = dependencyReviewWorkflowText();
    expect(yml).toContain("name: Dependency Review");
    expect(yml).toContain("pull_request");
    expect(yml).toContain("permissions:");
    expect(yml).toContain("contents: read");
    expect(yml).toContain("concurrency:");
    expect(yml).toContain("cancel-in-progress: true");
    expect(yml).toContain("actions/checkout@v4");
    expect(yml).toContain("actions/dependency-review-action@v4");
  });

  it("writes dependency-review.yml into new projects", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "dep-review-app",
      description: "Dependency review demo",
      license: "mit",
      packageManager: "npm",
    });

    const yml = await readFile(
      join(dir, ".github/workflows/dependency-review.yml"),
      "utf8",
    );
    expect(yml).toContain("actions/dependency-review-action@v4");
    expect(yml).toMatch(/on:\s*\n\s*pull_request:/);
    expect(yml).toContain("contents: read");
    expect(yml).toContain("actions/checkout@v4");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("Dependency Review");
  });
});
