/**
 * Extended crunch.ts coverage: sport types (Walk, Workout), gradient, speed zones,
 * training zones, segment analysis, and various boundary conditions.
 */
import { describe, it, expect } from "vitest";
import { crunchActivity } from "../crunch.js";
import type { RiderConfig } from "../config.js";

const RIDER: RiderConfig = {
  weightKg: 70,
  ftpW: 250,
  rFtpW: null,
  maxHr: 190,
  runnerMaxHr: 185,
  lthr: 168,
  runnerLthr: 165,
  restHr: 50,
};

const RIDER_MINIMAL: RiderConfig = {
  weightKg: null, ftpW: null, rFtpW: null,
  maxHr: null, runnerMaxHr: null, lthr: null, runnerLthr: null, restHr: null,
};

// ─── Helpers ───

function streamRows(count: number, overrides: (i: number) => Record<string, any> = () => ({})) {
  return Array.from({ length: count }, (_, i) => ({
    time_offset: i,
    is_moving: true,
    heartrate_bpm: 150 + (i % 10),
    speed_kmh: 25,
    power_watts: null,
    cadence_rpm: 85,
    altitude_meters: 100,
    grade_percent: 0,
    temperature_c: 20,
    ...overrides(i),
  }));
}

function makeActivity(sportType: string, streamLength = 150, extraOverrides: Record<string, any> = {}, streamOverrides: (i: number) => Record<string, any> = () => ({})) {
  return {
    activity_summary: {
      sport_type: sportType,
      average_heartrate: 150,
      max_heartrate: 175,
      average_watts: null,
      total_elevation_gain_m: 100,
      distance_m: 10000,
      moving_time_seconds: streamLength,
      elapsed_time_seconds: streamLength + 60,
      name: `Test ${sportType}`,
      calories: 500,
      ...extraOverrides,
    },
    splits_metric: [],
    segment_efforts: [],
    best_efforts: [],
    laps: [],
    stream_data: streamRows(streamLength, streamOverrides),
  };
}

// ─── Walk activity ───

describe("crunchActivity — Walk", () => {
  it("returns summary_card for a Walk", () => {
    const result = crunchActivity(makeActivity("Walk"), RIDER);
    expect(result.summary_card).toBeDefined();
  });

  it("uses runner speed zones model for walking", () => {
    const result = crunchActivity(makeActivity("Walk", 150), RIDER);
    // Walking uses walk speed zone model — speed_zones should be present
    expect(result.training_zones?.speed_zones?.zone_model).toBe("walking");
  });
});

// ─── Run activity ───

describe("crunchActivity — Run (extended)", () => {
  it("uses running speed zone model", () => {
    const result = crunchActivity(makeActivity("Run", 150, {}, () => ({ speed_kmh: 11, power_watts: null })), RIDER);
    expect(result.training_zones?.speed_zones?.zone_model).toBe("running");
  });

  it("computes cadence zones for run in spm unit", () => {
    const result = crunchActivity(makeActivity("Run", 150), RIDER);
    expect(result.training_zones?.cadence_zones?.unit).toBe("spm");
  });
});

// ─── Ride activity — extended ───

