import type { ScaffoldOptions } from "./types.js";

export function srcIndexText(opts: ScaffoldOptions): string {
  return `/**
 * ${opts.name} — entry point
 */
export function greet(who = "world"): string {
  return \`Hello, \${who}!\`;
}
`;
}

export function vitestConfigText(): string {
  return `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
`;
}

export function srcTestText(_opts: ScaffoldOptions): string {
  return `import { describe, expect, it } from "vitest";
import { greet } from "./index.js";

describe("greet", () => {
  it("greets the world by default", () => {
    expect(greet()).toBe("Hello, world!");
  });

  it("greets a custom name", () => {
    expect(greet("x")).toBe("Hello, x!");
  });
});
`;
}
