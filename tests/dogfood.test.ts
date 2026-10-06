import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/commands/doctor.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("ossready dogfood", () => {
  it("passes every `ossready doctor` check on its own repository", async () => {
    const report = await runDoctor(repoRoot);
    const missing = report.results.filter((r) => !r.ok).map((r) => r.scaffoldPath);
    expect(missing).toEqual([]);
    expect(report.passed).toBe(report.total);
  });
});
