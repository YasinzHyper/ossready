export interface ScaffoldOptions {
  name: string;
  description: string;
  license: "mit" | "apache-2.0";
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
  year: number;
  copyrightHolder: string;
  /** Contact email for CODE_OF_CONDUCT.md enforcement */
  cocEmail: string;
  /** Optional private security contact email for SECURITY.md */
  securityEmail?: string;
  /** GitHub username or org for real URLs in README / package.json / CODEOWNERS */
  githubOwner?: string;
  /** Explicit --author when provided (CITATION.cff authors; LICENSE still uses copyrightHolder) */
  author?: string;
}

/** Package managers `ossready init --package-manager` accepts. */
export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;

/**
 * Yarn release pinned in the scaffolded `packageManager` field. Corepack reads it
 * to run modern Yarn (Berry); without it Corepack falls back to Yarn 1 (classic).
 */
export const YARN_VERSION = "4.18.1";

export function pmRun(pm: ScaffoldOptions["packageManager"], script: string): string {
  switch (pm) {
    case "pnpm":
      return `pnpm ${script}`;
    case "yarn":
      return `yarn ${script}`;
    case "bun":
      return `bun run ${script}`;
    default:
      return `npm run ${script}`;
  }
}

export function pmInstall(pm: ScaffoldOptions["packageManager"]): string {
  switch (pm) {
    case "pnpm":
      return "pnpm install";
    case "yarn":
      return "yarn install";
    case "bun":
      return "bun install";
    default:
      return "npm install";
  }
}
