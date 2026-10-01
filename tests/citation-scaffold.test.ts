import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";
import { citationCffText } from "../src/templates/citation.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init CITATION.cff scaffold", () => {
  it("exposes valid CFF 1.2.0 with author and github owner", () => {
    const cff = citationCffText({
      name: "my-lib",
      license: "mit",
      author: "Jane Doe",
      githubOwner: "YasinzHyper",
    });
    expect(cff).toContain("cff-version: 1.2.0");
    expect(cff).toContain(
      'message: "If you use this software, please cite it using the metadata from this file."',
    );
    expect(cff).toContain('title: "my-lib"');
    expect(cff).toContain("type: software");
    expect(cff).toContain('name: "Jane Doe"');
    expect(cff).toContain("license: MIT");
    expect(cff).toContain('url: "https://github.com/YasinzHyper/my-lib"');
    expect(cff).toContain(
      'repository-code: "https://github.com/YasinzHyper/my-lib"',
    );
    expect(cff).not.toContain("YOUR_GITHUB_USERNAME");
    expect(cff).not.toContain("Anonymous");
  });

  it("uses placeholder author and commented URLs when flags omitted", () => {
    const cff = citationCffText({
      name: "plain-lib",
      license: "mit",
    });
    expect(cff).toContain("cff-version: 1.2.0");
    expect(cff).toContain('name: "Anonymous"');
    expect(cff).toContain("--author");
    expect(cff).toContain("# url:");
    expect(cff).toContain("YOUR_GITHUB_USERNAME");
    expect(cff).not.toMatch(/^url:/m);
    expect(cff).not.toMatch(/^repository-code:/m);
  });

  it("maps apache-2.0 license to SPDX Apache-2.0", () => {
    const cff = citationCffText({
      name: "apache-lib",
      license: "apache-2.0",
      author: "Org Name",
    });
    expect(cff).toContain("license: Apache-2.0");
  });

  it("writes CITATION.cff into new projects", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "cite-app",
      description: "Citation demo",
      license: "mit",
      packageManager: "npm",
      author: "Mohammed Yasin",
      githubOwner: "YasinzHyper",
    });

    const cff = await readFile(join(dir, "CITATION.cff"), "utf8");
    expect(cff).toContain("cff-version: 1.2.0");
    expect(cff).toContain('title: "cite-app"');
    expect(cff).toContain('name: "Mohammed Yasin"');
    expect(cff).toContain(
      'repository-code: "https://github.com/YasinzHyper/cite-app"',
    );

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("CITATION.cff");

    const plain = await makeTempDir();
    await initCommand(plain, {
      name: "plain-cite",
      description: "No author cite",
      license: "mit",
      packageManager: "npm",
    });
    const plainCff = await readFile(join(plain, "CITATION.cff"), "utf8");
    expect(plainCff).toContain('name: "Anonymous"');
    expect(plainCff).toContain("# url:");
  });
});
