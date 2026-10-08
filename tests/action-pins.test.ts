import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildScaffoldFiles, type ScaffoldOptions } from "../src/templates/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const BASE: ScaffoldOptions = {
  name: "pins-app",
  description: "action pin parity",
  license: "mit",
  packageManager: "npm",
  year: 2026,
  copyrightHolder: "Octo",
  cocEmail: "",
  githubOwner: "octo",
};

/** `uses: owner/repo[/path]@ref` → Map<owner/repo[/path], Set<ref>> */
function collectPins(yamls: string[]): Map<string, Set<string>> {
  const pins = new Map<string, Set<string>>();
  for (const yml of yamls) {
    for (const m of yml.matchAll(/^\s*(?:-\s+)?uses:\s*([\w.-]+\/[\w./-]+)@([\w.-]+)/gm)) {
      const [, action, ref] = m;
      if (!pins.has(action)) pins.set(action, new Set());
      pins.get(action)!.add(ref);
    }
  }
  return pins;
}

function scaffoldedWorkflows(): string[] {
  return (["npm", "pnpm", "bun"] as const).flatMap((packageManager) =>
    buildScaffoldFiles({ ...BASE, packageManager })
      .filter((f) => f.path.startsWith(".github/workflows/"))
      .map((f) => f.content),
  );
}

async function repoWorkflows(): Promise<string[]> {
  const dir = join(repoRoot, ".github/workflows");
  const names = (await readdir(dir)).filter((n) => /\.ya?ml$/.test(n));
  return Promise.all(names.map((n) => readFile(join(dir, n), "utf8")));
}

describe("GitHub Action pins in scaffolded workflows", () => {
  it("use a single version per action across every template and package manager", () => {
    for (const [action, refs] of collectPins(scaffoldedWorkflows())) {
      expect([...refs], `${action} is pinned inconsistently`).toHaveLength(1);
    }
  });

  it("match the versions ossready's own (Dependabot-maintained) workflows use", async () => {
    const scaffold = collectPins(scaffoldedWorkflows());
    const repo = collectPins(await repoWorkflows());
    let shared = 0;
    for (const [action, refs] of repo) {
      const tmpl = scaffold.get(action);
      if (!tmpl) continue;
      shared++;
      expect(
        [...tmpl],
        `${action}: templates pin ${[...tmpl].join(", ")} but .github/workflows uses ${[...refs].join(", ")} — bump src/templates too`,
      ).toEqual([...refs]);
    }
    expect(shared).toBeGreaterThan(0);
  });

  it("no longer reference Node 20-based action majors", () => {
    const all = scaffoldedWorkflows().join("\n");
    for (const stale of [
      "actions/checkout@v4",
      "actions/setup-node@v4",
      "actions/upload-artifact@v4",
      "actions/stale@v9",
      "actions/dependency-review-action@v4",
      "github/codeql-action/init@v3",
      "github/codeql-action/upload-sarif@v3",
      "pnpm/action-setup@v4",
      "softprops/action-gh-release@v2",
    ]) {
      expect(all).not.toContain(stale);
    }
  });
});
