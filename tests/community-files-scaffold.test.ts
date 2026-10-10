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

describe("SECURITY.md --security-email", () => {
  it("includes the email alongside the advisory form when owner and email are set", () => {
    const md = securityMdText({
      name: "my-lib",
      githubOwner: "AcmeOrg",
      securityEmail: "security@acme.example",
    });
    expect(md).toContain("https://github.com/AcmeOrg/my-lib/security/advisories/new");
    expect(md).toContain("`security@acme.example`");
    expect(md).not.toContain("security@example.com");
    expect(md).not.toContain("OWNER");
  });

  it("uses the real email instead of the placeholder when owner is omitted", () => {
    const md = securityMdText({ name: "my-lib", securityEmail: "sec@example.org" });
    expect(md).toContain("`sec@example.org`");
    expect(md).toContain("https://github.com/OWNER/my-lib/security/advisories/new");
    expect(md).not.toContain("security@example.com");
  });

  it("is written by init with --security-email and --github-owner", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-sec-email-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, {
      name: "sec-app",
      githubOwner: "YasinzHyper",
      securityEmail: "security@yas.in",
    });
    const md = await readFile(join(dir, "SECURITY.md"), "utf8");
    expect(md).toContain("https://github.com/YasinzHyper/sec-app/security/advisories/new");
    expect(md).toContain("`security@yas.in`");
  });
});

describe("email validation for --coc-email / --security-email", () => {
  it("rejects clearly invalid --coc-email before writing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-bad-coc-"));
    await expect(
      initCommand(dir, { name: "bad-coc", cocEmail: "not-an-email", dryRun: true }),
    ).rejects.toThrow(/Invalid --coc-email/i);
  });

  it("rejects clearly invalid --security-email before writing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-bad-sec-"));
    await expect(
      initCommand(dir, {
        name: "bad-sec",
        securityEmail: "nope",
        dryRun: true,
      }),
    ).rejects.toThrow(/Invalid --security-email/i);
  });

  it("accepts a valid --coc-email override", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-good-coc-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    await initCommand(dir, { name: "good-coc", cocEmail: "mods@example.org" });
    const md = await readFile(join(dir, "CODE_OF_CONDUCT.md"), "utf8");
    expect(md).toContain("**mods@example.org**");
  });
});
