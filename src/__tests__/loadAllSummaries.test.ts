import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readdirSync, readFileSync } from "fs";
import { loadAllSummaries } from "../summary_utils.js";

function makeMinimalCrunched(date = "2024-06-15") {
  return JSON.stringify({
    summary_card: {
      name: "Test Ride",
      type: "Ride",
      distance: "30.0 km",
      moving_time_seconds: 3600,
      date: `${date}T08:00:00Z`,
    },
    heart_rate: { stats: { avg: 150, max: 175 } },
    power: { avg_power: 200, normalized_power: 210, variability_index: 1.05 },
    climbing: { total_ascent_m: 300 },
    training_metrics: { tss: 80 },
    relative_effort: { score: 120 },
    training_zones: {
      hr_zones: {
        zones: [
          { pct: 10, time_seconds: 360 },
          { pct: 40, time_seconds: 1440 },
          { pct: 30, time_seconds: 1080 },
          { pct: 15, time_seconds: 540 },
          { pct: 5, time_seconds: 180 },
        ],
      },
    },
  });
}

describe("loadAllSummaries (fs-mocked)", () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset();
    vi.mocked(readdirSync).mockReset();
    vi.mocked(readFileSync).mockReset();
  });

  it("returns empty array when analysis dir does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(loadAllSummaries("/fake/dir")).toEqual([]);
  });

  it("returns empty array when no _crunched.json files", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(["other.json", "notes.md"] as any);
    expect(loadAllSummaries("/fake/dir")).toEqual([]);
  });

  it("loads and parses _crunched.json files", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      "activity_111_2024-06-10_Ride_crunched.json",
      "activity_222_2024-06-12_Ride_crunched.json",
    ] as any);
    vi.mocked(readFileSync).mockImplementation((path: any) => {
      if (String(path).includes("_111_")) return makeMinimalCrunched("2024-06-10") as any;
      return makeMinimalCrunched("2024-06-12") as any;
    });

    const summaries = loadAllSummaries("/fake/dir");
    expect(summaries).toHaveLength(2);
    expect(summaries[0].date).toBe("2024-06-10");
    expect(summaries[1].date).toBe("2024-06-12");
  });

  it("sorts summaries by date ascending", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      "activity_222_2024-06-12_Ride_crunched.json",
      "activity_111_2024-06-10_Ride_crunched.json",
    ] as any);
    vi.mocked(readFileSync).mockImplementation((path: any) => {
      if (String(path).includes("_222_")) return makeMinimalCrunched("2024-06-12") as any;
      return makeMinimalCrunched("2024-06-10") as any;
    });

    const summaries = loadAllSummaries("/fake/dir");
    expect(summaries[0].date).toBe("2024-06-10");
    expect(summaries[1].date).toBe("2024-06-12");
  });

  it("skips corrupt JSON files gracefully", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      "activity_bad_2024-06-10_corrupt_crunched.json",
      "activity_111_2024-06-12_Ride_crunched.json",
    ] as any);
    vi.mocked(readFileSync).mockImplementation((path: any) => {
      if (String(path).includes("corrupt")) return "{ invalid" as any;
      return makeMinimalCrunched("2024-06-12") as any;
    });

    const summaries = loadAllSummaries("/fake/dir");
    expect(summaries).toHaveLength(1);
    expect(summaries[0].id).toBe("111");
  });
});

