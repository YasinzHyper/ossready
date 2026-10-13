import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { doctorCommand, runDoctor } from "../src/commands/doctor.js";
import { initCommand } from "../src/commands/init.js";
import { agentsMdText, copilotInstructionsText } from "../src/templates/index.js";
import type { ScaffoldOptions } from "../src/templates/types.js";
import { pathExists } from "../src/utils/fs.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function opts(packageManager: ScaffoldOptions["packageManager"]): ScaffoldOptions {
  return {
    name: "agent-lib",
    description: "A library that agents can work on.",
    license: "mit",
    packageManager,
    year: 2026,
    copyrightHolder: "Test",
    cocEmail: "",
  };
}

const COMMANDS = {
  npm: ["npm install", "npm run build", "npm run test", "npm run lint", "npm run test:coverage"],
  pnpm: ["pnpm install", "pnpm build", "pnpm test", "pnpm lint", "pnpm format:check"],
  yarn: ["corepack enable", "yarn install", "yarn build", "yarn test", "yarn typecheck"],
  bun: ["bun install", "bun run build", "bun run test", "bun run lint", "bun run format"],
} as const;

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("AGENTS.md scaffold", () => {
  for (const [pm, commands] of Object.entries(COMMANDS)) {
    it(`uses ${pm} commands`, () => {
      const text = agentsMdText(opts(pm as ScaffoldOptions["packageManager"]));
      for (const cmd of commands) expect(text).toContain(`${cmd}`);
      expect(text).toContain(`Package manager: ${pm}`);
      const copilot = copilotInstructionsText(opts(pm as ScaffoldOptions["packageManager"]));
      expect(copilot).toContain("../AGENTS.md");
      expect(copilot).toContain(commands[pm === "yarn" ? 1 : 0]);
    });
  }

  it("covers overview, style, PR and security guidance", () => {
    const text = agentsMdText(opts("npm"));
    expect(text.startsWith("# AGENTS.md\n")).toBe(true);
    expect(text).toContain("A library that agents can work on.");
    for (const s of ["Prettier", "ESLint", "EditorConfig", "Conventional Commits"]) {
      expect(text).toContain(s);
    }
    expect(text).toContain("[CONTRIBUTING.md](CONTRIBUTING.md)");
    expect(text).toContain("[SECURITY.md](SECURITY.md)");
    expect(text).not.toContain("corepack");
    expect(text.endsWith("\n")).toBe(true);
    expect(text).not.toMatch(/[ \t]+$/m);
  });

  it("is written by ossready init", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-agents-"));
    await initCommand(dir, { name: "agents-demo", packageManager: "pnpm" });
    const agents = await readFile(join(dir, "AGENTS.md"), "utf8");
    expect(agents).toContain("agents-demo");
    expect(agents).toContain("pnpm test");
    const copilot = await readFile(join(dir, ".github/copilot-instructions.md"), "utf8");
    expect(copilot).toContain("AGENTS.md");
  });

  it("is a recommended doctor check that --fix fills with the detected package manager", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-agents-fix-"));
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "legacy", license: "MIT" }));
    await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
    const before = await runDoctor(dir);
    const check = before.results.find((r) => r.id === "agents-md");
    expect(check?.level).toBe("recommended");
    expect(check?.ok).toBe(false);

    vi.spyOn(console, "log").mockImplementation(() => {});
    const after = await doctorCommand(dir, { fix: true });
    expect(after.results.find((r) => r.id === "agents-md")?.foundAt).toBe("AGENTS.md");
    expect(await readFile(join(dir, "AGENTS.md"), "utf8")).toContain("pnpm install");
    expect(await pathExists(join(dir, ".github/copilot-instructions.md"))).toBe(true);
  });

  it("keeps an existing AGENTS.md untouched", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ossready-agents-keep-"));
    await mkdir(join(dir, ".github"), { recursive: true });
    await writeFile(join(dir, "agents.md"), "# mine\n");
    const report = await runDoctor(dir);
    expect(report.results.find((r) => r.id === "agents-md")?.ok).toBe(true);
    expect(await readFile(join(dir, "agents.md"), "utf8")).toBe("# mine\n");
  });

  it("is dogfooded with ossready's own commands", async () => {
    const text = await readFile(join(repoRoot, "AGENTS.md"), "utf8");
    for (const s of ["npm install", "npm test", "npm run build", "doctor . --strict", "CONTRIBUTING.md", "SECURITY.md"]) {
      expect(text).toContain(s);
    }
  });
});
