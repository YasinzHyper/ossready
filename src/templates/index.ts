export interface ScaffoldOptions {
  name: string;
  description: string;
  license: "mit" | "apache-2.0";
  packageManager: "npm" | "pnpm" | "bun";
  year: number;
  copyrightHolder: string;
}

function pmRun(pm: ScaffoldOptions["packageManager"], script: string): string {
  switch (pm) {
    case "pnpm":
      return `pnpm ${script}`;
    case "bun":
      return `bun run ${script}`;
    default:
      return `npm run ${script}`;
  }
}

function pmInstall(pm: ScaffoldOptions["packageManager"]): string {
  switch (pm) {
    case "pnpm":
      return "pnpm install";
    case "bun":
      return "bun install";
    default:
      return "npm install";
  }
}

export function licenseText(opts: ScaffoldOptions): string {
  const { year, copyrightHolder, license } = opts;
  if (license === "apache-2.0") {
    return `Copyright ${year} ${copyrightHolder}

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
`;
  }

  return `MIT License

Copyright (c) ${year} ${copyrightHolder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}

export function readmeText(opts: ScaffoldOptions): string {
  const { name, description, license, packageManager } = opts;
  const licenseBadge =
    license === "mit"
      ? `[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)`
      : `[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)`;
  const npmBadge = `[![npm](https://img.shields.io/npm/v/${name}.svg)](https://www.npmjs.com/package/${name})`;
  const ciBadge = `[![CI](https://github.com/OWNER/${name}/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/${name}/actions/workflows/ci.yml)`;

  return `# ${name}

${description}

${ciBadge}
${npmBadge}
${licenseBadge}

> Replace \`OWNER\` in the CI badge URL with your GitHub username or org.

## Features

- TypeScript-first project layout
- GitHub Actions CI (test + build)
- Issue and pull request templates
- Conventional-commit friendly changelog starter
- Tag-based GitHub Releases workflow
- Security policy (SECURITY.md) and Dependabot updates
- Solid Node/\`.gitignore\` defaults

## Quick start

\`\`\`bash
${pmInstall(packageManager)}
${pmRun(packageManager, "build")}
${pmRun(packageManager, "test")}
\`\`\`

## Usage

\`\`\`bash
# After building
node dist/index.js
\`\`\`

## Scripts

| Script | Description |
|--------|-------------|
| \`build\` | Compile TypeScript to \`dist/\` |
| \`test\` | Run tests |
| \`lint\` | Type-check without emitting |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please open an issue before large changes.

## License

${license === "mit" ? "MIT" : "Apache-2.0"} — see [LICENSE](LICENSE).
`;
}

export function gitignoreText(): string {
  return `# Dependencies
node_modules/

# Build
dist/
build/
*.tsbuildinfo

# Test / coverage
coverage/
.vitest/
.nyc_output/

# Logs
*.log
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment
.env
.env.*
!.env.example

# OS / editor
.DS_Store
Thumbs.db
*.swp
*.swo
.idea/
.vscode/
*.code-workspace

# Temp / misc
tmp/
temp/
*.tmp
*.tgz
`;
}

export function ciWorkflowText(opts: ScaffoldOptions): string {
  const { packageManager } = opts;
  const setupSteps =
    packageManager === "pnpm"
      ? `      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile`
      : packageManager === "bun"
        ? `      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile`
        : `      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: npm
      - run: npm ci`;

  const runTest =
    packageManager === "pnpm"
      ? "pnpm test"
      : packageManager === "bun"
        ? "bun test"
        : "npm test";
  const runBuild =
    packageManager === "pnpm"
      ? "pnpm build"
      : packageManager === "bun"
        ? "bun run build"
        : "npm run build";

  return `name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
${setupSteps}
      - run: ${runTest}
      - run: ${runBuild}
`;
}

export function releaseWorkflowText(): string {
  return `name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
`;
}

export function bugReportTemplate(): string {
  return `---
name: Bug report
about: Report a problem so we can fix it
title: "[bug] "
labels: bug
assignees: ""
---

## Describe the bug

A clear and concise description of what the bug is.

## Steps to reproduce

1.
2.
3.

## Expected behavior

What you expected to happen.

## Actual behavior

What actually happened.

## Environment

- OS:
- Node version:
- Package version:

## Additional context

Logs, screenshots, or related issues.
`;
}

export function featureRequestTemplate(): string {
  return `---
name: Feature request
about: Suggest an idea for this project
title: "[feat] "
labels: enhancement
assignees: ""
---

## Problem

What problem does this solve?

## Proposed solution

How would you like it to work?

## Alternatives considered

Other approaches you thought about.

## Additional context

Links, mocks, or related issues.
`;
}

export function pullRequestTemplate(): string {
  return `## Summary

Briefly describe what this PR does and why.

## Changes

- 

## Checklist

- [ ] Tests added/updated (if applicable)
- [ ] Docs updated (if applicable)
- [ ] Conventional commit style used in commit messages
- [ ] CI passes locally (\`npm test\` / \`npm run build\`)

## Related issues

Closes #
`;
}

export function codeownersText(): string {
  return `# CODEOWNERS — replace with your GitHub username or team
# Docs: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
#
# * @YOUR_GITHUB_USERNAME
`;
}

export function dependabotYmlText(): string {
  return `version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
`;
}

export function securityMdText(opts: ScaffoldOptions): string {
  const { name } = opts;
  return `# Security Policy

## Supported Versions

Use this section to tell users which versions of **${name}** receive security updates.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

Please **do not** file a public GitHub issue for security vulnerabilities in ${name}.

Report privately instead:

1. **GitHub Security Advisories** — open a private advisory via
   [Report a vulnerability](https://github.com/OWNER/${name}/security/advisories/new)
   (replace \`OWNER\` with your GitHub username or organization).
2. **Email** — send details to \`security@example.com\` (replace with a real contact).

Include as much detail as you can:

- Description of the issue and impact
- Steps to reproduce
- Affected versions / commit SHAs
- Any known workarounds or mitigations

We will acknowledge reports as soon as practical and coordinate a disclosure timeline with you.
`;
}

export function contributingText(opts: ScaffoldOptions): string {
  const { name, packageManager } = opts;
  return `# Contributing to ${name}

Thanks for your interest in contributing!

## Development

1. Fork and clone the repository
2. Install dependencies: \`${pmInstall(packageManager)}\`
3. Make your changes on a feature branch
4. Run \`${pmRun(packageManager, "lint")}\`, \`${pmRun(packageManager, "test")}\`, and \`${pmRun(packageManager, "build")}\`
5. Open a pull request

## Commit messages

Prefer [Conventional Commits](https://www.conventionalcommits.org/):

- \`feat:\` new feature
- \`fix:\` bug fix
- \`docs:\` documentation only
- \`chore:\` tooling / maintenance
- \`refactor:\` code change that neither fixes a bug nor adds a feature
- \`test:\` adding or updating tests

## Releases

Tag a version (\`v1.0.0\`) to trigger the Release workflow and create a GitHub Release.

## Code of conduct

Be respectful and constructive. Harassment or discrimination is not welcome.
`;
}

export function changelogText(opts: ScaffoldOptions): string {
  return `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project scaffold via [ossready](https://github.com/YasinzHyper/ossready)

## [0.1.0] - ${opts.year}-01-01

### Added

- First public release placeholder — update the date when you ship
`;
}

export function packageJsonText(opts: ScaffoldOptions): string {
  const { name, description, license } = opts;
  const licenseField = license === "mit" ? "MIT" : "Apache-2.0";
  return (
    JSON.stringify(
      {
        name,
        version: "0.1.0",
        description,
        type: "module",
        main: "./dist/index.js",
        types: "./dist/index.d.ts",
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            import: "./dist/index.js",
          },
        },
        files: ["dist", "LICENSE", "README.md", "CHANGELOG.md"],
        publishConfig: {
          access: "public",
        },
        scripts: {
          build: "tsc",
          test: 'node -e "console.log(\'All tests passed\')"',
          lint: "tsc --noEmit",
        },
        engines: {
          node: ">=18",
        },
        keywords: [],
        license: licenseField,
        devDependencies: {
          "@types/node": "^22.10.0",
          typescript: "^5.7.2",
        },
      },
      null,
      2,
    ) + "\n"
  );
}

