import { createHash } from "node:crypto";
import { CHECK_CATALOG, plainText, type DoctorLevel } from "../checks.js";
import type { DoctorReport, DoctorResult } from "./doctor.js";

/**
 * SARIF 2.1.0 output for `ossready doctor --sarif`, so missing OSS-readiness
 * files show up as GitHub code scanning alerts (upload with
 * `github/codeql-action/upload-sarif`). Only the subset of SARIF that code
 * scanning reads is produced. Pure: no I/O.
 */

export const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";
export const SARIF_VERSION = "2.1.0";
export const OSSREADY_INFORMATION_URI = "https://github.com/YasinzHyper/ossready";
export const CHECKS_DOC_URI = `${OSSREADY_INFORMATION_URI}/blob/main/docs/checks.md`;
/** Key in `partialFingerprints`, versioned so the scheme can change without colliding. */
export const SARIF_FINGERPRINT_KEY = "ossreadyFindingHash/v1";

export type SarifLevel = "error" | "warning";

export interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  help: { text: string; markdown: string };
  helpUri: string;
  defaultConfiguration: { level: SarifLevel };
  properties: { tags: string[]; level: DoctorLevel; fixable: string };
}

export interface SarifResult {
  ruleId: string;
  ruleIndex: number;
  level: SarifLevel;
  message: { text: string };
  locations: {
    physicalLocation: {
      artifactLocation: { uri: string; uriBaseId: "%SRCROOT%" };
      region?: { startLine: number };
    };
  }[];
  partialFingerprints: Record<string, string>;
}

export interface SarifLog {
  $schema: string;
  version: typeof SARIF_VERSION;
  runs: {
    tool: {
      driver: {
        name: "ossready";
        version: string;
        semanticVersion: string;
        informationUri: string;
        rules: SarifRule[];
      };
    };
    results: SarifResult[];
  }[];
}

/** Required checks are errors, recommended checks warnings (strict mode only changes the exit code). */
export function sarifLevel(level: DoctorLevel): SarifLevel {
  return level === "required" ? "error" : "warning";
}

/** `kebab-case` check id → `PascalCase` rule name (SARIF `rule.name`). */
function ruleName(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** A SARIF URI for a repo-relative path: forward slashes, no leading `./` or `/`, segments percent-encoded. */
export function sarifUri(path: string): string {
  const clean = path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  return (clean || ".")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function fingerprint(ruleId: string, uri: string, extra = ""): string {
  return createHash("sha256").update(`${ruleId}\0${uri}\0${extra}`).digest("hex").slice(0, 32);
}

/** One SARIF rule per catalogued check, in catalogue order (so `ruleIndex` is stable across runs). */
export function sarifRules(): SarifRule[] {
  return CHECK_CATALOG.map((c) => {
    const description = plainText(c.description);
    const fix = plainText(c.fix);
    const looksAt = plainText(c.looksAt);
    return {
      id: c.id,
      name: ruleName(c.id),
      shortDescription: { text: c.title },
      fullDescription: { text: description },
      help: {
        text: `${description}\n\nLooks at: ${looksAt}\n\nFix: ${fix}`,
        markdown: `${c.description}\n\n**Looks at:** ${c.looksAt}\n\n**Fix:** ${c.fix}${
          c.fixable === "no" ? "" : "\n\nRun `npx ossready doctor --fix` (add `--dry-run` to preview)."
        }`,
      },
      helpUri: `${CHECKS_DOC_URI}#${c.id}`,
      defaultConfiguration: { level: sarifLevel(c.level) },
      properties: { tags: ["ossready", "oss-readiness", c.level], level: c.level, fixable: c.fixable },
    };
  });
}

interface Finding {
  message: string;
  path: string;
  line?: number;
  /** Disambiguates several findings of one rule in one file (e.g. two outdated actions) */
  key?: string;
}

/** Where a failing check points: the file it wants, or the exact files and lines at fault. */
function findingsFor(result: DoctorResult, report: DoctorReport): Finding[] {
  const message = plainText(result.detail ?? `Missing ${result.scaffoldPath}. ${result.hint}`);
  if (result.group === "workflow-actions" && report.workflowActions.status === "checked") {
    const outdated = report.workflowActions.outdated;
    if (outdated.length) {
      return outdated.map((f) => ({
        message: `${f.action}@${f.ref} is older than the recommended ${f.recommended}. ${plainText(result.hint)}`,
        path: f.file,
        line: f.line,
        key: `${f.action}@${f.ref}:${f.line}`,
      }));
    }
  }
  if (result.group === "managed-files" && report.managedFiles.status === "checked") {
    const stale = report.managedFiles.files.filter((f) => f.status === "outdated");
    if (stale.length) {
      return stale.map((f) => {
        const counts = f.added !== undefined || f.removed !== undefined ? ` (+${f.added ?? 0} -${f.removed ?? 0})` : "";
        return {
          message: `${f.path} differs from the current ossready template${counts}. ${plainText(result.hint)}`,
          path: f.path,
        };
      });
    }
  }
  return [{ message, path: result.scaffoldPath }];
}

/**
 * Render a doctor report as a SARIF 2.1.0 log: every catalogued check becomes
 * a rule (title, description, what it looks at, how `--fix` helps, link to
 * docs/checks.md), and every failing check becomes a result pointing at the
 * file it wants. Outdated workflow actions point at their `uses:` line, and
 * stale managed files point at each file. Passing checks produce no result,
 * so a fully ready repo uploads an empty `results` array and code scanning
 * closes earlier alerts. Fingerprints depend only on the rule and location,
 * so re-runs update alerts instead of duplicating them.
 */
export function formatDoctorSarif(
  report: DoctorReport,
  options: { version: string },
): SarifLog {
  const rules = sarifRules();
  const index = new Map(rules.map((r, i) => [r.id, i]));
  const results: SarifResult[] = [];
  for (const r of report.results) {
    if (r.ok) continue;
    const ruleIndex = index.get(r.id);
    if (ruleIndex === undefined) continue; // every doctor check is catalogued; guard anyway
    for (const f of findingsFor(r, report)) {
      const uri = sarifUri(f.path);
      results.push({
        ruleId: r.id,
        ruleIndex,
        level: sarifLevel(r.level),
        message: { text: f.message },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri, uriBaseId: "%SRCROOT%" },
              ...(f.line ? { region: { startLine: f.line } } : {}),
            },
          },
        ],
        partialFingerprints: { [SARIF_FINGERPRINT_KEY]: fingerprint(r.id, uri, f.key) },
      });
    }
  }
  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: "ossready",
            version: options.version,
            semanticVersion: options.version,
            informationUri: OSSREADY_INFORMATION_URI,
            rules,
          },
        },
        results,
      },
    ],
  };
}
