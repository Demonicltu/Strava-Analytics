import { describe, it, expect } from "vitest";
import type { ActivitySummary } from "../summary_utils.js";
import { buildTrainingRecommendations } from "../recommendations.js";

function act(date: string, load: number, sport: string = "Ride"): ActivitySummary {
  return {
    id: date,
    date,
    week: "2026-W01",
    sport,
    sport_raw: sport,
    name: sport,
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

describe("buildTrainingRecommendations", () => {
  it("recommends recovery when readiness and TSB are low", () => {
    const rec = buildTrainingRecommendations({
      ctl: 60,
      atl: 80,
      tsb: -20,
      readiness_score: 42,
      readiness_label: "Low",
      hrv_trend: "declining",
      sleep_score: 51,
      body_battery: 28,
      recent_activities: [act("2026-01-01", 120), act("2026-01-02", 110)],
      goal_event_date: null,
    });
    expect(rec.state).toBe("fatigued");
    expect(rec.session_type).toBe("rest");
    expect(rec.next_24h).toMatch(/rest|recovery/i);
    expect(rec.suggested_weekly_tss_range?.[0]).toBeLessThan(rec.suggested_weekly_tss_range?.[1] ?? 0);
    expect(rec.session_plan?.type).toBe("recovery_spin");
    expect(rec.recovery_eta_hours).toBeGreaterThan(0);
    expect(rec.cause_codes?.some(c => c === "LOAD_HIGH" || c === "HRV_DROP")).toBe(true);
    expect(rec.confidence_factors).toBeDefined();
  });

  it("recommends quality when freshness is high", () => {
    const rec = buildTrainingRecommendations({
      ctl: 72,
      atl: 50,
      tsb: 22,
      readiness_score: 84,
      readiness_label: "Ready",
      hrv_trend: "improving",
      sleep_score: 82,
      body_battery: 76,
      recent_activities: [act("2026-01-01", 60), act("2026-01-02", 40)],
      goal_event_date: "2026-08-15",
    });
    expect(rec.state).toBe("fresh");
    expect(rec.session_type).toBe("quality");
    expect(rec.next_24h).toMatch(/quality|tempo|threshold/i);
    expect(rec.recovery_eta_hours).toBeNull();
    expect(["tempo_intervals", "threshold_intervals"]).toContain(rec.session_plan?.type);
    expect(rec.rationale.some(r => r.includes("Goal event date"))).toBe(true);
  });

  it("defaults to balanced build when signals are moderate", () => {
    const rec = buildTrainingRecommendations({
      ctl: 58,
      atl: 54,
      tsb: 4,
      readiness_score: 68,
      readiness_label: "Moderate",
      hrv_trend: "stable",
      sleep_score: 71,
      body_battery: 63,
      recent_activities: [act("2026-01-01", 50), act("2026-01-02", 70), act("2026-01-03", 40)],
      goal_event_date: null,
    });
    expect(rec.state).toBe("balanced");
    expect(rec.session_type).toMatch(/endurance|tempo/);
    expect(rec.confidence).toBe("medium");
    expect(rec.suggested_next_session_tss_range).not.toBeNull();
    expect(rec.confidence_factors?.coverage).toBeGreaterThan(0);
  });

  it("prioritizes Garmin decline signals when recent readiness and recovery drop", () => {
    const rec = buildTrainingRecommendations({
      ctl: 62,
      atl: 64,
      tsb: -3,
      readiness_score: 66,
      readiness_label: "Moderate",
      hrv_trend: "stable",
      hrv_delta_7: -5,
      sleep_score: 69,
      body_battery: 44,
      readiness_avg_7: 61,
      readiness_avg_28: 71,
      sleep_avg_7: 64,
      sleep_avg_28: 74,
      body_battery_avg_7: 42,
      body_battery_avg_28: 56,
      garmin_days_7: 7,
      garmin_days_28: 24,
      recent_activities: [act("2026-01-01", 75), act("2026-01-02", 70), act("2026-01-03", 65)],
      goal_event_date: null,
    });
    expect(rec.state).toMatch(/fatigued|cautious/);
    expect(rec.signals.some(s => s.includes("Readiness is down"))).toBe(true);
    expect(rec.cause_codes?.includes("HRV_DROP")).toBe(true);
  });

  it("downgrades confidence when quality penalty is high", () => {
    const rec = buildTrainingRecommendations({
      ctl: 72,
      atl: 50,
      tsb: 22,
      readiness_score: 84,
      readiness_label: "Ready",
      hrv_trend: "improving",
      sleep_score: 82,
      body_battery: 76,
      garmin_days_7: 7,
      quality_flags: ["GARMIN_DAYS_MISSING", "HRV_IMPLAUSIBLE_JUMP"],
      quality_penalty: 25,
      recent_activities: [act("2026-01-01", 60), act("2026-01-02", 40)],
      goal_event_date: null,
    });
    expect(["fresh", "balanced"]).toContain(rec.state);
    expect(rec.confidence).not.toBe("high");
    expect(rec.quality_flags?.length).toBeGreaterThan(0);
  });

  it("adjusts targets upward in build_fitness goal mode", () => {
    const rec = buildTrainingRecommendations({
      ctl: 58, atl: 54, tsb: 4, readiness_score: 68, readiness_label: "Moderate",
      hrv_trend: "stable", sleep_score: 71, body_battery: 63, goal_mode: "build_fitness",
      recent_activities: [act("2026-01-01", 50)],
    });
    expect(rec.rationale.some(r => r.includes("Goal mode"))).toBe(true);
  });

  it("uses less conservative fresh thresholds in performance modes", () => {
    const rec = buildTrainingRecommendations({
      ctl: 58,
      atl: 52,
      tsb: 7,
      readiness_score: 73,
      readiness_label: "Moderate",
      hrv_trend: "stable",
      sleep_score: 74,
      body_battery: 64,
      goal_mode: "build_fitness",
      recent_activities: [act("2026-01-01", 45), act("2026-01-02", 50)],
    });
    expect(rec.state).toBe("fresh");
    expect(rec.next_24h).toMatch(/progressive|quality/i);
  });

  it("maintains targets in maintain goal mode (default)", () => {
    const recDefault = buildTrainingRecommendations({
      ctl: 58, atl: 54, tsb: 4, readiness_score: 68, readiness_label: "Moderate",
      hrv_trend: "stable", sleep_score: 71, body_battery: 63, goal_mode: null,
      recent_activities: [act("2026-01-01", 50)],
    });
    expect(recDefault.suggested_next_session_tss_range).toBeDefined();
  });
});

describe("sport-specific adjustments", () => {
  it("detects running profile and adds running-specific rationale", () => {
    const runsOnly = Array.from({ length: 5 }, (_, i) =>
      act(`2026-01-${String(i + 1).padStart(2, "0")}`, 50, "Run")
    );
    const rec = buildTrainingRecommendations({
      ctl: 58, atl: 54, tsb: 4, readiness_score: 68, readiness_label: "Moderate",
      hrv_trend: "stable", sleep_score: 71, body_battery: 63,
      recent_activities: runsOnly,
    });
    expect(rec.rationale.some(r => r.includes("running"))).toBe(true);
  });

  it("detects cycling profile and adds cycling-specific rationale", () => {
    const ridesOnly = Array.from({ length: 5 }, (_, i) =>
      act(`2026-01-${String(i + 1).padStart(2, "0")}`, 80, "Ride")
    );
    const rec = buildTrainingRecommendations({
      ctl: 58, atl: 54, tsb: 4, readiness_score: 68, readiness_label: "Moderate",
      hrv_trend: "stable", sleep_score: 71, body_battery: 63,
      recent_activities: ridesOnly,
    });
    expect(rec.rationale.some(r => r.includes("cycling"))).toBe(true);
  });
});

describe("7-day microcycle planning", () => {
  it("generates weekly plan for fatigued state with rest days", () => {
    const rec = buildTrainingRecommendations({
      ctl: 60, atl: 80, tsb: -20, readiness_score: 42, readiness_label: "Low",
      hrv_trend: "declining", sleep_score: 51, body_battery: 28,
      recent_activities: [act("2026-01-01", 120), act("2026-01-02", 110)],
    });
    expect(rec.suggested_weekly_microcycle).toBeDefined();
    expect(rec.suggested_weekly_microcycle?.length).toBe(7);
    const restDays = rec.suggested_weekly_microcycle?.filter(d => d.intensity === "rest").length ?? 0;
    expect(restDays).toBeGreaterThanOrEqual(2);
  });

  it("generates weekly plan for fresh state with multiple quality sessions", () => {
    const rec = buildTrainingRecommendations({
      ctl: 72, atl: 50, tsb: 22, readiness_score: 84, readiness_label: "Ready",
      hrv_trend: "improving", sleep_score: 82, body_battery: 76,
      recent_activities: [act("2026-01-01", 60), act("2026-01-02", 40)],
    });
    expect(rec.suggested_weekly_microcycle).toBeDefined();
    expect(rec.suggested_weekly_microcycle?.length).toBe(7);
    const hardDays = rec.suggested_weekly_microcycle?.filter(d => d.intensity === "hard").length ?? 0;
    expect(hardDays).toBeGreaterThanOrEqual(1);
  });

  it("increases quality frequency in fresh performance mode microcycle", () => {
    const rec = buildTrainingRecommendations({
      ctl: 72,
      atl: 50,
      tsb: 22,
      readiness_score: 84,
      readiness_label: "Ready",
      hrv_trend: "improving",
      sleep_score: 82,
      body_battery: 76,
      goal_mode: "race_prep",
      recent_activities: [act("2026-01-01", 60), act("2026-01-02", 40)],
    });
    const hardDays = rec.suggested_weekly_microcycle?.filter(d => d.intensity === "hard").length ?? 0;
    expect(hardDays).toBeGreaterThanOrEqual(3);
  });
});

describe("cause code thresholds", () => {
  it("does not emit LOAD_HIGH at tsb -12 when other fatigue gates are not triggered", () => {
    const rec = buildTrainingRecommendations({
      ctl: 60,
      atl: 70,
      tsb: -12,
      readiness_score: 80,
      readiness_label: "Ready",
      hrv_trend: "improving",
      sleep_score: 82,
      body_battery: 72,
      garmin_days_7: 0,
      recent_activities: [act("2026-01-01", 30), act("2026-01-02", 35)],
    });
    expect(rec.cause_codes?.includes("LOAD_HIGH")).toBe(false);
  });

  it("does not emit LOAD_SPIKE for load ratio around 1.21 unless hard-day rule is met", () => {
    const recent: ActivitySummary[] = [];
    const start = new Date("2026-01-01T00:00:00Z");
    for (let i = 0; i < 28; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);
      const load = i >= 21 ? 13 : 10; // 7d load ratio ~= 1.21 (between old/new thresholds)
      recent.push(act(date, load));
    }

    const rec = buildTrainingRecommendations({
      ctl: 58,
      atl: 56,
      tsb: 2,
      readiness_score: 70,
      readiness_label: "Moderate",
      hrv_trend: "stable",
      sleep_score: 74,
      body_battery: 60,
      garmin_days_7: 7,
      recent_activities: recent,
    });

    expect(rec.cause_codes?.includes("LOAD_SPIKE")).toBe(false);
  });
});

