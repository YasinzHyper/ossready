import { buildBadges, githubRepoFromUrl, renderBadgeBlock } from "../commands/badges.js";
import type { ScaffoldOptions } from "./types.js";
import { pmInstall, pmRun } from "./types.js";

/**
 * The README badge block for a fresh scaffold, built with the same code as
 * `ossready badges` from what the scaffold is known to contain: ci.yml,
 * scorecard.yml and codeql.yml, a public package named `name`, LICENSE, and
 * package.json links when there is an owner. Without an owner only the npm and
 * license badges are emitted (like `ossready badges`); `ossready badges --write
 * --github-owner <you>` or `ossready doctor --fix --github-owner <you>` adds the rest.
 */
export function scaffoldBadgeBlock(opts: Pick<ScaffoldOptions, "name" | "license" | "githubOwner">): string {
  const owner = opts.githubOwner?.trim() || undefined;
  // Same repo name `ossready badges` reads back from the scaffolded package.json "repository".
  const repo =
    (owner ? githubRepoFromUrl(`git+https://github.com/${owner}/${opts.name}.git`) : undefined) ??
    (opts.name.replace(/^@[^/]+\//, "") || opts.name);
  const { badges } = buildBadges({
    owner,
    repo,
    npmName: opts.name,
    license: opts.license === "mit" ? "MIT" : "Apache-2.0",
    licenseFile: "LICENSE",
    workflows: { ci: true, scorecard: true, codeql: true },
  });
  return renderBadgeBlock(badges);
}

export function readmeText(opts: ScaffoldOptions): string {
  const { name, description, license, packageManager } = opts;
  const licenseLabel = license === "mit" ? "MIT" : "Apache-2.0";

  const lines: string[] = [
    "# " + name,
    "",
    scaffoldBadgeBlock(opts),
    "",
    description,
    "",
    "## Features",
    "",
    "- TypeScript-first project layout",
    "- Vitest smoke tests and coverage (`test` / `test:coverage`) with 80% thresholds from day one",
    "- GitHub Actions CI (lint + format:check + test + coverage + build)",
    "- ESLint flat config with typescript-eslint and Prettier integration",
    "- CodeQL security analysis workflow",
    "- Dependency Review workflow on pull requests",
    "- OpenSSF Scorecard supply-chain security workflow",
    "- Stale workflow to close inactive issues and PRs",
    "- Lock Threads workflow to lock inactive closed issues and PRs",
    "- Consistent EditorConfig defaults",
    "- `.nvmrc` (Node 22) aligned with `engines.node`",
    "- Prettier formatting (`format` / `format:check`)",
    "- GitHub Issue Forms (bug + feature) and pull request templates",
    "- Conventional-commit friendly changelog starter",
    "- Tag-based GitHub Releases workflow",
    "- npm Publish workflow with provenance on GitHub Release",
    "- Security policy (SECURITY.md) and Dependabot updates",
    "- Support resources (SUPPORT.md) for questions, bugs, and response expectations",
    "- GitHub Sponsors funding config (FUNDING.yml; filled when --github-owner is set)",
    "- Citation File Format metadata (CITATION.cff) for citing this software",
    "- Contributor Covenant Code of Conduct",
    "- README badges kept current with `ossready badges --write`",
    "- Solid Node/`.gitignore` defaults",
    "",
    "## Quick start",
    "",
    "```bash",
    ...(packageManager === "yarn" ? ["corepack enable"] : []),
    pmInstall(packageManager),
    pmRun(packageManager, "build"),
    pmRun(packageManager, "test"),
    "```",
    "",
    "## Usage",
    "",
    "```ts",
    'import { greet } from "' + name + '";',
    "",
    "console.log(greet()); // Hello, world!",
    'console.log(greet("oss")); // Hello, oss!',
    "```",
    "",
    "## Scripts",
    "",
    // Pre-aligned so a fresh project passes `prettier --check .` (Prettier pads Markdown tables).
    "| Script          | Description                                               |",
    "| --------------- | --------------------------------------------------------- |",
    "| `build`         | Compile TypeScript to `dist/`                             |",
    "| `test`          | Run Vitest                                                |",
    "| `test:coverage` | Run Vitest with v8 coverage (text + html; 80% thresholds) |",
    "| `lint`          | Lint with ESLint                                          |",
    "| `typecheck`     | Type-check without emitting                               |",
    "| `format`        | Format with Prettier                                      |",
    "| `format:check`  | Check formatting with Prettier                            |",
    "",
    "## Contributing",
    "",
    "See [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md). Please open an issue before large changes.",
    "",
    "## License",
    "",
    licenseLabel + " -- see [LICENSE](LICENSE).",
    "",
  ];

  return lines.join("\n");
}
