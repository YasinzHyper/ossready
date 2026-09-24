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

export function nvmrcText(): string {
  // Pin a concrete Node major for nvm / fnm / asdf; keep in sync with engines.node
  return "20\n";
}

export function prettierRcText(): string {
  return (
    JSON.stringify(
      {
        semi: true,
        singleQuote: false,
        trailingComma: "all",
        printWidth: 100,
        tabWidth: 2,
        useTabs: false,
        arrowParens: "always",
        endOfLine: "lf",
      },
      null,
      2,
    ) + "\n"
  );
}

export function prettierIgnoreText(): string {
  return `node_modules
dist
build
coverage
.vitest
.nyc_output
*.tsbuildinfo
package-lock.json
pnpm-lock.yaml
yarn.lock
bun.lock
bun.lockb
*.tgz
`;
}

export function eslintConfigText(): string {
  return `import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "*.tgz"],
  },
);
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
  const { name, description, license, githubOwner } = opts;
  const licenseField = license === "mit" ? "MIT" : "Apache-2.0";
  const owner = githubOwner?.trim();
  const pkg: Record<string, unknown> = {
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
      test: "vitest run",
      "test:coverage": "vitest run --coverage",
      lint: "eslint .",
      typecheck: "tsc --noEmit",
      format: "prettier --write .",
      "format:check": "prettier --check .",
    },
    engines: {
      node: ">=18",
    },
    keywords: [],
    license: licenseField,
    devDependencies: {
      "@eslint/js": "^9.17.0",
      "@types/node": "^22.10.0",
      "@vitest/coverage-v8": "^3.0.0",
      eslint: "^9.17.0",
      "eslint-config-prettier": "^9.1.0",
      prettier: "^3.4.2",
      typescript: "^5.7.2",
      "typescript-eslint": "^8.18.0",
      vitest: "^3.0.0",
    },
  };

  if (owner) {
    const repoUrl = `https://github.com/${owner}/${name}`;
    pkg.repository = {
      type: "git",
      url: `git+${repoUrl}.git`,
    };
    pkg.bugs = {
      url: `${repoUrl}/issues`,
    };
    pkg.homepage = `${repoUrl}#readme`;
  }

  return JSON.stringify(pkg, null, 2) + "\n";
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
        exclude: ["node_modules", "dist", "**/*.test.ts"],
      },
      null,
      2,
    ) + "\n"
  );
}

export {
  srcIndexText,
  vitestConfigText,
  srcTestText,
} from "./srcScaffold.js";
