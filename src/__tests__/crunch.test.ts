import { describe, it, expect } from "vitest";
import {
  formatDuration,
  formatPace,
  formatTime,
  round,
  degToCardinal,
  computeStats,
  bestRollingAvg,
  crunchActivity,
} from "../crunch.js";
import type { RiderConfig } from "../config.js";

// ─── Pure helpers ───

describe("formatDuration", () => {
  it("formats seconds only", () => expect(formatDuration(45)).toBe("0m 45s"));
  it("formats minutes+seconds", () => expect(formatDuration(125)).toBe("2m 5s"));
  it("formats hours+minutes+seconds", () => expect(formatDuration(3725)).toBe("1h 2m 5s"));
  it("handles zero", () => expect(formatDuration(0)).toBe("0m 0s"));
});

describe("formatPace", () => {
  it("returns dash for zero speed", () => expect(formatPace(0)).toBe("-"));
  it("returns dash for negative speed", () => expect(formatPace(-1)).toBe("-"));
  it("formats 10 km/h → 6:00/km", () => expect(formatPace(10)).toBe("6:00/km"));
  it("formats 12 km/h → 5:00/km", () => expect(formatPace(12)).toBe("5:00/km"));
  it("formats 8 km/h → 7:30/km", () => expect(formatPace(8)).toBe("7:30/km"));
});

describe("formatTime", () => {
  it("formats 90s → 1:30", () => expect(formatTime(90)).toBe("1:30"));
  it("formats 0s → 0:00", () => expect(formatTime(0)).toBe("0:00"));
  it("formats 3600s → 60:00", () => expect(formatTime(3600)).toBe("60:00"));
});

describe("round", () => {
  it("rounds to 1 decimal by default", () => expect(round(1.25)).toBe(1.3));
  it("rounds to 0 decimals", () => expect(round(1.5, 0)).toBe(2));
  it("rounds to 2 decimals", () => expect(round(1.555, 2)).toBe(1.56));
});

describe("degToCardinal", () => {
  it("N at 0°", () => expect(degToCardinal(0)).toBe("N"));
  it("E at 90°", () => expect(degToCardinal(90)).toBe("E"));
  it("S at 180°", () => expect(degToCardinal(180)).toBe("S"));
  it("W at 270°", () => expect(degToCardinal(270)).toBe("W"));
  it("NE at 45°", () => expect(degToCardinal(45)).toBe("NE"));
  it("NNE at 22°", () => expect(degToCardinal(22)).toBe("NNE"));
});

describe("computeStats", () => {
  it("returns null for empty array", () => expect(computeStats([])).toBeNull());
  it("computes correct stats", () => {
    const s = computeStats([1, 2, 3, 4, 5])!;
    expect(s.avg).toBe(3);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
    expect(s.median).toBe(3);
    expect(s.count).toBe(5);
  });
  it("single element", () => {
    const s = computeStats([42])!;
    expect(s.avg).toBe(42);
    expect(s.min).toBe(42);
    expect(s.max).toBe(42);
  });
});

describe("bestRollingAvg", () => {
  it("returns null if fewer values than window", () => expect(bestRollingAvg([100, 200], 5)).toBeNull());
  it("finds correct best window", () => {
    // values: [1,1,1,10,10,10,1,1,1] — best 3-sec window = 10
    const v = [1, 1, 1, 10, 10, 10, 1, 1, 1];
    expect(bestRollingAvg(v, 3)).toBe(10);
  });
  it("window = array length returns avg", () => {
    expect(bestRollingAvg([4, 6], 2)).toBe(5);
  });
});

// ─── crunchActivity integration (mocked stream data) ───

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

function makeStreamRow(overrides: Record<string, any> = {}) {
  return {
    time_offset: 0,
    is_moving: true,
    heartrate_bpm: 150,
    speed_kmh: 25,
    power_watts: 200,
    cadence_rpm: 85,
    altitude_meters: 100,
    grade_percent: 0,
    temperature_c: 20,
    ...overrides,
  };
}

function makeRideRaw(streamLength = 120, streamOverrides: Record<string, any> = {}) {
  return {
    activity_summary: {
      sport_type: "Ride",
      average_heartrate: 150,
      max_heartrate: 175,
      average_watts: 200,
      weighted_average_watts: 210,
      device_watts: true,
      total_elevation_gain_m: 300,
      distance_m: 30000,
      moving_time_seconds: 3600,
      elapsed_time_seconds: 3700,
      name: "Test Ride",
      calories: 800,
    },
    splits_metric: [],
    segment_efforts: [],
    best_efforts: [],
    laps: [],
    stream_data: Array.from({ length: streamLength }, (_, i) =>
      makeStreamRow({ time_offset: i, ...streamOverrides })
    ),
  };
}

describe("crunchActivity — Ride", () => {
  it("returns an object with summary_card", () => {
    const result = crunchActivity(makeRideRaw(), RIDER);
    expect(result).toBeDefined();
    expect(result.summary_card).toBeDefined();
  });

  it("computes normalized power when powerValues.length > 30", () => {
    const result = crunchActivity(makeRideRaw(120), RIDER);
    expect(result.power?.normalized_power).toBeTypeOf("number");
    expect(result.power.normalized_power).toBeGreaterThan(0);
  });

  it("does not compute NP with < 30 power data points", () => {
    const result = crunchActivity(makeRideRaw(20), RIDER);
    expect(result.power?.normalized_power ?? null).toBeNull();
  });

  it("heart_rate stats present when HR data exists", () => {
    const result = crunchActivity(makeRideRaw(60), RIDER);
    expect(result.heart_rate?.stats?.avg).toBeTypeOf("number");
  });

  it("cadence stats present when cadence data exists", () => {
    const result = crunchActivity(makeRideRaw(60), RIDER);
    expect(result.cadence?.stats?.avg).toBeTypeOf("number");
  });

  it("uses effectiveRestHr from garminRestHr when provided", () => {
    // Should not throw even with garmin rest HR provided
    const result = crunchActivity(makeRideRaw(60), RIDER, 48);
    expect(result).toBeDefined();
  });
});

describe("crunchActivity — Run", () => {
  function makeRunRaw(streamLength = 60) {
    return {
      activity_summary: {
        sport_type: "Run",
        average_heartrate: 160,
        max_heartrate: 180,
        total_elevation_gain_m: 50,
        distance_m: 10000,
        moving_time_seconds: 2700,
        elapsed_time_seconds: 2800,
        name: "Test Run",
        calories: 600,
      },
      splits_metric: [],
      segment_efforts: [],
      best_efforts: [],
      laps: [],
      stream_data: Array.from({ length: streamLength }, (_, i) =>
        makeStreamRow({ time_offset: i, power_watts: null, speed_kmh: 12 })
      ),
    };
  }

  it("returns summary_card for a run", () => {
    const result = crunchActivity(makeRunRaw(), RIDER);
    expect(result.summary_card).toBeDefined();
  });

  it("no normalized power when no power sensor", () => {
    const result = crunchActivity(makeRunRaw(), RIDER);
    expect(result.power?.normalized_power ?? null).toBeNull();
  });
});

