import { describe, it, expect, vi, beforeEach } from "vitest";

const summaryMocks = vi.hoisted(() => ({
  loadAllSummaries: vi.fn(),
  buildHistoricalContext: vi.fn(),
  groupSport: vi.fn(),
  extractSummary: vi.fn(),
  checkPRs: vi.fn(),
}));

const formatMocks = vi.hoisted(() => ({
  buildPersonalScore: vi.fn(),
}));

const recMocks = vi.hoisted(() => ({
  loadWellnessByDate: vi.fn(),
  buildActivityRecommendation: vi.fn(),
}));

vi.mock("../summary_utils.js", () => summaryMocks);
vi.mock("../format.js", () => formatMocks);
vi.mock("../activity_recommendation.js", () => recMocks);

import { buildFastContext } from "../fast_context.js";

describe("buildFastContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds full context and PR check when summary is available", () => {
    const allSummaries = [{ id: "1" }];
    const historical = { baselines: [] };
    const personal = { composite_pct: 98 };
    const summary = { id: "A" };
    const pr = { any_new_pr: true };
    const wellness = new Map([["2026-06-28", { sleep_score: 80 }]]);
    const rec = { state: "balanced" };

    summaryMocks.loadAllSummaries.mockReturnValue(allSummaries);
    summaryMocks.groupSport.mockReturnValue("ride");
    summaryMocks.buildHistoricalContext.mockReturnValue(historical);
    formatMocks.buildPersonalScore.mockReturnValue(personal);
    summaryMocks.extractSummary.mockReturnValue(summary);
    summaryMocks.checkPRs.mockReturnValue(pr);
    recMocks.loadWellnessByDate.mockReturnValue(wellness);
    recMocks.buildActivityRecommendation.mockReturnValue(rec);

    const out = buildFastContext("C:/analysis", "2026-06-28", { summary_card: { type: "Ride" } }, "activity_1.json");

    expect(summaryMocks.loadAllSummaries).toHaveBeenCalledWith("C:/analysis");
    expect(summaryMocks.groupSport).toHaveBeenCalledWith("Ride");
    expect(summaryMocks.buildHistoricalContext).toHaveBeenCalledWith(allSummaries, "2026-06-28", "ride");
    expect(formatMocks.buildPersonalScore).toHaveBeenCalledWith({ summary_card: { type: "Ride" } }, historical);
    expect(summaryMocks.checkPRs).toHaveBeenCalledWith(allSummaries, summary);
    expect(recMocks.buildActivityRecommendation).toHaveBeenCalledWith(allSummaries, wellness, "2026-06-28");
    expect(out).toEqual({
      historicalCtx: historical,
      personalScore: personal,
      prCheck: pr,
      recommendation: rec,
    });
  });

  it("returns prCheck as null when summary extraction returns null", () => {
    summaryMocks.loadAllSummaries.mockReturnValue([]);
    summaryMocks.groupSport.mockReturnValue("other");
    summaryMocks.buildHistoricalContext.mockReturnValue(null);
    formatMocks.buildPersonalScore.mockReturnValue(null);
    summaryMocks.extractSummary.mockReturnValue(null);
    recMocks.loadWellnessByDate.mockReturnValue(new Map());
    recMocks.buildActivityRecommendation.mockReturnValue(null);

    const out = buildFastContext("C:/analysis", "2026-06-28", { summary_card: {} }, "activity_2.json");

    expect(summaryMocks.checkPRs).not.toHaveBeenCalled();
    expect(out.prCheck).toBeNull();
    expect(out.recommendation).toBeNull();
  });
});

