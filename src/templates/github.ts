import type { ScaffoldOptions } from "./types.js";

export function bugReportTemplate(): string {
  return `---
name: Bug report
about: Report a problem so we can fix it
title: "[bug] "
labels: bug
assignees: ""
---

## Describe the bug

A clear and concise description of what the bug is.

## Steps to reproduce

1.
2.
3.

## Expected behavior

What you expected to happen.

## Actual behavior

What actually happened.

## Environment

- OS:
- Node version:
- Package version:

## Additional context

Logs, screenshots, or related issues.
`;
}

export function featureRequestTemplate(): string {
  return `---
name: Feature request
about: Suggest an idea for this project
title: "[feat] "
labels: enhancement
assignees: ""
---

## Problem

What problem does this solve?

## Proposed solution

How would you like it to work?

## Alternatives considered

Other approaches you thought about.

## Additional context

Links, mocks, or related issues.
`;
}

export function pullRequestTemplate(): string {
  return `## Summary

Briefly describe what this PR does and why.

## Changes

- 

## Checklist

- [ ] Tests added/updated (if applicable)
- [ ] Docs updated (if applicable)
- [ ] Conventional commit style used in commit messages
- [ ] CI passes locally (\`npm test\` / \`npm run build\`)

## Related issues

Closes #
`;
}

export function codeownersText(opts?: Pick<ScaffoldOptions, "githubOwner">): string {
  const owner = opts?.githubOwner?.trim();
  if (owner) {
    return `# CODEOWNERS — default reviewers for this repository
# Docs: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners

* @${owner}
`;
  }
  return `# CODEOWNERS — replace with your GitHub username or team
# Docs: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
#
# * @YOUR_GITHUB_USERNAME
`;
}

export function dependabotYmlText(): string {
  return `version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
`;
}

export function editorconfigText(): string {
  return `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
`;
}

export function codeqlWorkflowText(): string {
  return `name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: "27 3 * * 1"

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write

    strategy:
      fail-fast: false
      matrix:
        language: [javascript-typescript]

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: \${{ matrix.language }}

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:\${{ matrix.language }}"
`;
}

export function dependencyReviewWorkflowText(): string {
  return `name: Dependency Review

on:
  pull_request:

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  dependency-review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Dependency Review
        uses: actions/dependency-review-action@v4
`;
}

export function scorecardWorkflowText(): string {
  return `name: Scorecard supply-chain security

on:
  # For Branch-Protection check. Only the default branch is supported. See
  # https://github.com/ossf/scorecard/blob/main/docs/checks.md#branch-protection
  branch_protection_rule:
  # To guarantee Maintained check is occasionally updated. See
  # https://github.com/ossf/scorecard/blob/main/docs/checks.md#maintained
  schedule:
    - cron: "30 1 * * 6"
  push:
    branches: [main]

permissions: read-all

jobs:
  analysis:
    name: Scorecard analysis
    runs-on: ubuntu-latest
    # publish_results only works from the default branch
    if: github.event.repository.default_branch == github.ref_name || github.event_name == 'pull_request'
    permissions:
      security-events: write
      id-token: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: Run analysis
        uses: ossf/scorecard-action@v2
        with:
          results_file: results.sarif
          results_format: sarif
          # Optional PAT for Branch-Protection on public repos, or private repos:
          # repo_token: \${{ secrets.SCORECARD_TOKEN }}
          publish_results: true

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: SARIF file
          path: results.sarif
          retention-days: 5

      - name: Upload to code-scanning
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
`;
}
