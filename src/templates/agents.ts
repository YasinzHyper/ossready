import type { ScaffoldOptions } from "./types.js";
import { pmInstall, pmRun } from "./types.js";

/** Setup lines for the chosen package manager (Yarn needs Corepack first). */
function setupLines(pm: ScaffoldOptions["packageManager"]): string {
  return pm === "yarn" ? `corepack enable\n${pmInstall(pm)}` : pmInstall(pm);
}

/**
 * `AGENTS.md`: the cross-tool convention (https://agents.md) that AI coding
 * agents read for project context, commands, and conventions.
 */
export function agentsMdText(opts: ScaffoldOptions): string {
  const { name, description, packageManager: pm } = opts;
  const run = (script: string) => `\`${pmRun(pm, script)}\``;
  return `# AGENTS.md

Instructions for AI coding agents working on ${name}. Human contributors should start with [CONTRIBUTING.md](CONTRIBUTING.md); both describe the same workflow.

## Project overview

${description}

- Language: TypeScript (ES modules, \`strict\` mode), compiled with \`tsc\` from \`src/\` to \`dist/\`
- Runtime: Node.js 22.12 or newer (see \`.nvmrc\` and \`engines\` in \`package.json\`)
- Package manager: ${pm}
- Tests: Vitest, next to the code as \`src/**/*.test.ts\`

## Setup

\`\`\`bash
${setupLines(pm)}
\`\`\`

## Commands

- Build: ${run("build")}
- Test: ${run("test")}
- Coverage: ${run("test:coverage")} (fails below 80% lines, functions, branches, or statements)
- Lint: ${run("lint")}
- Type-check: ${run("typecheck")}
- Format: ${run("format")} (check only: ${run("format:check")})

Before you finish a change, run lint, format:check, typecheck, test, and build. CI (\`.github/workflows/ci.yml\`) runs the same scripts on Node 22 and 24.

## Code style

- Prettier (\`.prettierrc\`) owns formatting: double quotes, semicolons, trailing commas, 100-character lines. Run ${run("format")} instead of formatting by hand.
- ESLint (\`eslint.config.js\`) uses the recommended JavaScript and typescript-eslint rules. Fix the code rather than disabling a rule.
- EditorConfig (\`.editorconfig\`): UTF-8, LF line endings, 2-space indentation, final newline.
- Keep changes small and focused, and add or update tests for every behavior change.

## Pull requests and commits

- Follow [CONTRIBUTING.md](CONTRIBUTING.md) and fill in the pull request template.
- Use Conventional Commits (\`feat:\`, \`fix:\`, \`docs:\`, \`chore:\`, \`refactor:\`, \`test:\`).
- Record user-facing changes under \`[Unreleased]\` in [CHANGELOG.md](CHANGELOG.md).
- Never commit secrets, \`.env\` files, \`dist/\`, or \`coverage/\`.

## Security

Never put vulnerability details in public issues, pull requests, or commits. Follow [SECURITY.md](SECURITY.md) to report them privately.
`;
}

/** `.github/copilot-instructions.md`: points GitHub Copilot at AGENTS.md. */
export function copilotInstructionsText(opts: ScaffoldOptions): string {
  const pm = opts.packageManager;
  return `# Copilot instructions

This repository keeps its instructions for AI coding agents in [AGENTS.md](../AGENTS.md). Read it before making changes: it covers setup, the build, test, lint, and format commands, code style, and the pull request and security expectations.

In short:

- Install with \`${pmInstall(pm)}\`${pm === "yarn" ? " (after \`corepack enable\`)" : ""}, then check your work with \`${pmRun(pm, "lint")}\`, \`${pmRun(pm, "format:check")}\`, \`${pmRun(pm, "test")}\`, and \`${pmRun(pm, "build")}\`.
- Follow [CONTRIBUTING.md](../CONTRIBUTING.md) for pull requests and commits, and [SECURITY.md](../SECURITY.md) for vulnerabilities.
`;
}
