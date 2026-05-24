/**
 * Additional format.ts coverage:
 * - Workout description (cat=workout)
 * - Surf description
 * - Raw training zones fallback (no AI text)
 * - No-AI HR peaks, power skills, VAM, gradient, segment highlights
 * - Pogačar score fallback (no amateur_score)
 * - Kipchoge fallback (no runner_score)
 * - Historical context raw fallback
 */
import { describe, it, expect } from "vitest";
import { buildDescription, buildPrivateNotes } from "../format.js";

// ─── Workout description ───

describe("buildDescription — Workout", () => {
  const workoutCrunched = {
    summary_card: { type: "Workout", name: "Strength", date: "Mon", distance: "0 km", moving_time: "1h 00m", elapsed_time: "1h 05m", moving_time_seconds: 3600 },
    workout_analysis: {
      wis: { score: 65, label: "Hard" },
      intervals_detected: 4,
      avg_work_duration: "45s",
      avg_rest_duration: "30s",
      work_rest_ratio: 1.5,
      consistency_score: { cv_pct: 8, label: "Moderate variation" },
      hr_progression: { pattern: "rising", early_avg: 130, mid_avg: 150, late_avg: 165 },
      time_to_peak_hr: { at_formatted: "45:00", at_pct: 75, label: "Late" },
      recovery_ratio: { recovery_pct: 30, threshold_bpm: 140 },
      hr_recovery_rate: { drop_60s_bpm: 22, label: "Good" },
      epoc_estimate: { kcal: 85, label: "Moderate" },
    },
    relative_effort: { score: 110, interpretation: "Hard" },
    heart_points: { total_points: 40, points: 40, pct_of_weekly_target: "27%", moderate_minutes: 15, vigorous_minutes: 12 },
    vo2max: { value: 50, level: "Good", method: "HR" },
  };

  it("shows WORKOUT SCORE header", () => {
    const out = buildDescription(workoutCrunched, null);
    expect(out).toContain("🏋️ WORKOUT SCORE");
    expect(out).toContain("65/100");
  });

  it("shows WORKOUT METRICS section with intervals", () => {
    const out = buildDescription(workoutCrunched, null);
    expect(out).toContain("⚙️ WORKOUT METRICS");
    expect(out).toContain("Intervals: 4");
    expect(out).toContain("Work:Rest ratio");
  });

  it("shows consistency, HR progression, recovery metrics", () => {
    const out = buildDescription(workoutCrunched, null);
    expect(out).toContain("Consistency:");
    expect(out).toContain("HR Pattern:");
    expect(out).toContain("Peak HR:");
    expect(out).toContain("Recovery ratio:");
    expect(out).toContain("HR Recovery:");
    expect(out).toContain("EPOC");
  });

  it("shows VO2max in workout section", () => {
    const out = buildDescription(workoutCrunched, null);
    expect(out).toContain("VO2max:");
  });

  it("shows TRIMP in workout score header", () => {
    const out = buildDescription(workoutCrunched, null);
    expect(out).toContain("TRIMP:");
  });
});

// ─── Surf description ───

describe("buildDescription — Surf", () => {
  const surfCrunched = {
    summary_card: { type: "Surfing", name: "Morning Surf", date: "Sat", distance: "5.0 km", moving_time: "1h 30m", elapsed_time: "1h 35m", moving_time_seconds: 5400, avg_hr: "130 bpm" },
    surf_analysis: {
      wave_count: 14,
      max_wave_speed_kmh: 22.3,
      avg_wave_speed_kmh: 15.1,
      longest_wave_seconds: 8,
      longest_wave_speed_kmh: 20.1,
      riding_time_formatted: "1m 45s",
      ride_pct: 3,
      paddling_time_formatted: "52m 30s",
      paddle_pct: 97,
      wait_time: "18m 20s",
    },
    relative_effort: { score: 90, interpretation: "Moderate" },
  };

  it("shows SURF SESSION label", () => {
    const out = buildDescription(surfCrunched, null);
    expect(out).toContain("📊 SURF SESSION");
  });

  it("shows WAVE REPORT", () => {
    const out = buildDescription(surfCrunched, null);
    expect(out).toContain("🏄 WAVE REPORT");
    expect(out).toContain("~14");
    expect(out).toContain("22.3 km/h");
  });
});

// ─── Raw training zones fallback (no AI text) ───

