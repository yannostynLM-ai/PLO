import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist", "client", "src/__tests__/e2e/**"],
    setupFiles: ["src/__tests__/helpers/setup-env.ts"],
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      include: [
        "src/adapters/**",
        "src/lib/validators.ts",
        "src/templates/**",
        "src/services/**",
        "src/routes/**",
        "src/anomaly/**",
      ],
      exclude: ["**/*.test.ts", "src/__tests__/**"],
    },
  },
});
