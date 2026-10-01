import type { ScaffoldOptions } from "./types.js";
import { pmInstall, pmRun } from "./types.js";

export function readmeText(opts: ScaffoldOptions): string {
  const { name, description, license, packageManager, githubOwner } = opts;
  const licenseBadge =
    license === "mit"
      ? "[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)"
      : "[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)";
  const npmBadge =
    "[![npm](https://img.shields.io/npm/v/" +
    name +
    ".svg)](https://www.npmjs.com/package/" +
    name +
    ")";
  const owner = githubOwner?.trim() || "OWNER";
  const ciBadge =
    "[![CI](https://github.com/" +
    owner +
    "/" +
    name +
    "/actions/workflows/ci.yml/badge.svg)](https://github.com/" +
    owner +
    "/" +
    name +
    "/actions/workflows/ci.yml)";
  const licenseLabel = license === "mit" ? "MIT" : "Apache-2.0";

  const lines: string[] = [
    "# " + name,
    "",
    description,
    "",
    ciBadge,
    npmBadge,
    licenseBadge,
  ];

  if (!githubOwner?.trim()) {
    lines.push(
      "",
      "> Replace `OWNER` in the CI badge URL with your GitHub username or org.",
    );
  }

  lines.push(
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
    "- Consistent EditorConfig defaults",
    "- `.nvmrc` (Node 20) aligned with `engines.node`",
    "- Prettier formatting (`format` / `format:check`)",
    "- GitHub Issue Forms (bug + feature) and pull request templates",
    "- Conventional-commit friendly changelog starter",
    "- Tag-based GitHub Releases workflow",
    "- npm Publish workflow with provenance on GitHub Release",
    "- Security policy (SECURITY.md) and Dependabot updates",
    "- GitHub Sponsors funding config (FUNDING.yml; filled when --github-owner is set)",
    "- Citation File Format metadata (CITATION.cff) for citing this software",
    "- Contributor Covenant Code of Conduct",
    "- Solid Node/`.gitignore` defaults",
    "",
    "## Quick start",
    "",
    "```bash",
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
    "| Script | Description |",
    "|--------|-------------|",
    "| `build` | Compile TypeScript to `dist/` |",
    "| `test` | Run Vitest |",
    "| `test:coverage` | Run Vitest with v8 coverage (text + html; 80% thresholds) |",
    "| `lint` | Lint with ESLint |",
    "| `typecheck` | Type-check without emitting |",
    "| `format` | Format with Prettier |",
    "| `format:check` | Check formatting with Prettier |",
    "",
    "## Contributing",
    "",
    "See [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md). Please open an issue before large changes.",
    "",
    "## License",
    "",
    licenseLabel + " -- see [LICENSE](LICENSE).",
    "",
  );

  return lines.join("\n");
}
