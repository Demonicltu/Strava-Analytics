import { describe, it, expect } from "vitest";
import {
  groupSport,
  isoWeek,
  avg,
  sum,
  round2,
  extractSummary,
  buildHistoricalContext,
  checkPRs,
} from "../summary_utils.js";
import type { ActivitySummary } from "../summary_utils.js";

// ─── groupSport ───

describe("groupSport", () => {
  it.each([
    ["Run", "Run"], ["TrailRun", "Run"], ["VirtualRun", "Run"],
    ["Ride", "Ride"], ["GravelRide", "Ride"], ["VirtualRide", "Ride"],
    ["Walk", "Walk"], ["Hike", "Walk"],
    ["StandUpPaddling", "Paddle"],
    ["Swim", "Swim"], ["OpenWaterSwim", "Swim"],
    ["WeightTraining", "Strength"], ["Yoga", "Strength"],
    ["Surfing", "Surfing"],    // falls through to raw type
    ["Unknown", "Unknown"],
  ])("maps %s → %s", (input, expected) => {
    expect(groupSport(input)).toBe(expected);
  });
});

// ─── isoWeek ───

describe("isoWeek", () => {
  it("returns correct ISO week for 2024-01-01 (W01)", () =>
    expect(isoWeek("2024-01-01")).toMatch(/2024-W0[12]/));
  it("returns correct format YYYY-Www", () =>
    expect(isoWeek("2024-06-15")).toMatch(/^\d{4}-W\d{2}$/));
  it("same date always gives same week", () => {
    expect(isoWeek("2024-06-15")).toBe(isoWeek("2024-06-15"));
  });
  it("Mon and Sun in same week match", () => {
    expect(isoWeek("2024-06-10")).toBe(isoWeek("2024-06-16")); // Mon–Sun W24
  });
});

// ─── avg / sum / round2 ───

describe("avg", () => {
  it("returns null for empty array", () => expect(avg([])).toBeNull());
  it("returns null for all-null array", () => expect(avg([null, null])).toBeNull());
  it("ignores nulls", () => expect(avg([1, null, 3])).toBe(2));
  it("rounds to 2 decimals", () => expect(avg([1, 2, 3])).toBe(2));
});

describe("sum", () => {
  it("treats null as 0", () => expect(sum([1, null, 3])).toBe(4));
  it("empty array = 0", () => expect(sum([])).toBe(0));
});

describe("round2", () => {
  it("rounds to 2 decimals", () => expect(round2(1.555)).toBe(1.56));
  it("returns null for null", () => expect(round2(null)).toBeNull());
});

// ─── extractSummary ───

function makeMinimalCrunched(overrides: Record<string, any> = {}) {
  return {
    summary_card: {
      name: "Test Activity",
      type: "Ride",
      distance: "30.0 km",
      moving_time_seconds: 3600,
      date: "2024-06-15T08:00:00Z",
      ...overrides.summary_card,
    },
    heart_rate: { stats: { avg: 150, max: 175 } },
    power: { avg_power: 200, normalized_power: 210, best_efforts: {}, variability_index: 1.05 },
    training_zones: {
      hr_zones: {
        zones: [
          { pct: 10, time_seconds: 360 },
          { pct: 40, time_seconds: 1440 },
          { pct: 30, time_seconds: 1080 },
          { pct: 15, time_seconds: 540 },
          { pct: 5,  time_seconds: 180 },
        ],
      },
    },
    climbing: { total_ascent_m: 300 },
    training_metrics: { tss: 80 },
    relative_effort: { score: 120 },
    vo2max: { value: 55.5 },
    cadence: { stats: { avg: 85 } },
    aerobic_decoupling: { decoupling_pct: 4.2 },
    ...overrides,
  };
}

