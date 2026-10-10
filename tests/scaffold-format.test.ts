import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import * as prettier from "prettier";
import { describe, expect, it } from "vitest";
import { initCommand } from "../src/commands/init.js";

/** Every file under `dir`, recursively (a fresh scaffold has no node_modules). */
async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

/**
 * Mirrors `prettier --check .` inside the generated project: honours its
 * .prettierrc and .prettierignore and skips files Prettier has no parser for.
 */
async function unformattedFiles(dir: string): Promise<string[]> {
  const ignorePath = join(dir, ".prettierignore");
  const bad: string[] = [];
  for (const file of await listFiles(dir)) {
    const info = await prettier.getFileInfo(file, { ignorePath });
    if (info.ignored || !info.inferredParser) continue;
    const config = (await prettier.resolveConfig(file, { editorconfig: true })) ?? {};
    const source = await readFile(file, "utf8");
    if (!(await prettier.check(source, { ...config, filepath: file }))) {
      bad.push(relative(dir, file).split("\\").join("/"));
    }
  }
  return bad.sort();
}

const VARIANTS = [
  { packageManager: "npm", license: "mit", githubOwner: "YasinzHyper" },
  { packageManager: "pnpm", license: "apache-2.0", githubOwner: undefined },
  { packageManager: "bun", license: "mit", githubOwner: "octo-org" },
] as const;

describe("ossready init output passes its own `format:check`", () => {
  for (const variant of VARIANTS) {
    it(`is Prettier-clean (${variant.packageManager}, ${variant.license}, owner=${variant.githubOwner ?? "none"})`, async () => {
      const dir = await mkdtemp(join(tmpdir(), "ossready-format-"));
      await initCommand(dir, {
        name: "format-demo",
        description: "Checks that every scaffolded file is Prettier-formatted.",
        author: "Test Author",
        ...variant,
      });

      const files = await listFiles(dir);
      expect(files.some((f) => f.endsWith(".prettierrc"))).toBe(true);
      expect(await unformattedFiles(dir)).toEqual([]);
    });
  }
});