export function tsconfigText(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          outDir: "dist",
          rootDir: "src",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
        },
        include: ["src/**/*"],
        exclude: ["node_modules", "dist"],
      },
      null,
      2,
    ) + "\n"
  );
}

export function srcIndexText(opts: ScaffoldOptions): string {
  return `/**
 * ${opts.name} — entry point
 */
export function greet(who = "world"): string {
  return \`Hello, \${who}!\`;
}

console.log(greet("${opts.name}"));
`;
}

export type ScaffoldFile = { path: string; content: string };

export function buildScaffoldFiles(opts: ScaffoldOptions): ScaffoldFile[] {
  return [
    { path: "LICENSE", content: licenseText(opts) },
    { path: "README.md", content: readmeText(opts) },
    { path: "SECURITY.md", content: securityMdText(opts) },
    { path: ".gitignore", content: gitignoreText() },
    { path: ".github/workflows/ci.yml", content: ciWorkflowText(opts) },
    { path: ".github/workflows/release.yml", content: releaseWorkflowText() },
    {
      path: ".github/ISSUE_TEMPLATE/bug_report.md",
      content: bugReportTemplate(),
    },
    {
      path: ".github/ISSUE_TEMPLATE/feature_request.md",
      content: featureRequestTemplate(),
    },
    {
      path: ".github/PULL_REQUEST_TEMPLATE.md",
      content: pullRequestTemplate(),
    },
    { path: ".github/CODEOWNERS", content: codeownersText() },
    { path: ".github/dependabot.yml", content: dependabotYmlText() },
    { path: "CONTRIBUTING.md", content: contributingText(opts) },
    { path: "CHANGELOG.md", content: changelogText(opts) },
    { path: "package.json", content: packageJsonText(opts) },
    { path: "tsconfig.json", content: tsconfigText() },
    { path: "src/index.ts", content: srcIndexText(opts) },
  ];
}
