import type { ScaffoldOptions } from "./types.js";

export type SupportOpts = Pick<
  ScaffoldOptions,
  "name" | "githubOwner"
>;

/**
 * GitHub community health SUPPORT.md — "Get support" guidance for maintainers.
 * @see https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/adding-support-resources-to-your-project
 */
export function supportMdText(opts: SupportOpts): string {
  const { name } = opts;
  const owner = opts.githubOwner?.trim();
  const issuesUrl = owner
    ? `https://github.com/${owner}/${name}/issues`
    : `https://github.com/OWNER/${name}/issues`;
  const discussionsUrl = owner
    ? `https://github.com/${owner}/${name}/discussions`
    : `https://github.com/OWNER/${name}/discussions`;
  const newIssueUrl = owner
    ? `https://github.com/${owner}/${name}/issues/new/choose`
    : `https://github.com/OWNER/${name}/issues/new/choose`;

  const ownerNote = owner
    ? ""
    : "\n> Replace `OWNER` in the links below with your GitHub username or organization (or pass `--github-owner` to `ossready init`).\n";

  return `# Support

Thanks for using **${name}**! This document explains how to get help and where to report problems.
${ownerNote}
## Before you ask

1. Search [existing issues](${issuesUrl}) for a similar report or question.
2. Check [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md) for usage and setup guidance.
3. If [GitHub Discussions](${discussionsUrl}) is enabled for this repository, look there for Q&A and ideas.

## Asking a question

- **Usage / how-to** — Prefer [GitHub Discussions](${discussionsUrl}) (when enabled), or open a brief issue with clear context.
- **Feature ideas** — Use the **Feature request** issue form via [New issue](${newIssueUrl}).
- **Bugs** — Use the **Bug report** issue form via [New issue](${newIssueUrl}). Include steps to reproduce, expected vs actual behavior, and environment details.

Please do **not** open blank issues when forms are available — the templates help maintainers respond faster.

## Security vulnerabilities

Do **not** report security issues in public Issues or Discussions.

Follow [SECURITY.md](SECURITY.md) and use private GitHub Security Advisories (or the contact listed there).

## Response expectations

Maintainers review new issues and discussions as time allows. There is no guaranteed SLA for volunteer-maintained open source.

- We may ask for more detail before investigating.
- Duplicate or off-topic reports may be closed with a link to the canonical thread.
- Pull requests that follow [CONTRIBUTING.md](CONTRIBUTING.md) are appreciated; please open an issue first for large changes.

## Code of Conduct

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful and constructive.
`;
}
