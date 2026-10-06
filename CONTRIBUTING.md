# Contributing to ossready

Thanks for your interest in contributing! ossready is a small TypeScript CLI, so most changes are a template in `src/templates/`, its wiring in `src/templates/index.ts`, and a test in `tests/`.

## Development

1. Fork and clone the repository
2. Install dependencies: `npm install` (Node 18 or newer; CI tests Node 18, 20, and 22)
3. Make your changes on a feature branch
4. Run the checks CI runs:
   - `npm run lint` (TypeScript type-check)
   - `npm test` (Vitest)
   - `npm run build`
5. Try the CLI against a scratch directory:

   ```bash
   node dist/cli.js init /tmp/demo --name demo --github-owner YourGitHubUser
   node dist/cli.js doctor /tmp/demo
   ```

6. Open a pull request and fill in the template

## Adding a new scaffolded file

- Add a `…Text(opts)` function in `src/templates/` and register it in `buildScaffoldFiles`
- If the file is a community health file or workflow, consider adding a matching `ossready doctor` check in `src/commands/doctor.ts`
- Dogfood it: ossready's own repo should pass `ossready doctor . --strict` (enforced by `tests/dogfood.test.ts`)
- Document it in `README.md` and add an entry under **Unreleased** in `CHANGELOG.md`

## Commit messages

Prefer [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `chore:` tooling / maintenance
- `refactor:` code change that neither fixes a bug nor adds a feature
- `test:` adding or updating tests

## Releases

Publishing a GitHub Release triggers the Publish workflow, which runs tests and the build and then publishes to npm with provenance.

## Code of conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). Security issues go through [SECURITY.md](SECURITY.md), not public issues.
