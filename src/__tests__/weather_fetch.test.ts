/**
 * Tests for weather.ts fetchWeatherMultiPoint (mocked axios)
 * and the baseUrl/wmoDescription functions already covered partially.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => {
  const mockAxios: any = {
    get: vi.fn(),
    default: null,
  };
  mockAxios.default = mockAxios;
  return { default: mockAxios };
});

import { fetchWeatherMultiPoint } from "../weather.js";

function makeHourlyResponse(hour = 10) {
  // Build 24h fake hourly data; put valid data at `hour`
  const times = Array.from({ length: 24 }, (_, i) => `2024-06-15T${String(i).padStart(2, "0")}:00:00Z`);
  return {
    data: {
      hourly: {
        time: times,
        temperature_2m: times.map((_, i) => 15 + i * 0.1),
        apparent_temperature: times.map((_, i) => 13 + i * 0.1),
        precipitation: times.map(() => 0),
        windspeed_10m: times.map(() => 20),
        winddirection_10m: times.map(() => 270),
        windgusts_10m: times.map(() => 30),
        weathercode: times.map(() => 2), // Partly cloudy
        relativehumidity_2m: times.map(() => 65),
      },
    },
  };
}

describe("fetchWeatherMultiPoint", () => {
  beforeEach(async () => {
    // Re-acquire the mocked axios each test
    const { default: axiosMock } = await import("axios");
    vi.mocked(axiosMock.get).mockReset();
  });

  it("returns null for empty waypoints", async () => {
    expect(await fetchWeatherMultiPoint([])).toBeNull();
  });

  it("fetches weather for single waypoint and returns multi-point result", async () => {
    const { default: axiosMock } = await import("axios");
    vi.mocked(axiosMock.get).mockResolvedValue(makeHourlyResponse(8));

    const waypoints = [{ lat: 54.0, lng: 25.0, utcIso: "2024-06-15T08:00:00Z", waypointPct: 0 }];
    const result = await fetchWeatherMultiPoint(waypoints);

    expect(result).not.toBeNull();
    expect(result!.waypoints_fetched).toBe(1);
    expect(result!.snapshots).toHaveLength(1);
    expect(result!.at_start).toBeDefined();
    expect(result!.condition_summary).toBe("Partly cloudy");
  });

  it("returns null when all axios calls fail", async () => {
    const { default: axiosMock } = await import("axios");
    vi.mocked(axiosMock.get).mockRejectedValue(new Error("Network error"));

    const waypoints = [{ lat: 54.0, lng: 25.0, utcIso: "2024-06-15T08:00:00Z", waypointPct: 0 }];
    const result = await fetchWeatherMultiPoint(waypoints);
    expect(result).toBeNull();
  });

  it("returns null when response has no hourly data", async () => {
    const { default: axiosMock } = await import("axios");
    vi.mocked(axiosMock.get).mockResolvedValue({ data: {} });

    const waypoints = [{ lat: 54.0, lng: 25.0, utcIso: "2024-06-15T08:00:00Z", waypointPct: 0 }];
    const result = await fetchWeatherMultiPoint(waypoints);
    expect(result).toBeNull();
  });

  it("fetches multiple waypoints in parallel", async () => {
    const { default: axiosMock } = await import("axios");
    vi.mocked(axiosMock.get).mockResolvedValue(makeHourlyResponse(10));

    const waypoints = [
      { lat: 54.0, lng: 25.0, utcIso: "2024-06-15T10:00:00Z", waypointPct: 0 },
      { lat: 54.1, lng: 25.1, utcIso: "2024-06-15T11:00:00Z", waypointPct: 50 },
      { lat: 54.2, lng: 25.2, utcIso: "2024-06-15T12:00:00Z", waypointPct: 100 },
    ];
    const result = await fetchWeatherMultiPoint(waypoints);

    expect(result).not.toBeNull();
    expect(result!.waypoints_fetched).toBe(3);
    expect(axiosMock.get).toHaveBeenCalledTimes(3);
  });

  it("uses archive URL for activities > 7 days old", async () => {
    const { default: axiosMock } = await import("axios");
    vi.mocked(axiosMock.get).mockResolvedValue(makeHourlyResponse(10));

    // Use a date >7 days ago
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const waypoints = [{ lat: 54.0, lng: 25.0, utcIso: oldDate, waypointPct: 0 }];
    await fetchWeatherMultiPoint(waypoints);

    expect(axiosMock.get).toHaveBeenCalledWith(
      expect.stringContaining("archive"),
      expect.any(Object)
    );
  });

  it("uses forecast URL for activities within 7 days", async () => {
    const { default: axiosMock } = await import("axios");
    vi.mocked(axiosMock.get).mockResolvedValue(makeHourlyResponse(10));

    // Use a date within 7 days
    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const waypoints = [{ lat: 54.0, lng: 25.0, utcIso: recentDate, waypointPct: 0 }];
    await fetchWeatherMultiPoint(waypoints);

    expect(axiosMock.get).toHaveBeenCalledWith(
      expect.stringContaining("forecast"),
      expect.any(Object)
    );
  });
});

