/**
 * types.ts — interface/type-only file with no runtime code.
 * Coverage is 0% because there is nothing to execute.
 * This test confirms all exported interfaces are importable (type-level smoke test).
 */
import { describe, it, expect } from "vitest";
import type {
  TokenResponse,
  AthleteSummary,
  SummaryActivity,
  DetailedActivity,
  SegmentEffort,
  Split,
  BestEffort,
  Gear,
  PhotoPrimary,
  Lap,
  ActivityZone,
  StreamEntry,
  StreamSet,
  EnrichedActivity,
  AthleteStats,
  ActivityTotal,
  StravaExport,
} from "../types.js";

describe("types.ts — all interfaces importable", () => {
  it("TokenResponse shape is constructable", () => {
    const t: TokenResponse = {
      token_type: "Bearer",
      expires_at: 1700000000,
      expires_in: 3600,
      refresh_token: "rt",
      access_token: "at",
    };
    expect(t.token_type).toBe("Bearer");
  });

  it("AthleteSummary shape is constructable", () => {
    const a: AthleteSummary = {
      id: 1, username: "u", firstname: "F", lastname: "L",
      city: "C", state: "S", country: "LT", sex: "M",
      premium: false, created_at: "", updated_at: "",
      profile_medium: "", profile: "",
    };
    expect(a.id).toBe(1);
  });

  it("Lap shape is constructable", () => {
    const lap: Lap = {
      id: 1, resource_state: 2, name: "Lap 1",
      elapsed_time: 600, moving_time: 580, start_date: "", start_date_local: "",
      distance: 2000, start_index: 0, end_index: 580,
      total_elevation_gain: 10, average_speed: 3.3, max_speed: 5,
      lap_index: 1, split: 1, pace_zone: 2,
    };
    expect(lap.lap_index).toBe(1);
  });

  it("ActivityZone shape is constructable", () => {
    const z: ActivityZone = {
      score: 80, distribution_buckets: [], type: "heartrate",
      resource_state: 2, sensor_based: true, points: 100, custom_zones: false,
    };
    expect(z.type).toBe("heartrate");
  });

  it("StreamEntry shape is constructable", () => {
    const s: StreamEntry = {
      type: "heartrate", data: [150, 155], series_type: "time",
      original_size: 2, resolution: "high",
    };
    expect(s.type).toBe("heartrate");
  });

  it("ActivityTotal shape is constructable", () => {
    const t: ActivityTotal = {
      count: 5, distance: 10000, moving_time: 3600,
      elapsed_time: 3700, elevation_gain: 100,
    };
    expect(t.count).toBe(5);
  });
});

