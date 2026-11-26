import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";
import { detectLicenseSpdx } from "../src/commands/packageJson.js";
import { licenseText } from "../src/templates/license.js";
import type { ScaffoldOptions } from "../src/templates/types.js";

/** sha256 of https://www.apache.org/licenses/LICENSE-2.0.txt without its leading blank line */
const APACHE_2_0_SHA256 = "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4";

const BASE: ScaffoldOptions = {
  name: "lic-lib",
  description: "",
  license: "apache-2.0",
  packageManager: "npm",
  year: 2026,
  copyrightHolder: "Jane Doe",
  cocEmail: "conduct@example.com",
};

describe("LICENSE scaffold", () => {
  it("writes the full Apache License 2.0 terms, not just the boilerplate notice", () => {
    const text = licenseText(BASE);
    expect(text.startsWith("                                 Apache License\n")).toBe(true);
    expect(text).toContain("TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION");
    for (let n = 1; n <= 9; n++) expect(text).toMatch(new RegExp(`^   ${n}\\. [A-Z]`, "m"));
    expect(text).toContain("END OF TERMS AND CONDITIONS");
    expect(text.endsWith("   limitations under the License.\n")).toBe(true);
    expect(detectLicenseSpdx(text)).toBe("Apache-2.0");
  });

  it("fills the appendix copyright line and leaves no placeholders", () => {
    const text = licenseText(BASE);
    expect(text).toContain("\n   Copyright 2026 Jane Doe\n");
    expect(text).not.toContain("[yyyy]");
    expect(text).not.toContain("[name of copyright owner]");
    // The holder appears once, after END OF TERMS AND CONDITIONS (where license detectors stop reading).
    expect(text.indexOf("Jane Doe")).toBeGreaterThan(text.indexOf("END OF TERMS AND CONDITIONS"));
    expect(text.split("Jane Doe")).toHaveLength(2);
  });

  it("is the canonical apache.org text apart from the copyright line", () => {
    const canonical = licenseText(BASE).replace(
      "Copyright 2026 Jane Doe",
      "Copyright [yyyy] [name of copyright owner]",
    );
    expect(createHash("sha256").update(canonical).digest("hex")).toBe(APACHE_2_0_SHA256);
  });

  it("keeps the MIT text unchanged", () => {
    const text = licenseText({ ...BASE, license: "mit" });
    expect(text.startsWith("MIT License\n\nCopyright (c) 2026 Jane Doe\n")).toBe(true);
    expect(detectLicenseSpdx(text)).toBe("MIT");
  });

  it("ossready init --license apache-2.0 writes the full terms", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-"));
    await initCommand(dir, { name: "apache-full", license: "apache-2.0", author: "Jane Doe" });
    const text = await readFile(join(dir, "LICENSE"), "utf8");
    expect(text).toContain("TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION");
    expect(text).toContain(`   Copyright ${new Date().getFullYear()} Jane Doe\n`);
  });
});
