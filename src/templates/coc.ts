import { securityAdvisoryUrl } from "./security.js";
import type { ScaffoldOptions } from "./types.js";

/** Placeholder used when neither --coc-email nor --github-owner is provided */
export const PLACEHOLDER_COC_EMAIL = "conduct@example.com";

function enforcementContact(opts: ScaffoldOptions): string {
  const { cocEmail, githubOwner } = opts;
  if (cocEmail) {
    return `may be reported
to the community leaders responsible for enforcement at **${cocEmail}**.`;
  }
  if (githubOwner) {
    return `may be reported
privately to the maintainers ([@${githubOwner}](https://github.com/${githubOwner})) by opening a
[private advisory](${securityAdvisoryUrl(opts)}) and noting that it is a
Code of Conduct report, or to GitHub via
[Report abuse](https://docs.github.com/en/communities/maintaining-your-safety-on-github/reporting-abuse-or-spam).`;
  }
  return `may be reported
to the community leaders responsible for enforcement at **${PLACEHOLDER_COC_EMAIL}**.`;
}

export function codeOfConductText(opts: ScaffoldOptions): string {
  const { name } = opts;
  return `# Contributor Covenant Code of Conduct

## Our Pledge

We as members, contributors, and leaders of **${name}** pledge to make participation
in our community a harassment-free experience for everyone, regardless of age, body
size, visible or invisible disability, ethnicity, sex characteristics, gender identity
and expression, level of experience, education, socio-economic status, nationality,
personal appearance, race, caste, color, religion, or sexual identity and orientation.

We pledge to act and interact in ways that contribute to an open, welcoming, diverse,
inclusive, and healthy community.

## Our Standards

Examples of behavior that contributes to a positive environment include:

- Demonstrating empathy and kindness toward other people
- Being respectful of differing opinions, viewpoints, and experiences
- Giving and gracefully accepting constructive feedback
- Accepting responsibility and apologizing to those affected by our mistakes
- Focusing on what is best for the overall community

Examples of unacceptable behavior include:

- The use of sexualized language or imagery, and sexual attention or advances of any kind
- Trolling, insulting or derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without their explicit permission
- Other conduct which could reasonably be considered inappropriate in a professional setting

## Enforcement Responsibilities

Community leaders are responsible for clarifying and enforcing our standards of
acceptable behavior and will take appropriate and fair corrective action in response
to behavior they deem inappropriate, threatening, offensive, or harmful.

## Scope

This Code of Conduct applies within all community spaces and when an individual is
officially representing the community in public spaces.

## Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior ${enforcementContact(opts)}

All complaints will be reviewed and investigated promptly and fairly.

## Attribution

This Code of Conduct is adapted from the [Contributor Covenant][homepage], version 2.1,
available at https://www.contributor-covenant.org/version/2/1/code_of_conduct.html.

[homepage]: https://www.contributor-covenant.org
`;
}
