import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/commands/doctor.js";
import { initCommand } from "../src/commands/init.js";
import {
  OSSREADY_RC_SCHEMA_URL,
  loadOssreadyConfig,
  parseOssreadyConfig,
} from "../src/config.js";
import { isManaged } from "../src/templates/managed.js";
import { ossreadyrcText } from "../src/templates/ossreadyrc.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init .ossreadyrc scaffold", () => {
  it("writes a starter .ossreadyrc with $schema and no filters", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "rc-demo",
      description: "Config scaffold demo",
      license: "mit",
      packageManager: "npm",
      githubOwner: "YasinzHyper",
    });

    const text = await readFile(join(dir, ".ossreadyrc"), "utf8");
    expect(text).toBe(ossreadyrcText());

    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed).toEqual({ $schema: OSSREADY_RC_SCHEMA_URL });
    expect(parsed).not.toHaveProperty("check");
    expect(parsed).not.toHaveProperty("skip");
    expect(parsed).not.toHaveProperty("doctor");

    // Loader accepts it and contributes no check/skip (just $schema).
    const doctor = parseOssreadyConfig(parsed, ".ossreadyrc");
    expect(doctor).toEqual({});
    const loaded = await loadOssreadyConfig(dir);
    expect(loaded?.path).toBe(".ossreadyrc");
    expect(loaded?.doctor).toEqual({});

    // Meant to be customized per project — sync must leave it alone.
    expect(isManaged(text)).toBe(false);
  });

  it("keeps a fresh scaffold at full doctor --strict with the starter rc", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "rc-strict",
      description: "Config scaffold doctor demo",
      license: "mit",
      packageManager: "npm",
      githubOwner: "YasinzHyper",
    });

    const report = await runDoctor(dir, { strict: true });
    expect(report.passed).toBe(report.total);
    expect(report.missingRequired).toBe(0);
    // Starter has no check/skip, so the report has no filter at all.
    expect(report.filter).toBeUndefined();
  });

  it("points $schema at the canonical main URL used by docs and the schema package", () => {
    const text = ossreadyrcText();
    expect(text).toContain(OSSREADY_RC_SCHEMA_URL);
    expect(text.endsWith("\n")).toBe(true);
    // Prettier json (printWidth 100) keeps this short object multi-line with a trailing newline.
    expect(text).toBe(
      `{\n  "$schema": "${OSSREADY_RC_SCHEMA_URL}"\n}\n`,
    );
  });
});
