import { describe, it, expect } from "vitest";
import { buildPersonalScore, extractSection } from "../format.js";

// ─── buildPersonalScore ───

function makeBaseline(overrides: Record<string, any> = {}) {
  return {
    period_label: "3 months",
    days: 90,
    activity_count: 10,
    avg_normalized_power_w: 200,
    avg_efficiency_factor: 1.4,
    avg_tss: 80,
    ...overrides,
  };
}

function makeCrunched(overrides: Record<string, any> = {}) {
  return {
    summary_card: { moving_time_seconds: 3600 },
    power: { normalized_power: 210 },
    training_metrics: { efficiency_factor: 1.45, tss: 88 },
    ...overrides,
  };
}

describe("buildPersonalScore", () => {
  it("returns null when no historicalCtx", () => {
    expect(buildPersonalScore(makeCrunched(), null)).toBeNull();
  });

  it("returns null when baselines is empty", () => {
    expect(buildPersonalScore(makeCrunched(), { baselines: [] })).toBeNull();
  });

  it("returns null when baseline activity_count < 3", () => {
    const ctx = { baselines: [makeBaseline({ activity_count: 2 })] };
    expect(buildPersonalScore(makeCrunched(), ctx)).toBeNull();
  });

  it("returns null when all metrics are missing", () => {
    const crunched = { summary_card: { moving_time_seconds: 3600 }, power: {}, training_metrics: {} };
    const ctx = { baselines: [makeBaseline()] };
    expect(buildPersonalScore(crunched, ctx)).toBeNull();
  });

  it("returns composite_pct as a number", () => {
    const ctx = { baselines: [makeBaseline()] };
    const result = buildPersonalScore(makeCrunched(), ctx);
    expect(result).not.toBeNull();
    expect(typeof result.composite_pct).toBe("number");
  });

  it("composite 105% → 'On par' interpretation", () => {
    // NP 210/200=105%, EF 1.4/1.4=100%, TSS 80/80=100% → weighted avg ~ 102
    const ctx = { baselines: [makeBaseline()] };
    const result = buildPersonalScore(makeCrunched({ training_metrics: { tss: 80, efficiency_factor: 1.4 } }), ctx);
    expect(result.interpretation).toContain("On par");
  });

  it("composite > 130 → 'Significantly above' interpretation", () => {
    const crunched = makeCrunched({ power: { normalized_power: 320 }, training_metrics: { tss: 160 } });
    const ctx = { baselines: [makeBaseline()] };
    const result = buildPersonalScore(crunched, ctx);
    expect(result.interpretation).toContain("Significantly above");
  });

  it("composite < 70 → 'Well below' interpretation", () => {
    const crunched = makeCrunched({ power: { normalized_power: 100 }, training_metrics: { tss: 30, efficiency_factor: 0.8 } });
    const ctx = { baselines: [makeBaseline()] };
    const result = buildPersonalScore(crunched, ctx);
    expect(result.interpretation).toContain("Well below");
  });

  it("long ride (>2.5h) changes weighting — long_ride_weighting=true", () => {
    const crunched = makeCrunched({ summary_card: { moving_time_seconds: 10000 } });
    const ctx = { baselines: [makeBaseline()] };
    const result = buildPersonalScore(crunched, ctx);
    expect(result.long_ride_weighting).toBe(true);
  });

  it("short ride — long_ride_weighting=false", () => {
    const ctx = { baselines: [makeBaseline()] };
    const result = buildPersonalScore(makeCrunched(), ctx);
    expect(result.long_ride_weighting).toBe(false);
  });

  it("accepts JSON string as crunchedRaw", () => {
    const ctx = { baselines: [makeBaseline()] };
    const result = buildPersonalScore(JSON.stringify(makeCrunched()), ctx);
    expect(result).not.toBeNull();
    expect(result.composite_pct).toBeTypeOf("number");
  });

  it("prefers 90d baseline (days 85-95)", () => {
    const ctx = {
      baselines: [
        makeBaseline({ days: 30, period_label: "1 month", avg_normalized_power_w: 180 }),
        makeBaseline({ days: 90, period_label: "3 months", avg_normalized_power_w: 200 }),
      ],
    };
    const result = buildPersonalScore(makeCrunched(), ctx);
    // 90d baseline avg_normalized_power_w=200 → NP pct=105
    expect(result.baseline_period).toBe("3 months");
  });

  it("falls back to last baseline when no 90d baseline", () => {
    const ctx = {
      baselines: [
        makeBaseline({ days: 7, period_label: "1 week", avg_normalized_power_w: 200 }),
        makeBaseline({ days: 30, period_label: "1 month", avg_normalized_power_w: 205 }),
      ],
    };
    const result = buildPersonalScore(makeCrunched(), ctx);
    expect(result.baseline_period).toBe("1 month");
  });
});

// ─── extractSection ───

describe("extractSection", () => {
  const md = `
# Introduction
Some intro text.

## Tips
- Tip one
- Tip two

## Key Stats
stat1: 100
stat2: 200

# Conclusion
Bye.
`.trim();

  it("extracts content under matching header", () => {
    const result = extractSection(md, "Tips");
    expect(result).toContain("Tip one");
    expect(result).toContain("Tip two");
  });

  it("does not include content beyond next same-level header", () => {
    const result = extractSection(md, "Tips");
    expect(result).not.toContain("stat1");
  });

  it("returns null when header not found", () => {
    expect(extractSection(md, "Nonexistent")).toBeNull();
  });

  it("is case-insensitive for keyword matching", () => {
    expect(extractSection(md, "tips")).not.toBeNull();
    expect(extractSection(md, "TIPS")).not.toBeNull();
  });

  it("returns null for empty section content", () => {
    const emptyMd = "## EmptySection\n## Next";
    expect(extractSection(emptyMd, "EmptySection")).toBeNull();
  });
});

