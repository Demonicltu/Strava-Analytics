import { describe, it, expect } from "vitest";
import { buildDescription, buildPrivateNotes } from "../format.js";

// ─── Shared fixtures ───

function makeRideCrunched(overrides: Record<string, any> = {}) {
  return {
    summary_card: {
      type: "Ride",
      name: "Morning Ride",
      date: "Wednesday, June 15, 2024",
      distance: "50.0 km",
      moving_time: "2h 00m",
      elapsed_time: "2h 10m",
      avg_speed: "25.0 km/h",
      max_speed: "48.0 km/h",
      elevation: "500 m gained",
      avg_hr: "155 bpm",
      avg_power: "200 W (NP: 215 W)",
      cadence: "85 rpm",
      calories: "1200 kcal",
      moving_time_seconds: 7200,
    },
    heart_rate: { stats: { avg: 155, max: 175 }, cardiac_drift: { drift_bpm: 4, drift_pct: 2.5 } },
    power: { normalized_power: 215, avg_power: 200, has_power_meter: true, variability_index: 1.075 },
    training_metrics: { intensity_factor: 0.86, intensity_factor_label: "Tempo", tss: 82, tss_label: "Moderate" },
    power_to_weight: { avg_wkg: 2.86, np_wkg: 3.07, estimated_level: "Cat 4" },
    relative_effort: { score: 120, interpretation: "Hard" },
    vo2max: { value: 52.5, level: "Above Average", method: "power (FTP-based)" },
    aerobic_decoupling: { decoupling_pct: 3.5 },
    pacing: { type: "positive-split", first_half: { avg_speed_kmh: 27.0, avg_hr: 152 }, second_half: { avg_speed_kmh: 23.0, avg_hr: 158 } },
    ...overrides,
  };
}

function makeRunCrunched(overrides: Record<string, any> = {}) {
  return {
    summary_card: { type: "Run", name: "Easy Run", date: "Thursday", distance: "10.0 km", moving_time: "50m", elapsed_time: "52m", avg_speed: "5:00/km", avg_hr: "155 bpm", moving_time_seconds: 3000 },
    relative_effort: { score: 80, interpretation: "Moderate" },
    ...overrides,
  };
}

// ─── buildDescription — basic checks ───

describe("buildDescription — Ride (no AI)", () => {
  it("contains summary card header", () => {
    const out = buildDescription(makeRideCrunched(), null);
    expect(out).toContain("📊 RIDE SUMMARY");
  });

  it("contains distance", () => {
    const out = buildDescription(makeRideCrunched(), null);
    expect(out).toContain("50.0 km");
  });

  it("contains advanced metrics for rides", () => {
    const out = buildDescription(makeRideCrunched(), null);
    expect(out).toContain("⚙️ ADVANCED METRICS");
    expect(out).toContain("IF:");
    expect(out).toContain("TSS:");
  });

  it("contains W/kg when power_to_weight present", () => {
    const out = buildDescription(makeRideCrunched(), null);
    expect(out).toContain("W/kg:");
  });

  it("contains relative effort", () => {
    const out = buildDescription(makeRideCrunched(), null);
    expect(out).toContain("Relative Effort:");
  });

  it("contains VO2max when present", () => {
    const out = buildDescription(makeRideCrunched(), null);
    expect(out).toContain("VO2max:");
  });

  it("contains footer attribution", () => {
    const out = buildDescription(makeRideCrunched(), null);
    expect(out).toContain("Strava Analytics");
  });

  it("contains heart points when present", () => {
    const crunched = makeRideCrunched({ heart_points: { points: 45, pct_of_weekly_target: "30%", moderate_minutes: 18, vigorous_minutes: 14 } });
    const out = buildDescription(crunched, null);
    expect(out).toContain("HEART POINTS");
    expect(out).toContain("45");
  });

  it("shows pacing section in no-AI mode", () => {
    const out = buildDescription(makeRideCrunched(), null);
    expect(out).toContain("📈 PACING");
    expect(out).toContain("positive-split");
  });

  it("shows aerobic decoupling in no-AI mode", () => {
    const out = buildDescription(makeRideCrunched(), null);
    expect(out).toContain("AEROBIC DECOUPLING");
  });

  it("shows PR count when segments_summary.prs > 0", () => {
    const crunched = makeRideCrunched({ segments_summary: { prs: 5 } });
    const out = buildDescription(crunched, null);
    expect(out).toContain("5 personal records");
  });
});

