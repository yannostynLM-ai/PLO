import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/e2e/**/*.test.ts"],
    setupFiles: ["src/__tests__/helpers/setup-env-e2e.ts"],
    globalSetup: ["src/__tests__/e2e/global-setup.ts"],
    testTimeout: 30000,
    sequence: { concurrent: false },
  },
});
