import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/__tests__/**",
        // CLI entry-point scripts — interactive, use process.exit, not unit-testable
        "src/index.ts",
        "src/analyze.ts",
        "src/bulk_fetch.ts",
        "src/compare.ts",
        "src/dashboard.ts",
        "src/digest.ts",
        "src/fast.ts",
        "src/pre_analyze.ts",
        "src/recrunch.ts",
        "src/update_strava.ts",
        "src/activities.ts",
        "src/details.ts",
        // Pure TypeScript interfaces only — no runtime code, v8 cannot instrument
        "src/types.ts",
      ],
    },
  },
});

