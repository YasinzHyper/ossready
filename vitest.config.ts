import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Build dist/ once before any worker starts (see tests/global-setup.ts).
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 30_000,
  },
});
