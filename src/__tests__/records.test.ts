import { describe, it, expect } from "vitest";
import { buildRecords } from "../records.js";
import type { ActivitySummary } from "../summary_utils.js";

// Re-export buildRecords for testing. Since it's unexported we copy + test via the module.
// We test fmtPace indirectly through PR labels.

function makeSummary(date: string, sport: string, overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: date + sport,
    date,
    week: "2024-W01",
    sport,
    sport_raw: sport,
    name: `${sport} on ${date}`,
    distance_km: 20,
    moving_time_sec: 3600,
    elevation_m: 200,
    avg_hr: 150,
    max_hr: 175,
    avg_speed_kmh: 20,
    avg_power_w: 200,
    normalized_power: 210,
    tss: 80,
    trimp: 100,
    vo2max: 50,
    calories: 600,
    hr_zone_pct: null,
    hr_zone_sec: null,
    efficiency_factor: 1.4,
    pace_sec_per_km: sport === "Run" ? 330 : null,
    avg_cadence: 85,
    variability_index: 1.05,
    cardiac_drift_bpm: 3,
    z2_pct: 40,
    best_20min_power_w: 220,
    aerobic_decoupling_pct: 3,
    ...overrides,
  };
}

describe("buildRecords", () => {
  const runs = [
    makeSummary("2024-01-01", "Run", { pace_sec_per_km: 350, distance_km: 5 }),
    makeSummary("2024-02-01", "Run", { pace_sec_per_km: 320, distance_km: 10 }),
    makeSummary("2024-03-01", "Run", { pace_sec_per_km: 300, distance_km: 15 }),
  ];
  const rides = [
    makeSummary("2024-01-15", "Ride", { distance_km: 50, normalized_power: 200 }),
    makeSummary("2024-02-15", "Ride", { distance_km: 80, normalized_power: 230 }),
    makeSummary("2024-03-15", "Ride", { distance_km: 120, normalized_power: 215 }),
  ];
  const all = [...runs, ...rides];

  it("returns the correct total_activities_scanned", () => {
    const r = buildRecords(all);
    expect(r.total_activities_scanned).toBe(6);
  });

  it("picks fastest km pace (min pace_sec_per_km, no minDist)", () => {
    const r = buildRecords(all);
    expect(r.run_fastest_km_pace?.value).toBe(300);
  });

  it("run_fastest_5k_pace uses minDist >= 5", () => {
    const r = buildRecords(all);
    // All runs are >= 5 km so should pick 300 (fastest among all)
    expect(r.run_fastest_5k_pace?.value).toBe(300);
  });

  it("run_fastest_10k_pace uses minDist >= 10", () => {
    const r = buildRecords(all);
    // 5 km run excluded, picks from 10 km (320) and 15 km (300) → 300
    expect(r.run_fastest_10k_pace?.value).toBe(300);
  });

  it("run_longest_km picks max distance among runs", () => {
    const r = buildRecords(all);
    expect(r.run_longest_km?.value).toBe(15);
  });

  it("ride_longest_km picks max distance among rides", () => {
    const r = buildRecords(all);
    expect(r.ride_longest_km?.value).toBe(120);
  });

  it("ride_best_normalized_power_w picks max NP among rides", () => {
    const r = buildRecords(all);
    expect(r.ride_best_normalized_power_w?.value).toBe(230);
  });

  it("biggest_climb_m picks max elevation across all sports", () => {
    const withBigClimb = [...all, makeSummary("2024-04-01", "Run", { elevation_m: 2000 })];
    const r = buildRecords(withBigClimb);
    expect(r.biggest_climb_m?.value).toBe(2000);
  });

  it("best_vo2max picks max vo2max", () => {
    const withVo2 = [...all, makeSummary("2024-04-01", "Run", { vo2max: 65 })];
    const r = buildRecords(withVo2);
    expect(r.best_vo2max?.value).toBe(65);
  });

  it("highest_tss picks max tss", () => {
    const r = buildRecords(all);
    expect(r.highest_tss?.value).toBe(80); // all have 80
  });

  it("highest_trimp picks max trimp", () => {
    const r = buildRecords(all);
    expect(r.highest_trimp?.value).toBe(100);
  });

  it("longest_by_sport contains entries for each sport", () => {
    const r = buildRecords(all);
    expect(r.longest_by_sport["Run"]).toBeDefined();
    expect(r.longest_by_sport["Ride"]).toBeDefined();
  });

  it("longest_by_sport Run value is longest run distance", () => {
    const r = buildRecords(all);
    expect(r.longest_by_sport["Run"].value).toBe(15);
  });

  it("returns null PRs when no activities of that sport", () => {
    const r = buildRecords(rides); // no runs
    expect(r.run_fastest_km_pace).toBeNull();
    expect(r.run_longest_km).toBeNull();
  });

  it("pace label format is M:SS/km", () => {
    const r = buildRecords(runs);
    // 300 sec/km = 5:00/km
    expect(r.run_fastest_km_pace?.label).toBe("5:00/km");
  });

  it("run_fastest_10k_pace excludes runs shorter than 10km", () => {
    const shortRuns = [
      makeSummary("2024-01-01", "Run", { pace_sec_per_km: 200, distance_km: 3 }), // excluded
      makeSummary("2024-02-01", "Run", { pace_sec_per_km: 350, distance_km: 12 }),
    ];
    const r = buildRecords(shortRuns);
    expect(r.run_fastest_10k_pace?.value).toBe(350);
  });

  it("handles empty summaries without throwing", () => {
    const r = buildRecords([]);
    expect(r.total_activities_scanned).toBe(0);
    expect(r.run_fastest_km_pace).toBeNull();
    expect(r.ride_longest_km).toBeNull();
    expect(Object.keys(r.longest_by_sport)).toHaveLength(0);
  });
});