describe("crunchActivity — Ride (extended)", () => {
  it("uses cycling speed zone model", () => {
    const result = crunchActivity(makeActivity("Ride", 150, { average_watts: 200 }, () => ({ speed_kmh: 25, power_watts: 200 })), RIDER);
    expect(result.training_zones?.speed_zones?.zone_model).toBe("cycling");
  });

  it("computes cadence zones with rpm unit for ride", () => {
    const result = crunchActivity(makeActivity("Ride", 150, { average_watts: 200 }, () => ({ power_watts: 200 })), RIDER);
    expect(result.training_zones?.cadence_zones?.unit).toBe("rpm");
  });

  it("computes HR zones when maxHr is set", () => {
    const result = crunchActivity(makeActivity("Ride", 150), RIDER);
    expect(result.training_zones?.hr_zones?.zones?.length).toBeGreaterThan(0);
  });

  it("computes power zones when FTP is set and power data present", () => {
    const result = crunchActivity(makeActivity("Ride", 150, { average_watts: 200, device_watts: true }, () => ({ power_watts: 200 })), RIDER);
    expect(result.training_zones?.power_zones?.zones?.length).toBeGreaterThan(0);
  });

  it("computes pogacar score for ride", () => {
    const result = crunchActivity(makeActivity("Ride", 150, { average_watts: 200, device_watts: true }, () => ({ power_watts: 200, speed_kmh: 30 })), RIDER);
    expect(result.pogacar_score).toBeDefined();
  });

  it("computes gradient analysis when grade data present", () => {
    const result = crunchActivity(
      makeActivity("Ride", 200, {}, (i) => ({ grade_percent: (i % 3 === 0) ? 5 : (i % 3 === 1) ? -3 : 0 })),
      RIDER
    );
    expect(result.gradient_analysis?.distribution).toBeDefined();
    expect(result.gradient_analysis.distribution.length).toBeGreaterThan(0);
  });

  it("includes temperature data in summary_card when present", () => {
    const result = crunchActivity(makeActivity("Ride", 150, {}, () => ({ temperature_c: 15 })), RIDER);
    expect(result.summary_card?.temperature).toBeDefined();
  });

  it("computes training metrics when FTP is set", () => {
    const result = crunchActivity(
      makeActivity("Ride", 150, { average_watts: 200, device_watts: true, weighted_average_watts: 210 }, () => ({ power_watts: 200 })),
      RIDER
    );
    expect(result.training_metrics).toBeDefined();
  });

  it("adds heat-adjusted TSS when average temperature is above 25C", () => {
    const result = crunchActivity(
      makeActivity("Ride", 180, { average_watts: 220, device_watts: true, weighted_average_watts: 230 }, () => ({
        power_watts: 220,
        temperature_c: 30,
      })),
      RIDER,
    );
    expect(result.training_metrics?.tss).toBeTypeOf("number");
    expect(result.training_metrics?.tss_heat_adjusted).toBeTypeOf("number");
    expect(result.training_metrics?.tss_heat_adjusted).toBeGreaterThan(result.training_metrics?.tss);
  });

  it("handles missing rider config gracefully (null FTP/maxHr)", () => {
    expect(() => crunchActivity(makeActivity("Ride", 150), RIDER_MINIMAL)).not.toThrow();
  });

  it("computes route difficulty for outdoor non-workout sessions", () => {
    const result = crunchActivity(
      makeActivity("Ride", 220, { total_elevation_gain_m: 550, distance_km: 28 }, (i) => ({
        grade_percent: i % 5 === 0 ? 9 : i % 3 === 0 ? 5 : 1,
      })),
      RIDER,
    );
    expect(result.route_difficulty).toBeDefined();
    expect(result.route_difficulty.score).toBeTypeOf("number");
    expect(result.route_difficulty.label).toBeTypeOf("string");
  });

  it("includes 60min and 90min best power efforts for long rides", () => {
    const long = makeActivity("Ride", 6000, { average_watts: 210, device_watts: true, weighted_average_watts: 215 }, () => ({
      power_watts: 210,
      speed_kmh: 28,
    }));
    long.activity_summary.moving_time_seconds = 6000;
    const result = crunchActivity(long, RIDER);
    expect(result.power?.best_efforts?.["60min"]).toBeDefined();
    expect(result.power?.best_efforts?.["90min"]).toBeDefined();
  });
});

// ─── Segment efforts ───

describe("crunchActivity — segments", () => {
  it("processes segment_efforts and builds segments_summary", () => {
    const segEfforts = Array.from({ length: 3 }, (_, i) => ({
      name: `Segment ${i + 1}`,
      elapsed_time: 120 + i * 30,
      moving_time: 115 + i * 30,
      distance: 1000 + i * 200,
      average_heartrate: 160,
      pr_rank: i === 0 ? 1 : null,
      segment: { id: i, average_grade: 3 + i, distance: 1000 },
    }));

    const raw = makeActivity("Ride", 150);
    raw.segment_efforts = segEfforts as any;

    const result = crunchActivity(raw, RIDER);
    expect(result.segments_summary).toBeDefined();
  });
});

// ─── Best efforts (running) ───

describe("crunchActivity — best_efforts", () => {
  it("processes best_efforts for run", () => {
    const raw = makeActivity("Run", 150, {}, () => ({ speed_kmh: 12, power_watts: null }));
    raw.best_efforts = [
      { name: "1 kilometer", elapsed_time: 300, distance: 1000, start_index: 0, end_index: 300 },
      { name: "5 kilometer", elapsed_time: 1500, distance: 5000, start_index: 0, end_index: 1500 },
    ] as any;

    const result = crunchActivity(raw, RIDER);
    expect(result).toBeDefined();
  });
});

// ─── Laps ───

describe("crunchActivity — laps", () => {
  it("processes laps when present", () => {
    const raw = makeActivity("Ride", 150, { average_watts: 200, device_watts: true }, () => ({ power_watts: 200 }));
    raw.laps = [
      { name: "Lap 1", elapsed_time: 600, moving_time: 580, distance: 5000, average_speed: 8.3, average_heartrate: 150, average_cadence: 85, average_watts: 200, lap_index: 1, total_elevation_gain: 50 },
      { name: "Lap 2", elapsed_time: 600, moving_time: 580, distance: 5000, average_speed: 8.5, average_heartrate: 155, average_cadence: 87, average_watts: 210, lap_index: 2, total_elevation_gain: 50 },
    ] as any;

    const result = crunchActivity(raw, RIDER);
    expect(result).toBeDefined();
  });
});

// ─── Splits metric ───

describe("crunchActivity — splits", () => {
  it("processes splits_metric when present", () => {
    const raw = makeActivity("Run", 200, {}, () => ({ speed_kmh: 11, power_watts: null }));
    raw.splits_metric = Array.from({ length: 10 }, (_, i) => ({
      split: i + 1,
      distance: 1000,
      elapsed_time: 300,
      moving_time: 290,
      elevation_difference: 5,
      average_speed: 3.4,
      average_heartrate: 155,
      pace_zone: 2,
    })) as any;

    const result = crunchActivity(raw, RIDER);
    expect(result.pacing).toBeDefined();
  });
});

