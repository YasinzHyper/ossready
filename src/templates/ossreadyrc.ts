import { OSSREADY_RC_SCHEMA_URL } from "../config.js";

/**
 * Starter `.ossreadyrc` for a fresh scaffold. Only `$schema` is set so editors
 * validate the file against the shipped JSON Schema; `check` / `skip` stay
 * unset until the project needs persistent doctor filters. Not managed by
 * `ossready sync` — projects customize this freely.
 */
export function ossreadyrcText(): string {
  return (
    JSON.stringify(
      {
        $schema: OSSREADY_RC_SCHEMA_URL,
      },
      null,
      2,
    ) + "\n"
  );
}
