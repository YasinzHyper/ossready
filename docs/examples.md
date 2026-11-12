# Examples

Copy-paste recipes for using ossready in CI and day-to-day workflows. Command and option reference: [commands.md](commands.md). Every `ossready doctor` check: [checks.md](checks.md). Project config (`.ossreadyrc` / JSON Schema): [configuration.md](configuration.md).

## `doctor --markdown` in a GitHub Actions job summary

Append the Markdown report to `$GITHUB_STEP_SUMMARY` so every CI run shows the score, verdict, and per-check table on the job summary page. Absolute paths are omitted from the report so the summary stays clean.

```yaml
permissions:
  contents: read

jobs:
  doctor:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npm install
      - run: npm run build
      # Fail the job when required (or, with --strict, recommended) checks fail.
      - name: Audit with ossready doctor
        run: npx ossready doctor . --strict
      # Always publish the report to the job summary, even when the audit fails.
      - name: Doctor report in the job summary
        if: always()
        run: npx ossready doctor . --markdown >> "$GITHUB_STEP_SUMMARY"
```

ossready's own [CI workflow](../.github/workflows/ci.yml) does the same after `npm run build` with `node dist/cli.js`.

## Sticky pull request comment with `doctor --markdown`

Post (or update) one PR comment that always shows the latest doctor report. Use a HTML marker comment so the step finds and edits the previous comment instead of stacking new ones. Needs `pull-requests: write`.

```yaml
name: Doctor report

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  doctor-comment:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npm install
      - run: npm run build
      - name: Write doctor Markdown
        run: npx ossready doctor . --markdown > /tmp/doctor.md
      - name: Sticky PR comment
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          header: ossready-doctor
          path: /tmp/doctor.md
```

`--json`, `--markdown` and `--sarif` cannot be combined: pick Markdown for humans (summaries, comments), JSON for scripts, or SARIF for code scanning. With `--fix`, the fix plan goes to stderr so stdout stays pure Markdown suitable for piping.

## GitHub code scanning alerts with `doctor --sarif`

`--sarif` prints a [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html) log that GitHub code scanning understands, so each missing file shows up as an alert in the repository's **Security → Code scanning** tab (required checks as errors, recommended ones as warnings) and closes on its own once the file lands. Every check is a rule with its description, what it looks at, how `--fix` helps, and a link to [checks.md](checks.md). Outdated workflow actions point at their exact `uses:` line, and stale ossready-managed files point at each file.

```yaml
permissions:
  contents: read

jobs:
  doctor:
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      security-events: write # upload-sarif
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - name: ossready doctor (SARIF)
        run: npx ossready doctor . --sarif > ossready.sarif
      - name: Upload to code scanning
        if: always() # upload even when doctor exits 1 for missing required files
        uses: github/codeql-action/upload-sarif@v4
        with:
          sarif_file: ossready.sarif
          category: ossready
```

The doctor step still exits `1` when required checks are missing (or recommended ones with `--strict` / `"strict": true`); `if: always()` keeps the upload running so the alerts appear anyway. Add `continue-on-error: true` to the doctor step if you want alerts without failing the job. `--check` / `--skip` and project config narrow the uploaded results the same way they narrow the report. Code scanning is free for public repositories; private repositories need GitHub Advanced Security.

## The ossready GitHub Action

Instead of the `npx ossready` steps above, use this repository as an action. It builds ossready from source on the runner, writes the job summary, and can write SARIF in one step; inputs and outputs are listed in the [README](../README.md#github-action).

```yaml
steps:
  - uses: actions/checkout@v7
  - uses: actions/setup-node@v7
    with:
      node-version: 22
  - id: ossready
    uses: YasinzHyper/ossready@main # or pin a commit SHA
    continue-on-error: true # report without failing the job
    with:
      sarif-file: ossready.sarif
  - run: echo "ossready doctor ${{ steps.ossready.outputs.result }}"
```

## `doctor --check` / `--skip`

Run a subset of checks, or ignore ones that do not apply to the repo. Ids are the ones from [`ossready doctor --list`](checks.md) (for example `readme`, `pkg-links`, `funding`). Repeat the flag or pass a comma-separated list.

```bash
# Only the community-health required checks
ossready doctor . --check readme,license,code-of-conduct,contributing,security,issue-templates,pr-template,ci --strict

# Full audit, but do not fail --strict on funding / citation
ossready doctor . --strict --skip funding --skip citation

# Debug one publish-readiness check as JSON
ossready doctor . --check pkg-links --json
```

In CI, prefer skipping over deleting files when a recommended check is intentionally out of scope:

```yaml
- name: Audit with ossready doctor
  run: npx ossready doctor . --strict --skip funding --skip citation
```

## Persistent `--check` / `--skip` via project config

Commit the filters you always want so local runs and CI stay in sync without repeating flags. Full reference: [configuration.md](configuration.md). Fresh scaffolds already include a starter `.ossreadyrc` with `"$schema"`; existing repos can add one with `ossready config --init`. Add `skip` / `check` there (or use any of these — first match wins):

1. `.ossreadyrc` / `.ossreadyrc.json` / `.ossready.json` in the repo root
2. the `"ossready"` key in `package.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/YasinzHyper/ossready/main/schema/ossreadyrc.schema.json",
  "skip": ["funding", "citation"]
}
```

```json
{
  "name": "my-lib",
  "ossready": {
    "doctor": {
      "skip": ["funding", "citation"]
    }
  }
}
```

`check` and `skip` accept a string, a comma-separated string, or an array of strings — the same tokens as the CLI flags (ids from [`ossready doctor --list`](checks.md)). Unknown config keys fail with a did-you-mean suggestion. Point `"$schema"` at the shipped [`schema/ossreadyrc.schema.json`](../schema/ossreadyrc.schema.json) (also published as `ossready/schema.json`) for editor validation.

```bash
# Show what config doctor will pick up (or write a starter)
ossready config .
ossready config . --init

# Picks up .ossreadyrc / package.json#ossready automatically
ossready doctor . --strict

# Point at a shared team file, or ignore config for a full audit
ossready doctor . --config ./team-ossready.json --strict
ossready doctor . --strict --ignore-config
```

CLI `--check` replaces a config `check`. CLI `--skip` is **added** to config `skip` (persistent skips stay on). `--json` includes `filter.config` when a file contributed.