describe("buildDescription — Ride (with AI text)", () => {
  const aiText = `## Performance Verdict\nGreat ride today!\n\n## Training Zones\nZ2: 40%\n\n## 4.2 Heart Rate Analysis\nAvg: 155 bpm\n`;

  it("extracts Performance Verdict from AI text", () => {
    const out = buildDescription(makeRideCrunched(), aiText);
    expect(out).toContain("📈 PERFORMANCE VERDICT");
    expect(out).toContain("Great ride today");
  });

  it("extracts Training Zones from AI text", () => {
    const out = buildDescription(makeRideCrunched(), aiText);
    expect(out).toContain("🎯 TRAINING ZONES");
  });

  it("hides no-AI fallback sections when AI text present", () => {
    const out = buildDescription(makeRideCrunched(), aiText);
    // No-AI pacing section should use AI text path — pacing section only shows with no-AI
    expect(out).not.toContain("📈 PACING");
  });
});

describe("buildDescription — Run", () => {
  it("uses RUN SUMMARY label", () => {
    const out = buildDescription(makeRunCrunched(), null);
    expect(out).toContain("📊 RUN SUMMARY");
  });

  it("shows effort section for run", () => {
    const out = buildDescription(makeRunCrunched(), null);
    expect(out).toContain("⚙️ EFFORT");
  });
});

describe("buildDescription — Walk", () => {
  it("uses WALK SUMMARY label", () => {
    const crunched = { summary_card: { type: "Walk", name: "Walk", distance: "5.0 km", moving_time_seconds: 3600 } };
    const out = buildDescription(crunched, null);
    expect(out).toContain("📊 WALK SUMMARY");
  });
});

describe("buildDescription — amateur_score", () => {
  it("shows YOUR CYCLING SCORE when amateur_score present", () => {
    const crunched = makeRideCrunched({
      amateur_score: { composite_pct: 76, category: "Cat 4", tier_position: "Mid", near_promotion: false, metrics: { speed: "110% of ceiling" } },
    });
    const out = buildDescription(crunched, null);
    expect(out).toContain("YOUR CYCLING SCORE");
    expect(out).toContain("Cat 4");
  });

  it("shows near_promotion message when near_promotion=true", () => {
    const crunched = makeRideCrunched({
      amateur_score: { composite_pct: 98, category: "Cat 4", tier_position: "Top", near_promotion: true, next_category: "Cat 3", metrics: {} },
    });
    const out = buildDescription(crunched, null);
    expect(out).toContain("Cat 3");
    expect(out).toContain("Approaching");
  });

  it("shows personal score vs typical arrow when personalScore present", () => {
    const crunched = makeRideCrunched({
      amateur_score: { composite_pct: 76, category: "Cat 4", metrics: {} },
    });
    const personalScore = { composite_pct: 115, interpretation: "Above average" };
    const out = buildDescription(crunched, null, undefined, undefined, personalScore);
    expect(out).toContain("115%");
    expect(out).toContain("⬆️");
  });
});

describe("buildDescription — runner_score", () => {
  it("shows YOUR RUNNER SCORE when runner_score present", () => {
    const crunched = makeRunCrunched({
      runner_score: { composite_pct: 74, category: "Strong Amateur", tier_position: "Mid", near_promotion: false, metrics: { pace: "5:00/km → cat ceiling" } },
    });
    const out = buildDescription(crunched, null);
    expect(out).toContain("YOUR RUNNER SCORE");
    expect(out).toContain("Strong Amateur");
  });
});

