/**
 * Single source of truth for the GitHub Action versions ossready recommends.
 *
 * Keys are `owner/repo` (sub-actions such as `github/codeql-action/init` share
 * their repo's entry). The scaffold templates pin exactly these refs, which
 * `tests/action-pins.test.ts` enforces, and `ossready doctor` uses them to flag
 * outdated majors in an existing repo's workflows (`workflow-actions` check).
 */
export const RECOMMENDED_ACTIONS: Readonly<Record<string, string>> = {
  "actions/checkout": "v7",
  "actions/setup-node": "v7",
  "actions/upload-artifact": "v7",
  "actions/stale": "v11",
  "actions/dependency-review-action": "v5",
  "github/codeql-action": "v4",
  "pnpm/action-setup": "v6",
  "oven-sh/setup-bun": "v2",
  "softprops/action-gh-release": "v3",
  "ossf/scorecard-action": "v2.5.0",
  "dessant/lock-threads": "v6",
};

/**
 * GitHub-hosted runner label for every scaffolded (and dogfooded) workflow.
 *
 * Pin an explicit Ubuntu LTS instead of `ubuntu-latest` so CI stays on a known
 * image when GitHub rolls `ubuntu-latest` forward (for example the 2026-10-19
 * migration from 24.04 to 26.04). Bump this constant, regenerate dogfood
 * workflows, and update ossready's own `ci.yml` when intentionally moving
 * scaffolds onto a newer LTS. `tests/action-pins.test.ts` enforces the pin.
 */
export const DEFAULT_RUNNER = "ubuntu-24.04";

/** `github/codeql-action/init` → `github/codeql-action` (lower-cased). */
export function actionKey(action: string): string {
  return action.split("/").slice(0, 2).join("/").toLowerCase();
}

/** Major version of a tag-like ref (`v4`, `v2.4.4`, `3`); undefined for branches and SHAs. */
export function refMajor(ref: string): number | undefined {
  const m = /^v?(\d+)(?:\.\d+){0,2}$/i.exec(ref.trim());
  return m?.[1] !== undefined ? Number(m[1]) : undefined;
}

/** A full 40-character commit SHA pin. */
export function isShaRef(ref: string): boolean {
  return /^[0-9a-f]{40}$/i.test(ref.trim());
}

export type ActionRefStatus =
  | { kind: "unknown" }
  | { kind: "sha"; recommended: string }
  | { kind: "unversioned"; recommended: string }
  | { kind: "current"; recommended: string }
  | { kind: "outdated"; recommended: string };

/** Compare `action@ref` against RECOMMENDED_ACTIONS by major version. */
export function classifyActionRef(action: string, ref: string): ActionRefStatus {
  const recommended = RECOMMENDED_ACTIONS[actionKey(action)];
  if (recommended === undefined) return { kind: "unknown" };
  if (isShaRef(ref)) return { kind: "sha", recommended };
  const have = refMajor(ref);
  const want = refMajor(recommended);
  if (have === undefined || want === undefined) return { kind: "unversioned", recommended };
  return have < want ? { kind: "outdated", recommended } : { kind: "current", recommended };
}
