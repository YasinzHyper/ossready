import { isAbsolute, relative, sep } from "node:path";
import type { DoctorLevel } from "../checks.js";
import type { DoctorReport } from "./doctor.js";
import { findingsFor } from "./sarif.js";

/**
 * GitHub Actions workflow commands for `ossready doctor --annotations`: every
 * failing check becomes an `::error` (required) or `::warning` (recommended)
 * line, which the runner turns into an annotation on the workflow run (and on
 * the pull request's changed files when the line is in the diff). Uses the
 * same findings as `--sarif` (outdated actions, missing permissions and
 * injections point at their workflow line), without needing code scanning or
 * `security-events: write`. Pure: no I/O.
 */

export type AnnotationCommand = "error" | "warning";

export interface Annotation {
  command: AnnotationCommand;
  /** Check id from the catalogue */
  checkId: string;
  /** Path relative to the workspace (the current directory), forward slashes */
  file: string;
  line?: number;
  title: string;
  message: string;
}

/** Required checks are errors, recommended checks warnings (strict mode only changes the exit code). */
export function annotationCommand(level: DoctorLevel): AnnotationCommand {
  return level === "required" ? "error" : "warning";
}

/** Escape a workflow command message (`%`, CR, LF), per the GitHub Actions toolkit. */
export function escapeAnnotationData(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** Escape a workflow command property value: the message escapes plus `:` and `,`. */
export function escapeAnnotationProperty(text: string): string {
  return escapeAnnotationData(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

/**
 * The audited directory relative to `cwd`, as a path prefix ending in `/`, so
 * `ossready doctor packages/lib --annotations` run from the repository root
 * annotates `packages/lib/README.md`. Empty when the directory is `cwd` or not
 * inside it (then paths stay relative to the audited directory, like SARIF).
 */
export function annotationPrefix(directory: string, cwd: string): string {
  const rel = relative(cwd, directory);
  if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) return "";
  return `${rel.split(sep).join("/")}/`;
}

function joinPath(prefix: string, path: string): string {
  const clean = path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  return `${prefix}${clean}` || ".";
}

/** One annotation per finding of every failing check, in report order. */
export function doctorAnnotations(report: DoctorReport, options: { cwd?: string } = {}): Annotation[] {
  const prefix = annotationPrefix(report.directory, options.cwd ?? process.cwd());
  const annotations: Annotation[] = [];
  for (const r of report.results) {
    if (r.ok) continue;
    for (const f of findingsFor(r, report)) {
      annotations.push({
        command: annotationCommand(r.level),
        checkId: r.id,
        file: joinPath(prefix, f.path),
        ...(f.line ? { line: f.line } : {}),
        title: `ossready ${r.id} (${r.level})`,
        message: f.message,
      });
    }
  }
  return annotations;
}

/** Render one annotation as a workflow command line. */
export function formatAnnotation(a: Annotation): string {
  const props = [`file=${escapeAnnotationProperty(a.file)}`];
  if (a.line) props.push(`line=${a.line}`);
  props.push(`title=${escapeAnnotationProperty(a.title)}`);
  return `::${a.command} ${props.join(",")}::${escapeAnnotationData(a.message)}`;
}

/** Every annotation line for a report (empty when every selected check passes). */
export function formatDoctorAnnotations(report: DoctorReport, options: { cwd?: string } = {}): string[] {
  return doctorAnnotations(report, options).map(formatAnnotation);
}
