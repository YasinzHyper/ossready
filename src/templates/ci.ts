import { pmRun, type ScaffoldOptions } from "./types.js";

/**
 * Yarn (Berry) via Corepack. The scaffold pins Yarn in package.json's
 * `packageManager` field, so `corepack enable` provides that exact release.
 * Yarn turns on immutable installs on CI by default, which fails without a
 * committed yarn.lock, so the first install is explicitly mutable.
 */
function yarnInstallSteps(): string {
  return `      - run: corepack enable
      # No yarn.lock is committed yet. After committing one, drop this env so
      # CI uses Yarn's default immutable install.
      - run: yarn install
        env:
          YARN_ENABLE_IMMUTABLE_INSTALLS: "false"`;
}

export function ciWorkflowText(opts: ScaffoldOptions): string {
  const { packageManager } = opts;
  // Fresh scaffolds have no lockfile. Use plain install (no cache / no frozen
  // lockfile). After committing a lockfile, switch npm to `npm ci` + `cache: npm`
  // (or pnpm/yarn/bun frozen install + cache) for faster, reproducible CI.
  const setupSteps =
    packageManager === "pnpm"
      ? `      - uses: pnpm/action-setup@v6
        with:
          version: 9
      - uses: actions/setup-node@v7
        with:
          node-version: \${{ matrix.node-version }}
      - run: pnpm install`
      : packageManager === "yarn"
        ? `      - uses: actions/setup-node@v7
        with:
          node-version: \${{ matrix.node-version }}
${yarnInstallSteps()}`
        : packageManager === "bun"
          ? `      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install`
          : `      - uses: actions/setup-node@v7
        with:
          node-version: \${{ matrix.node-version }}
      # After committing a lockfile, switch to \`npm ci\` and add \`cache: npm\`.
      - run: npm install`;

  const run = (script: string) => pmRun(packageManager, script);
  const runLint = run("lint");
  const runFormatCheck = run("format:check");
  const runTest = packageManager === "npm" ? "npm test" : run("test");
  const runCoverage = run("test:coverage");
  const runBuild = run("build");

  return `name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [22, 24]
    steps:
      - uses: actions/checkout@v7
${setupSteps}
      - run: ${runLint}
      - run: ${runFormatCheck}
      - run: ${runTest}
      - run: ${runCoverage}
      - run: ${runBuild}
`;
}

export function releaseWorkflowText(): string {
  return `name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: softprops/action-gh-release@v3
        with:
          generate_release_notes: true
`;
}

export function publishWorkflowText(
  packageManager: ScaffoldOptions["packageManager"] = "npm",
): string {
  // Mirrors ossready's dogfood publish.yml. Publishing always uses `npm publish`
  // (npm provenance + NODE_AUTH_TOKEN). npm / pnpm / bun scaffolds install, test
  // and build with npm too; yarn scaffolds use Yarn via Corepack for those steps
  // because setup-node already ships Corepack. Set NPM_TOKEN repo secret;
  // optionally enable npm trusted publishing for OIDC provenance.
  const steps =
    packageManager === "yarn"
      ? `${yarnInstallSteps()}
      - run: yarn test
      - run: yarn build`
      : `      - run: npm install
      - run: npm test
      - run: npm run build`;
  return `name: Publish

on:
  release:
    types: [published]

permissions:
  contents: read
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
${steps}
      - name: Publish to npm
        run: npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
`;
}
