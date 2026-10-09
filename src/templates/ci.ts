import type { ScaffoldOptions } from "./types.js";

export function ciWorkflowText(opts: ScaffoldOptions): string {
  const { packageManager } = opts;
  // Fresh scaffolds have no lockfile. Use plain install (no cache / no frozen
  // lockfile). After committing a lockfile, switch npm to `npm ci` + `cache: npm`
  // (or pnpm/bun frozen install + cache) for faster, reproducible CI.
  const setupSteps =
    packageManager === "pnpm"
      ? `      - uses: pnpm/action-setup@v6
        with:
          version: 9
      - uses: actions/setup-node@v7
        with:
          node-version: \${{ matrix.node-version }}
      - run: pnpm install`
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

  const runLint =
    packageManager === "pnpm"
      ? "pnpm lint"
      : packageManager === "bun"
        ? "bun run lint"
        : "npm run lint";
  const runFormatCheck =
    packageManager === "pnpm"
      ? "pnpm format:check"
      : packageManager === "bun"
        ? "bun run format:check"
        : "npm run format:check";
  const runTest =
    packageManager === "pnpm"
      ? "pnpm test"
      : packageManager === "bun"
        ? "bun run test"
        : "npm test";
  const runCoverage =
    packageManager === "pnpm"
      ? "pnpm test:coverage"
      : packageManager === "bun"
        ? "bun run test:coverage"
        : "npm run test:coverage";
  const runBuild =
    packageManager === "pnpm"
      ? "pnpm build"
      : packageManager === "bun"
        ? "bun run build"
        : "npm run build";

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

export function publishWorkflowText(): string {
  // Mirrors ossready's dogfood publish.yml. Uses npm for install/test/build/publish
  // (npm provenance + NODE_AUTH_TOKEN) regardless of scaffold package manager --
  // release.yml is also package-manager agnostic. Set NPM_TOKEN repo secret;
  // optionally enable npm trusted publishing for OIDC provenance.
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
      - run: npm install
      - run: npm test
      - run: npm run build
      - name: Publish to npm
        run: npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
`;
}
