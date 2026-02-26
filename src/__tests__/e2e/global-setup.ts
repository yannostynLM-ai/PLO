// =============================================================================
// E2E Global Setup — Re-seed the database before running E2E tests
// Ensures a clean, consistent state regardless of previous runs
// =============================================================================

import { execSync } from "child_process";

export async function setup() {
  console.log("[E2E setup] Re-seeding database...");
  execSync("npx tsx src/seed/index.ts", { stdio: "inherit" });
  console.log("[E2E setup] Seed complete ✓");
}

export async function teardown() {
  // Nothing to clean up — DB state preserved for debugging
}
