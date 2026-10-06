import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";
import { codeOfConductText } from "../src/templates/coc.js";
import { securityMdText } from "../src/templates/security.js";
import type { ScaffoldOptions } from "../src/templates/types.js";

const base: ScaffoldOptions = {
  name: "contact-lib",
  description: "Contacts demo",
  license: "mit",
  packageManager: "npm",
  year: 2026,
  copyrightHolder: "Jane Doe",
};

describe("SECURITY.md contacts", () => {
  it("links the real private advisory form and drops placeholder email when --github-owner is set", () => {
    const md = securityMdText({ ...base, githubOwner: "YasinzHyper" });
    expect(md).toContain(
      "https://github.com/YasinzHyper/contact-lib/security/advisories/new",
    );
    expect(md).not.toContain("OWNER");
    expect(md).not.toContain("security@example.com");
    expect(md).not.toMatch(/replace with a real contact/i);
  });

  it("keeps OWNER and email placeholders when nothing is known", () => {
    const md = securityMdText(base);
    expect(md).toContain("https://github.com/OWNER/contact-lib/security/advisories/new");
    expect(md).toMatch(/replace `OWNER`/);
    expect(md).toContain("security@example.com");
  });

  it("uses --security-email alongside advisories", () => {
    const md = securityMdText({
      ...base,
      githubOwner: "acme",
      securityEmail: "security@acme.dev",
    });
    expect(md).toContain("https://github.com/acme/contact-lib/security/advisories/new");
    expect(md).toContain("`security@acme.dev`");
    expect(md).not.toContain("security@example.com");
    expect(md).toMatch(/1\. \*\*GitHub Security Advisories\*\*/);
    expect(md).toMatch(/2\. \*\*Email\*\*/);
  });
});

describe("CODE_OF_CONDUCT.md contacts", () => {
  it("prefers an explicit --coc-email", () => {
    const md = codeOfConductText({
      ...base,
      githubOwner: "acme",
      cocEmail: "mods@acme.dev",
    });
    expect(md).toContain("**mods@acme.dev**");
    expect(md).not.toContain("conduct@example.com");
  });

  it("falls back to GitHub-native reporting when only --github-owner is set", () => {
    const md = codeOfConductText({ ...base, githubOwner: "acme" });
    expect(md).toContain("[@acme](https://github.com/acme)");
    expect(md).toContain("https://github.com/acme/contact-lib/security/advisories/new");
    expect(md).toContain("Report abuse");
    expect(md).not.toContain("conduct@example.com");
  });

  it("keeps the conduct@example.com placeholder when nothing is known", () => {
    const md = codeOfConductText(base);
    expect(md).toContain("**conduct@example.com**");
  });
});

describe("ossready init contact flags", () => {
  it("writes --security-email into SECURITY.md", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-"));
    await initCommand(dir, {
      name: "sec-app",
      githubOwner: "acme",
      securityEmail: "  security@acme.dev  ",
    });
    const security = await readFile(join(dir, "SECURITY.md"), "utf8");
    expect(security).toContain("`security@acme.dev`");
    const coc = await readFile(join(dir, "CODE_OF_CONDUCT.md"), "utf8");
    expect(coc).not.toContain("conduct@example.com");
  });

  it("rejects malformed contact emails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-"));
    await expect(
      initCommand(dir, { name: "bad-app", securityEmail: "not-an-email" }),
    ).rejects.toThrow(/--security-email/);
    await expect(
      initCommand(dir, { name: "bad-app", cocEmail: "nope" }),
    ).rejects.toThrow(/--coc-email/);
  });
});
