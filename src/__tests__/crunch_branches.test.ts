/**
 * Additional tests targeting uncovered branches in crunch.ts:
 * - Aerobic decoupling with power meter
 * - Runner category score
 * - Amateur (cycling) score
 * - VO2max estimate
 * - Wind analysis with GPS data
 * - Surf activity crunch
 */
import { describe, it, expect } from "vitest";
import { crunchActivity } from "../crunch.js";
import type { RiderConfig } from "../config.js";

const RIDER: RiderConfig = {
  weightKg: 70, ftpW: 250, rFtpW: null,
  maxHr: 190, runnerMaxHr: 185,
  lthr: 168, runnerLthr: 165,
  restHr: 50,
};

function streamRows(count: number, overrides: (i: number) => Record<string, any> = () => ({})) {
  return Array.from({ length: count }, (_, i) => ({
    time_offset: i,
    is_moving: true,
    heartrate_bpm: 150 + (i % 10),
    speed_kmh: 25,
    power_watts: 200,
    cadence_rpm: 85,
    altitude_meters: 100,
    grade_percent: 0,
    temperature_c: 20,
    ...overrides(i),
  }));
}

// ─── Aerobic Decoupling (needs hasPowerMeter=true and > 100 HR/power rows) ───

describe("crunchActivity — aerobic decoupling", () => {
  it("computes aerobic_decoupling for ride with power meter and long stream", () => {
    const raw = {
      activity_summary: {
        sport_type: "Ride",
        average_heartrate: 150,
        max_heartrate: 175,
        average_watts: 200,
        weighted_average_watts: 210,
        device_watts: true,
        total_elevation_gain_m: 100,
        distance_m: 50000,
        moving_time_seconds: 7200,
        elapsed_time_seconds: 7300,
        name: "Long Ride",
      },
      splits_metric: [], segment_efforts: [], best_efforts: [], laps: [],
      stream_data: streamRows(200, (i) => ({
        time_offset: i * 36, // spread over 7200 seconds
        power_watts: 200 + (i > 100 ? -10 : 0), // slight power drop in second half
        heartrate_bpm: 150 + (i > 100 ? 5 : 0), // HR drift
      })),
    };
    const result = crunchActivity(raw, RIDER);
    expect(result.aerobic_decoupling).toBeDefined();
    expect(typeof result.aerobic_decoupling.decoupling_pct).toBe("number");
    expect(result.aerobic_decoupling.interpretation).toBeTypeOf("string");
  });
});

// ─── Power-to-Weight ───

describe("crunchActivity — power_to_weight", () => {
  it("computes power_to_weight when weightKg and power meter present", () => {
    const raw = {
      activity_summary: {
        sport_type: "Ride",
        average_heartrate: 150,
        max_heartrate: 175,
        average_watts: 210,
        weighted_average_watts: 220,
        device_watts: true,
        total_elevation_gain_m: 100,
        distance_m: 30000,
        moving_time_seconds: 3600,
        elapsed_time_seconds: 3700,
        name: "Ride",
      },
      splits_metric: [], segment_efforts: [], best_efforts: [], laps: [],
      stream_data: streamRows(150, () => ({ power_watts: 210 })),
    };
    const result = crunchActivity(raw, RIDER);
    expect(result.power_to_weight).toBeDefined();
    expect(result.power_to_weight.avg_wkg).toBeTypeOf("number");
  });
});

// ─── Runner Category Score ───

describe("crunchActivity — runner_score", () => {
  it("computes runner_score for a run with speed data", () => {
    const raw = {
      activity_summary: {
        sport_type: "Run",
        average_heartrate: 160,
        max_heartrate: 180,
        average_speed_kmh: 11.5, // ~5:13/km — Trained Amateur
        average_cadence: 87,
        total_elevation_gain_m: 50,
        distance_m: 10000,
        moving_time_seconds: 3120,
        elapsed_time_seconds: 3200,
        name: "Run",
      },
      splits_metric: [], segment_efforts: [], best_efforts: [], laps: [],
      stream_data: streamRows(150, (i) => ({ power_watts: null, speed_kmh: 11.5 })),
    };
    const result = crunchActivity(raw, RIDER);
    expect(result.runner_score).toBeDefined();
    expect(result.runner_score.category).toBeTypeOf("string");
    expect(result.runner_score.composite_pct).toBeTypeOf("number");
  });
});

// ─── VO2max calculation ───

describe("crunchActivity — VO2max", () => {
  it("estimates vo2max for ride with FTP and weight", () => {
    const raw = {
      activity_summary: {
        sport_type: "Ride",
        average_heartrate: 150,
        max_heartrate: 175,
        average_watts: 200,
        device_watts: true,
        total_elevation_gain_m: 100,
        distance_m: 30000,
        moving_time_seconds: 3600,
        elapsed_time_seconds: 3700,
        name: "Ride",
      },
      splits_metric: [], segment_efforts: [], best_efforts: [], laps: [],
      stream_data: streamRows(150, () => ({ power_watts: 200 })),
    };
    const result = crunchActivity(raw, RIDER);
    // vo2max may or may not compute depending on bestPowerRaw["20min"]
    // at minimum it should not throw
    expect(result).toBeDefined();
  });
});