describe("buildDescription — raw training zones fallback", () => {
  const crunchedWithZones = {
    summary_card: { type: "Ride", name: "Ride", moving_time_seconds: 3600 },
    training_zones: {
      hr_zones: {
        section_header: "Heart Rate Zones",
        zones: [
          { zone: "Z1", range_bpm: "<108", time_formatted: "5m", pct: 8 },
          { zone: "Z2", range_bpm: "108-126", time_formatted: "20m", pct: 35 },
        ],
      },
      power_zones: {
        ftp_used: 250,
        zones: [
          { zone: "Z1", range_watts: "<138W", time_formatted: "5m", pct: 8 },
          { zone: "Z2", range_watts: "138-187W", time_formatted: "15m", pct: 25 },
        ],
      },
      cadence_zones: {
        zones: [
          { zone: "Z1 Grind", time_formatted: "2m", pct: 5 },
          { zone: "Z2 Steady", time_formatted: "30m", pct: 55 },
          { zone: "Z3 Hidden", time_formatted: "0m", pct: 0 }, // pct=0, should be skipped
        ],
      },
    },
  };

  it("shows raw HR ZONES when no AI text", () => {
    const out = buildDescription(crunchedWithZones, null);
    expect(out).toContain("HEART RATE ZONES");
    expect(out).toContain("Z1");
    expect(out).toContain("Z2");
  });

  it("shows POWER ZONES when no AI text", () => {
    const out = buildDescription(crunchedWithZones, null);
    expect(out).toContain("POWER ZONES (FTP: 250W)");
  });

  it("shows CADENCE ZONES and skips pct=0 zones", () => {
    const out = buildDescription(crunchedWithZones, null);
    expect(out).toContain("🔄 CADENCE ZONES");
    expect(out).not.toContain("Z3 Hidden");
  });

  it("uses section_header for HR zone header when present", () => {
    const out = buildDescription(crunchedWithZones, null);
    expect(out).toContain("HEART RATE ZONES");
  });
});

// ─── No-AI HR peaks ───

describe("buildDescription — no-AI HR peaks", () => {
  it("shows HR PEAKS when heart_rate.peak_efforts present", () => {
    const crunched = {
      summary_card: { type: "Ride", name: "Ride", moving_time_seconds: 3600 },
      heart_rate: {
        stats: { avg: 150, max: 175 },
        peak_efforts: { "1min": "171 bpm", "5min": "165 bpm", "20min": "160 bpm" },
        cardiac_drift: { drift_bpm: 4, drift_pct: 2.6 },
      },
    };
    const out = buildDescription(crunched, null);
    expect(out).toContain("❤️ HEART RATE PEAKS");
    expect(out).toContain("1min: 171 bpm");
    expect(out).toContain("Cardiac drift: +4 bpm");
  });
});

// ─── No-AI power skills ───

describe("buildDescription — no-AI power skills", () => {
  it("shows POWER SKILLS when power_skills present", () => {
    const crunched = {
      summary_card: { type: "Ride", name: "Ride", moving_time_seconds: 3600 },
      power: { best_efforts: { "5s": "450 W", "1min": "320 W", "20min": "255 W" } },
      power_skills: {
        sprint_5s_pct_ftp: "180% FTP",
        attack_1min_pct_ftp: "128% FTP",
        sustained_5min_pct_ftp: "105% FTP",
        sustained_20min_pct_ftp: "98% FTP",
        primary_strength: "Sprinting",
      },
    };
    const out = buildDescription(crunched, null);
    expect(out).toContain("💪 POWER SKILLS");
    expect(out).toContain("Sprint (5s):");
    expect(out).toContain("Primary strength: Sprinting");
  });

  it("shows POWER BEST EFFORTS", () => {
    const crunched = {
      summary_card: { type: "Ride", name: "Ride", moving_time_seconds: 3600 },
      power: { best_efforts: { "5s": "450 W", "20min": "255 W" } },
    };
    const out = buildDescription(crunched, null);
    expect(out).toContain("⚡ POWER BEST EFFORTS");
    expect(out).toContain("5s: 450 W");
  });
});

// ─── No-AI VAM and gradient ───

