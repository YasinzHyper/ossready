import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BADGES_END,
  BADGES_START,
  detectBadges,
  githubRepoFromUrl,
  renderBadgeBlock,
  runBadges,
  upsertBadgeBlock,
} from "../src/commands/badges.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const opts = { noGitConfig: true } as const;

let dir: string;

async function put(path: string, content: string): Promise<void> {
  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), content, "utf8");
}

async function fullRepo(): Promise<void> {
  await put("package.json", JSON.stringify({ name: "demo", version: "1.0.0", license: "MIT" }));
  await put("LICENSE", "MIT License\n");
  await put(".github/workflows/ci.yml", "name: CI\n");
  await put(".github/workflows/scorecard.yml", "name: Scorecard\n");
  await put(".github/workflows/codeql.yml", "name: CodeQL\n");
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ossready-badges-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("detectBadges", () => {
  it("builds every badge, in order, with shields.io and GitHub URLs", async () => {
    await fullRepo();
    const r = await detectBadges(dir, { ...opts, githubOwner: "octo" });
    expect(r.owner).toBe("octo");
    expect(r.repo).toBe("demo");
    expect(r.badges.map((b) => b.id)).toEqual(["ci", "npm-version", "npm-downloads", "license", "scorecard", "codeql"]);
    expect(r.badges.map((b) => b.markdown)).toEqual([
      "[![CI](https://github.com/octo/demo/actions/workflows/ci.yml/badge.svg)](https://github.com/octo/demo/actions/workflows/ci.yml)",
      "[![npm version](https://img.shields.io/npm/v/demo.svg)](https://www.npmjs.com/package/demo)",
      "[![npm downloads](https://img.shields.io/npm/dm/demo.svg)](https://www.npmjs.com/package/demo)",
      "[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)",
      "[![OpenSSF Scorecard](https://img.shields.io/ossf-scorecard/github.com/octo/demo?label=openssf%20scorecard)](https://scorecard.dev/viewer/?uri=github.com/octo/demo)",
      "[![CodeQL](https://github.com/octo/demo/actions/workflows/codeql.yml/badge.svg)](https://github.com/octo/demo/actions/workflows/codeql.yml)",
    ]);
    expect(r.markdown.split("\n")[0]).toBe(BADGES_START);
    expect(r.markdown.split("\n").at(-1)).toBe(BADGES_END);
  });

  it("only includes badges whose sources exist", async () => {
    await put(".github/workflows/codeql.yml", "name: CodeQL\n");
    const r = await detectBadges(dir, { ...opts, githubOwner: "octo", repo: "thing" });
    expect(r.badges.map((b) => b.id)).toEqual(["codeql"]);
  });

  it("skips npm badges for private packages or packages without a name", async () => {
    await put("package.json", JSON.stringify({ name: "demo", private: true, license: "MIT" }));
    let r = await detectBadges(dir, { ...opts, githubOwner: "octo" });
    expect(r.badges.map((b) => b.id)).toEqual(["license"]);
    await put("package.json", JSON.stringify({ license: "MIT" }));
    r = await detectBadges(dir, { ...opts, githubOwner: "octo" });
    expect(r.badges.map((b) => b.id)).toEqual(["license"]);
  });

  it("reads the license from the LICENSE file and escapes it for shields.io", async () => {
    await put("LICENSE", "                                 Apache License\n                           Version 2.0, January 2004\n");
    const r = await detectBadges(dir, { ...opts, githubOwner: "octo" });
    expect(r.badges).toHaveLength(1);
    expect(r.badges[0].markdown).toBe(
      "[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-yellow.svg)](LICENSE)",
    );
  });

  it("keeps scoped npm names and strips the scope for the repo name", async () => {
    await put("package.json", JSON.stringify({ name: "@acme/kit" }));
    const r = await detectBadges(dir, { ...opts, githubOwner: "acme" });
    expect(r.repo).toBe("kit");
    expect(r.badges[0].image).toBe("https://img.shields.io/npm/v/@acme/kit.svg");
  });

  it("infers owner and repo from the origin remote, and --repo owner/name overrides", async () => {
    await put(".git/config", '[remote "origin"]\n\turl = git@github.com:someone/cool-repo.git\n');
    await put(".github/workflows/ci.yml", "name: CI\n");
    let r = await detectBadges(dir, opts);
    expect(r).toMatchObject({ owner: "someone", repo: "cool-repo", ownerSource: "the origin git remote" });
    r = await detectBadges(dir, { ...opts, repo: "other/fork" });
    expect(r).toMatchObject({ owner: "other", repo: "fork" });
    r = await detectBadges(dir, { ...opts, githubOwner: "me", repo: "renamed" });
    expect(r.badges[0].link).toBe("https://github.com/me/renamed/actions/workflows/ci.yml");
  });

  it("rejects invalid owners and repos", async () => {
    await expect(detectBadges(dir, { ...opts, githubOwner: "-bad-" })).rejects.toThrow(/Invalid GitHub owner/);
    await expect(detectBadges(dir, { ...opts, repo: "a/b/c" })).rejects.toThrow(/Invalid --repo/);
  });

  it("parses repo names from GitHub URLs", () => {
    expect(githubRepoFromUrl("https://github.com/o/name.git")).toBe("name");
    expect(githubRepoFromUrl("git+https://github.com/o/my.lib.git")).toBe("my.lib");
    expect(githubRepoFromUrl("https://github.com/o/name#readme")).toBe("name");
    expect(githubRepoFromUrl("https://gitlab.com/o/name")).toBeUndefined();
  });
});

describe("no owner", () => {
  it("drops owner-bound badges, lists them, and --write exits 1 without touching README", async () => {
    await fullRepo();
    await put("README.md", "# demo\n\nHello\n");
    const r = await detectBadges(dir, opts);
    expect(r.owner).toBeUndefined();
    expect(r.badges.map((b) => b.id)).toEqual(["npm-version", "npm-downloads", "license"]);
    expect(r.needsOwner).toEqual(["ci", "scorecard", "codeql"]);
    const out = await runBadges(dir, { ...opts, write: true });
    expect(out.exitCode).toBe(1);
    expect(out.readme).toBeUndefined();
    expect(await readFile(join(dir, "README.md"), "utf8")).toBe("# demo\n\nHello\n");
    expect((await runBadges(dir, opts)).exitCode).toBe(0);
  });
});

describe("upsertBadgeBlock", () => {
  const block = renderBadgeBlock([]);

  it("inserts right after the first H1, skipping fenced code", () => {
    const readme = "```\n# not a heading\n```\n\n# Title\n\nIntro\n";
    const { content, action } = upsertBadgeBlock(readme, block);
    expect(action).toBe("inserted");
    expect(content).toBe(`\`\`\`\n# not a heading\n\`\`\`\n\n# Title\n\n${block}\n\nIntro\n`);
  });

  it("adds a blank line when the H1 is directly followed by text", () => {
    expect(upsertBadgeBlock("# T\nIntro\n", block).content).toBe(`# T\n\n${block}\n\nIntro\n`);
  });

  it("puts the block at the top when there is no H1", () => {
    expect(upsertBadgeBlock("Intro\n", block).content).toBe(`${block}\n\nIntro\n`);
    expect(upsertBadgeBlock("", block).content).toBe(`${block}\n`);
  });

  it("replaces only the content between markers", () => {
    const readme = `# T\n\n${BADGES_START}\nold\n${BADGES_END}\nkeep me\n`;
    const { content, action } = upsertBadgeBlock(readme, block);
    expect(action).toBe("updated");
    expect(content).toBe(`# T\n\n${block}\nkeep me\n`);
  });

  it("is idempotent", () => {
    for (const readme of ["# T\n\nIntro\n", "Intro\n", "", "# T\r\n\r\nIntro\r\n"]) {
      const once = upsertBadgeBlock(readme, block).content;
      expect(upsertBadgeBlock(once, block)).toEqual({ content: once, action: "unchanged" });
    }
  });

  it("refuses a half-marked README", () => {
    expect(() => upsertBadgeBlock(`${BADGES_START}\n`, block)).toThrow(/no/);
    expect(() => upsertBadgeBlock(`${BADGES_END}\n`, block)).toThrow(/no/);
  });
});

describe("runBadges --write", () => {
  it("writes once, then reports unchanged (no diff on a second run)", async () => {
    await fullRepo();
    await put("README.md", "# demo\n\nHello\n");
    const first = await runBadges(dir, { ...opts, githubOwner: "octo", write: true });
    expect(first.readme).toMatchObject({ action: "inserted", written: true });
    const after = await readFile(join(dir, "README.md"), "utf8");
    expect(after).toContain("https://github.com/octo/demo/actions/workflows/ci.yml/badge.svg");
    const second = await runBadges(dir, { ...opts, githubOwner: "octo", write: true });
    expect(second.readme).toMatchObject({ action: "unchanged", written: false });
    expect(await readFile(join(dir, "README.md"), "utf8")).toBe(after);
  });

  it("--dry-run reports the change without writing", async () => {
    await fullRepo();
    await put("README.md", "# demo\n");
    const out = await runBadges(dir, { ...opts, githubOwner: "octo", write: true, dryRun: true });
    expect(out.readme).toMatchObject({ action: "inserted", written: false });
    expect(await readFile(join(dir, "README.md"), "utf8")).toBe("# demo\n");
  });
});

describe("dogfood", () => {
  it("ossready's own README carries the current badge block", async () => {
    const r = await detectBadges(repoRoot, { ...opts, githubOwner: "YasinzHyper", repo: "ossready" });
    expect(r.badges.map((b) => b.id)).toEqual(["ci", "npm-version", "npm-downloads", "license", "scorecard", "codeql"]);
    const readme = await readFile(join(repoRoot, "README.md"), "utf8");
    expect(readme, "run `node dist/cli.js badges --write` to refresh it").toContain(r.markdown);
    expect(upsertBadgeBlock(readme, r.markdown).action).toBe("unchanged");
  });
});
