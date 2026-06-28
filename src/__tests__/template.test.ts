import { describe, it, expect } from "vitest";
import { renderTemplate, fillSlots, getSlotNames } from "../template.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRide(overrides: Record<string, any> = {}): any {
  return {
    summary_card: {
      type: "Ride",
      date: "2024-06-15",
      distance: "80 km",
      moving_time: "2:30:00",
      moving_time_seconds: 9000,
      avg_speed: 32,
      max_speed: "55 km/h",
      elevation: "800 m",
      avg_hr: "148 bpm",
      avg_power: "220 W",
      cadence: "89 rpm",
      calories: "1800",
      gear: "Gravel bike",
    },
    heart_rate: {
      stats: { avg: 148, max: 172, median: 150, p5: 120, p95: 168 },
      cardiac_drift: { drift_bpm: 5, drift_pct: 3.2 },
    },
    pacing: {
      type: "positive split",
      first_half: { avg_speed_kmh: 33, avg_hr: 145 },
      second_half: { avg_speed_kmh: 31, avg_hr: 151 },
      fastest_km: { km: 12, speed_kmh: 38, hr: 160, elevation_diff_m: -5 },
      slowest_km: { km: 5, speed_kmh: 22, hr: 142, elevation_diff_m: 15 },
    },
    power: { avg_power: 220, normalized_power: 235, variability_index: 1.07, has_power_meter: true },
    training_metrics: { tss: 120, intensity_factor: 0.88, efficiency_factor: 1.52, ftp_used: 267 },
    aerobic_decoupling: {
      decoupling_pct: 4.2,
      first_half_power: 225, second_half_power: 215,
      first_half_hr: 145, second_half_hr: 151,
      first_half_ratio: 1.55, second_half_ratio: 1.42,
    },
    training_zones: {
      hr_zones: { lthr: 168, zones: [{ zone: "Z1", range_bpm: "< 130", time_formatted: "5:00", pct: 10 }] },
      power_zones: { ftp_used: 267, zones: [{ zone: "Z2", range_watts: "134-185", time_formatted: "1:00:00", pct: 50 }] },
      cadence_zones: { zones: [{ zone: "85-95", range: "85-95", time_formatted: "1:30:00", pct: 80 }] },
    },
    cadence: { stats: { avg: 89, max: 115, median: 90 } },
    power_to_weight: { avg_wkg: 2.8, np_wkg: 3.0, ftp_wkg: 3.1, estimated_level: "Cat 4" },
    power_skills: { sprint_5s_pct_ftp: "180%", sustained_20min_pct_ftp: "95%", primary_strength: "Sustained" },
    vam_analysis: {
      climbs: [{ start_km: 10, elevation_gain_m: 150, duration_formatted: "12:00", vam: 750 }],
      best_vam_climb: { vam: 750, start_km: 10 },
      overall_vam: 600,
    },
    climbing_analysis: { total_ascent_m: 800, total_descent_m: 780, flat_pct: 40, uphill_pct: 35, downhill_pct: 25 },
    gradient_analysis: { distribution: [{ label: "Flat (0-2%)", pct: 40 }] },
    route_difficulty: { score: 61.5, label: "Hard", components: { ascent_density_m_per_km: 10.2, steep_uphill_pct: 12.8, uphill_total_pct: 38.4 } },
    torque: { avg_nm: 22, peak_nm: 55 },
    meteorology: {
      at_activity_start: { temperature_c: 22, apparent_temperature_c: 20, humidity_pct: 60, windspeed_kmh: 15, wind_direction: "NW", weather_description: "Clear sky" },
      wind_analysis: { headwind_pct: 30, tailwind_pct: 50, crosswind_pct: 20 },
    },
    heart_points: { points: 85, moderate_minutes: 30, vigorous_minutes: 55, pct_of_weekly_target: "57%" },
    vo2max: { value: 52.5, level: "Excellent", method: "pace-HR regression" },
    segments_summary: { prs: 3, highlight_table: [{ name: "Hill climb", distance: "2 km", time: "5:00", pr: "🥇" }] },
    relative_effort: { score: 120, interpretation: "Hard" },
    amateur_score: {
      composite_pct: 65,
      category: "Cat 4",
      tier_position: "upper",
      near_promotion: false,
      metrics: { "W/kg NP": "3.0" },
    },
    ...overrides,
  };
}

