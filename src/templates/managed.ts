/**
 * Ownership marker for the template-owned GitHub config files ossready generates
 * (workflows, Dependabot, Issue Forms). It is the first line of each of them.
 * `ossready sync` only updates files that still start with it, so a file you
 * have taken over (by deleting the line) is never touched without `--force`.
 */
export const MANAGED_MARKER =
  "# Managed by ossready — edit freely; `ossready sync` previews template updates (delete this line to opt out)";

/** What identifies the marker, so a later rewording keeps older files managed. */
const MANAGED_PREFIX = "# Managed by ossready";

/** Prepend the marker line to a template. */
export function withManagedMarker(text: string): string {
  return `${MANAGED_MARKER}\n${text}`;
}

/** Whether the first line of `text` is the ossready marker. */
export function isManaged(text: string): boolean {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  return first.trimStart().startsWith(MANAGED_PREFIX);
}

/** `text` without its marker line (unchanged when it has none). */
export function stripManagedMarker(text: string): string {
  if (!isManaged(text)) return text;
  const nl = text.indexOf("\n");
  return nl === -1 ? "" : text.slice(nl + 1);
}
