import type { ScaffoldOptions } from "./types.js";
import { pmInstall, pmRun } from "./types.js";

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

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful
and constructive. Harassment or discrimination is not welcome.
`;
}
