/**
 * Every `ossready` command and option, in `--help` order. src/cli.ts registers
 * them with cac from this list, and `npm run docs:gen` renders
 * docs/commands.md from it, so `--help` and the docs come from one source.
 */

export interface OptionSpec {
  /** cac option syntax, e.g. `--name <name>` or `-y, --yes` */
  flags: string;
  description: string;
  /** cac default (boolean flags only) */
  default?: boolean;
}

export type CommandName = "init" | "doctor" | "sync" | "badges";

export interface CommandSpec {
  name: CommandName;
  /** cac command syntax, e.g. `init [directory]` */
  usage: string;
  description: string;
  options: readonly OptionSpec[];
  /** Short shell examples for docs/commands.md */
  examples: readonly string[];
  /** Extra Markdown paragraph for docs/commands.md */
  note?: string;
}

export const COMMANDS: readonly CommandSpec[] = [
  {
    name: "init",
    usage: "init [directory]",
    description: "Scaffold a production-ready GitHub repo",
    // No cac defaults for --license / --package-manager / --coc-email: an omitted flag
    // must stay `undefined` so the interactive prompt knows to ask. initCommand applies
    // the same defaults (mit / npm / conduct@example.com) when nothing is given.
    options: [
      { flags: "--name <name>", description: "Project / package name" },
      { flags: "--description <text>", description: "Short project description" },
      { flags: "--author <name>", description: "Copyright holder for LICENSE and CITATION.cff authors" },
      { flags: "--license <license>", description: "License: mit | apache-2.0 (default: mit)" },
      { flags: "--package-manager <pm>", description: "Package manager: npm | pnpm | yarn | bun (default: npm)" },
      { flags: "--coc-email <email>", description: "Code of Conduct contact email (default: conduct@example.com)" },
      { flags: "--security-email <email>", description: "Private security contact email for SECURITY.md" },
      {
        flags: "--github-owner <owner>",
        description:
          "GitHub username or org for README badges, URLs, CODEOWNERS, FUNDING.yml, CITATION.cff, SUPPORT.md, and SECURITY.md",
      },
      {
        flags: "-y, --yes",
        description: "Skip interactive prompts and use defaults for omitted options",
        default: false,
      },
      { flags: "--force", description: "Overwrite existing files", default: false },
      { flags: "--dry-run", description: "Print planned files without writing", default: false },
    ],
    examples: [
      "ossready init my-lib",
      "ossready init my-lib --yes --license apache-2.0 --package-manager pnpm",
      "ossready init . --dry-run",
    ],
  },
  {
    name: "doctor",
    usage: "doctor [directory]",
    description: "Audit an existing repo for missing OSS-readiness files",
    options: [
      { flags: "--json", description: "Print the report as JSON", default: false },
      {
        flags: "--markdown",
        description: "Print the report as Markdown (for GitHub job summaries and PR comments)",
        default: false,
      },
      {
        flags: "--strict",
        description: "Also fail (exit 1) when recommended checks are missing",
        default: false,
      },
      {
        flags: "--fix",
        description: "Write missing files from ossready's templates (never overwrites)",
        default: false,
      },
      { flags: "--dry-run", description: "With --fix: list files that would be written", default: false },
      {
        flags: "--github-owner <owner>",
        description:
          "GitHub owner for --fix and the readme-badges check (default: from package.json or git remote)",
      },
      { flags: "--author <name>", description: "With --fix: copyright holder (default: package.json author)" },
      {
        flags: "--license <license>",
        description: "With --fix: mit | apache-2.0 (default: package.json license)",
      },
      { flags: "--coc-email <email>", description: "With --fix: Code of Conduct contact email" },
      {
        flags: "--security-email <email>",
        description: "With --fix: private security contact email for SECURITY.md",
      },
      {
        flags: "--list",
        description:
          "List every check (id, level, description, --fix support) without auditing; add --json for JSON",
        default: false,
      },
    ],
    examples: [
      "ossready doctor .",
      "ossready doctor . --strict --json",
      'ossready doctor . --markdown >> "$GITHUB_STEP_SUMMARY"',
      "ossready doctor . --fix --dry-run",
      "ossready doctor --list",
    ],
    note: "Every check is described in [checks.md](checks.md), and `ossready doctor --list` prints the same catalogue.",
  },
  {
    name: "sync",
    usage: "sync [directory]",
    description:
      "Update ossready-managed workflows, Dependabot and Issue Forms to the current templates (dry run unless --write)",
    options: [
      {
        flags: "--write",
        description: "Apply the changes (default: dry run with a diff per file; exits 1 when changes are pending)",
        default: false,
      },
      { flags: "--add-missing", description: "Also create managed files that don't exist yet", default: false },
      { flags: "--force", description: "Also overwrite files without the ossready marker line", default: false },
      { flags: "--quiet", description: "One summary line per file instead of diffs", default: false },
      { flags: "--json", description: "Print the result as JSON", default: false },
      {
        flags: "--github-owner <owner>",
        description: "GitHub owner for owner-bound files (default: package.json links or the origin remote)",
      },
      {
        flags: "--package-manager <pm>",
        description: "npm | pnpm | yarn | bun (default: from lockfiles or package.json packageManager)",
      },
    ],
    examples: ["ossready sync .", "ossready sync . --quiet", "ossready sync . --write"],
  },
  {
    name: "badges",
    usage: "badges [directory]",
    description: "Print README badges (CI, npm, license, Scorecard, CodeQL) for a repo",
    options: [
      {
        flags: "--write",
        description: "Insert or update the badge block in README.md between ossready markers",
        default: false,
      },
      { flags: "--dry-run", description: "With --write: show what would change without writing", default: false },
      { flags: "--json", description: "Print the badges as JSON", default: false },
      {
        flags: "--github-owner <owner>",
        description: "GitHub owner (default: package.json links, git remotes, or git config github.user)",
      },
      {
        flags: "--repo <repo>",
        description: "Repository name or <owner>/<name> (default: from package.json links or the origin remote)",
      },
    ],
    examples: [
      "ossready badges .",
      "ossready badges . --write --dry-run",
      "ossready badges . --write --github-owner octo",
    ],
  },
];

/** The spec for one command; throws for an unknown name. */
export function commandSpec(name: CommandName): CommandSpec {
  const spec = COMMANDS.find((c) => c.name === name);
  if (!spec) throw new Error(`Unknown command "${name}"`);
  return spec;
}
