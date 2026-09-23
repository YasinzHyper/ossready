import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

function assertCiHardening(ci: string, lintCmd: string, formatCmd: string, testCmd: string, buildCmd: string) {
  expect(ci).toContain("permissions:");
  expect(ci).toContain("contents: read");
  expect(ci).toContain("concurrency:");
  expect(ci).toContain("cancel-in-progress: true");
  expect(ci).toContain(`- run: ${lintCmd}`);
  expect(ci).toContain(`- run: ${formatCmd}`);
  expect(ci).toContain(`- run: ${testCmd}`);
  expect(ci).toContain(`- run: ${buildCmd}`);
}

describe("ossready init CI hardening scaffold", () => {
  it("writes permissions and concurrency into npm CI workflow", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "ci-harden-npm",
      description: "CI hardening demo",
      license: "mit",
      packageManager: "npm",
    });

    const ci = await readFile(join(dir, ".github/workflows/ci.yml"), "utf8");
    assertCiHardening(
      ci,
      "npm run lint",
      "npm run format:check",
      "npm test",
      "npm run build",
    );
    expect(ci).toContain("group: ${{ github.workflow }}-${{ github.ref }}");
  });

  it("wires the same hardening for pnpm CI workflows", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "ci-harden-pnpm",
      packageManager: "pnpm",
      license: "mit",
    });

    const ci = await readFile(join(dir, ".github/workflows/ci.yml"), "utf8");
    assertCiHardening(
      ci,
      "pnpm lint",
      "pnpm format:check",
      "pnpm test",
      "pnpm build",
    );
    expect(ci).toContain("contents: read");
    expect(ci).toContain("cancel-in-progress: true");
  });
});