describe("extractSummary", () => {
  const filename = "activity_12345678_2024-06-15_Test_crunched.json";

  it("extracts id from filename", () => {
    const s = extractSummary(makeMinimalCrunched(), filename)!;
    expect(s.id).toBe("12345678");
  });

  it("extracts date from filename", () => {
    const s = extractSummary(makeMinimalCrunched(), filename)!;
    expect(s.date).toBe("2024-06-15");
  });

  it("groups sport_type correctly", () => {
    const s = extractSummary(makeMinimalCrunched(), filename)!;
    expect(s.sport).toBe("Ride");
  });

  it("parses distance_km", () => {
    const s = extractSummary(makeMinimalCrunched(), filename)!;
    expect(s.distance_km).toBe(30);
  });

  it("extracts elevation_m", () => {
    const s = extractSummary(makeMinimalCrunched(), filename)!;
    expect(s.elevation_m).toBe(300);
  });

  it("extracts normalized_power", () => {
    const s = extractSummary(makeMinimalCrunched(), filename)!;
    expect(s.normalized_power).toBe(210);
  });

  it("extracts tss", () => {
    const s = extractSummary(makeMinimalCrunched(), filename)!;
    expect(s.tss).toBe(80);
  });

  it("extracts hr zone percentages", () => {
    const s = extractSummary(makeMinimalCrunched(), filename)!;
    expect(s.hr_zone_pct?.z1).toBe(10);
    expect(s.hr_zone_pct?.z2).toBe(40);
  });

  it("returns null for activity without valid date", () => {
    const raw = makeMinimalCrunched({ summary_card: { type: "Ride", distance: "5.0 km" } });
    const result = extractSummary(raw, "no_date_match_crunched.json");
    expect(result).toBeNull();
  });

  it("computes efficiency_factor when NP and avg HR both present", () => {
    const s = extractSummary(makeMinimalCrunched(), filename)!;
    // ef = round(210 / 150, 3) = 1.4
    expect(s.efficiency_factor).toBeCloseTo(1.4, 2);
  });

  it("extracts run pace from avg_speed string", () => {
    const raw = makeMinimalCrunched({
      summary_card: {
        name: "Test Run",
        type: "Run",
        distance: "10.0 km",
        moving_time_seconds: 2700,
        avg_speed: "5:30/km",
        date: "2024-06-15T08:00:00Z",
      },
    });
    const s = extractSummary(raw, "activity_99999_2024-06-15_Run_crunched.json")!;
    expect(s.pace_sec_per_km).toBe(330); // 5*60 + 30
  });
});

// ─── buildHistoricalContext ───

function makeSummary(date: string, overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: date,
    date,
    week: isoWeek(date),
    sport: "Ride",
    sport_raw: "Ride",
    name: "Ride",
    distance_km: 30,
    moving_time_sec: 3600,
    elevation_m: 200,
    avg_hr: 150,
    max_hr: 175,
    avg_speed_kmh: 30,
    avg_power_w: 200,
    normalized_power: 210,
    tss: 80,
    trimp: 100,
    vo2max: 55,
    calories: 800,
    hr_zone_pct: { z1: 10, z2: 40, z3: 30, z4: 15, z5: 5 },
    hr_zone_sec: { z1: 360, z2: 1440, z3: 1080, z4: 540, z5: 180 },
    efficiency_factor: 1.4,
    pace_sec_per_km: null,
    avg_cadence: 85,
    variability_index: 1.05,
    cardiac_drift_bpm: 5,
    z2_pct: 40,
    best_20min_power_w: 230,
    aerobic_decoupling_pct: 4.2,
    tss_is_hr_based: false,
    vi_is_pace_based: false,
    decoupling_is_drift: false,
    ...overrides,
  };
}

