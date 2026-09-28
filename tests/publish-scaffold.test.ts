import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";
import { publishWorkflowText } from "../src/templates/ci.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init npm publish scaffold", () => {
  it("exposes an idiomatic npm Publish workflow template", () => {
    const yml = publishWorkflowText();
    expect(yml).toContain("name: Publish");
    expect(yml).toContain("release:");
    expect(yml).toContain("types: [published]");
    expect(yml).toContain("permissions:");
    expect(yml).toContain("contents: read");
    expect(yml).toContain("id-token: write");
    expect(yml).toContain("actions/checkout@v4");
    expect(yml).toContain("actions/setup-node@v4");
    expect(yml).toContain("node-version: 22");
    expect(yml).toContain("registry-url: https://registry.npmjs.org");
    expect(yml).toContain("npm install");
    expect(yml).toContain("npm test");
    expect(yml).toContain("npm run build");
    expect(yml).toContain("npm publish --access public --provenance");
    expect(yml).toContain("NODE_AUTH_TOKEN");
    expect(yml).toContain("secrets.NPM_TOKEN");
  });

  it("writes publish.yml into new projects", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "publish-app",
      description: "Publish workflow demo",
      license: "mit",
      packageManager: "npm",
    });

    const yml = await readFile(
      join(dir, ".github/workflows/publish.yml"),
      "utf8",
    );
    expect(yml).toContain("name: Publish");
    expect(yml).toContain("types: [published]");
    expect(yml).toContain("id-token: write");
    expect(yml).toContain("npm publish --access public --provenance");
    expect(yml).toContain("secrets.NPM_TOKEN");
    expect(yml).toContain("actions/checkout@v4");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("npm Publish");
    expect(readme).toContain("provenance");

    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.publishConfig?.access).toBe("public");
  });
});
