export function dependabotYmlText(): string {
  return `version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
`;
}

export function securityMdText(): string {
  return `# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public GitHub issue.

1. Email the maintainers at \`security@example.com\` (replace this with a real contact before publishing).
2. Include a clear description of the issue, steps to reproduce, affected versions, and any proof-of-concept if available.
3. Allow a reasonable time for a response and fix before any public disclosure.

We aim to acknowledge reports within a few business days and will keep you informed of progress.

## Supported versions

Security fixes are typically applied to the latest release. Older versions may not receive patches.
`;
}
