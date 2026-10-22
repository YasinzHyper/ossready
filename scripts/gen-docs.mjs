// Regenerates docs/checks.md and docs/commands.md from the doctor check
// catalogue (src/checks.ts) and the CLI command definitions (src/cliSpec.ts).
// Run it with `npm run docs:gen`, which builds dist/ first; it uses no
// dependencies. tests/docs-up-to-date.test.ts fails when the committed docs
// differ from what this writes. Lives outside src/, so it is not published.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDocs } from "../dist/docs.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const [path, content] of Object.entries(renderDocs())) {
  const file = join(root, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
  console.log(`wrote ${path}`);
}
