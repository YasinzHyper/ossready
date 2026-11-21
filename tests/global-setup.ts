import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Vitest global setup: build dist/ once, before any test file starts.
 *
 * CI runs `npm test` before `npm run build`, and some suites spawn `node dist/cli.js`
 * or inspect the packed dist/. Test files run in parallel workers, so a per-file
 * `npm run build` lets one suite's `tsc` rewrite dist/*.js while another suite's
 * child process is importing them (seen as `SyntaxError: The requested module
 * './readme.js' does not provide an export named …`). Building here, once, removes
 * that race. Test files must not run `npm run build` / `tsc` into dist/ themselves
 * (`tests/test-build.test.ts` guards this); compile into a private directory instead,
 * as `tests/github-action.test.ts` does.
 */
export default function setup(): void {
  execFileSync("npm", ["run", "build"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
}
