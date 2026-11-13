import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "extension.spec.ts",
  outputDir: "test-results/extension",
  workers: 1,
  timeout: 60000,
});
