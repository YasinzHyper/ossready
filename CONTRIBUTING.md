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

## Releases

Bump `version` in `package.json`, update `CHANGELOG.md`, and publish a GitHub Release. The Publish workflow (`.github/workflows/publish.yml`) then runs test + build and publishes to npm with provenance.

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## Code of conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful
and constructive. Harassment or discrimination is not welcome.
