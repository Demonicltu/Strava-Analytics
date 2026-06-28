import { describe, it, expect } from "vitest";
import type { ActivitySummary } from "../summary_utils.js";
import {
  buildDailyLoadSeries,
  computeLoadModel,
  computeLatestLoadMetrics,
} from "../training_intelligence.js";

function mkActivity(date: string, overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: date,
    date,
    week: "2026-W01",
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
    tss: 50,
    trimp: 60,
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
    ...overrides,
  };
}

describe("buildDailyLoadSeries", () => {
  it("fills date gaps with zero load", () => {
    const acts = [
      mkActivity("2026-01-01", { tss: 40 }),
      mkActivity("2026-01-03", { tss: 60 }),
    ];
    const daily = buildDailyLoadSeries(acts, "2026-01-03");
    expect(daily).toHaveLength(3);
    expect(daily[1].date).toBe("2026-01-02");
    expect(daily[1].load).toBe(0);
  });

  it("falls back to TRIMP when TSS is zero", () => {
    const acts = [mkActivity("2026-01-01", { tss: 0, trimp: 33 })];
    const daily = buildDailyLoadSeries(acts, "2026-01-01");
    expect(daily[0].load).toBe(33);
  });
});

describe("computeLoadModel", () => {
  it("produces smoother CTL than ATL under increasing load", () => {
    const daily = [
      { date: "2026-01-01", tss_raw: 0, trimp_raw: 0, load: 20 },
      { date: "2026-01-02", tss_raw: 0, trimp_raw: 0, load: 50 },
      { date: "2026-01-03", tss_raw: 0, trimp_raw: 0, load: 90 },
      { date: "2026-01-04", tss_raw: 0, trimp_raw: 0, load: 110 },
    ];
    const model = computeLoadModel(daily);
    const last = model[model.length - 1];
    expect(last.atl).toBeGreaterThan(last.ctl);
    expect(last.tsb).toBeLessThan(0);
  });

  it("returns empty for empty input", () => {
    expect(computeLoadModel([])).toEqual([]);
  });
});

describe("computeLatestLoadMetrics", () => {
  it("returns zeros for empty activity list", () => {
    expect(computeLatestLoadMetrics([])).toEqual({ ctl: 0, atl: 0, tsb: 0, acwr: null });
  });

  it("returns latest rounded metrics", () => {
    const acts = [
      mkActivity("2026-01-01", { tss: 40 }),
      mkActivity("2026-01-02", { tss: 80 }),
      mkActivity("2026-01-03", { tss: 20 }),
    ];
    const m = computeLatestLoadMetrics(acts, "2026-01-03");
    expect(typeof m.ctl).toBe("number");
    expect(typeof m.atl).toBe("number");
    expect(typeof m.tsb).toBe("number");
  });
});

