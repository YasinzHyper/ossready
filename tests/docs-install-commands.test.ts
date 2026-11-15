import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The npm package is `ossready-cli` (the command is `ossready`). Docs should
 * prefer `npx ossready-cli` / `npm i -g ossready-cli`, and may also show the
 * GitHub install (`npx github:YasinzHyper/ossready`) as an alternative.
 * `npx ossready` / `npm i -g ossready` still fail — that unscoped name is not
 * on the registry (npm blocked it as too similar to `oss-ready`). Flip this
 * back to false only if the package is unpublished.
 */
const PUBLISHED_ON_NPM = true;

/** The npm package name; must match package.json `name`. */
const NPM_SPEC = "ossready-cli";

/** The GitHub install spec the docs use as an alternative; must match package.json `repository`. */
const GITHUB_SPEC = "github:YasinzHyper/ossready";

/** Install / run commands that need the *unscoped* `ossready` package, which is not on npm. */
const REGISTRY_ONLY: RegExp[] = [
  /\bnpx(?:\s+(?:-y|--yes|-p|--package))*[\s=]+ossready(?:@[^\s`'"]*)?(?=[\s`'"]|$)/,
  /\bnpm\s+(?:i|install|add)\s+(?:(?:-g|--global|-D|--save-dev)\s+)*ossready(?:@[^\s`'"]*)?(?=[\s`'"]|$)/,
  /\b(?:pnpm\s+dlx|bunx|yarn\s+dlx)\s+ossready(?=[\s`'"]|$)/,
  /\b(?:pnpm|yarn|bun)\s+(?:add|global\s+add)\s+(?:(?:-g|--global|-D)\s+)*ossready(?=[\s`'"]|$)/,
];

async function walk(dir: string, keep: (path: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path, keep)));
    else if (keep(path)) out.push(path);
  }
  return out;
}

/** Fenced code blocks of a Markdown file, with the line each one starts on. */
function codeBlocks(markdown: string): { line: number; text: string }[] {
  const blocks: { line: number; text: string }[] = [];
  const lines = markdown.split("\n");
  let start = -1;
  let fence = "";
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(`{3,}|~{3,})/.exec(lines[i]);
    if (!m) continue;
    if (start < 0) {
      start = i;
      fence = m[1];
    } else if (m[1].startsWith(fence[0]) && m[1].length >= fence.length) {
      blocks.push({ line: start + 2, text: lines.slice(start + 1, i).join("\n") });
      start = -1;
    }
  }
  return blocks;
}

/** `file:line: text` for every registry-only command in `text`. */
function offenders(file: string, firstLine: number, text: string): string[] {
  const found: string[] = [];
  text.split("\n").forEach((line, i) => {
    if (REGISTRY_ONLY.some((re) => re.test(line))) found.push(`${file}:${firstLine + i}: ${line.trim()}`);
  });
  return found;
}

describe.skipIf(PUBLISHED_ON_NPM)("docs only show install commands that work before npm publish", () => {
  it("flags registry-only commands", () => {
    for (const bad of [
      "npx ossready init my-lib",
      "npx -y ossready doctor",
      "npx --yes ossready@latest doctor .",
      "npx --package=ossready ossready init",
      "npm i -g ossready",
      "npm install --global ossready@0.2.0",
      "pnpm dlx ossready init",
      "bunx ossready init",
      "run: `npx ossready doctor --fix`",
    ]) {
      expect(REGISTRY_ONLY.some((re) => re.test(bad)), bad).toBe(true);
    }
    for (const good of [
      "npx github:YasinzHyper/ossready init my-lib",
      "npx --yes github:YasinzHyper/ossready doctor . --strict",
      "npm i -g github:YasinzHyper/ossready#v0.2.0",
      "npx ossready-cli init my-lib",
      "npx --yes ossready-cli doctor . --strict",
      "npm i -g ossready-cli",
      "ossready init my-lib",
      "npx ossready-like-tool",
      "npx eslint .",
    ]) {
      expect(REGISTRY_ONLY.some((re) => re.test(good)), good).toBe(false);
    }
  });

  it("Markdown code blocks never use the bare npm package", async () => {
    const isDoc = (p: string) => p.endsWith(".md") && !p.endsWith("CHANGELOG.md");
    const files = [...(await walk(repoRoot, isDoc)), ...(await walk(join(repoRoot, ".github"), isDoc))];
    expect(files.map((f) => relative(repoRoot, f))).toEqual(expect.arrayContaining(["README.md", "docs/examples.md"]));
    const found: string[] = [];
    for (const file of files) {
      const rel = relative(repoRoot, file);
      for (const block of codeBlocks(await readFile(file, "utf8"))) found.push(...offenders(rel, block.line, block.text));
    }
    expect(found, `ossready is not on npm yet; use \`npx ${GITHUB_SPEC}\` or a bare \`ossready\``).toEqual([]);
  });

  it("source strings shown to users never use the bare npm package", async () => {
    const files = await walk(join(repoRoot, "src"), (p) => p.endsWith(".ts"));
    const found: string[] = [];
    for (const file of files) found.push(...offenders(relative(repoRoot, file), 1, await readFile(file, "utf8")));
    expect(found).toEqual([]);
  });

  it("action.yml and workflows never use the bare npm package", async () => {
    const files = [join(repoRoot, "action.yml"), ...(await walk(join(repoRoot, ".github"), (p) => /\.ya?ml$/.test(p)))];
    expect(files.length).toBeGreaterThan(1);
    const found: string[] = [];
    for (const file of files) found.push(...offenders(relative(repoRoot, file), 1, await readFile(file, "utf8")));
    expect(found).toEqual([]);
  });
});

