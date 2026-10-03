export function bugReportTemplate(): string {
  return `name: Bug report
description: Report a problem so we can fix it
title: "[bug] "
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to report a bug. The more detail you share, the faster we can help.
  - type: textarea
    id: description
    attributes:
      label: Description
      description: A clear and concise description of what the bug is.
    validations:
      required: true
  - type: textarea
    id: reproduce
    attributes:
      label: Steps to reproduce
      description: Minimal steps that trigger the problem.
      placeholder: |
        1.
        2.
        3.
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
      description: What you expected to happen.
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: Actual behavior
      description: What actually happened (include error messages if any).
    validations:
      required: true
  - type: textarea
    id: environment
    attributes:
      label: Environment
      description: OS, Node version, and package version.
      value: |
        - OS:
        - Node version:
        - Package version:
    validations:
      required: false
  - type: textarea
    id: additional
    attributes:
      label: Additional context
      description: Logs, screenshots, or related issues.
    validations:
      required: false
`;
}

export function featureRequestTemplate(): string {
  return `name: Feature request
description: Suggest an idea for this project
title: "[feat] "
labels: ["enhancement"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for suggesting an improvement. Please focus on the problem first so we can discuss solutions together.
  - type: textarea
    id: problem
    attributes:
      label: Problem
      description: What problem does this solve? Who is affected?
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: Proposed solution
      description: How would you like it to work?
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
      description: Other approaches you thought about, and why they fall short.
    validations:
      required: false
  - type: textarea
    id: additional
    attributes:
      label: Additional context
      description: Links, mocks, or related issues.
    validations:
      required: false
`;
}

export function issueTemplateConfigText(
  opts?: { name?: string; githubOwner?: string },
): string {
  const owner = opts?.githubOwner?.trim() || "OWNER";
  const repo = opts?.name?.trim() || "REPO";
  return `blank_issues_enabled: false
contact_links:
  - name: Security vulnerability
    url: https://github.com/${owner}/${repo}/security/advisories/new
    about: Please report security issues privately (see SECURITY.md) — do not file a public issue.
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

export function codeownersText(opts?: { githubOwner?: string }): string {
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
        uses: ossf/scorecard-action@v2.4.4
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

export function staleWorkflowText(): string {
  return `name: Stale

on:
  schedule:
    # Daily at 01:37 UTC (offset minute to avoid :00 thundering herd)
    - cron: "37 1 * * *"
  workflow_dispatch:

permissions:
  issues: write
  pull-requests: write

jobs:
  stale:
    runs-on: ubuntu-latest
    steps:
      - name: Close stale issues and PRs
        uses: actions/stale@v9
        with:
          days-before-issue-stale: 60
          days-before-pr-stale: 90
          days-before-issue-close: 14
          days-before-pr-close: 14
          stale-issue-label: stale
          stale-pr-label: stale
          exempt-issue-labels: pinned,security,good first issue
          exempt-pr-labels: pinned,security,good first issue
          exempt-all-milestones: true
          stale-issue-message: >
            This issue has been automatically marked as stale because it has not had
            recent activity. It will be closed in 14 days if no further activity occurs.
            Thank you for your contributions.
          close-issue-message: >
            This issue was closed because it remained stale for 14 days with no activity.
            Please reopen if this is still relevant.
          stale-pr-message: >
            This pull request has been automatically marked as stale because it has not had
            recent activity. It will be closed in 14 days if no further activity occurs.
            Thank you for your contributions.
          close-pr-message: >
            This pull request was closed because it remained stale for 14 days with no activity.
            Please reopen if you still intend to merge it.
`;
}