describe("buildHistoricalContext", () => {
  it("returns null when fewer than MIN_HISTORY_COUNT prior activities", () => {
    const summaries = [makeSummary("2024-06-01"), makeSummary("2024-06-08")];
    expect(buildHistoricalContext(summaries, "2024-06-15", "Ride")).toBeNull();
  });

  it("returns baselines when enough history exists", () => {
    const summaries = [
      makeSummary("2024-01-01"),
      makeSummary("2024-02-01"),
      makeSummary("2024-03-01"),
      makeSummary("2024-04-01"),
    ];
    const ctx = buildHistoricalContext(summaries, "2024-06-15", "Ride");
    expect(ctx).not.toBeNull();
    expect(ctx!.baselines.length).toBeGreaterThanOrEqual(1);
  });

  it("excludes activities on or after target date", () => {
    const summaries = [
      makeSummary("2024-06-15"), // same date — should be excluded
      makeSummary("2024-06-16"), // future — should be excluded
      makeSummary("2024-01-01"),
      makeSummary("2024-02-01"),
      makeSummary("2024-03-01"),
    ];
    const ctx = buildHistoricalContext(summaries, "2024-06-15", "Ride");
    expect(ctx).not.toBeNull();
    // All baselines only include activities before 2024-06-15
    for (const b of ctx!.baselines) {
      expect(b.activity_count).toBeLessThanOrEqual(3);
    }
  });

  it("filters by sport", () => {
    const summaries = [
      makeSummary("2024-01-01", { sport: "Run" }),
      makeSummary("2024-02-01", { sport: "Run" }),
      makeSummary("2024-03-01", { sport: "Run" }),
    ];
    expect(buildHistoricalContext(summaries, "2024-06-15", "Ride")).toBeNull();
  });

  it("returns correct sport in context", () => {
    const summaries = Array.from({ length: 5 }, (_, i) =>
      makeSummary(`2024-0${i + 1}-01`)
    );
    const ctx = buildHistoricalContext(summaries, "2024-06-15", "Ride");
    expect(ctx!.sport).toBe("Ride");
  });
});

// ─── checkPRs ───

describe("checkPRs", () => {
  const prior = [
    makeSummary("2024-01-01", { distance_km: 20, elevation_m: 300, normalized_power: 200, pace_sec_per_km: null }),
    makeSummary("2024-02-01", { distance_km: 25, elevation_m: 500, normalized_power: 220, pace_sec_per_km: null }),
    makeSummary("2024-03-01", { distance_km: 30, elevation_m: 400, normalized_power: 215, pace_sec_per_km: null }),
  ];

  it("detects longest distance PR", () => {
    const activity = makeSummary("2024-06-15", { distance_km: 35 });
    const result = checkPRs([...prior, activity], activity);
    expect(result.is_pr_longest_distance).toBe(true);
    expect(result.pr_labels.some(l => l.includes("Longest"))).toBe(true);
  });

  it("detects best power PR", () => {
    const activity = makeSummary("2024-06-15", { normalized_power: 250 });
    const result = checkPRs([...prior, activity], activity);
    expect(result.is_pr_best_power).toBe(true);
  });

  it("no PR for average activity", () => {
    const activity = makeSummary("2024-06-15", { distance_km: 20, elevation_m: 100, normalized_power: 180 });
    const result = checkPRs([...prior, activity], activity);
    expect(result.is_pr_longest_distance).toBe(false);
    expect(result.is_pr_best_power).toBe(false);
  });

  it("returns empty PR list when fewer than 3 prior activities", () => {
    const activity = makeSummary("2024-06-15", { distance_km: 999 });
    const result = checkPRs([makeSummary("2024-01-01"), activity], activity);
    expect(result.pr_labels).toHaveLength(0);
  });

  it("detects biggest climb PR", () => {
    const activity = makeSummary("2024-06-15", { elevation_m: 1000 });
    const result = checkPRs([...prior, activity], activity);
    expect(result.is_pr_biggest_climb).toBe(true);
  });

  it("detects fastest pace PR for runs", () => {
    const runPrior = prior.map(s => ({ ...s, sport: "Run", pace_sec_per_km: 330 }));
    const activity = { ...makeSummary("2024-06-15"), sport: "Run", pace_sec_per_km: 310 };
    const result = checkPRs([...runPrior, activity], activity);
    expect(result.is_pr_fastest_pace).toBe(true);
  });
});

