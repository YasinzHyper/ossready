import type { ScaffoldOptions } from "./types.js";

export function securityMdText(opts: ScaffoldOptions): string {
  const { name } = opts;
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

1. **GitHub Security Advisories** — open a private advisory via
   [Report a vulnerability](https://github.com/OWNER/${name}/security/advisories/new)
   (replace \`OWNER\` with your GitHub username or organization).
2. **Email** — send details to \`security@example.com\` (replace with a real contact).

Include as much detail as you can:

- Description of the issue and impact
- Steps to reproduce
- Affected versions / commit SHAs
- Any known workarounds or mitigations

We will acknowledge reports as soon as practical and coordinate a disclosure timeline with you.
`;
}