function makeRun(overrides: Record<string, any> = {}): any {
  return {
    summary_card: { type: "Run", date: "2024-06-20", distance: "10 km", moving_time: "50:00", moving_time_seconds: 3000, avg_speed: 12 },
    heart_rate: { stats: { avg: 155, max: 178 } },
    pacing: { first_half: { avg_speed_kmh: 11.8, avg_hr: 152 }, second_half: { avg_speed_kmh: 12.2, avg_hr: 158 } },
    cadence: { stats: { avg: 172, max: 185, median: 170 } },
    torque: { avg_nm: 20, peak_nm: 38 },
    climbing_analysis: { total_ascent_m: 150, total_descent_m: 140 },
    runner_score: {
      composite_pct: 72,
      category: "Competitive",
      tier_position: "mid",
      near_promotion: true,
      next_category: "Sub-Elite",
      metrics: { "Pace": "5:00/km" },
    },
    ...overrides,
  };
}

function makePaddle(overrides: Record<string, any> = {}): any {
  return {
    summary_card: { type: "StandUpPaddling", date: "2026-06-20", distance: "7.26 km", moving_time: "2:12:07", moving_time_seconds: 7927, avg_speed: "3.3 km/h", cadence: "51.4 spm" },
    pacing: { first_half: { avg_speed_kmh: 3.2, avg_hr: 93 }, second_half: { avg_speed_kmh: 3.5, avg_hr: 96 } },
    heart_rate: { stats: { avg: 95, max: 118, median: 96 } },
    cadence: { stats: { avg: 51, max: 79, median: 50 } },
    paddle_analysis: {
      avg_speed_kmh: 3.3,
      pace_sec_per_km: 1090.9,
      avg_stroke_rate_spm: 51.4,
      max_stroke_rate_spm: 79,
      stroke_rate_variability_pct: 32.1,
      estimated_total_strokes: 6704,
      distance_per_stroke_m: 1.08,
      stroke_rate_trend: { first_half_spm: 49.8, second_half_spm: 53.2, delta_spm: 3.4 },
    },
    ...overrides,
  };
}

// ─── getSlotNames ─────────────────────────────────────────────────────────────

describe("getSlotNames", () => {
  it("returns empty array for string with no slots", () => {
    expect(getSlotNames("no slots here")).toEqual([]);
  });

  it("returns slot names from skeleton", () => {
    expect(getSlotNames("{{verdict}} some text {{tips}}")).toEqual(["verdict", "tips"]);
  });

  it("deduplicates repeated slots", () => {
    expect(getSlotNames("{{verdict}} {{verdict}}")).toEqual(["verdict"]);
  });

  it("only matches lowercase_underscore patterns", () => {
    expect(getSlotNames("{{verdict}} {{NOT_SLOT}}")).toEqual(["verdict"]);
  });
});

// ─── fillSlots ────────────────────────────────────────────────────────────────

describe("fillSlots", () => {
  it("fills a single slot", () => {
    expect(fillSlots("Hello {{name}}!", { name: "world" })).toBe("Hello world!");
  });

  it("fills multiple distinct slots", () => {
    const result = fillSlots("{{a}} and {{b}}", { a: "one", b: "two" });
    expect(result).toBe("one and two");
  });

  it("replaces all occurrences of the same slot", () => {
    expect(fillSlots("{{x}} {{x}}", { x: "y" })).toBe("y y");
  });

  it("trims interpretation values", () => {
    expect(fillSlots("{{slot}}", { slot: "  spaced  " })).toBe("spaced");
  });

  it("removes unfilled slots", () => {
    const result = fillSlots("{{verdict}} {{unfilled}}", { verdict: "good" });
    expect(result).toBe("good ");
  });

  it("handles empty interpretations map", () => {
    const result = fillSlots("{{verdict}}", {});
    expect(result).toBe("");
  });
});

// ─── renderTemplate ───────────────────────────────────────────────────────────

