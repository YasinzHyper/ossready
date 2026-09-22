import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-"));
}

describe("ossready init .nvmrc scaffold", () => {
  it("writes .nvmrc pinned to Node 20 and keeps engines.node aligned", async () => {
    const dir = await makeTempDir();
    await initCommand(dir, {
      name: "nvmrc-app",
      description: "nvmrc demo",
      license: "mit",
      packageManager: "npm",
    });

    const nvmrc = await readFile(join(dir, ".nvmrc"), "utf8");
    expect(nvmrc.trim()).toBe("20");

    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.engines?.node).toBe(">=18");

    const readme = await readFile(join(dir, "README.md"), "utf8");
    expect(readme).toContain(".nvmrc");
    expect(readme).toContain("Node 20");
  });
});
