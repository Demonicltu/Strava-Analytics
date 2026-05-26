import { describe, it, expect } from "vitest";
import { buildInterpretationRequests } from "../interpret.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse only the JSON portion of a user field.
 * When few-shot examples are appended, the user field looks like:
 *   {json}\n\n--- Example ---\nInput: ...\nOutput: ...
 * We split on the separator and parse only the first part.
 */
function parseUserJson(user: string): any {
  const sep = user.indexOf("\n\n--- Example ---");
  const jsonStr = sep >= 0 ? user.slice(0, sep) : user;
  return JSON.parse(jsonStr);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRide(overrides: Record<string, any> = {}): any {
  return {
    summary_card: {
      type: "Ride",
      distance: "80 km",
      moving_time: "2:30:00",
      moving_time_seconds: 9000,
      avg_speed: 32,
    },
    heart_rate: {
      stats: { avg: 148, max: 172, median: 150, p5: 120, p95: 168 },
      cardiac_drift: { drift_bpm: 5, drift_pct: 3.2 },
    },
    pacing: {
      type: "positive split",
      first_half: { avg_speed_kmh: 33, avg_hr: 145 },
      second_half: { avg_speed_kmh: 31, avg_hr: 151 },
      fastest_km: { km: 12, speed_kmh: 38, hr: 160 },
      slowest_km: { km: 5, speed_kmh: 22, hr: 142 },
    },
    power: {
      avg_power: 220,
      normalized_power: 235,
      variability_index: 1.07,
    },
    training_metrics: {
      tss: 120,
      intensity_factor: 0.88,
      efficiency_factor: 1.52,
      ftp_used: 267,
    },
    aerobic_decoupling: {
      decoupling_pct: 4.2,
      first_half_power: 225,
      second_half_power: 215,
      first_half_hr: 145,
      second_half_hr: 151,
    },
    training_zones: {
      hr_zones: { zones: [{ zone: "Z1", pct: 10 }, { zone: "Z2", pct: 60 }, { zone: "Z3", pct: 30 }] },
      power_zones: { ftp_used: 267, zones: [{ zone: "Z2", pct: 50 }, { zone: "Z3", pct: 50 }] },
      cadence_zones: { zones: [{ zone: "85-95", pct: 80 }] },
    },
    cadence: { stats: { avg: 89 }, is_low: false },
    power_skills: { sprint_5s_pct_ftp: "180%", primary_strength: "Sustained" },
    power_to_weight: { avg_wkg: 2.8, np_wkg: 3.0, ftp_wkg: 3.1 },
    vam_analysis: {
      climbs: [{ start_km: 10, elevation_gain_m: 150, duration_formatted: "12:00", vam: 750 }],
      best_vam_climb: { vam: 750, start_km: 10 },
      overall_vam: 600,
    },
    torque: { avg_nm: 22, peak_nm: 55 },
    climbing_analysis: { total_ascent_m: 800 },
    segments_summary: { prs: 3 },
    meteorology: { at_activity_start: { weather_description: "Clear sky" } },
    ...overrides,
  };
}

function makeRun(overrides: Record<string, any> = {}): any {
  return {
    summary_card: {
      type: "Run",
      distance: "10 km",
      moving_time: "50:00",
      moving_time_seconds: 3000,
      avg_speed: 12,
    },
    heart_rate: { stats: { avg: 155, max: 178 }, cardiac_drift: { drift_bpm: 3, drift_pct: 2.0 } },
    pacing: {
      type: "negative split",
      first_half: { avg_speed_kmh: 11.8, avg_hr: 152 },
      second_half: { avg_speed_kmh: 12.2, avg_hr: 158 },
    },
    training_metrics: { tss: 65, intensity_factor: 0.82 },
    aerobic_decoupling: { decoupling_pct: 2.1 },
    cadence: { stats: { avg: 172 } },
    torque: { avg_nm: 20, peak_nm: 38 },
    training_zones: {
      cadence_zones: { zones: [{ zone: "170-180", pct: 65 }] },
    },
    segments_summary: { prs: 0 },
    ...overrides,
  };
}

const ALL_SLOTS = [
  "verdict",
  "pacing_interpretation",
  "cardiac_drift_interpretation",
  "power_interpretation",
  "ef_interpretation",
  "decoupling_interpretation",
  "power_skills_interpretation",
  "hr_zones_insight",
  "power_zones_insight",
  "cadence_zones_insight",
  "vam_interpretation",
  "torque_interpretation",
  "tips",
  "historical_comparison",
  "readiness_verdict",
];

// ─── buildInterpretationRequests ─────────────────────────────────────────────

describe("buildInterpretationRequests", () => {
  it("returns empty array when slotNames is empty", () => {
    expect(buildInterpretationRequests(makeRide(), null, null, [])).toEqual([]);
  });

  it("returns only requested slots", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["verdict", "tips"]);
    expect(reqs.map(r => r.slot)).toEqual(["verdict", "tips"]);
  });

  it("verdict request has correct slot and maxTokens", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["verdict"]);
    expect(reqs).toHaveLength(1);
    const r = reqs[0];
    expect(r.slot).toBe("verdict");
    expect(r.maxTokens).toBe(200);
    expect(r.system).toContain("verdict");
  });

  it("verdict user JSON includes key activity fields", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["verdict"]);
    const user = parseUserJson(reqs[0].user);
    expect(user.avg_hr).toBe(148);
    expect(user.sport).toBe("Ride");
    expect(user.segment_prs).toBe(3);
  });

  it("pacing request includes split speeds", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["pacing_interpretation"]);
    const user = parseUserJson(reqs[0].user);
    expect(user.first_half_speed).toBe(33);
    expect(user.second_half_speed).toBe(31);
    expect(user.split_type).toBe("positive split");
  });

  it("pacing request computes avgPace for run sport", () => {
    const reqs = buildInterpretationRequests(makeRun(), null, null, ["verdict"]);
    const user = parseUserJson(reqs[0].user);
    // avgPace is computed from first_half avg_speed_kmh = 11.8 → ~5:05/km
    expect(user.avg_pace).toMatch(/\d+:\d{2}\/km/);
  });

  it("cardiac_drift request includes drift_bpm and decoupling", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["cardiac_drift_interpretation"]);
    const user = parseUserJson(reqs[0].user);
    expect(user.drift_bpm).toBe(5);
    expect(user.aerobic_decoupling_pct).toBe(4.2);
  });

  it("power_interpretation request includes variability_index", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["power_interpretation"]);
    const user = parseUserJson(reqs[0].user);
    expect(user.variability_index).toBe(1.07);
    expect(user.avg_power).toBe(220);
  });

  it("ef_interpretation has maxTokens 40", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["ef_interpretation"]);
    expect(reqs[0].maxTokens).toBe(40);
  });

  it("decoupling_interpretation includes first/second half power and hr", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["decoupling_interpretation"]);
    const user = parseUserJson(reqs[0].user);
    expect(user.decoupling_pct).toBe(4.2);
    expect(user.first_half_power).toBe(225);
    expect(user.second_half_hr).toBe(151);
  });

  it("power_skills_interpretation includes power_skills data", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["power_skills_interpretation"]);
    const user = parseUserJson(reqs[0].user);
    expect(user.power_skills.sprint_5s_pct_ftp).toBe("180%");
    expect(user.sport).toBe("Ride");
  });

  it("hr_zones_insight maps zones to pct pairs", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["hr_zones_insight"]);
    const user = parseUserJson(reqs[0].user);
    expect(user.zones).toEqual([{ zone: "Z1", pct: 10 }, { zone: "Z2", pct: 60 }, { zone: "Z3", pct: 30 }]);
  });

  it("power_zones_insight includes ftp", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["power_zones_insight"]);
    const user = parseUserJson(reqs[0].user);
    expect(user.ftp).toBe(267);
    expect(user.tss).toBe(120);
  });

  it("cadence_zones_insight detects cycling sport for ride", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["cadence_zones_insight"]);
    const user = parseUserJson(reqs[0].user);
    expect(user.sport).toBe("cycling");
  });

  it("cadence_zones_insight detects running sport for run", () => {
    const reqs = buildInterpretationRequests(makeRun(), null, null, ["cadence_zones_insight"]);
    const user = parseUserJson(reqs[0].user);
    expect(user.sport).toBe("running");
  });

  it("vam_interpretation references cycling refs in system", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["vam_interpretation"]);
    expect(reqs[0].system).toContain("Pogačar");
  });

  it("vam_interpretation references trail running refs for run", () => {
    const reqs = buildInterpretationRequests(makeRun(), null, null, ["vam_interpretation"]);
    expect(reqs[0].system).toContain("trail runner");
  });

  it("torque_interpretation references cycling benchmarks for ride", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["torque_interpretation"]);
    expect(reqs[0].system).toContain("recreational=15-25Nm");
    const user = parseUserJson(reqs[0].user);
    expect(user.avg_nm).toBe(22);
    expect(user.sport).toBe("cycling");
  });

  it("tips request includes cadence and torque data", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["tips"]);
    const user = parseUserJson(reqs[0].user);
    expect(user.avg_cadence).toBe(89);
    expect(user.torque_avg_nm).toBe(22);
    expect(user.segment_prs).toBe(3);
  });

  it("historical_comparison is skipped when historical is null", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["historical_comparison"]);
    expect(reqs).toHaveLength(0);
  });

  it("historical_comparison is included when historical has baselines", () => {
    const historical = {
      baselines: [
        { days: 90, period_label: "3 months", avg_hr_bpm: 150, activity_count: 20 },
        { days: 180, period_label: "6 months", avg_efficiency_factor: 1.4 },
      ],
    };
    const reqs = buildInterpretationRequests(makeRide(), historical, null, ["historical_comparison"]);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].slot).toBe("historical_comparison");
    const user = parseUserJson(reqs[0].user);
    expect(user.primary_baseline.period).toBe("3 months");
    expect(user.slow_baseline.avg_ef).toBe(1.4);
  });

  it("readiness_verdict is skipped when wellness is null", () => {
    const reqs = buildInterpretationRequests(makeRide(), null, null, ["readiness_verdict"]);
    expect(reqs).toHaveLength(0);
  });

  it("readiness_verdict is included when wellness provided", () => {
    const wellness = {
      night_before: { sleep_score: 78, hrv_last_5_min: 42, resting_hr: 52, body_battery_start: 75 },
      day_of: { body_battery_at_start: 80 },
    };
    const reqs = buildInterpretationRequests(makeRide(), null, wellness, ["readiness_verdict"]);
    expect(reqs).toHaveLength(1);
    const user = parseUserJson(reqs[0].user);
    expect(user.sleep_score).toBe(78);
    expect(user.body_battery_at_start).toBe(80);
  });

  it("all slots built for fully-populated ride with historical + wellness", () => {
    const historical = {
      baselines: [
        { days: 90, period_label: "3 months", avg_hr_bpm: 150, activity_count: 10 },
      ],
    };
    const wellness = {
      night_before: { sleep_score: 80, hrv_last_5_min: 45 },
      day_of: null,
    };
    const reqs = buildInterpretationRequests(makeRide(), historical, wellness, ALL_SLOTS);
    const slots = reqs.map(r => r.slot);
    expect(slots).toContain("verdict");
    expect(slots).toContain("tips");
    expect(slots).toContain("historical_comparison");
    expect(slots).toContain("readiness_verdict");
  });

  it("handles missing nested data gracefully (no throw)", () => {
    const minimal = { summary_card: { type: "Ride" } };
    expect(() =>
      buildInterpretationRequests(minimal, null, null, ALL_SLOTS.filter(s => s !== "historical_comparison" && s !== "readiness_verdict"))
    ).not.toThrow();
  });
});

