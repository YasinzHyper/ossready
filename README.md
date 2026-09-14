# ossready

**Scaffold production-ready public GitHub repos in one command.**

Stop copying the same LICENSE, CI workflow, issue templates, and CONTRIBUTING.md into every new repo. `ossready` writes a polished TypeScript project layout with the OSS hygiene GitHub expects—ready to push and open to contributors.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

## Why ossready?

Shipping open source is more than `git init` and a README. Public repos that look “ready” usually include:

- A correct license
- CI that actually runs
- Issue / PR templates
- Contribution guidelines and a changelog
- A release path for version tags

`ossready` generates all of that (plus a minimal TypeScript `src/` that builds) so you can focus on the product.

## Install

```bash
# Global
npm i -g ossready

# Or one-shot
npx ossready init my-lib
```

Requires **Node.js 18+**.

## Usage

```bash
# Scaffold into a new directory
ossready init my-awesome-lib

# Scaffold into the current directory
ossready init .

# Full options
ossready init my-lib \
  --name my-lib \
  --description "Does one thing well" \
  --license mit \
  --package-manager npm
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `[directory]` | `.` | Target folder (created if missing) |
| `--name <name>` | directory basename | Package / project name |
| `--description <text>` | short default | README description |
| `--license <license>` | `mit` | `mit` or `apache-2.0` |
| `--package-manager <pm>` | `npm` | `npm`, `pnpm`, or `bun` |
| `--force` | off | Overwrite existing files |

### What gets written

```
LICENSE
README.md
.gitignore
CONTRIBUTING.md
CHANGELOG.md
package.json
tsconfig.json
src/index.ts
.github/workflows/ci.yml
.github/workflows/release.yml   # tag v* → GitHub Release
.github/ISSUE_TEMPLATE/bug_report.md
.github/ISSUE_TEMPLATE/feature_request.md
.github/PULL_REQUEST_TEMPLATE.md
.github/CODEOWNERS
```

## Examples

```bash
# MIT + npm (default)
npx ossready init cool-cli --name cool-cli --description "A cool CLI"

# Apache-2.0 + pnpm
npx ossready init enterprise-kit \
  --license apache-2.0 \
  --package-manager pnpm

# Existing folder — overwrite carefully
npx ossready init . --name my-app --force
```

## Development (this repo)

```bash
npm install
npm run build
npm test
node dist/cli.js --help
node dist/cli.js init /tmp/demo --name demo --force
```

## License

MIT © Mohammed Yasin Zuhayr ([YasinzHyper](https://github.com/YasinzHyper))
