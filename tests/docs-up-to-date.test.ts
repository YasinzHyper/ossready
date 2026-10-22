import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import { describe, expect, it } from "vitest";
import { CHECK_CATALOG } from "../src/checks.js";
import { COMMANDS } from "../src/cliSpec.js";
import { DOCS_FILES, renderDocs } from "../src/docs.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generated = renderDocs();
const HOW_TO_FIX = "run `npm run docs:gen` and commit the result";

/** Where two texts first differ, as a short, readable message. */
function firstDifference(expected: string, actual: string): string {
  const e = expected.split("\n");
  const a = actual.split("\n");
  for (let i = 0; i < Math.max(e.length, a.length); i++) {
    if (e[i] !== a[i]) {
      return `line ${i + 1}\n  expected: ${JSON.stringify(e[i] ?? "<end of file>")}\n  actual:   ${JSON.stringify(a[i] ?? "<end of file>")}`;
    }
  }
  return "nowhere (identical)";
}

/**
 * On GitHub Actions, print the expected file as notice annotations so a red
 * run shows exactly what to commit, even without a local checkout. The file
 * is split on line boundaries; each part is wrapped in <<< and >>> lines so
 * blank lines at its edges survive. Join the parts' inner lines in order.
 */
function annotate(label: string, path: string, content: string): void {
  if (process.env.GITHUB_ACTIONS !== "true") return;
  const escape = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const parts: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const line of content.replace(/\n$/, "").split("\n")) {
    if (size + line.length > 3500 && current.length > 0) {
      parts.push(current.join("\n"));
      current = [];
      size = 0;
    }
    current.push(line);
    size += line.length + 1;
  }
  if (current.length > 0) parts.push(current.join("\n"));
  parts.forEach((part, i) => {
    console.log(`::notice title=${label} ${path} part ${i + 1} of ${parts.length}::${escape(`<<<\n${part}\n>>>`)}`);
  });
}

describe("generated docs (npm run docs:gen)", () => {
  for (const path of DOCS_FILES) {
    const expected = generated[path];

    it(`${path} is up to date`, async () => {
      let actual = "";
      try {
        actual = await readFile(join(repoRoot, path), "utf8");
      } catch {
        actual = "";
      }
      if (actual !== expected) annotate("Expected", path, expected);
      expect(
        actual === expected,
        `${path} differs from what the code generates: ${HOW_TO_FIX}. First difference at ${firstDifference(expected, actual)}`,
      ).toBe(true);
    });

    it(`${path} is Prettier-clean as generated`, async () => {
      const filepath = join(repoRoot, path);
      const config = (await prettier.resolveConfig(filepath, { editorconfig: true })) ?? {};
      const formatted = await prettier.format(expected, { ...config, filepath });
      if (formatted !== expected) annotate("Prettier", path, formatted);
      expect(
        formatted === expected,
        `Prettier would reformat the generated ${path}; fix the renderer in src/docs.ts, then ${HOW_TO_FIX}. First difference at ${firstDifference(formatted, expected)}`,
      ).toBe(true);
    });
  }

  it("documents every doctor check and every command, option and example", () => {
    const checks = generated["docs/checks.md"];
    for (const c of CHECK_CATALOG) {
      expect(checks).toContain(`### \`${c.id}\``);
      expect(checks).toContain(`| \`${c.id}\` `);
    }
    const commands = generated["docs/commands.md"];
    for (const c of COMMANDS) {
      expect(commands).toContain(`## \`ossready ${c.name}\``);
      for (const o of c.options) expect(commands).toContain(`- \`${o.flags}\`: `);
      for (const e of c.examples) expect(commands).toContain(`\n${e}\n`);
    }
  });
});