describe("buildDescription — historical context fallback (no AI)", () => {
  it("shows HISTORICAL CONTEXT from raw data when no AI text", () => {
    const historicalCtx = {
      sport: "Ride",
      baselines: [
        { period_label: "3 months", days: 90, activity_count: 15, total_distance_km: 600, total_time_h: 24, weekly_avg_distance_km: 46.2, avg_normalized_power_w: 205, avg_tss: 78, avg_efficiency_factor: 1.38 },
      ],
    };
    const out = buildDescription(makeRideCrunched(), null, historicalCtx);
    expect(out).toContain("HISTORICAL CONTEXT");
    expect(out).toContain("3 months");
    expect(out).toContain("NP 205 W");
  });
});

describe("buildDescription — wellness fallback (no AI)", () => {
  it("shows READINESS section from wellness context when no AI text", () => {
    const wellnessCtx = {
      activity_date: "2024-06-15",
      night_before: {
        date: "2024-06-14",
        sleep_score: 78,
        sleep_duration_h: 7.5,
        sleep_deep_pct: 20,
        sleep_rem_pct: 22,
        sleep_avg_spo2: 96,
        sleep_avg_stress: 18,
        hrv_last_5_min: 52,
        hrv_weekly_avg: 48,
        hrv_status: "Balanced",
        hrv_vs_baseline: 4,
        resting_hr: 51,
        training_readiness_score: 72,
        training_readiness_level: "Ready",
        stress_low_pct: 50,
        stress_medium_pct: 30,
        stress_high_pct: 8,
        body_battery_start: 80,
        body_battery_end: 40,
        body_battery_charged: 65,
        body_battery_drained: 50,
        spo2_avg: 97,
        spo2_min: 94,
      },
      day_of: null,
      readiness_note: "HRV 52 ms | Sleep 78/100",
    };
    const out = buildDescription(makeRideCrunched(), null, undefined, wellnessCtx as any);
    expect(out).toContain("🛌 READINESS");
    expect(out).toContain("Training Readiness:");
  });
});

describe("buildDescription — weather", () => {
  it("shows WEATHER & WIND when meteorology present", () => {
    const crunched = makeRideCrunched({
      meteorology: {
        at_activity_start: {
          temperature_c: 14,
          apparent_temperature_c: 11,
          humidity_pct: 72,
          precipitation_mm: 0,
          windspeed_kmh: 22,
          wind_direction: "W",
          wind_gusts_kmh: 34,
          weather_description: "Partly cloudy",
        },
        wind_analysis: null,
        snapshots: [],
      },
    });
    const out = buildDescription(crunched, null);
    expect(out).toContain("WEATHER & WIND");
    expect(out).toContain("14°C");
  });
});

// ─── buildPrivateNotes ───

