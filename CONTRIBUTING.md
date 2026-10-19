# Contributing to ossready

Thanks for your interest in contributing!

## Development

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Make your changes on a feature branch
4. Run `npm run lint`, `npm test`, and `npm run build`
5. Check the repo still passes its own audit: `node dist/cli.js doctor . --strict`
6. Open a pull request

Try the CLI locally:

```bash
node dist/cli.js init /tmp/demo --name demo --dry-run
node dist/cli.js init /tmp/demo --name demo --github-owner YOUR_GITHUB_USERNAME --force
node dist/cli.js doctor /tmp/demo
```

## Project layout

- `src/cli.ts` — command definitions (`init`, `doctor`)
- `src/commands/` — command implementations
- `src/templates/` — one function per scaffolded file; `buildScaffoldFiles()` in `src/templates/index.ts` lists everything `init` writes
- `tests/` — Vitest suites (one `*-scaffold.test.ts` per scaffolded feature)

## Adding a scaffolded file

1. Add a template function under `src/templates/` and export it from `src/templates/index.ts`
2. Wire it into `buildScaffoldFiles()`
3. Add tests in `tests/` (template output and `ossready init` writing the file)
4. If it is a community health file or automation, consider adding a check to `ossready doctor` (`src/commands/doctor.ts`) and mapping it to its file(s) in `FIX_FILES` (`src/commands/fix.ts`) so `doctor --fix` can write it
5. Update `README.md` and the `Unreleased` section of `CHANGELOG.md`

ossready dogfoods its own templates: files such as `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`, `.github/dependabot.yml`, `.editorconfig`, and `.github/workflows/codeql.yml` must match the template output. `tests/dogfood.test.ts` fails when they drift — if you change one of those templates, update the matching file at the repo root too.

## Commit messages

Prefer [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `chore:` tooling / maintenance
- `refactor:` code change that neither fixes a bug nor adds a feature
- `test:` adding or updating tests

## Releasing

The published package is checked the way users get it, as a packed tarball:

- `npm test` includes `tests/package-contents.test.ts`, which builds and runs `npm pack --dry-run --json`. It fails if the tarball is missing the `bin` entry (with its shebang), the compiled `dist/` files, `README.md`, `LICENSE`, `CHANGELOG.md` or `package.json`, if `main` / `exports` / `types` point at files that are not packed, if anything outside the `files` allowlist (sources, tests, `.github/`, `tsconfig`, coverage, `.env` / `.npmrc` / keys) gets in, or if it grows past the size budget. Run `npm pack --dry-run` yourself to see the file list and size.
- The `prepack` script runs `npm run build`, so `npm pack` and `npm publish` always ship a fresh `dist/`.
- The `packed-install` CI job packs the tarball, installs it into a temp project, and runs the installed binary: `ossready --version` must equal the `package.json` version, then `ossready --help`, `ossready init --yes --name smoke --github-owner YasinzHyper` and `ossready doctor --strict` in a temp directory.

To release, bump `version` in `package.json`, move the `Unreleased` entries in `CHANGELOG.md` under the new version, and wait for CI to be green on `main`. Publishing is maintainer-only and needs explicit approval: the maintainer publishes a GitHub Release, and the Publish workflow (`.github/workflows/publish.yml`) runs test + build and publishes to npm with provenance using the maintainer's `NPM_TOKEN` repository secret. Pull requests never tag, release, or publish.

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## Code of conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful
and constructive. Harassment or discrimination is not welcome.
