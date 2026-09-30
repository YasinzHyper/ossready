import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";
import { fundingYmlText } from "../src/templates/funding.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init FUNDING.yml scaffold", () => {
  it("exposes FUNDING.yml with github sponsor when owner is set", () => {
    const yml = fundingYmlText({ githubOwner: "YasinzHyper" });
    expect(yml).toContain("# These are supported funding model platforms");
    expect(yml).toContain("github: [YasinzHyper]");
    expect(yml).toContain("# patreon:");
    expect(yml).toContain("# custom:");
    expect(yml).not.toContain("YOUR_GITHUB_USERNAME");
  });

  it("keeps github commented when owner is omitted", () => {
    const yml = fundingYmlText();
    expect(yml).toContain("# github: [YOUR_GITHUB_USERNAME]");
    expect(yml).not.toMatch(/^github:/m);
    expect(yml).toContain("--github-owner");
  });

  it("writes FUNDING.yml into new projects", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "funding-app",
      description: "Funding demo",
      license: "mit",
      packageManager: "npm",
      githubOwner: "YasinzHyper",
    });

    const yml = await readFile(join(dir, ".github/FUNDING.yml"), "utf8");
    expect(yml).toContain("github: [YasinzHyper]");
    expect(yml).toContain("# These are supported funding model platforms");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("FUNDING.yml");

    const plain = await makeTempDir();
    await initCommand(plain, {
      name: "plain-funding",
      description: "No owner funding",
      license: "mit",
      packageManager: "npm",
    });
    const plainYml = await readFile(join(plain, ".github/FUNDING.yml"), "utf8");
    expect(plainYml).toContain("# github: [YOUR_GITHUB_USERNAME]");
    expect(plainYml).not.toMatch(/^github:/m);
  });
});