describe("buildPrivateNotes", () => {
  it("contains KEY STATS section", () => {
    const out = buildPrivateNotes(makeRideCrunched(), null);
    expect(out).toContain("📋 KEY STATS");
  });

  it("shows IF and TSS when training_metrics present", () => {
    const out = buildPrivateNotes(makeRideCrunched(), null);
    expect(out).toContain("IF:");
    expect(out).toContain("TSS:");
  });

  it("shows NP and VI when power meter present", () => {
    const out = buildPrivateNotes(makeRideCrunched(), null);
    expect(out).toContain("NP:");
    expect(out).toContain("VI:");
  });

  it("shows W/kg level when power_to_weight present", () => {
    const out = buildPrivateNotes(makeRideCrunched(), null);
    expect(out).toContain("W/kg:");
  });

  it("shows VO2max when present", () => {
    const out = buildPrivateNotes(makeRideCrunched(), null);
    expect(out).toContain("VO2max:");
  });

  it("shows aerobic decoupling", () => {
    const out = buildPrivateNotes(makeRideCrunched(), null);
    expect(out).toContain("Aero decoupling:");
  });

  it("shows pacing type", () => {
    const out = buildPrivateNotes(makeRideCrunched(), null);
    expect(out).toContain("Pacing:");
  });

  it("extracts Tips from AI text", () => {
    const aiText = `## Actionable Tips\n- 🔄 Work on cadence — your 67 rpm is low\n- 📊 Monitor drift`;
    const out = buildPrivateNotes(makeRideCrunched(), aiText);
    expect(out).toContain("💡 TIPS");
    expect(out).toContain("cadence");
  });

  it("filters segment/PR tips from AI text", () => {
    const aiText = `## Actionable Tips\n- 🏅 Great PR day — 14 personal records!\n- 🔄 Work on cadence`;
    const out = buildPrivateNotes(makeRideCrunched(), aiText);
    // PR tip should be filtered out
    expect(out).not.toContain("personal records");
    expect(out).toContain("cadence");
  });

  it("shows cadence low tip when cadence.is_low = true and no AI", () => {
    const crunched = makeRideCrunched({ cadence: { is_low: true, stats: { avg: 65 }, unit: "rpm" } });
    const out = buildPrivateNotes(crunched, null);
    expect(out).toContain("Cadence low");
  });

  it("shows HR drift tip when drift > 5 bpm and no AI", () => {
    const crunched = makeRideCrunched({ heart_rate: { stats: { avg: 155, max: 175 }, cardiac_drift: { drift_bpm: 8, drift_pct: 5.1 } } });
    const out = buildPrivateNotes(crunched, null);
    expect(out).toContain("drift");
  });

  it("shows READINESS from wellness context when no AI", () => {
    const wellnessCtx = { activity_date: "2024-06-15", night_before: null, day_of: null, readiness_note: "HRV 55 ms | Sleep 80/100" };
    const out = buildPrivateNotes(makeRideCrunched(), null, wellnessCtx as any);
    expect(out).toContain("🛌 READINESS");
    expect(out).toContain("HRV 55 ms");
  });

  it("shows surf stats when surf_analysis present", () => {
    const crunched = { ...makeRideCrunched(), surf_analysis: { wave_count: 12, max_wave_speed_kmh: 22.3, ride_pct: 3, paddle_pct: 97 } };
    const out = buildPrivateNotes(crunched, null);
    expect(out).toContain("Waves:");
    expect(out).toContain("12");
  });

  it("shows heart points when present", () => {
    const crunched = makeRideCrunched({ heart_points: { points: 45, pct_of_weekly_target: "30%", moderate_minutes: 18, vigorous_minutes: 14 } });
    const out = buildPrivateNotes(crunched, null);
    expect(out).toContain("Heart Points:");
  });

  it("shows wind summary when meteorology.wind_analysis present", () => {
    const crunched = makeRideCrunched({
      meteorology: { wind_analysis: { headwind_pct: 40, tailwind_pct: 35, crosswind_pct: 25, headwind_exposure_kmh: 5, headwind_label: "Moderate headwind" } },
    });
    const out = buildPrivateNotes(crunched, null);
    expect(out).toContain("Wind:");
    expect(out).toContain("40% head");
  });
});

// ─── formatTablesForPlainText tested via buildDescription ───

describe("formatTablesForPlainText (via buildDescription with AI text)", () => {
  it("converts 2-column markdown table to key: value format", () => {
    const aiText = `## Performance Verdict\n| Metric | Value |\n|--------|-------|\n| Avg HR | 155 bpm |\n| TSS | 80 |\n`;
    const out = buildDescription(makeRideCrunched(), aiText);
    expect(out).toContain("Avg HR: 155 bpm");
    expect(out).toContain("TSS: 80");
  });

  it("converts 3-column table to pipe-separated rows", () => {
    const aiText = `## Performance Verdict\n| Zone | Time | % |\n|------|------|---|\n| Z2 | 30m | 40% |\n`;
    const out = buildDescription(makeRideCrunched(), aiText);
    expect(out).toContain("│");
  });

  it("strips **bold** markdown", () => {
    const aiText = `## Performance Verdict\n**Bold result**: Great ride\n`;
    const out = buildDescription(makeRideCrunched(), aiText);
    expect(out).not.toContain("**");
    expect(out).toContain("Bold result");
  });
});

