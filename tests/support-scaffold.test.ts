import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";
import { supportMdText } from "../src/templates/support.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init SUPPORT.md scaffold", () => {
  it("exposes SUPPORT.md with real GitHub links when owner is set", () => {
    const md = supportMdText({
      name: "my-lib",
      githubOwner: "YasinzHyper",
    });
    expect(md).toContain("# Support");
    expect(md).toContain("**my-lib**");
    expect(md).toContain("https://github.com/YasinzHyper/my-lib/issues");
    expect(md).toContain("https://github.com/YasinzHyper/my-lib/discussions");
    expect(md).toContain("https://github.com/YasinzHyper/my-lib/issues/new/choose");
    expect(md).toContain("SECURITY.md");
    expect(md).toContain("CODE_OF_CONDUCT.md");
    expect(md).toContain("CONTRIBUTING.md");
    expect(md).toMatch(/Bug report/i);
    expect(md).toMatch(/Feature request/i);
    expect(md).toMatch(/Response expectations/i);
    expect(md).not.toContain("https://github.com/OWNER/");
    expect(md).not.toContain("--github-owner");
  });

  it("uses OWNER placeholders when github owner is omitted", () => {
    const md = supportMdText({ name: "plain-lib" });
    expect(md).toContain("# Support");
    expect(md).toContain("**plain-lib**");
    expect(md).toContain("https://github.com/OWNER/plain-lib/issues");
    expect(md).toContain("https://github.com/OWNER/plain-lib/discussions");
    expect(md).toContain("--github-owner");
    expect(md).toContain("SECURITY.md");
  });

  it("writes SUPPORT.md into new projects", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "support-app",
      description: "Support demo",
      license: "mit",
      packageManager: "npm",
      githubOwner: "YasinzHyper",
    });

    const md = await readFile(join(dir, "SUPPORT.md"), "utf8");
    expect(md).toContain("# Support");
    expect(md).toContain("**support-app**");
    expect(md).toContain(
      "https://github.com/YasinzHyper/support-app/issues",
    );
    expect(md).toContain("SECURITY.md");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain("SUPPORT.md");

    const plain = await makeTempDir();
    await initCommand(plain, {
      name: "plain-support",
      description: "No owner support",
      license: "mit",
      packageManager: "npm",
    });
    const plainMd = await readFile(join(plain, "SUPPORT.md"), "utf8");
    expect(plainMd).toContain("https://github.com/OWNER/plain-support/issues");
    expect(plainMd).toContain("--github-owner");
  });
});