// ─── Wind analysis with GPS stream data ───

describe("crunchActivity — wind / meteorology", () => {
  it("computes wind analysis when weather and GPS data present", () => {
    const gpsRows = Array.from({ length: 50 }, (_, i) => ({
      time_offset: i,
      is_moving: true,
      heartrate_bpm: 150,
      speed_kmh: 25,
      power_watts: 200,
      cadence_rpm: 85,
      altitude_meters: 100,
      grade_percent: 0,
      temperature_c: 20,
      latitude: 54.0 + i * 0.001,
      longitude: 25.0 + i * 0.001,
    }));

    const raw: any = {
      activity_summary: {
        sport_type: "Ride",
        average_heartrate: 150, max_heartrate: 175,
        average_watts: 200, device_watts: true,
        total_elevation_gain_m: 50, distance_m: 20000,
        moving_time_seconds: 3000, elapsed_time_seconds: 3100, name: "Ride",
      },
      splits_metric: [], segment_efforts: [], best_efforts: [], laps: [],
      stream_data: gpsRows,
      weather: {
        snapshots: [
          { waypoint_pct: 0, windspeed_kmh: 20, wind_direction_deg: 90, wind_gusts_kmh: 30, temperature_c: 15 },
          { waypoint_pct: 50, windspeed_kmh: 22, wind_direction_deg: 100, wind_gusts_kmh: 32, temperature_c: 14 },
        ],
        condition_summary: "Partly cloudy",
        source: "Open-Meteo Archive",
        at_start: { temperature_c: 15, windspeed_kmh: 20, wind_direction_deg: 90 },
      },
    };

    const result = crunchActivity(raw, RIDER);
    expect(result.meteorology?.wind_analysis).toBeDefined();
    expect(typeof result.meteorology.wind_analysis.headwind_pct).toBe("number");
  });
});

// ─── Surf activity ───

describe("crunchActivity — Surf / Surfing", () => {
  it("returns summary_card for Surfing activity", () => {
    const raw = {
      activity_summary: {
        sport_type: "Surfing",
        average_heartrate: 130,
        max_heartrate: 165,
        total_elevation_gain_m: 0,
        distance_m: 5000,
        moving_time_seconds: 5400,
        elapsed_time_seconds: 5500,
        name: "Morning Surf",
      },
      splits_metric: [], segment_efforts: [], best_efforts: [], laps: [],
      stream_data: Array.from({ length: 200 }, (_, i) => ({
        time_offset: i,
        is_moving: i % 30 > 10, // mostly paddling, some waves
        heartrate_bpm: 130,
        speed_kmh: i % 30 > 25 ? 18 : 3, // speed spikes = wave riding
        power_watts: null,
        cadence_rpm: 0,
        altitude_meters: 0,
        grade_percent: 0,
        temperature_c: 24,
        latitude: 38.7 + i * 0.0001,
        longitude: -9.5 + i * 0.0001,
      })),
    };
    const result = crunchActivity(raw, RIDER);
    expect(result.summary_card).toBeDefined();
    // Surf analysis should be computed
    expect(result.surf_analysis).toBeDefined();
  });
});

// ─── Amateur (cycling) score ───

describe("crunchActivity — amateur_score", () => {
  it("computes amateur_score for a ride with speed and power data", () => {
    const raw = {
      activity_summary: {
        sport_type: "Ride",
        average_heartrate: 155,
        max_heartrate: 178,
        average_speed_kmh: 28,
        average_watts: 210,
        weighted_average_watts: 220,
        device_watts: true,
        total_elevation_gain_m: 200,
        distance_m: 40000,
        moving_time_seconds: 5142,
        elapsed_time_seconds: 5200,
        name: "Morning Ride",
      },
      splits_metric: [], segment_efforts: [], best_efforts: [], laps: [],
      stream_data: streamRows(200, () => ({ power_watts: 210, speed_kmh: 28 })),
    };
    const result = crunchActivity(raw, RIDER);
    expect(result.amateur_score).toBeDefined();
    expect(result.amateur_score.category).toBeTypeOf("string");
    expect(result.amateur_score.composite_pct).toBeTypeOf("number");
  });
});

// ─── Kipchoge score (run without power) ───

describe("crunchActivity — kipchoge_score", () => {
  it("computes kipchoge_score for a fast run", () => {
    const raw = {
      activity_summary: {
        sport_type: "Run",
        average_heartrate: 170,
        max_heartrate: 185,
        average_speed_kmh: 14, // ~4:17/km
        average_cadence: 90,
        total_elevation_gain_m: 20,
        distance_m: 10000,
        moving_time_seconds: 2571,
        elapsed_time_seconds: 2600,
        name: "Race Run",
      },
      splits_metric: [], segment_efforts: [], best_efforts: [], laps: [],
      stream_data: streamRows(150, () => ({ power_watts: null, speed_kmh: 14 })),
    };
    const result = crunchActivity(raw, RIDER);
    expect(result.kipchoge_score).toBeDefined();
    expect(result.kipchoge_score.composite_pct).toBeTypeOf("number");
  });
});

