import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { doctorCommand, runDoctor } from "../src/commands/doctor.js";
import { inferScaffoldOptions, packageManagerFromField } from "../src/commands/fix.js";
import { initCommand } from "../src/commands/init.js";
import { buildScaffoldFiles, type ScaffoldOptions } from "../src/templates/index.js";
import { YARN_VERSION } from "../src/templates/types.js";
import { pathExists } from "../src/utils/fs.js";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ossready-yarn-"));
}

const BASE: ScaffoldOptions = {
  name: "yarn-app",
  description: "yarn scaffold",
  license: "mit",
  packageManager: "yarn",
  year: 2026,
  copyrightHolder: "Octo",
  cocEmail: "",
  githubOwner: "octo",
};

function files(packageManager: ScaffoldOptions["packageManager"]): Map<string, string> {
  return new Map(
    buildScaffoldFiles({ ...BASE, packageManager }).map((f) => [f.path, f.content]),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("ossready init --package-manager yarn", () => {
  it("sets up modern Yarn via Corepack in CI without a frozen lockfile or cache", () => {
    const ci = files("yarn").get(".github/workflows/ci.yml")!;
    expect(ci).toContain("uses: actions/setup-node@v7");
    expect(ci).toContain("- run: corepack enable");
    expect(ci).toContain("- run: yarn install");
    expect(ci).toContain('YARN_ENABLE_IMMUTABLE_INSTALLS: "false"');
    expect(ci.indexOf("corepack enable")).toBeLessThan(ci.indexOf("yarn install"));
    expect(ci.indexOf("setup-node")).toBeLessThan(ci.indexOf("corepack enable"));
    for (const script of ["lint", "format:check", "test", "test:coverage", "build"]) {
      expect(ci).toContain(`- run: yarn ${script}\n`);
    }
    expect(ci).not.toMatch(/--immutable|--frozen-lockfile|cache:|npm (install|ci|test|run)/);
    expect(ci).not.toContain("pnpm/action-setup");
  });

  it("installs, tests and builds with Yarn in publish.yml but still publishes with npm", () => {
    const yml = files("yarn").get(".github/workflows/publish.yml")!;
    expect(yml).toContain("registry-url: https://registry.npmjs.org");
    expect(yml).toContain("- run: corepack enable");
    expect(yml).toContain("- run: yarn install");
    expect(yml).toContain('YARN_ENABLE_IMMUTABLE_INSTALLS: "false"');
    expect(yml).toContain("- run: yarn test");
    expect(yml).toContain("- run: yarn build");
    expect(yml).toContain("npm publish --access public --provenance");
    expect(yml).not.toMatch(/- run: npm (install|test|run build)/);
    expect(yml).not.toContain("cache:");
  });

  it("keeps publish.yml on npm for npm, pnpm and bun scaffolds", () => {
    for (const pm of ["npm", "pnpm", "bun"] as const) {
      const yml = files(pm).get(".github/workflows/publish.yml")!;
      expect(yml, pm).toContain("- run: npm install");
      expect(yml, pm).not.toContain("corepack");
    }
  });

  it("pins Yarn in package.json and adds a node-modules .yarnrc.yml", () => {
    const yarn = files("yarn");
    const pkg = JSON.parse(yarn.get("package.json")!);
    expect(pkg.packageManager).toBe(`yarn@${YARN_VERSION}`);
    expect(YARN_VERSION).toMatch(/^4\.\d+\.\d+$/);
    expect(yarn.get(".yarnrc.yml")).toBe("nodeLinker: node-modules\n");
    expect(yarn.has("yarn.lock")).toBe(false);
    // Yarn does not auto-install peers, and Vitest 5 peers on vite.
    expect(pkg.devDependencies.vite).toMatch(/^\^8\./);

    for (const pm of ["npm", "pnpm", "bun"] as const) {
      const other = files(pm);
      expect(JSON.parse(other.get("package.json")!).packageManager, pm).toBeUndefined();
      expect(other.has(".yarnrc.yml"), pm).toBe(false);
      expect(JSON.parse(other.get("package.json")!).devDependencies.vite, pm).toBeUndefined();
    }
  });

  it("ignores Yarn Berry state in .gitignore, .prettierignore and ESLint", () => {
    const yarn = files("yarn");
    const gitignore = yarn.get(".gitignore")!.split("\n");
    for (const line of [
      ".pnp.*",
      ".yarn/*",
      "!.yarn/patches",
      "!.yarn/plugins",
      "!.yarn/releases",
      "!.yarn/sdks",
      "!.yarn/versions",
    ]) {
      expect(gitignore).toContain(line);
    }
    const prettierignore = yarn.get(".prettierignore")!.split("\n");
    expect(prettierignore).toEqual(expect.arrayContaining(["yarn.lock", ".yarn", ".pnp.*"]));
    expect(yarn.get("eslint.config.js")).toContain('".yarn/**"');
  });

  it("documents yarn commands in README and CONTRIBUTING", () => {
    const yarn = files("yarn");
    const readme = yarn.get("README.md")!;
    expect(readme).toContain("corepack enable\nyarn install\nyarn build\nyarn test\n");
    const contributing = yarn.get("CONTRIBUTING.md")!;
    expect(contributing).toContain("`corepack enable`, then `yarn install`");
    expect(contributing).toContain("`yarn lint`, `yarn test`, and `yarn build`");
    expect(files("npm").get("README.md")).not.toContain("corepack");
  });

  it("keeps Dependabot on the npm ecosystem (it covers Yarn)", () => {
    expect(files("yarn").get(".github/dependabot.yml")).toContain("package-ecosystem: npm");
  });

  it("accepts --package-manager yarn (any case) and prints Corepack next steps", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });
    const dir = await makeTempDir();
    await initCommand(dir, { name: "yarn-cli", packageManager: "YARN", license: "mit" });
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    expect(pkg.packageManager).toBe(`yarn@${YARN_VERSION}`);
    expect(await pathExists(join(dir, ".yarnrc.yml"))).toBe(true);
    const out = logs.join("\n");
    expect(out).toMatch(/corepack enable\n\s+yarn install\n\s+yarn build/);
  });

  it("rejects unknown package managers and lists yarn as valid", async () => {
    const dir = await makeTempDir();
    await expect(
      initCommand(dir, { name: "bad-pm", packageManager: "yarn1", dryRun: true }),
    ).rejects.toThrow("Use: npm | pnpm | yarn | bun");
  });
});

