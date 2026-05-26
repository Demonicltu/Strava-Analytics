/**
 * Tests for src/instructions.ts
 * Covers: activityTypeToFile mapping, deviceToFile mapping,
 * loadComposedInstructions composition logic, extractActivityMeta parsing.
 * Uses the real instructions/ folder for integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadComposedInstructions, extractActivityMeta } from "../instructions.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = join(__dir, "..", "..");
const REAL_INSTRUCTIONS_DIR = join(BASE_DIR, "instructions");

// ─── Temp fixture dir ───────────────────────────────────────────────────────

const TMP_DIR = join(__dir, "__tmp_instructions__");

function writeTmp(rel: string, content: string) {
  const full = join(TMP_DIR, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  mkdirSync(join(TMP_DIR, "devices"), { recursive: true });
  writeTmp("common.md", "# Common\nShared rules.");
  writeTmp("cycling.md", "# Cycling\nRide specific.");
  writeTmp("running.md", "# Running\nRun specific.");
  writeTmp("walk.md", "# Walk\nWalk specific.");
  writeTmp("surf.md", "# Surf\nWave specific.");
  writeTmp("workout.md", "# Workout\nGym specific.");
  writeTmp("devices/garmin.md", "# Garmin\nGarmin device quirks.");
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

// ─── extractActivityMeta ────────────────────────────────────────────────────

describe("extractActivityMeta", () => {
  it("extracts type and device from summary_card", () => {
    const json = JSON.stringify({ summary_card: { type: "Ride", device: "Garmin Edge 530" } });
    expect(extractActivityMeta(json)).toEqual({ type: "Ride", device: "Garmin Edge 530" });
  });

  it("falls back to activity_meta when summary_card is absent", () => {
    const json = JSON.stringify({ activity_meta: { type: "Run", device: "Apple Watch" } });
    expect(extractActivityMeta(json)).toEqual({ type: "Run", device: "Apple Watch" });
  });

  it("prefers summary_card over activity_meta", () => {
    const json = JSON.stringify({
      summary_card: { type: "Workout", device: "Garmin Fenix 7" },
      activity_meta: { type: "Run", device: "Other" },
    });
    expect(extractActivityMeta(json)).toEqual({ type: "Workout", device: "Garmin Fenix 7" });
  });

  it("returns device: null when device field is absent", () => {
    const json = JSON.stringify({ summary_card: { type: "Ride" } });
    expect(extractActivityMeta(json)).toEqual({ type: "Ride", device: null });
  });

  it("defaults to Workout type when type field is absent", () => {
    const json = JSON.stringify({ summary_card: {} });
    expect(extractActivityMeta(json)).toEqual({ type: "Workout", device: null });
  });

  it("returns safe defaults on invalid JSON", () => {
    expect(extractActivityMeta("NOT_JSON")).toEqual({ type: "Workout", device: null });
  });

  it("returns safe defaults on empty string", () => {
    expect(extractActivityMeta("")).toEqual({ type: "Workout", device: null });
  });

  it("returns safe defaults on null JSON value", () => {
    expect(extractActivityMeta("null")).toEqual({ type: "Workout", device: null });
  });
});

// ─── activityTypeToFile mapping (via loadComposedInstructions output) ────────

describe("activity type → instruction file mapping", () => {
  const cases: Array<[string, string]> = [
    ["Ride", "# Cycling"],
    ["VirtualRide", "# Cycling"],
    ["GravelRide", "# Cycling"],
    ["MountainBikeRide", "# Cycling"],
    ["EBikeRide", "# Cycling"],
    ["Run", "# Running"],
    ["VirtualRun", "# Running"],
    ["TrailRun", "# Running"],
    ["Walk", "# Walk"],
    ["Hike", "# Walk"],
    ["Hiking", "# Walk"],
    ["Surfing", "# Surf"],
    ["Windsurf", "# Surf"],
    ["Kitesurf", "# Surf"],
    ["Workout", "# Workout"],
    ["WeightTraining", "# Workout"],
    ["CrossTraining", "# Workout"],
    ["Yoga", "# Workout"],
    ["Pilates", "# Workout"],
    ["Stretch", "# Workout"],
    ["UnknownSport", "# Workout"], // safe default
  ];

  for (const [actType, expectedHeading] of cases) {
    it(`"${actType}" includes ${expectedHeading} section`, () => {
      const result = loadComposedInstructions(TMP_DIR, actType);
      expect(result).toContain(expectedHeading);
    });
  }
});

// ─── deviceToFile mapping ────────────────────────────────────────────────────

describe("device → instruction file mapping", () => {
  const garminDevices = [
    "Garmin Edge 530",
    "Garmin Fenix 7 Pro",
    "Garmin Forerunner 955",
    "Garmin Vivoactive 5",
    "fenix 6",
    "EDGE 1040",
  ];

  for (const device of garminDevices) {
    it(`"${device}" includes Garmin section`, () => {
      const result = loadComposedInstructions(TMP_DIR, "Ride", device);
      expect(result).toContain("# Garmin");
    });
  }

  it("unknown device omits device section", () => {
    const result = loadComposedInstructions(TMP_DIR, "Ride", "Wahoo ELEMNT ROAM");
    expect(result).not.toContain("# Garmin");
  });

  it("null device omits device section", () => {
    const result = loadComposedInstructions(TMP_DIR, "Ride", null);
    expect(result).not.toContain("# Garmin");
  });

  it("undefined device omits device section", () => {
    const result = loadComposedInstructions(TMP_DIR, "Ride", undefined);
    expect(result).not.toContain("# Garmin");
  });
});

// ─── loadComposedInstructions composition ───────────────────────────────────

describe("loadComposedInstructions — composition", () => {
  it("includes common section for every activity type", () => {
    for (const type of ["Ride", "Run", "Walk", "Surfing", "Workout"]) {
      const result = loadComposedInstructions(TMP_DIR, type);
      expect(result).toContain("# Common");
    }
  });

  it("separates sections with ---", () => {
    const result = loadComposedInstructions(TMP_DIR, "Ride");
    expect(result).toContain("---");
  });

  it("cycling ride with Garmin includes all three sections", () => {
    const result = loadComposedInstructions(TMP_DIR, "Ride", "Garmin Edge 530");
    expect(result).toContain("# Common");
    expect(result).toContain("# Cycling");
    expect(result).toContain("# Garmin");
  });

  it("cycling ride without device includes only common + cycling (no device section)", () => {
    const result = loadComposedInstructions(TMP_DIR, "Ride");
    expect(result).toContain("# Common");
    expect(result).toContain("# Cycling");
    expect(result).not.toContain("# Garmin");
  });

  it("sections are joined with separator", () => {
    const result = loadComposedInstructions(TMP_DIR, "Ride", "Garmin Fenix 7");
    const parts = result.split("\n\n---\n\n");
    expect(parts).toHaveLength(3); // common + cycling + garmin
  });

  it("output is empty string when instructionsDir does not exist", () => {
    const result = loadComposedInstructions("/nonexistent/path", "Ride");
    expect(result).toBe("");
  });

  it("missing activity file → only common is included (no separator at end)", () => {
    // Only common.md exists in a partial dir
    const partial = join(TMP_DIR, "__partial__");
    mkdirSync(partial, { recursive: true });
    writeTmp("__partial__/common.md", "# Common Only");

    const result = loadComposedInstructions(partial, "Ride");
    expect(result).toBe("# Common Only");
  });

  it("missing common.md → only activity file included", () => {
    const noCommon = join(TMP_DIR, "__nocommon__");
    mkdirSync(noCommon, { recursive: true });
    writeFileSync(join(noCommon, "cycling.md"), "# Cycling Only", "utf-8");

    const result = loadComposedInstructions(noCommon, "Ride");
    expect(result).toBe("# Cycling Only");
  });

  it("all files missing → returns empty string", () => {
    const empty = join(TMP_DIR, "__empty__");
    mkdirSync(empty, { recursive: true });
    const result = loadComposedInstructions(empty, "Ride", "Garmin Edge");
    expect(result).toBe("");
  });
});

// ─── Integration: real instructions/ folder ─────────────────────────────────

describe("real instructions/ folder — integration", () => {
  const hasRealInstructions = existsSync(REAL_INSTRUCTIONS_DIR);

  it("instructions/ directory exists", () => {
    expect(hasRealInstructions).toBe(true);
  });

  const expectedFiles = ["common.md", "cycling.md", "running.md", "walk.md", "surf.md", "workout.md"];
  for (const file of expectedFiles) {
    it(`${file} exists and is non-empty`, () => {
      if (!hasRealInstructions) return;
      const path = join(REAL_INSTRUCTIONS_DIR, file);
      expect(existsSync(path)).toBe(true);
      const { readFileSync } = require("node:fs");
      expect(readFileSync(path, "utf-8").length).toBeGreaterThan(100);
    });
  }

  it("devices/garmin.md exists and is non-empty", () => {
    if (!hasRealInstructions) return;
    const path = join(REAL_INSTRUCTIONS_DIR, "devices", "garmin.md");
    expect(existsSync(path)).toBe(true);
    const { readFileSync } = require("node:fs");
    expect(readFileSync(path, "utf-8").length).toBeGreaterThan(100);
  });

  it("cycling Ride produces non-empty composed instructions", () => {
    if (!hasRealInstructions) return;
    const result = loadComposedInstructions(REAL_INSTRUCTIONS_DIR, "Ride");
    expect(result.length).toBeGreaterThan(500);
  });

  it("cycling + Garmin produces more content than cycling alone", () => {
    if (!hasRealInstructions) return;
    const withoutDevice = loadComposedInstructions(REAL_INSTRUCTIONS_DIR, "Ride");
    const withDevice = loadComposedInstructions(REAL_INSTRUCTIONS_DIR, "Ride", "Garmin Fenix 7");
    expect(withDevice.length).toBeGreaterThan(withoutDevice.length);
  });

  it("workout instructions are shorter than cycling instructions (no power/VAM)", () => {
    if (!hasRealInstructions) return;
    const cycling = loadComposedInstructions(REAL_INSTRUCTIONS_DIR, "Ride");
    const workout = loadComposedInstructions(REAL_INSTRUCTIONS_DIR, "Workout");
    expect(workout.length).toBeLessThan(cycling.length);
  });

  it("common.md contains HR analysis section", () => {
    if (!hasRealInstructions) return;
    const result = loadComposedInstructions(REAL_INSTRUCTIONS_DIR, "Ride");
    expect(result).toMatch(/heart\s*rate/i);
  });

  it("cycling instructions contain power/watts reference", () => {
    if (!hasRealInstructions) return;
    const result = loadComposedInstructions(REAL_INSTRUCTIONS_DIR, "Ride");
    expect(result).toMatch(/power|watts/i);
  });

  it("running instructions contain pace reference", () => {
    if (!hasRealInstructions) return;
    const result = loadComposedInstructions(REAL_INSTRUCTIONS_DIR, "Run");
    expect(result).toMatch(/pace/i);
  });

  it("surf instructions contain wave reference", () => {
    if (!hasRealInstructions) return;
    const result = loadComposedInstructions(REAL_INSTRUCTIONS_DIR, "Surfing");
    expect(result).toMatch(/wave/i);
  });

  it("garmin device file contains Body Battery reference", () => {
    if (!hasRealInstructions) return;
    const result = loadComposedInstructions(REAL_INSTRUCTIONS_DIR, "Ride", "Garmin Edge 530");
    expect(result).toMatch(/body battery/i);
  });

  it("extractActivityMeta + loadComposedInstructions round-trip for Ride", () => {
    if (!hasRealInstructions) return;
    const json = JSON.stringify({ summary_card: { type: "Ride", device: "Garmin Fenix 7 Pro Solar" } });
    const { type, device } = extractActivityMeta(json);
    const result = loadComposedInstructions(REAL_INSTRUCTIONS_DIR, type, device);
    expect(result).toContain("Cycling");
    expect(result).toContain("Garmin");
  });

  it("extractActivityMeta + loadComposedInstructions round-trip for Workout (no device)", () => {
    if (!hasRealInstructions) return;
    const json = JSON.stringify({ summary_card: { type: "Workout" } });
    const { type, device } = extractActivityMeta(json);
    const result = loadComposedInstructions(REAL_INSTRUCTIONS_DIR, type, device);
    expect(result).toMatch(/workout/i);
    expect(result).not.toContain("# Garmin");
  });
});

