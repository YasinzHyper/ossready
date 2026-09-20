# ossready

**Scaffold production-ready public GitHub repos in one command.**

Stop copying the same LICENSE, CI workflow, issue templates, and CONTRIBUTING.md into every new repo. `ossready` writes a polished TypeScript project layout with the OSS hygiene GitHub expects—ready to push and open to contributors.

[![CI](https://github.com/YasinzHyper/ossready/actions/workflows/ci.yml/badge.svg)](https://github.com/YasinzHyper/ossready/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

## Why ossready?

Shipping open source is more than `git init` and a README. Public repos that look “ready” usually include:

- A correct license
- CI that actually runs
- Issue / PR templates
- Contribution guidelines and a changelog
- A release path for version tags
- A security policy and dependency update automation
- A Code of Conduct for community standards
- Consistent editor defaults and automated CodeQL scanning
- Prettier formatting config and scripts

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

# Preview without writing files
ossready init my-lib --dry-run

# Full options
ossready init my-lib \
  --name my-lib \
  --description "Does one thing well" \
  --author "Your Name" \
  --license mit \
  --package-manager npm \
  --coc-email conduct@example.com
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `[directory]` | `.` | Target folder (created if missing) |
| `--name <name>` | directory basename | Package / project name |
| `--description <text>` | short default | README description |
| `--author <name>` | project name (see note) | Copyright holder written into LICENSE |
| `--license <license>` | `mit` | `mit` or `apache-2.0` |
| `--package-manager <pm>` | `npm` | `npm`, `pnpm`, or `bun` |
| `--coc-email <email>` | `conduct@example.com` | Contact email in CODE_OF_CONDUCT.md |
| `--force` | off | Overwrite existing files |
| `--dry-run` | off | Print planned files without writing |

When `--author` is omitted, the LICENSE copyright holder defaults to the project name (with the existing special-case for scaffolding into `.` without `--name`).

### What gets written

```
LICENSE
README.md
SECURITY.md
CODE_OF_CONDUCT.md
.gitignore
.editorconfig
.prettierrc
.prettierignore
CONTRIBUTING.md
CHANGELOG.md
package.json
tsconfig.json
vitest.config.ts
src/index.ts
src/index.test.ts
.github/workflows/ci.yml
.github/workflows/release.yml   # tag v* → GitHub Release
.github/workflows/codeql.yml    # CodeQL for JS/TS
.github/ISSUE_TEMPLATE/bug_report.md
.github/ISSUE_TEMPLATE/feature_request.md
.github/PULL_REQUEST_TEMPLATE.md
.github/CODEOWNERS
.github/dependabot.yml          # weekly npm + GitHub Actions updates
```

Scaffolded CI uses `npm install` (or `pnpm install` / `bun install`) without a lockfile cache so the first push succeeds. After you commit a lockfile, switch to `npm ci` + `cache: npm` (or the equivalent frozen install for pnpm/bun).

## Examples

```bash
# MIT + npm (default)
npx ossready init cool-cli --name cool-cli --description "A cool CLI"

# Custom copyright holder
npx ossready init cool-cli --name cool-cli --author "Jane Doe"

# Custom Code of Conduct contact
npx ossready init cool-cli --name cool-cli --coc-email mods@example.org

# Apache-2.0 + pnpm
npx ossready init enterprise-kit \
  --license apache-2.0 \
  --package-manager pnpm

# Preview the plan first
npx ossready init my-app --dry-run

# Existing folder — overwrite carefully
npx ossready init . --name my-app --force
```

## Releasing (this package)

`ossready` is set up for npm with `publishConfig.access: public` and a Publish workflow.

1. Bump `version` in `package.json` and update [CHANGELOG.md](CHANGELOG.md).
2. Commit, push, and create a GitHub Release (or tag `vX.Y.Z` and publish a release from it).
3. On `release: published`, [.github/workflows/publish.yml](.github/workflows/publish.yml) runs test + build, then `npm publish --access public --provenance`.

**One-time setup:** add an npm Automation token as the repository secret `NPM_TOKEN` (Settings → Secrets and variables → Actions). Optionally enable [trusted publishing](https://docs.npmjs.com/trusted-publishers) for this GitHub repo on npmjs.com so provenance can use OIDC.

## Development (this repo)

```bash
npm install
npm run build
npm test
node dist/cli.js --help
node dist/cli.js init /tmp/demo --name demo --force
node dist/cli.js init /tmp/demo --name demo --dry-run
```

## License

MIT © Mohammed Yasin Zuhayr ([YasinzHyper](https://github.com/YasinzHyper))
