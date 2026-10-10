/**
 * Light-touch email check for CLI flags: non-empty local@domain with a dot in the domain.
 * Not RFC 5322-complete — just rejects clearly invalid values before writing files.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate a required non-empty email; returns the trimmed value or throws. */
export function assertValidEmail(value: string, flag: string): string {
  const trimmed = value.trim();
  if (!trimmed || !EMAIL_RE.test(trimmed)) {
    throw new Error(
      `Invalid ${flag} "${value}". Provide a valid email address (e.g. security@example.com).`,
    );
  }
  return trimmed;
}

/**
 * Optional email flag: `undefined` / blank → unset; non-empty → validated.
 * Use for `--security-email` (and similar) where omitting the flag is fine.
 */
export function normalizeOptionalEmail(
  value: string | undefined,
  flag: string,
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return assertValidEmail(trimmed, flag);
}
