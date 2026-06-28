import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WellnessContext } from "../wellness.js";

// Mock fs before importing the module
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from "fs";
import { loadWellnessContext } from "../wellness.js";

const ANALYSIS_DIR = "/fake/analysis";
const DATE = "2024-06-15";
const NIGHT_DATE = "2024-06-14";

function makeWellnessData(overrides: Record<string, any> = {}) {
  return {
    [NIGHT_DATE]: {
      sleep_score: 82,
      sleep_duration_sec: 28800, // 8h
      sleep_deep_sec: 5760,
      sleep_rem_sec: 7200,
      sleep_average_spo2: 96,
      sleep_avg_stress: 20,
      hrv_last_5_min: 55,
      hrv_weekly_avg: 50,
      hrv_status: "Balanced",
      resting_hr: 52,
      training_readiness_score: 75,
      training_readiness_level: "Good",
      stress_low_sec: 28800,
      stress_medium_sec: 14400,
      stress_high_sec: 7200,
      body_battery_start_of_day: 85,
      body_battery_end_of_day: 30,
      body_battery_charged: 70,
      body_battery_drained: 55,
      spo2_avg: 97,
      spo2_min: 93,
    },
    [DATE]: {
      body_battery_start_of_day: 75,
      body_battery_intraday: [
        [new Date("2024-06-15T07:00:00Z").getTime(), 80],
        [new Date("2024-06-15T08:00:00Z").getTime(), 70],
        [new Date("2024-06-15T09:00:00Z").getTime(), 55],
      ],
      avg_daily_stress: 25,
      steps: 8000,
      intensity_minutes_moderate: 30,
      intensity_minutes_vigorous: 15,
    },
    ...overrides,
  };
}

describe("loadWellnessContext", () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset();
    vi.mocked(readFileSync).mockReset();
  });

  it("returns null when neither garmin nor samsung wellness file exists", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(loadWellnessContext(ANALYSIS_DIR, DATE)).toBeNull();
  });

  it("falls back to samsung_wellness.json when garmin file missing", () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes("garmin_wellness")) return false;
      if (String(p).includes("samsung_wellness")) return true;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeWellnessData()) as any);
    const ctx = loadWellnessContext(ANALYSIS_DIR, DATE)!;
    expect(ctx).not.toBeNull();
    expect(ctx.activity_date).toBe(DATE);
  });

  it("returns null when JSON is malformed", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("{ invalid json" as any);
    expect(loadWellnessContext(ANALYSIS_DIR, DATE)).toBeNull();
  });

  it("returns WellnessContext with correct activity_date", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeWellnessData()) as any);
    const ctx = loadWellnessContext(ANALYSIS_DIR, DATE)!;
    expect(ctx.activity_date).toBe(DATE);
  });

  it("parses night_before correctly", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeWellnessData()) as any);
    const ctx = loadWellnessContext(ANALYSIS_DIR, DATE)!;
    expect(ctx.night_before).not.toBeNull();
    expect(ctx.night_before!.sleep_score).toBe(82);
    expect(ctx.night_before!.sleep_duration_h).toBe(8);
    expect(ctx.night_before!.hrv_last_5_min).toBe(55);
    expect(ctx.night_before!.hrv_vs_baseline).toBe(5); // 55 - 50
    expect(ctx.night_before!.resting_hr).toBe(52);
    expect(ctx.night_before!.training_readiness_score).toBe(75);
  });

  it("parses day_of correctly", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeWellnessData()) as any);
    const ctx = loadWellnessContext(ANALYSIS_DIR, DATE)!;
    expect(ctx.day_of).not.toBeNull();
    expect(ctx.day_of!.daily_steps).toBe(8000);
    expect(ctx.day_of!.avg_stress).toBe(25);
  });

  it("returns null night_before when no data for that date", () => {
    const data = makeWellnessData();
    delete (data as any)[NIGHT_DATE];
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(data) as any);
    const ctx = loadWellnessContext(ANALYSIS_DIR, DATE)!;
    expect(ctx.night_before).toBeNull();
  });

  it("picks closest intraday body battery for activity start time", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeWellnessData()) as any);
    // Activity starts at 08:00 UTC → closest intraday = 70
    const ctx = loadWellnessContext(ANALYSIS_DIR, DATE, "2024-06-15T08:00:00Z")!;
    expect(ctx.day_of!.body_battery_at_start).toBe(70);
  });

  it("builds non-empty readiness_note", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeWellnessData()) as any);
    const ctx = loadWellnessContext(ANALYSIS_DIR, DATE)!;
    expect(ctx.readiness_note).toContain("HRV");
    expect(ctx.readiness_note).toContain("Sleep score");
  });

  it("readiness_note mentions high stress when stress_high_pct > 10%", () => {
    // stress_high_sec: 7200 / 57600 = 12.5% → should appear
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(makeWellnessData()) as any);
    const ctx = loadWellnessContext(ANALYSIS_DIR, DATE)!;
    expect(ctx.readiness_note).toContain("High stress");
  });

  it("returns context with null fields when no data at all for either date", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}) as any);
    const ctx = loadWellnessContext(ANALYSIS_DIR, DATE)!;
    expect(ctx.night_before).toBeNull();
    expect(ctx.day_of).toBeNull();
    expect(ctx.readiness_note).toContain("No Garmin wellness data");
  });
});