describe("ossready doctor on yarn projects", () => {
  it("passes doctor --strict on a fresh yarn scaffold", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const dir = await makeTempDir();
    await initCommand(dir, { name: "yarn-doctor", packageManager: "yarn", githubOwner: "octo" });
    const report = await runDoctor(dir);
    expect(report.results.filter((r) => !r.ok).map((r) => r.id)).toEqual([]);
  });

  it("detects yarn from yarn.lock, .yarnrc.yml or the packageManager field", async () => {
    const lock = await makeTempDir();
    await writeFile(join(lock, "yarn.lock"), "# yarn lockfile v1\n", "utf8");
    expect((await inferScaffoldOptions(lock)).options.packageManager).toBe("yarn");

    const rc = await makeTempDir();
    await writeFile(join(rc, ".yarnrc.yml"), "nodeLinker: node-modules\n", "utf8");
    expect((await inferScaffoldOptions(rc)).options.packageManager).toBe("yarn");

    const field = await makeTempDir();
    await writeFile(
      join(field, "package.json"),
      JSON.stringify({ name: "f", packageManager: "yarn@4.6.0+sha512.abc" }),
      "utf8",
    );
    expect((await inferScaffoldOptions(field)).options.packageManager).toBe("yarn");

    // A pnpm lockfile still wins, and plain repos stay on npm.
    await writeFile(join(lock, "pnpm-lock.yaml"), "lockfileVersion: 9\n", "utf8");
    expect((await inferScaffoldOptions(lock)).options.packageManager).toBe("pnpm");
    expect((await inferScaffoldOptions(await makeTempDir())).options.packageManager).toBe("npm");

    expect(packageManagerFromField("pnpm@9.15.0")).toBe("pnpm");
    expect(packageManagerFromField("deno@2")).toBeUndefined();
    expect(packageManagerFromField(42)).toBeUndefined();
  });

  it("doctor --fix writes a Yarn CI workflow for yarn repos", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const dir = await makeTempDir();
    await mkdir(join(dir, "src"));
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "yarn-legacy", license: "MIT" }),
      "utf8",
    );
    await writeFile(join(dir, "yarn.lock"), "# yarn lockfile v1\n", "utf8");
    await doctorCommand(dir, { fix: true, githubOwner: "octo" });
    const ci = await readFile(join(dir, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("- run: corepack enable");
    expect(ci).toContain("- run: yarn test");
    // doctor --fix never touches package.json
    expect(JSON.parse(await readFile(join(dir, "package.json"), "utf8")).packageManager).toBeUndefined();
  });
});
