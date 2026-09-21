import type { ScaffoldOptions } from "./types.js";
import { pmInstall, pmRun } from "./types.js";

export function readmeText(opts: ScaffoldOptions): string {
  const { name, description, license, packageManager, githubOwner } = opts;
  const licenseBadge =
    license === "mit"
      ? `[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)`
      : `[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)`;
  const npmBadge = `[![npm](https://img.shields.io/npm/v/${name}.svg)](https://www.npmjs.com/package/${name})`;
  const owner = githubOwner?.trim() || "OWNER";
  const ciBadge = `[![CI](https://github.com/${owner}/${name}/actions/workflows/ci.yml/badge.svg)](https://github.com/${owner}/${name}/actions/workflows/ci.yml)`;
  const replaceNote = githubOwner?.trim()
    ? ""
    : "\n> Replace `OWNER` in the CI badge URL with your GitHub username or org.\n";

  return `# ${name}

${description}

${ciBadge}
${npmBadge}
${licenseBadge}
${replaceNote}
## Features

- TypeScript-first project layout
- Vitest smoke tests from day one
- GitHub Actions CI (lint + test + build)
- ESLint flat config with typescript-eslint and Prettier integration
- CodeQL security analysis workflow
- Consistent EditorConfig defaults
- Prettier formatting (`format` / `format:check`)
- Issue and pull request templates
- Conventional-commit friendly changelog starter
- Tag-based GitHub Releases workflow
- Security policy (SECURITY.md) and Dependabot updates
- Contributor Covenant Code of Conduct
- Solid Node/`.gitignore` defaults

## Quick start

\`\`\`bash
${pmInstall(packageManager)}
${pmRun(packageManager, "build")}
${pmRun(packageManager, "test")}
\`\`\`

## Usage

\`\`\`ts
import { greet } from "${name}";

console.log(greet()); // Hello, world!
console.log(greet("oss")); // Hello, oss!
\`\`\`

## Scripts

| Script | Description |
|--------|-------------|
| \`build\` | Compile TypeScript to \`dist/\` |
| \`test\` | Run Vitest |
| \`lint\` | Lint with ESLint |
| \`typecheck\` | Type-check without emitting |
| \`format\` | Format with Prettier |
| \`format:check\` | Check formatting with Prettier |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md). Please open an issue before large changes.

## License

${license === "mit" ? "MIT" : "Apache-2.0"} — see [LICENSE](LICENSE).
`;
}