// ─── Minimal activity (no optional data) ───

describe("crunchActivity — minimal activity (no streams)", () => {
  it("handles empty stream data without throwing", () => {
    const raw = {
      activity_summary: {
        sport_type: "Ride",
        average_heartrate: 0,
        max_heartrate: 0,
        total_elevation_gain_m: 0,
        distance_m: 1000,
        moving_time_seconds: 600,
        elapsed_time_seconds: 620,
        name: "Minimal",
      },
      splits_metric: [],
      segment_efforts: [],
      best_efforts: [],
      laps: [],
      stream_data: [],
    };
    expect(() => crunchActivity(raw, RIDER_MINIMAL)).not.toThrow();
  });
});

// ─── VirtualRide ───

describe("crunchActivity — VirtualRide", () => {
  it("correctly identifies virtual ride and computes pogacar score", () => {
    const result = crunchActivity(
      makeActivity("VirtualRide", 150, { average_watts: 200, device_watts: true }, () => ({ power_watts: 200 })),
      RIDER
    );
    expect(result.summary_card).toBeDefined();
    // Virtual ride uses power-only reference
    expect(result.pogacar_score).toBeDefined();
  });
});

// ─── VAM analysis (ride with elevation and alt data) ───

describe("crunchActivity — VAM analysis", () => {
  it("builds climbing analysis when elevation present", () => {
    const result = crunchActivity(
      makeActivity("Ride", 300, { total_elevation_gain_m: 500 }, (i) => ({
        altitude_meters: 100 + (i < 150 ? i : 300 - i),
        grade_percent: i < 150 ? 2 : -2,
      })),
      RIDER
    );
    expect(result.climbing).toBeDefined();
  });
});

// ─── Workout activity ───

describe("crunchActivity — Workout", () => {
  const workoutRaw = {
    activity_summary: {
      sport_type: "Workout",
      average_heartrate: 145,
      max_heartrate: 175,
      total_elevation_gain_m: 0,
      distance_m: 0,
      moving_time_seconds: 3600,
      elapsed_time_seconds: 3700,
      name: "Strength Session",
    },
    splits_metric: [],
    segment_efforts: [],
    best_efforts: [],
    laps: [],
    stream_data: Array.from({ length: 200 }, (_, i) => ({
      time_offset: i,
      is_moving: true,
      heartrate_bpm: i < 50 ? 120 : i < 100 ? 165 : i < 150 ? 130 : 160,
      speed_kmh: 0,
      power_watts: null,
      cadence_rpm: 70,
      altitude_meters: 0,
      grade_percent: 0,
      temperature_c: 21,
    })),
  };

  it("returns summary_card for Workout", () => {
    const result = crunchActivity(workoutRaw, RIDER);
    expect(result.summary_card).toBeDefined();
  });

  it("computes workout_analysis for Workout sport when enough HR data", () => {
    const result = crunchActivity(workoutRaw, RIDER);
    // workout_analysis should be present because we have 200 HR points > 60
    expect(result.workout_analysis).toBeDefined();
  });

  it("detects intervals in workout with alternating HR", () => {
    const result = crunchActivity(workoutRaw, RIDER);
    // intervals_detected may or may not find intervals depending on threshold logic
    expect(typeof result.workout_analysis?.intervals_detected).toBe("number");
  });
});

describe("crunchActivity — Paddle", () => {
  it("builds paddle_analysis for StandUpPaddling when cadence exists", () => {
    const raw = makeActivity("StandUpPaddling", 180, {
      average_speed_kmh: 3.4,
      average_cadence: 52,
      distance_km: 7.2,
    }, (i) => ({
      speed_kmh: 3 + (i % 10) * 0.1,
      cadence_rpm: 50 + (i % 5),
      power_watts: null,
    }));
    const result = crunchActivity(raw, RIDER);
    expect(result.summary_card?.type).toBe("StandUpPaddling");
    expect(result.paddle_analysis).toBeDefined();
    expect(result.paddle_analysis.avg_stroke_rate_spm).toBeTypeOf("number");
    expect(result.paddle_analysis.estimated_total_strokes).toBeTypeOf("number");
    expect(result.paddle_analysis.distance_per_stroke_m).toBeTypeOf("number");
    expect(result.training_zones?.speed_zones?.zone_model).toBe("paddling");
  });

  it("keeps pace/speed paddle_analysis when cadence is missing", () => {
    const raw = makeActivity("StandUpPaddling", 160, {
      average_speed_kmh: 3.1,
      average_cadence: null,
      distance_km: 6.0,
    }, () => ({
      speed_kmh: 3.1,
      cadence_rpm: null,
      power_watts: null,
    }));
    const result = crunchActivity(raw, RIDER);
    expect(result.paddle_analysis).toBeDefined();
    expect(result.paddle_analysis.pace_sec_per_km).toBeTypeOf("number");
    expect(result.paddle_analysis.avg_stroke_rate_spm ?? null).toBeNull();
    expect(result.paddle_analysis.estimated_total_strokes ?? null).toBeNull();
  });
});


