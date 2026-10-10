export interface ScaffoldOptions {
  name: string;
  description: string;
  license: "mit" | "apache-2.0";
  packageManager: "npm" | "pnpm" | "bun";
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

export function pmRun(pm: ScaffoldOptions["packageManager"], script: string): string {
  switch (pm) {
    case "pnpm":
      return `pnpm ${script}`;
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
    case "bun":
      return "bun install";
    default:
      return "npm install";
  }
}
