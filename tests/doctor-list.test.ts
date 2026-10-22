import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECK_CATALOG, checkInfo } from "../src/checks.js";
import {
  checkList,
  DOCTOR_CHECKS,
  formatCheckList,
  listChecksCommand,
  MANAGED_FILES_CHECK,
  PACKAGE_JSON_CHECKS,
  README_BADGES_CHECK,
  runDoctor,
  WORKFLOW_ACTIONS_CHECK,
} from "../src/commands/doctor.js";
import { FIX_FILES } from "../src/commands/fix.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Every doctor check in report order, as doctor defines it. */
const DOCTOR_ORDER = [
  ...DOCTOR_CHECKS,
  ...PACKAGE_JSON_CHECKS.map((c) => ({ ...c, level: "recommended", group: "package-json" })),
  WORKFLOW_ACTIONS_CHECK,
  README_BADGES_CHECK,
  MANAGED_FILES_CHECK,
];

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("doctor check catalogue (src/checks.ts)", () => {
  it("lists every doctor check once, in report order", () => {
    expect(CHECK_CATALOG.map((c) => c.id)).toEqual(DOCTOR_ORDER.map((c) => c.id));
    expect(new Set(CHECK_CATALOG.map((c) => c.id)).size).toBe(30);
  });

  it("is where doctor takes each check's label, level and group from", () => {
    for (const check of DOCTOR_ORDER) {
      const info = checkInfo(check.id);
      expect(check.label, check.id).toBe(info.title);
      expect(check.level, check.id).toBe(info.level);
      expect(check.group, check.id).toBe(info.group);
    }
  });

  it("says what --fix can do, consistently with FIX_FILES and the report-only checks", () => {
    for (const c of CHECK_CATALOG.filter((x) => !x.group)) {
      expect(Object.keys(FIX_FILES), c.id).toContain(c.id);
      expect(c.fixable, c.id).toBe(c.id === "license" ? "partial" : "yes");
    }
    for (const c of CHECK_CATALOG.filter((x) => x.group === "package-json")) {
      expect(c.fixable, c.id).toBe(c.id === "pkg-links" ? "partial" : "no");
    }
    expect(checkInfo("workflow-actions").fixable).toBe("no");
    expect(checkInfo("readme-badges").fixable).toBe("partial");
    expect(checkInfo("managed-files").fixable).toBe("yes");
  });

  it("has a one-sentence description, a fix note and what it looks at for every check", () => {
    for (const c of CHECK_CATALOG) {
      expect(c.description, c.id).toMatch(/\.$/);
      expect(c.description, c.id).not.toContain("\n");
      expect(c.fix, c.id).toMatch(/\.$/);
      expect(c.looksAt.length, c.id).toBeGreaterThan(0);
      expect(Boolean(c.runsWhen), c.id).toBe(Boolean(c.group));
    }
  });

  it("throws for an unknown check id", () => {
    expect(() => checkInfo("nope")).toThrow(/Unknown doctor check/);
  });
});

describe("ossready doctor --list", () => {
  it("prints every check with its title, level, --fix support and what it looks at", () => {
    const text = formatCheckList();
    expect(text).toContain("ossready doctor checks (30)");
    expect(text).toContain("Required (8):");
    expect(text).toContain("Recommended (22):");
    for (const c of CHECK_CATALOG) {
      expect(text).toContain(`${c.id} — ${c.title} [--fix: ${c.fixable}]`);
    }
    expect(text).toContain("Looks at: README.md, README, README.markdown, README.rst or README.txt");
    expect(text).toContain("Runs only when a root README.md exists.");
    expect(text).not.toContain("`");
  });

  it("--json prints the catalogue as JSON without Markdown backticks, and exits 0", () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });
    listChecksCommand({ json: true });
    const parsed = JSON.parse(logs.join("\n")) as {
      total: number;
      checks: { id: string; fixable: string; runsWhen: string; group?: string }[];
    };
    expect(parsed.total).toBe(30);
    expect(parsed.checks).toEqual(checkList());
    expect(parsed.checks.map((c) => c.id)).toEqual(CHECK_CATALOG.map((c) => c.id));
    expect(parsed.checks.find((c) => c.id === "readme")).toMatchObject({
      title: "README",
      level: "required",
      fixable: "yes",
      runsWhen: "always",
    });
    expect(parsed.checks.find((c) => c.id === "pkg-links")).toMatchObject({
      fixable: "partial",
      group: "package-json",
    });
    expect(logs.join("\n")).not.toContain("`");
    expect(process.exitCode).toBeUndefined();
  });

  it("prints the text list without --json", () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });
    listChecksCommand();
    expect(logs.join("\n")).toBe(formatCheckList());
  });
});

describe("doctor results are unchanged by the catalogue", () => {
  it("reports ossready's own checks in catalogue order (30/30)", async () => {
    const report = await runDoctor(repoRoot);
    expect(report.results.map((r) => r.id)).toEqual(CHECK_CATALOG.map((c) => c.id));
    expect(report.passed).toBe(30);
    expect(report.total).toBe(30);
  });

  it("keeps catalogue-only fields out of the results", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-list-"));
    const report = await runDoctor(dir);
    for (const r of report.results) {
      expect(Object.keys(r)).toEqual(["id", "label", "level", "scaffoldPath", "hint", "ok"]);
    }
  });
});