describe("install docs after the npm publish", () => {
  it("package.json name is ossready-cli and the bin command stays ossready", async () => {
    const pkg = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")) as {
      name: string;
      bin: Record<string, string>;
    };
    expect(pkg.name).toBe(NPM_SPEC);
    expect(Object.keys(pkg.bin)).toContain("ossready");
  });

  it("flags the blocked unscoped ossready package, not ossready-cli", () => {
    for (const bad of [
      "npx ossready init my-lib",
      "npx --yes ossready@latest doctor .",
      "npm i -g ossready",
      "npm install --global ossready@0.3.0",
    ]) {
      expect(REGISTRY_ONLY.some((re) => re.test(bad)), bad).toBe(true);
    }
    for (const good of [
      "npx ossready-cli init my-lib",
      "npx --yes ossready-cli@0.3.0 doctor .",
      "npm i -g ossready-cli",
      "npm i -g github:YasinzHyper/ossready#v0.3.0",
      "ossready init my-lib",
    ]) {
      expect(REGISTRY_ONLY.some((re) => re.test(good)), good).toBe(false);
    }
  });

  it("Markdown code blocks never install the blocked unscoped ossready package", async () => {
    const isDoc = (p: string) => p.endsWith(".md") && !p.endsWith("CHANGELOG.md");
    const files = [...(await walk(repoRoot, isDoc)), ...(await walk(join(repoRoot, ".github"), isDoc))];
    const found: string[] = [];
    for (const file of files) {
      const rel = relative(repoRoot, file);
      for (const block of codeBlocks(await readFile(file, "utf8"))) found.push(...offenders(rel, block.line, block.text));
    }
    expect(
      found,
      `the npm package is ${NPM_SPEC}; do not document \`npx ossready\` / \`npm i -g ossready\``,
    ).toEqual([]);
  });
});

describe.skipIf(!PUBLISHED_ON_NPM)("primary install is ossready-cli", () => {
  it("README and examples lead with npx ossready-cli / npm i -g ossready-cli", async () => {
    const readme = await readFile(join(repoRoot, "README.md"), "utf8");
    const examples = await readFile(join(repoRoot, "docs/examples.md"), "utf8");
    const readmeInstall = readme.slice(readme.indexOf("## Install"), readme.indexOf("## Usage"));
    expect(readmeInstall).toContain(`npx ${NPM_SPEC}`);
    expect(readmeInstall).toContain(`npm i -g ${NPM_SPEC}`);
    expect(readmeInstall).toContain("the command it installs is `ossready`");
    expect(readmeInstall.indexOf(`npx ${NPM_SPEC}`)).toBeLessThan(readmeInstall.indexOf(GITHUB_SPEC));
    expect(examples).toContain(`npx --yes ${NPM_SPEC}`);
  });

  it("keeps the GitHub install as an alternative", async () => {
    const pkg = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")) as {
      repository: { url: string };
      scripts: Record<string, string>;
    };
    const repo = GITHUB_SPEC.replace(/^github:/, "");
    expect(pkg.repository.url).toContain(`github.com/${repo}`);
    expect(pkg.scripts.prepare).toMatch(/\bbuild\b/);
    for (const doc of ["README.md", "docs/examples.md"]) {
      const text = await readFile(join(repoRoot, doc), "utf8");
      expect(text, doc).toContain(GITHUB_SPEC);
      for (const m of text.matchAll(/github:([\w.-]+\/[\w.-]+)/g)) expect(m[1], doc).toBe(repo);
    }
  });
});
