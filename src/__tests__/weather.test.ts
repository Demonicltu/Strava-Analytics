import { describe, it, expect } from "vitest";
import { wmoDescription, buildWeatherWaypoints } from "../weather.js";

// ─── wmoDescription ───

describe("wmoDescription", () => {
  it("returns null for null code", () => expect(wmoDescription(null)).toBeNull());
  it("returns 'Clear sky' for code 0", () => expect(wmoDescription(0)).toBe("Clear sky"));
  it("returns 'Partly cloudy' for code 2", () => expect(wmoDescription(2)).toBe("Partly cloudy"));
  it("returns 'Overcast' for code 3", () => expect(wmoDescription(3)).toBe("Overcast"));
  it("returns 'Fog' for code 45", () => expect(wmoDescription(45)).toBe("Fog"));
  it("returns 'Thunderstorm' for code 95", () => expect(wmoDescription(95)).toBe("Thunderstorm"));
  it("returns 'Heavy rain' for code 65", () => expect(wmoDescription(65)).toBe("Heavy rain"));
  it("returns 'Moderate snow' for code 73", () => expect(wmoDescription(73)).toBe("Moderate snow"));
  it("returns fallback string for unknown code", () => expect(wmoDescription(999)).toBe("WMO code 999"));
  it("returns 'Mainly clear' for code 1", () => expect(wmoDescription(1)).toBe("Mainly clear"));
});

// ─── buildWeatherWaypoints ───

describe("buildWeatherWaypoints", () => {
  it("returns empty array when no GPS data", () => {
    expect(buildWeatherWaypoints([], "2024-06-15T08:00:00Z")).toEqual([]);
  });

  it("returns empty array when rows have no lat/lng", () => {
    const rows = [{ time_seconds: 0 }, { time_seconds: 60 }];
    expect(buildWeatherWaypoints(rows, "2024-06-15T08:00:00Z")).toEqual([]);
  });

  it("returns one waypoint for short activity within single hour", () => {
    const rows = [
      { latitude: 54.0, longitude: 25.0, time_seconds: 0 },
      { latitude: 54.1, longitude: 25.1, time_seconds: 1800 },
    ];
    const result = buildWeatherWaypoints(rows, "2024-06-15T08:00:00Z");
    expect(result.length).toBe(1);
    expect(result[0].lat).toBe(54.0);
    expect(result[0].lng).toBe(25.0);
    expect(result[0].waypointPct).toBe(0);
  });

  it("returns multiple waypoints for multi-hour activity", () => {
    // Activity from 08:00 to 10:30 → spans 3 UTC hours (8, 9, 10)
    const rows = [
      { latitude: 54.0, longitude: 25.0, time_seconds: 0 },
      { latitude: 54.1, longitude: 25.1, time_seconds: 3600 },
      { latitude: 54.2, longitude: 25.2, time_seconds: 7200 },
      { latitude: 54.3, longitude: 25.3, time_seconds: 9000 },
    ];
    const result = buildWeatherWaypoints(rows, "2024-06-15T08:00:00Z");
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("returns correct utcIso format", () => {
    const rows = [{ latitude: 54.0, longitude: 25.0, time_seconds: 0 }];
    const result = buildWeatherWaypoints(rows, "2024-06-15T10:30:00Z");
    expect(result[0].utcIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("waypointPct is 0 for start row", () => {
    const rows = [
      { latitude: 54.0, longitude: 25.0, time_seconds: 0 },
      { latitude: 54.1, longitude: 25.1, time_seconds: 600 },
    ];
    const result = buildWeatherWaypoints(rows, "2024-06-15T08:00:00Z");
    expect(result[0].waypointPct).toBe(0);
  });
});

