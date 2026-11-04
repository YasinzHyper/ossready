# Examples

Copy-paste recipes for using ossready in CI and day-to-day workflows. Command and option reference: [commands.md](commands.md). Every `ossready doctor` check: [checks.md](checks.md).

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

`--json` and `--markdown` cannot be combined: pick Markdown for humans (summaries, comments) or JSON for machines. With `--fix`, the fix plan goes to stderr so stdout stays pure Markdown suitable for piping.

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

Commit the filters you always want so local runs and CI stay in sync without repeating flags. Any of these files works (first match wins):

1. `.ossreadyrc` / `.ossreadyrc.json` / `.ossready.json` in the repo root
2. the `"ossready"` key in `package.json`

```json
// .ossreadyrc
{
  "skip": ["funding", "citation"]
}
```

```json
// package.json (excerpt)
{
  "name": "my-lib",
  "ossready": {
    "doctor": {
      "skip": ["funding", "citation"]
    }
  }
}
```

`check` and `skip` accept a string, a comma-separated string, or an array of strings — the same tokens as the CLI flags (ids from [`ossready doctor --list`](checks.md)).

```bash
# Picks up .ossreadyrc / package.json#ossready automatically
ossready doctor . --strict

# Point at a shared team file, or ignore config for a full audit
ossready doctor . --config ./team-ossready.json --strict
ossready doctor . --strict --ignore-config
```

CLI `--check` replaces a config `check`. CLI `--skip` is **added** to config `skip` (persistent skips stay on). `--json` includes `filter.config` when a file contributed.
