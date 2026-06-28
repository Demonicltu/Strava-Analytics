import { describe, it, expect, vi, beforeEach } from "vitest";

const summaryMocks = vi.hoisted(() => ({
  loadAllSummaries: vi.fn(),
  buildHistoricalContext: vi.fn(),
  groupSport: vi.fn(),
  extractSummary: vi.fn(),
  checkPRs: vi.fn(),
}));

const wellnessMocks = vi.hoisted(() => ({
  loadWellnessContext: vi.fn(),
}));

const recMocks = vi.hoisted(() => ({
  loadWellnessByDate: vi.fn(),
  buildActivityRecommendation: vi.fn(),
}));

vi.mock("../summary_utils.js", () => summaryMocks);
vi.mock("../wellness.js", () => wellnessMocks);
vi.mock("../activity_recommendation.js", () => recMocks);

import { buildAnalyzeContext } from "../analyze_context.js";

describe("buildAnalyzeContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds full context when activity date is present in filename", () => {
    const all = [{ id: "1" }];
    const historical = { baselines: [] };
    const prSummary = { id: "S" };
    const prCheck = { any_new_pr: false };
    const wellnessCtx = { readiness_note: "ok" };
    const wellnessByDate = new Map([["2026-06-28", { sleep_score: 75 }]]);
    const rec = { state: "cautious" };

    summaryMocks.groupSport.mockReturnValue("run");
    summaryMocks.loadAllSummaries.mockReturnValue(all);
    summaryMocks.buildHistoricalContext.mockReturnValue(historical);
    summaryMocks.extractSummary.mockReturnValue(prSummary);
    summaryMocks.checkPRs.mockReturnValue(prCheck);
    wellnessMocks.loadWellnessContext.mockReturnValue(wellnessCtx);
    recMocks.loadWellnessByDate.mockReturnValue(wellnessByDate);
    recMocks.buildActivityRecommendation.mockReturnValue(rec);

    const out = buildAnalyzeContext(
      "C:/analysis",
      "activity_123_2026-06-28_test_crunched.json",
      { summary_card: { type: "Run", start_date_local: "2026-06-28T06:00:00", local_utc_offset_hours: 3 } },
    );

    expect(out.activityDate).toBe("2026-06-28");
    expect(summaryMocks.buildHistoricalContext).toHaveBeenCalledWith(all, "2026-06-28", "run");
    expect(summaryMocks.checkPRs).toHaveBeenCalledWith(all, prSummary);
    expect(wellnessMocks.loadWellnessContext).toHaveBeenCalledWith("C:/analysis", "2026-06-28", "2026-06-28T06:00:00", 3);
    expect(recMocks.buildActivityRecommendation).toHaveBeenCalledWith(all, wellnessByDate, "2026-06-28");
    expect(out).toEqual({
      activityDate: "2026-06-28",
      historicalCtx: historical,
      prCheck,
      wellnessCtx,
      recommendation: rec,
    });
  });

  it("returns null context pieces when filename has no activity date", () => {
    summaryMocks.groupSport.mockReturnValue("other");
    summaryMocks.loadAllSummaries.mockReturnValue([]);
    summaryMocks.extractSummary.mockReturnValue(null);
    recMocks.loadWellnessByDate.mockReturnValue(new Map());

    const out = buildAnalyzeContext("C:/analysis", "no_date_here.json", {
      summary_card: { type: "Ride" },
      activity_meta: { start_date_local: "2026-06-27T05:00:00" },
    });

    expect(out.activityDate).toBeNull();
    expect(out.historicalCtx).toBeNull();
    expect(out.prCheck).toBeNull();
    expect(out.wellnessCtx).toBeNull();
    expect(out.recommendation).toBeNull();
    expect(summaryMocks.buildHistoricalContext).not.toHaveBeenCalled();
    expect(wellnessMocks.loadWellnessContext).not.toHaveBeenCalled();
    expect(recMocks.buildActivityRecommendation).not.toHaveBeenCalled();
  });
});

