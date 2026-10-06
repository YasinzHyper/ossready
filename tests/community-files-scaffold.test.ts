import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initCommand } from "../src/commands/init.js";
import { codeOfConductText, securityMdText } from "../src/templates/index.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SECURITY.md owner-aware reporting", () => {
  it("links the real advisory form and drops placeholders when owner is set", () => {
    const md = securityMdText({ name: "my-lib", githubOwner: "AcmeOrg" });
    expect(md).toContain("https://github.com/AcmeOrg/my-lib/security/advisories/new");
    expect(md).toContain("Private vulnerability reporting");
    expect(md).not.toContain("OWNER");
    expect(md).not.toContain("security@example.com");
  });

  it("keeps OWNER / email placeholders when owner is omitted", () => {
    const md = securityMdText({ name: "my-lib" });
    expect(md).toContain("https://github.com/OWNER/my-lib/security/advisories/new");
    expect(md).toContain("security@example.com");
  });

  it("is written by init with --github-owner", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-sec-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "sec-app", githubOwner: "YasinzHyper" });
    const md = await readFile(join(dir, "SECURITY.md"), "utf8");
    expect(md).toContain("https://github.com/YasinzHyper/sec-app/security/advisories/new");
    expect(md).not.toContain("security@example.com");
  });
});

describe("CODE_OF_CONDUCT.md enforcement contact", () => {
  it("uses the email when provided", () => {
    const md = codeOfConductText({ name: "x", cocEmail: "mods@example.org", githubOwner: "AcmeOrg" });
    expect(md).toContain("responsible for enforcement at **mods@example.org**.");
    expect(md).not.toContain("@AcmeOrg");
  });

  it("falls back to the GitHub owner when the email is empty", () => {
    const md = codeOfConductText({ name: "x", cocEmail: "  ", githubOwner: "AcmeOrg" });
    expect(md).toContain(
      "responsible for enforcement (currently [@AcmeOrg](https://github.com/AcmeOrg)).",
    );
    expect(md).not.toContain("****");
  });

  it("omits the contact entirely when neither email nor owner is set", () => {
    const md = codeOfConductText({ name: "x", cocEmail: "" });
    expect(md).toContain("responsible for enforcement.\n");
  });

  it("init still defaults to the conduct@example.com placeholder", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-coc-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "coc-app", githubOwner: "YasinzHyper" });
    const md = await readFile(join(dir, "CODE_OF_CONDUCT.md"), "utf8");
    expect(md).toContain("**conduct@example.com**");
  });
});
