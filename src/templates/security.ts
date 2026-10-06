import type { ScaffoldOptions } from "./types.js";

/** Placeholder used when no security contact email is known */
export const PLACEHOLDER_SECURITY_EMAIL = "security@example.com";

/** GitHub private vulnerability reporting URL for the repo (or an OWNER placeholder) */
export function securityAdvisoryUrl(opts: Pick<ScaffoldOptions, "name" | "githubOwner">): string {
  const owner = opts.githubOwner ?? "OWNER";
  return `https://github.com/${owner}/${opts.name}/security/advisories/new`;
}

export function securityMdText(opts: ScaffoldOptions): string {
  const { name, githubOwner, securityEmail } = opts;
  const advisoryUrl = securityAdvisoryUrl(opts);

  const channels: string[] = [];
  channels.push(
    githubOwner
      ? `**GitHub Security Advisories** — open a private advisory via
   [Report a vulnerability](${advisoryUrl}).`
      : `**GitHub Security Advisories** — open a private advisory via
   [Report a vulnerability](${advisoryUrl})
   (replace \`OWNER\` with your GitHub username or organization).`,
  );
  if (securityEmail) {
    channels.push(`**Email** — send details to \`${securityEmail}\`.`);
  } else if (!githubOwner) {
    channels.push(
      `**Email** — send details to \`${PLACEHOLDER_SECURITY_EMAIL}\` (replace with a real contact).`,
    );
  }

  const list =
    channels.length === 1
      ? `- ${channels[0].replace(/\n   /g, "\n  ")}`
      : channels.map((c, i) => `${i + 1}. ${c}`).join("\n");

  return `# Security Policy

## Supported Versions

Use this section to tell users which versions of **${name}** receive security updates.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

Please **do not** file a public GitHub issue for security vulnerabilities in ${name}.

Report privately instead:

${list}

Include as much detail as you can:

- Description of the issue and impact
- Steps to reproduce
- Affected versions / commit SHAs
- Any known workarounds or mitigations

We will acknowledge reports as soon as practical and coordinate a disclosure timeline with you.
`;
}
