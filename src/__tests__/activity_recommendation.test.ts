import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { ActivitySummary } from "../summary_utils.js";
import { loadWellnessByDate, buildActivityRecommendation } from "../activity_recommendation.js";

function act(date: string, load: number): ActivitySummary {
  return {
    id: date,
    date,
    week: "2026-W26",
    sport: "Ride",
    sport_raw: "Ride",
    name: "Ride",
    distance_km: 20,
    moving_time_sec: 3600,
    elevation_m: 200,
    avg_hr: 140,
    max_hr: 170,
    avg_speed_kmh: 24,
    avg_power_w: 180,
    normalized_power: 190,
    tss: load,
    trimp: load,
    vo2max: null,
    calories: null,
    hr_zone_pct: null,
    hr_zone_sec: null,
    efficiency_factor: null,
    pace_sec_per_km: null,
    avg_cadence: null,
    variability_index: null,
    cardiac_drift_bpm: null,
    z2_pct: null,
    best_20min_power_w: null,
    aerobic_decoupling_pct: null,
    tss_is_hr_based: false,
    vi_is_pace_based: false,
    decoupling_is_drift: false,
  };
}

function d(day: number): string {
  return `2026-06-${String(day).padStart(2, "0")}`;
}

function w(sleep: number, hrv: number, hrvBase: number, bb: number): any {
  return {
    sleep_score: sleep,
    hrv_last_5_min: hrv,
    hrv_weekly_avg: hrvBase,
    body_battery_start_of_day: bb,
  };
}

describe("loadWellnessByDate", () => {
  it("returns empty map when no wellness file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "wellness-none-"));
    try {
      const m = loadWellnessByDate(dir);
      expect(m.size).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prefers garmin file over samsung when both exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "wellness-both-"));
    try {
      writeFileSync(join(dir, "garmin_wellness.json"), JSON.stringify({ [d(28)]: { source: "garmin" } }), "utf-8");
      writeFileSync(join(dir, "samsung_wellness.json"), JSON.stringify({ [d(28)]: { source: "samsung" } }), "utf-8");
      const m = loadWellnessByDate(dir);
      expect(m.get(d(28))?.source).toBe("garmin");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns empty map when JSON is malformed", () => {
    const dir = mkdtempSync(join(tmpdir(), "wellness-bad-"));
    try {
      writeFileSync(join(dir, "garmin_wellness.json"), "{bad", "utf-8");
      const m = loadWellnessByDate(dir);
      expect(m.size).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("buildActivityRecommendation", () => {
  it("returns null when no activities are available up to activity date", () => {
    const rec = buildActivityRecommendation([act("2026-06-29", 60)], new Map(), "2026-06-28");
    expect(rec).toBeNull();
  });

  it("returns a fatigued recommendation when 7d Garmin trend declines", () => {
    const acts = Array.from({ length: 28 }, (_, i) => act(d(i + 1), 65));
    const wellness = new Map<string, any>();

    for (let i = 1; i <= 21; i++) wellness.set(d(i), w(86, 70, 60, 78));
    for (let i = 22; i <= 28; i++) wellness.set(d(i), w(60, 38, 60, 34));

    const rec = buildActivityRecommendation(acts, wellness, d(28));
    expect(rec).not.toBeNull();
    expect(rec!.state).toBe("fatigued");
    expect(rec!.signals.some(s => s.includes("Readiness is down"))).toBe(true);
    expect(rec!.signals.some(s => s.includes("HRV 7d delta"))).toBe(true);
    expect(rec!.changes).toBeDefined();
    expect(rec!.changes!.drivers.length).toBeGreaterThan(0);
  });

  it("handles sparse Garmin history and still returns recommendation", () => {
    const acts = [act(d(26), 45), act(d(27), 50), act(d(28), 55)];
    const wellness = new Map<string, any>([
      [d(27), w(80, 55, 50, 70)],
      [d(28), w(82, 56, 50, 72)],
    ]);

    const rec = buildActivityRecommendation(acts, wellness, d(28));
    expect(rec).not.toBeNull();
    expect(["fresh", "balanced", "cautious", "fatigued"]).toContain(rec!.state);
    expect(rec!.signals.some(s => s.includes("Garmin coverage"))).toBe(true);
    expect(rec!.signals.some(s => s.includes("HRV 7d delta"))).toBe(false);
  });

  it("reads wellness from samsung file when garmin file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "wellness-samsung-"));
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "samsung_wellness.json"), JSON.stringify({ [d(28)]: w(79, 55, 50, 68) }), "utf-8");
      const wellness = loadWellnessByDate(dir);
      const rec = buildActivityRecommendation([act(d(28), 55)], wellness, d(28));
      expect(wellness.size).toBe(1);
      expect(rec).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("omits change block when there is no previous day data", () => {
    const rec = buildActivityRecommendation([act(d(28), 55)], new Map([[d(28), w(80, 55, 50, 72)]]), d(28));
    expect(rec).not.toBeNull();
    expect(rec!.changes).toBeUndefined();
  });

  it("adds quality flags when wellness history is sparse or inconsistent", () => {
    const acts = [act(d(22), 50), act(d(24), 52), act(d(26), 54), act(d(28), 56)];
    const wellness = new Map<string, any>([
      [d(24), { sleep_score: 80, hrv_last_5_min: 40, hrv_weekly_avg: 45 }],
      [d(26), { sleep_score: null, hrv_last_5_min: 72, hrv_weekly_avg: 46, body_battery_start_of_day: 70 }],
      [d(28), { sleep_score: 78, hrv_last_5_min: 41, hrv_weekly_avg: 45 }],
    ]);
    const rec = buildActivityRecommendation(acts, wellness, d(28));
    expect(rec).not.toBeNull();
    expect(rec!.quality_flags?.includes("GARMIN_DAYS_MISSING")).toBe(true);
    expect(rec!.quality_flags?.includes("HRV_IMPLAUSIBLE_JUMP")).toBe(true);
    expect(rec!.quality_flags?.includes("BB_FIELDS_MISSING")).toBe(true);
  });
});


