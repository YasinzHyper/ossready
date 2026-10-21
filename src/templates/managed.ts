/**
 * Ownership marker for the template-owned files ossready generates. It is the
 * first line of each of them:
 *
 * - YAML (workflows, Dependabot, Issue Forms) and `.editorconfig` start with a
 *   `#` comment line (`MANAGED_MARKER`).
 * - Markdown (`.github/PULL_REQUEST_TEMPLATE.md`) starts with an HTML comment
 *   (`MARKDOWN_MANAGED_MARKER`) followed by a blank line, so GitHub doesn't
 *   render it and Prettier leaves it alone.
 *
 * `ossready sync` (and `ossready doctor`'s `managed-files` check) only update
 * files that still start with it, so a file you have taken over (by deleting
 * the line) is never touched without `--force`.
 *
 * Deliberately left unmarked:
 * - README.md, LICENSE, package.json, CHANGELOG.md and source files: yours from day one.
 * - CONTRIBUTING.md, SUPPORT.md, AGENTS.md and SECURITY.md: meant to be rewritten
 *   for the project (SECURITY.md's supported-versions table in particular).
 * - CODE_OF_CONDUCT.md and SECURITY.md also embed the `--coc-email` /
 *   `--security-email` contacts, which can't be recovered from the repo, so
 *   re-rendering them is not deterministic.
 * - CODEOWNERS, FUNDING.yml and CITATION.cff: filled in by hand.
 */
export const MANAGED_MARKER =
  "# Managed by ossready — edit freely; `ossready sync` previews template updates (delete this line to opt out)";

/** The same marker as an HTML comment, for Markdown templates. */
export const MARKDOWN_MANAGED_MARKER =
  "<!-- Managed by ossready — edit freely; `ossready sync` previews template updates (delete this line to opt out) -->";

/** What identifies the marker, so a later rewording keeps older files managed. */
const MANAGED_PREFIXES = ["# Managed by ossready", "<!-- Managed by ossready"];

/** Prepend the `#` marker line to a template (YAML, `.editorconfig`). */
export function withManagedMarker(text: string): string {
  return `${MANAGED_MARKER}\n${text}`;
}

/** Prepend the HTML comment marker and a blank line to a Markdown template. */
export function withMarkdownManagedMarker(text: string): string {
  return `${MARKDOWN_MANAGED_MARKER}\n\n${text}`;
}

function firstLine(text: string): string {
  return (text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "").trimStart();
}

/** Whether the first line of `text` is the ossready marker (either form). */
export function isManaged(text: string): boolean {
  const first = firstLine(text);
  return MANAGED_PREFIXES.some((prefix) => first.startsWith(prefix));
}

/** `text` without its marker line (unchanged when it has none). */
export function stripManagedMarker(text: string): string {
  if (!isManaged(text)) return text;
  const nl = text.indexOf("\n");
  if (nl === -1) return "";
  const rest = text.slice(nl + 1);
  // The Markdown marker is followed by a blank line; drop that too.
  return firstLine(text).startsWith("<!--") ? rest.replace(/^\r?\n/, "") : rest;
}