describe("buildDescription — no-AI VAM and gradient", () => {
  it("shows VAM CLIMBS when vam_analysis.climbs present", () => {
    const crunched = {
      summary_card: { type: "Ride", name: "Ride", moving_time_seconds: 3600 },
      vam_analysis: {
        climbs: [
          { start_km: 12.3, elevation_gain_m: 85, duration_formatted: "5m 20s", vam: 956 },
        ],
      },
    };
    const out = buildDescription(crunched, null);
    expect(out).toContain("🧗 VAM CLIMBS");
    expect(out).toContain("+85m");
    expect(out).toContain("956 VAM");
  });

  it("shows GRADIENT section when gradient_analysis.distribution present", () => {
    const crunched = {
      summary_card: { type: "Ride", name: "Ride", moving_time_seconds: 3600 },
      gradient_analysis: {
        distribution: [
          { label: "Flat (-2 to 2%)", pct: 55 },
          { label: "Gentle uphill", pct: 0 }, // pct=0 skipped
          { label: "Steep uphill (>8%)", pct: 5 },
        ],
      },
    };
    const out = buildDescription(crunched, null);
    expect(out).toContain("📐 GRADIENT");
    expect(out).toContain("Flat (-2 to 2%): 55%");
    expect(out).not.toContain("Gentle uphill: 0%");
  });
});

// ─── No-AI segment highlights ───

describe("buildDescription — no-AI segment highlights", () => {
  it("shows TOP SEGMENTS when segments_summary.highlight_table present", () => {
    const crunched = {
      summary_card: { type: "Ride", name: "Ride", moving_time_seconds: 3600 },
      segments_summary: {
        highlight_table: [
          { name: "Big Hill Climb", distance: "2.1 km", time: "5:30", avg_hr: "172 bpm", pr: "🥇 PR #1" },
          { name: "Flat Sprint", distance: "0.5 km", time: "0:45", avg_hr: "180 bpm", pr: null },
        ],
      },
    };
    const out = buildDescription(crunched, null);
    expect(out).toContain("🏅 TOP SEGMENTS");
    expect(out).toContain("Big Hill Climb");
    expect(out).toContain("🥇 PR #1");
  });
});

// ─── Pogačar score fallback ───

describe("buildDescription — Pogačar score fallback", () => {
  it("shows POGAČAR SCORE when no amateur_score but pogacar_score present", () => {
    const crunched = {
      summary_card: { type: "Ride", name: "Ride", moving_time_seconds: 3600 },
      pogacar_score: {
        composite_pct: 28,
        reference: "Flat Road",
        metrics: { speed: "28% of reference", power: "32% of reference" },
      },
    };
    const out = buildDescription(crunched, null);
    expect(out).toContain("🏆 POGAČAR SCORE: 28%");
    expect(out).toContain("speed: 28% of reference");
  });
});

// ─── Kipchoge fallback ───

describe("buildDescription — Kipchoge fallback (no runner_score)", () => {
  it("shows KIPCHOGE SCORE when no runner_score but kipchoge_score present", () => {
    const crunched = {
      summary_card: { type: "Run", name: "Run", moving_time_seconds: 2700 },
      kipchoge_score: {
        composite_pct: 38,
        metrics: { pace: "38% of Kipchoge" },
      },
    };
    const out = buildDescription(crunched, null);
    expect(out).toContain("🏆 KIPCHOGE SCORE: 38%");
  });
});

// ─── "other" activity type fallback ───

describe("buildDescription — other activity type", () => {
  it("shows ACTIVITY SUMMARY for unknown sport type", () => {
    const crunched = {
      summary_card: { type: "InlineSkate", name: "Skate", moving_time_seconds: 3600 },
    };
    const out = buildDescription(crunched, null);
    expect(out).toContain("📊 ACTIVITY SUMMARY");
  });
});

// ─── Training zones section_header via AI text ───

describe("buildDescription — training zones custom header via AI", () => {
  it("uses custom section_header for zone header label", () => {
    const crunched = {
      summary_card: { type: "Ride", name: "Ride", moving_time_seconds: 3600 },
      training_zones: { hr_zones: { section_header: "Custom Zone Header" } },
    };
    const aiText = "## Training Zones\nZ2: 40%\n";
    const out = buildDescription(crunched, aiText);
    expect(out).toContain("CUSTOM ZONE HEADER");
  });
});

// ─── buildPrivateNotes — no-AI cadence spm (run) ───

describe("buildPrivateNotes — cadence spm tip", () => {
  it("shows spm-specific tip for run with low cadence", () => {
    const crunched = {
      summary_card: { type: "Run", name: "Run", moving_time_seconds: 2700 },
      cadence: { is_low: true, stats: { avg: 155 }, unit: "spm" },
    };
    const out = buildPrivateNotes(crunched, null);
    expect(out).toContain("spm");
    expect(out).toContain("170-180 spm");
  });
});

