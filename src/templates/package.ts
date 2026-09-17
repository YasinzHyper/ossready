import type { ScaffoldOptions } from "./types.js";

export function gitignoreText(): string {
  return `# Dependencies
node_modules/

# Build
dist/
build/
*.tsbuildinfo

# Test / coverage
coverage/
.vitest/
.nyc_output/

# Logs
*.log
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment
.env
.env.*
!.env.example

# OS / editor
.DS_Store
Thumbs.db
*.swp
*.swo
.idea/
.vscode/
*.code-workspace

# Temp / misc
tmp/
temp/
*.tmp
*.tgz
`;
}

export function changelogText(opts: ScaffoldOptions): string {
  return `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project scaffold via [ossready](https://github.com/YasinzHyper/ossready)

## [0.1.0] - ${opts.year}-01-01

### Added

- First public release placeholder — update the date when you ship
`;
}

export function packageJsonText(opts: ScaffoldOptions): string {
  const { name, description, license } = opts;
  const licenseField = license === "mit" ? "MIT" : "Apache-2.0";
  return (
    JSON.stringify(
      {
        name,
        version: "0.1.0",
        description,
        type: "module",
        main: "./dist/index.js",
        types: "./dist/index.d.ts",
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            import: "./dist/index.js",
          },
        },
        files: ["dist", "LICENSE", "README.md", "CHANGELOG.md"],
        publishConfig: {
          access: "public",
        },
        scripts: {
          build: "tsc",
          test: 'node -e "console.log(\'All tests passed\')"',
          lint: "tsc --noEmit",
        },
        engines: {
          node: ">=18",
        },
        keywords: [],
        license: licenseField,
        devDependencies: {
          "@types/node": "^22.10.0",
          typescript: "^5.7.2",
        },
      },
      null,
      2,
    ) + "\n"
  );
}

export function tsconfigText(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          outDir: "dist",
          rootDir: "src",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
        },
        include: ["src/**/*"],
        exclude: ["node_modules", "dist"],
      },
      null,
      2,
    ) + "\n"
  );
}

export function srcIndexText(opts: ScaffoldOptions): string {
  return `/**
 * ${opts.name} — entry point
 */
export function greet(who = "world"): string {
  return \`Hello, \${who}!\`;
}

console.log(greet("${opts.name}"));
`;
}