describe("renderTemplate", () => {
  describe("sport routing", () => {
    it("renders ride summary title for ride type", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("RIDE SUMMARY");
    });

    it("renders run summary title for run type", () => {
      const out = renderTemplate(makeRun(), null, null);
      expect(out).toContain("RUN SUMMARY");
    });

    it("renders workout summary for workout type", () => {
      const out = renderTemplate({ summary_card: { type: "WeightTraining" } }, null, null);
      expect(out).toContain("WORKOUT SUMMARY");
    });

    it("renders paddle summary for StandUpPaddling type", () => {
      const out = renderTemplate(makePaddle(), null, null);
      expect(out).toContain("PADDLE SESSION");
    });

    it("renders activity summary for unknown type", () => {
      const out = renderTemplate({ summary_card: { type: "Kayaking" } }, null, null);
      expect(out).toContain("ACTIVITY SUMMARY");
    });
  });

  describe("summary card", () => {
    it("includes distance and moving time", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("80 km");
      expect(out).toContain("2:30:00");
    });

    it("shows avg pace label for run (not avg speed)", () => {
      const run = makeRun({ summary_card: { type: "Run", avg_speed: 12, distance: "10 km", moving_time: "50:00" } });
      const out = renderTemplate(run, null, null);
      expect(out).toContain("Avg Pace");
    });

    it("shows avg speed label for ride", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("Avg Speed");
    });

    it("shows elapsed vs moving time when different", () => {
      const ride = makeRide({
        summary_card: { ...makeRide().summary_card, elapsed_time: "2:45:00" },
      });
      const out = renderTemplate(ride, null, null);
      expect(out).toContain("moving");
      expect(out).toContain("total");
    });
  });

  describe("verdict section", () => {
    it("renders verdict slot placeholder", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("{{verdict}}");
    });
  });

  describe("pacing section", () => {
    it("renders first/second half table for ride", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("First half");
      expect(out).toContain("Last half");
    });

    it("renders fastest/slowest km highlights", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("Fastest km");
      expect(out).toContain("Slowest km");
    });

    it("renders pacing_interpretation slot", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("{{pacing_interpretation}}");
    });

    it("omits pacing section when no pacing data", () => {
      const out = renderTemplate({ summary_card: { type: "Ride" } }, null, null);
      expect(out).not.toContain("Pacing Strategy");
    });
  });

  describe("HR section", () => {
    it("renders avg and max HR", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("148 bpm");
      expect(out).toContain("172 bpm");
    });

    it("renders cardiac drift", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("drift");
      expect(out).toContain("{{cardiac_drift_interpretation}}");
    });

    it("omits HR section when no stats", () => {
      const out = renderTemplate({ summary_card: { type: "Ride" } }, null, null);
      expect(out).not.toContain("Heart Rate Analysis");
    });
  });

  describe("power section", () => {
    it("renders avg power and NP", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("220 W");
      expect(out).toContain("235 W");
    });

    it("notes power meter accuracy", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("power meter");
    });

    it("notes estimated power for rides without meter", () => {
      const ride = makeRide({ power: { avg_power: 200, normalized_power: 210, variability_index: 1.05, has_power_meter: false } });
      const out = renderTemplate(ride, null, null);
      expect(out).toContain("Strava-estimated");
    });

    it("omits power section when no avg_power", () => {
      const ride = makeRide({ power: null });
      const out = renderTemplate(ride, null, null);
      expect(out).not.toContain("Power Analysis");
    });
  });

  describe("training load section", () => {
    it("renders TSS and IF values", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("120");
      expect(out).toContain("0.88");
    });

    it("renders aerobic decoupling table when present (legacy field names)", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("4.2%");
      expect(out).toContain("{{decoupling_interpretation}}");
    });

    it("renders aerobic decoupling table from crunched JSON first_window/last_window", () => {
      const ride = makeRide({
        aerobic_decoupling: {
          decoupling_pct: -1.1,
          first_window: { avg_power: 235, avg_hr: 161, ratio: 1.461 },
          last_window: { avg_power: 239, avg_hr: 162, ratio: 1.476 },
        },
      });
      const out = renderTemplate(ride, null, null);
      expect(out).toContain("235 W");
      expect(out).toContain("161 bpm");
      expect(out).toContain("1.461");
      expect(out).toContain("-1.1%");
    });

    it("renders ef_interpretation slot when EF present", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("{{ef_interpretation}}");
    });
  });

  describe("zones section", () => {
    it("renders HR zones with bar chart", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("Z1");
      expect(out).toContain("{{hr_zones_insight}}");
    });

    it("renders power zones with FTP", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("FTP 267");
      expect(out).toContain("{{power_zones_insight}}");
    });

    it("renders cadence zones insight slot", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("{{cadence_zones_insight}}");
    });
  });

  describe("climbing section", () => {
    it("renders climbing data for rides with sufficient ascent", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("Climbing Analysis");
      expect(out).toContain("800 m");
    });

    it("skips climbing section for runs with < 100m ascent", () => {
      const out = renderTemplate(makeRun({ climbing_analysis: { total_ascent_m: 50 } }), null, null);
      expect(out).not.toContain("Climbing Analysis");
    });

    it("renders climbing for runs with >= 100m ascent", () => {
      const out = renderTemplate(makeRun({ climbing_analysis: { total_ascent_m: 150 } }), null, null);
      expect(out).toContain("Climbing Analysis");
    });

    it("renders climbing from crunched JSON 'climbing' key with nested terrain_pct", () => {
      const ride = makeRide({
        climbing_analysis: undefined,
        climbing: {
          total_ascent_m: 335, total_descent_m: 331,
          altitude_range: "75.2m → 156.4m",
          uphill_avg_speed: 22.3, flat_avg_speed: 30.3, downhill_avg_speed: 35.3,
          terrain_pct: { flat: 80, uphill: 12, downhill: 8 },
          uphill_avg_hr: 165, flat_avg_hr: 156,
          hardest_climb_km: { km: 53, speed_kmh: 20.4, hr: 171, elevation_diff_m: 36.4 },
        },
      });
      const out = renderTemplate(ride, null, null);
      expect(out).toContain("335 m");
      expect(out).toContain("75.2m → 156.4m");
      expect(out).toContain("80% flat");
      expect(out).toContain("Uphill avg HR: 165 bpm");
      expect(out).toContain("km 53");
    });
  });

  describe("VAM section", () => {
    it("renders VAM table and interpretation slot", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("VAM");
      expect(out).toContain("750");
      expect(out).toContain("{{vam_interpretation}}");
    });

    it("renders overall VAM when present", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("Overall VAM");
    });
  });

  describe("route difficulty section", () => {
    it("renders route difficulty score and component metrics", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("Route Difficulty");
      expect(out).toContain("61.5 / 100 (Hard)");
      expect(out).toContain("Ascent Density");
    });
  });

  describe("torque section", () => {
    it("renders avg and peak torque (legacy field names avg_nm/peak_nm)", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("22.0 Nm");
      expect(out).toContain("55.0 Nm");
      expect(out).toContain("{{torque_interpretation}}");
    });

    it("renders torque from crunched JSON field names avg_torque_nm/peak_torque_nm", () => {
      const ride = makeRide({ torque: { avg_torque_nm: 27.8, peak_torque_nm: 393.4 } });
      const out = renderTemplate(ride, null, null);
      expect(out).toContain("27.8 Nm");
      expect(out).toContain("393.4 Nm");
    });

    it("shows cycling benchmarks for ride", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("grinding");
    });

    it("shows running benchmarks for run", () => {
      const out = renderTemplate(makeRun(), null, null);
      expect(out).toContain("ground-force");
    });
  });

  describe("cadence section", () => {
    it("renders cadence stats in spm for run", () => {
      const out = renderTemplate(makeRun(), null, null);
      expect(out).toContain("172 spm");
    });

    it("renders cadence stats in rpm for ride", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("89 rpm");
    });

    it("shows optimal cadence benchmark for run", () => {
      const out = renderTemplate(makeRun(), null, null);
      expect(out).toContain("170–180 spm");
    });

    it("uses stroke rate wording for paddle and skips cycling benchmark", () => {
      const out = renderTemplate(makePaddle(), null, null);
      expect(out).toContain("Stroke Rate");
      expect(out).not.toContain("pro benchmark 85–95 rpm");
    });
  });

  describe("paddle metrics section", () => {
    it("renders paddle_analysis when available", () => {
      const out = renderTemplate(makePaddle(), null, null);
      expect(out).toContain("Paddle Metrics");
      expect(out).toContain("Estimated Total Strokes");
      expect(out).toContain("Distance Per Stroke");
    });
  });

  describe("weather section", () => {
    it("renders temperature and wind", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("22.0°C");
      expect(out).toContain("15 km/h");
    });

    it("renders wind impact section", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("WIND IMPACT");
      expect(out).toContain("30% headwind");
    });
  });

  describe("heart points section", () => {
    it("renders heart points and weekly target", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("Heart Points");
      expect(out).toContain("85");
      expect(out).toContain("150 pts");
    });
  });

  describe("VO2max section", () => {
    it("renders vo2max value and level", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("52.5");
      expect(out).toContain("Excellent");
    });
  });

  describe("segments section", () => {
    it("renders PR count", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("3 personal records");
    });

    it("renders highlight table", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("Hill climb");
    });
  });

  describe("score section", () => {
    it("renders cycling score for ride", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("Cycling Score: 65%");
    });

    it("renders runner score for run", () => {
      const out = renderTemplate(makeRun(), null, null);
      expect(out).toContain("Runner Score: 72%");
    });

    it("shows near_promotion notice when applicable", () => {
      const out = renderTemplate(makeRun(), null, null);
      expect(out).toContain("Sub-Elite");
    });
  });

  describe("tips section", () => {
    it("renders tips slot placeholder", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).toContain("{{tips}}");
    });
  });

  describe("historical section", () => {
    it("renders historical comparison when baselines provided (legacy avg_hr_bpm field)", () => {
      const historical = {
        baselines: [
          { period_label: "3 months", days: 90, activity_count: 20, avg_hr_bpm: 152, avg_normalized_power_w: 230, avg_tss: 110 },
        ],
      };
      const out = renderTemplate(makeRide(), historical, null);
      expect(out).toContain("HISTORICAL CONTEXT");
      expect(out).toContain("3 months");
      expect(out).toContain("{{historical_comparison}}");
    });

    it("renders Avg HR from crunched JSON field avg_hr", () => {
      const historical = {
        baselines: [
          { period_label: "3 months", days: 90, activity_count: 20, avg_hr: 145, avg_normalized_power_w: 203, avg_tss: 72,
            avg_best_20min_power_w: 204, avg_variability_index: 1.13 },
        ],
      };
      const out = renderTemplate(makeRide(), historical, null);
      expect(out).toContain("145 bpm");
      expect(out).toContain("204 W");
      expect(out).toContain("1.13");
    });

    it("skips historical section when no baselines", () => {
      const out = renderTemplate(makeRide(), { baselines: [] }, null);
      expect(out).not.toContain("HISTORICAL CONTEXT");
    });

    it("skips historical section when historical is null", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).not.toContain("HISTORICAL CONTEXT");
    });
  });

  describe("readiness section", () => {
    it("renders readiness when wellness provided", () => {
      const wellness = {
        night_before: { sleep_score: 78, hrv_last_5_min: 42, resting_hr: 52, body_battery_start: 75, hrv_vs_baseline: 2, training_readiness_score: 75 },
        day_of: { body_battery_at_start: 80 },
      };
      const out = renderTemplate(makeRide(), null, wellness);
      expect(out).toContain("READINESS");
      expect(out).toContain("78/100");
      expect(out).toContain("80/100 at activity start");
      expect(out).toContain("{{readiness_verdict}}");
    });

    it("renders overnight stress from sleep_avg_stress (real crunched JSON field)", () => {
      const wellness = {
        night_before: { sleep_score: 78, hrv_last_5_min: 42, sleep_avg_stress: 22, training_readiness_score: 75 },
        day_of: null,
      };
      const out = renderTemplate(makeRide(), null, wellness);
      expect(out).toContain("Overnight stress");
      expect(out).toContain("22");
      expect(out).toContain("Low — good recovery");
    });

    it("skips readiness section when wellness is null", () => {
      const out = renderTemplate(makeRide(), null, null);
      expect(out).not.toContain("READINESS");
    });
  });

  describe("training recommendation section", () => {
    it("renders deterministic recommendation block when provided", () => {
      const out = renderTemplate(makeRide(), null, null, {
        state: "cautious",
        session_type: "recovery",
        next_24h: "Easy aerobic / mobility",
        next_72h: "Easy day then endurance",
        suggested_next_session_tss_range: [25, 50],
        session_plan: {
          type: "aerobic_endurance",
          duration_min_range: [45, 75],
          intensity_hint: "Mostly Z2 with smooth cadence; avoid hard surges",
          tss_target_range: [25, 50],
        },
        suggested_weekly_tss_range: [350, 420],
        suggested_weekly_microcycle: [
          { day: 1, intensity: "easy", note: "Aerobic maintenance" },
          { day: 2, intensity: "rest", note: "Recovery focus" },
          { day: 3, intensity: "easy", note: "Light workout" },
          { day: 4, intensity: "rest", note: "Midweek break" },
          { day: 5, intensity: "moderate", note: "Tempo session" },
          { day: 6, intensity: "easy", note: "Easy spin" },
          { day: 7, intensity: "rest", note: "Prep for next week" },
        ],
        recovery_eta_hours: 18.5,
        rationale: ["Recovery signals are trending down"],
        signals: ["Readiness is down vs 28d baseline"],
        confidence: "high",
        cause_codes: ["LOAD_HIGH", "HRV_DROP"],
        quality_flags: ["GARMIN_DAYS_MISSING", "SLEEP_FIELDS_MISSING"],
        confidence_factors: { coverage: 100, agreement: 84, stability: 78 },
        changes: {
          state_changed: true,
          drivers: [
            { key: "Readiness", delta: -6 },
            { key: "HRV 7d delta", delta: -4, unit: "ms" },
          ],
        },
      });
      expect(out).toContain("TRAINING RECOMMENDATION");
      expect(out).toContain("Easy aerobic / mobility");
      expect(out).toContain("**Session archetype:** aerobic_endurance");
      expect(out).toContain("**Session duration target:** 45-75 min");
      expect(out).toContain("**7-Day Microcycle Plan:**");
      expect(out).toContain("**Day 1:** EASY");
      expect(out).toContain("**Day 5:** MODERATE");
      expect(out).toContain("**Recovery ETA to balanced state:**");
      expect(out).toContain("~18.5h");
      expect(out).toContain("Readiness is down vs 28d baseline");
      expect(out).toContain("Top drivers");
      expect(out).toContain("High training load");
      expect(out).toContain("HRV suppression");
      expect(out).toContain("Driver details");
      expect(out).toContain("High training load (LOAD_HIGH)");
      expect(out).toContain("HRV suppression (HRV_DROP)");
      expect(out).toContain("Confidence breakdown");
      expect(out).toContain("Coverage: 100/100");
      expect(out).toContain("Data quality");
      expect(out).toContain("GARMIN_DAYS_MISSING, SLEEP_FIELDS_MISSING");
      expect(out).toContain("What changed vs previous day");
      expect(out).toContain("Readiness: -6");
      expect(out).toContain("HRV 7d delta: -4 ms");
    });
  });

  describe("slots round-trip", () => {
    it("all slots from getSlotNames can be filled with fillSlots", () => {
      const skeleton = renderTemplate(makeRide(), { baselines: [{ period_label: "3 months", days: 90, activity_count: 5 }] }, {
        night_before: { sleep_score: 80, hrv_vs_baseline: 1 },
        day_of: null,
      });
      const slots = getSlotNames(skeleton);
      const fakeInterps = Object.fromEntries(slots.map(s => [s, `AI text for ${s}`]));
      const filled = fillSlots(skeleton, fakeInterps);
      expect(filled).not.toMatch(/\{\{[a-z_]+\}\}/);
      for (const s of slots) {
        expect(filled).toContain(`AI text for ${s}`);
      }
    });
  });
});

// ─── helper functions ─────────────────────────────────────────────────────────

describe("n helper (via rendered output)", () => {
  it("renders null as —", () => {
    const out = renderTemplate({ summary_card: { type: "Ride" }, heart_rate: { stats: { avg: null, max: null } } }, null, null);
    expect(out).toContain("—");
  });

  it("renders numbers rounded without decimals by default", () => {
    const out = renderTemplate(makeRide(), null, null);
    expect(out).toContain("148 bpm");
  });
});

describe("bar helper (via rendered zones)", () => {
  it("renders filled bars proportional to percentage", () => {
    const ride = makeRide({
      training_zones: {
        hr_zones: {
          zones: [
            { zone: "Z1", range_bpm: "< 130", time_formatted: "0:30", pct: 100 },
          ],
        },
      },
    });
    const out = renderTemplate(ride, null, null);
    expect(out).toContain("██████████");
  });

  it("renders partial bar for 50%", () => {
    const ride = makeRide({
      training_zones: {
        hr_zones: {
          zones: [{ zone: "Z2", range_bpm: "130-150", time_formatted: "1:00:00", pct: 50 }],
        },
      },
    });
    const out = renderTemplate(ride, null, null);
    expect(out).toContain("█████");
  });
});






