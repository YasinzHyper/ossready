import type { ScaffoldOptions } from "./types.js";

export type CitationOpts = Pick<
  ScaffoldOptions,
  "name" | "license" | "githubOwner"
> & {
  /** Explicit --author when provided; otherwise placeholder authors entry */
  author?: string;
};

function licenseSpdx(license: ScaffoldOptions["license"]): string {
  return license === "mit" ? "MIT" : "Apache-2.0";
}

function authorsBlock(author?: string): string {
  const trimmed = author?.trim();
  if (trimmed) {
    // Entity form accepts any display name from --author
    return `authors:
  - name: "${trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return `# Set real author metadata (or pass --author to ossready init)
authors:
  - name: "Anonymous"`;
}

/**
 * Citation File Format 1.2.0 (CITATION.cff) for cite-this-software metadata.
 * @see https://citation-file-format.github.io/
 */
export function citationCffText(opts: CitationOpts): string {
  const { name, license, githubOwner, author } = opts;
  const owner = githubOwner?.trim();
  const lines: string[] = [
    "cff-version: 1.2.0",
    'message: "If you use this software, please cite it using the metadata from this file."',
    `title: "${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
    "type: software",
    authorsBlock(author),
    `license: ${licenseSpdx(license)}`,
  ];

  if (owner) {
    const repoUrl = `https://github.com/${owner}/${name}`;
    lines.push(`url: "${repoUrl}"`);
    lines.push(`repository-code: "${repoUrl}"`);
  } else {
    lines.push(
      "# url / repository-code: set via --github-owner, or uncomment and edit:",
    );
    lines.push(`# url: "https://github.com/YOUR_GITHUB_USERNAME/${name}"`);
    lines.push(
      `# repository-code: "https://github.com/YOUR_GITHUB_USERNAME/${name}"`,
    );
  }

  return lines.join("\n") + "\n";
}
