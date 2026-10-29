# AGENTS.md

Instructions for AI coding agents working on ossready. Human contributors should start with [CONTRIBUTING.md](CONTRIBUTING.md); both describe the same workflow.

## Project overview

ossready is a TypeScript CLI (built on `cac`) that scaffolds production-ready public GitHub repos (`ossready init`) and audits existing ones (`ossready doctor`, with `--fix` to write missing files).

- `src/cli.ts`: the `bin` entry point; it only calls `runCli()`
- `src/program.ts`: registers the commands from `src/cliSpec.ts` with cac and runs them; `src/cliErrors.ts` turns usage mistakes (unknown command or option, missing option value, extra arguments) into friendly errors with did-you-mean suggestions
- `src/commands/`: `init.ts`, `doctor.ts` (the checks), `fix.ts` (`FIX_FILES` maps each check to the files `--fix` writes)
- `src/prompts.ts`: interactive TTY prompts for `init` (skipped with `--yes`, in CI, or when stdin/stdout is not a terminal)
- `src/templates/`: one function per scaffolded file; `buildScaffoldFiles()` in `src/templates/index.ts` lists everything `init` writes
- `tests/`: Vitest suites, one `*-scaffold.test.ts` per scaffolded feature
- Runtime: Node.js 22.12 or newer; CI runs Node 22 and 24

## Setup and commands

```bash
npm install
npm run build
npm test
npm run lint        # tsc --noEmit
node dist/cli.js doctor . --strict
```

This repo uses `npm install`, not `npm ci`, and has no committed lockfile. Do not add `cache: npm` to workflows or commit a partial lockfile.

## Rules for changes

- Generated files must pass Prettier: `tests/scaffold-format.test.ts` runs Prettier over every file `ossready init` writes, for npm, pnpm, Yarn, and bun.
- Dogfooded files (`CODE_OF_CONDUCT.md`, `SECURITY.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`, `.github/dependabot.yml`, `.editorconfig`, `.github/workflows/codeql.yml`) must stay byte-identical to their templates. `tests/dogfood.test.ts` fails when they drift.
- GitHub Action versions in templates and in this repo's workflows move together (`tests/action-pins.test.ts`), and the Node matrix and `engines` stay in sync (`tests/node-support.test.ts`).
- Scaffolded and dogfooded workflows pin `runs-on` to `DEFAULT_RUNNER` (`ubuntu-24.04` in `src/templates/actions.ts`), not `ubuntu-latest`, so CI stays on a known Ubuntu LTS when GitHub rolls the floating label forward. Bump the constant (and this repo's workflows) together when moving onto a newer LTS.
- A new scaffolded file needs a template, a `buildScaffoldFiles()` entry, tests, and README and CHANGELOG updates. If it is a community health file, add a doctor check and a `FIX_FILES` entry.
- Every behavior change needs a test. Keep the code style of the surrounding file (2-space indentation, double quotes, LF, see `.editorconfig`).

## Pull requests and commits

- Follow [CONTRIBUTING.md](CONTRIBUTING.md) and the pull request template.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).
- Add user-facing changes under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
- Do not tag, release, or publish to npm from a pull request.

## Security

Never put vulnerability details in public issues, pull requests, or commits. Follow [SECURITY.md](SECURITY.md) to report them privately.
