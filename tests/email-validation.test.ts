import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { doctorCommand } from "../src/commands/doctor.js";
import { inferScaffoldOptions } from "../src/commands/fix.js";
import { assertValidEmail, normalizeOptionalEmail } from "../src/utils/email.js";

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("assertValidEmail / normalizeOptionalEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(assertValidEmail("security@example.com", "--security-email")).toBe(
      "security@example.com",
    );
    expect(assertValidEmail("  mods@ex.co  ", "--coc-email")).toBe("mods@ex.co");
  });

  it("rejects clearly invalid values", () => {
    expect(() => assertValidEmail("nope", "--coc-email")).toThrow(/Invalid --coc-email/);
    expect(() => assertValidEmail("@missing-local.com", "--security-email")).toThrow(
      /Invalid --security-email/,
    );
    expect(() => assertValidEmail("missing-domain@", "--security-email")).toThrow(
      /Invalid --security-email/,
    );
    expect(() => assertValidEmail("spaces are@bad.com", "--coc-email")).toThrow(
      /Invalid --coc-email/,
    );
  });

  it("treats blank optional emails as unset", () => {
    expect(normalizeOptionalEmail(undefined, "--security-email")).toBeUndefined();
    expect(normalizeOptionalEmail("", "--security-email")).toBeUndefined();
    expect(normalizeOptionalEmail("   ", "--security-email")).toBeUndefined();
    expect(normalizeOptionalEmail("sec@example.com", "--security-email")).toBe("sec@example.com");
  });
});

describe("doctor --fix --security-email", () => {
  it("passes a validated security email into inferred scaffold options", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-fix-sec-"));
    await mkdir(join(dir), { recursive: true });
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "legacy-lib",
        license: "MIT",
        repository: { type: "git", url: "git+https://github.com/jane-doe/legacy-lib.git" },
      }),
      "utf8",
    );
    const { options } = await inferScaffoldOptions(dir, {
      securityEmail: "security@jane.example",
    });
    expect(options.securityEmail).toBe("security@jane.example");

    await expect(
      inferScaffoldOptions(dir, { securityEmail: "bad" }),
    ).rejects.toThrow(/Invalid --security-email/);

    await expect(inferScaffoldOptions(dir, { cocEmail: "also-bad" })).rejects.toThrow(
      /Invalid --coc-email/,
    );
  });

  it("writes SECURITY.md with the security email when fixing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-fix-write-sec-"));
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "legacy-lib",
        license: "MIT",
        repository: { type: "git", url: "git+https://github.com/jane-doe/legacy-lib.git" },
      }),
      "utf8",
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    await doctorCommand(dir, {
      fix: true,
      securityEmail: "security@jane.example",
    });
    const md = await readFile(join(dir, "SECURITY.md"), "utf8");
    expect(md).toContain("https://github.com/jane-doe/legacy-lib/security/advisories/new");
    expect(md).toContain("`security@jane.example`");
  });
});
