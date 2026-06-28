import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadRecommendationHistory, saveRecommendation, computeTrend, trendSummary } from "../recommendation_history.js";
import type { RecommendationBlock } from "../recommendations.js";

function mockRec(state: string, confidence: string = "high", eta: number | null = 12): RecommendationBlock {
  return {
    state: state as any,
    session_type: "recovery",
    next_24h: "Easy",
    next_72h: "Easy then moderate",
    suggested_next_session_tss_range: [20, 40],
    suggested_weekly_tss_range: [250, 350],
    rationale: ["test"],
    signals: [],
    confidence: confidence as any,
    recovery_eta_hours: eta,
  };
}

describe("recommendation_history", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "rec-history-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no history file exists", () => {
    const history = loadRecommendationHistory(tmpDir);
    expect(history).toEqual([]);
  });

  it("saves and loads recommendation", () => {
    saveRecommendation(tmpDir, "2026-06-28", mockRec("balanced"));
    const history = loadRecommendationHistory(tmpDir);
    expect(history.length).toBe(1);
    expect(history[0].date).toBe("2026-06-28");
    expect(history[0].state).toBe("balanced");
    expect(history[0].confidence).toBe("high");
  });

  it("deduplicates same-day recommendations", () => {
    saveRecommendation(tmpDir, "2026-06-28", mockRec("balanced"));
    saveRecommendation(tmpDir, "2026-06-28", mockRec("fresh"));
    const history = loadRecommendationHistory(tmpDir);
    expect(history.length).toBe(1);
    expect(history[0].state).toBe("fresh");
  });

  it("keeps latest 90 recommendations", () => {
    for (let i = 1; i <= 100; i++) {
      const date = `2026-${String((Math.floor((i - 1) / 30) + 1)).padStart(2, "0")}-${String(((i - 1) % 30) + 1).padStart(2, "0")}`;
      saveRecommendation(tmpDir, date, mockRec("balanced"));
    }
    const history = loadRecommendationHistory(tmpDir);
    expect(history.length).toBeLessThanOrEqual(90);
  });

  it("computes trend for recent recommendations", () => {
    const states = ["balanced", "balanced", "cautious", "fresh"];
    states.forEach((s, i) => {
      const date = `2026-06-${String(25 + i).padStart(2, "0")}`;
      saveRecommendation(tmpDir, date, mockRec(s));
    });
    const history = loadRecommendationHistory(tmpDir);
    const trend = computeTrend(history);
    expect(trend.states).toEqual(states);
    expect(trend.state_consistency).toBeGreaterThan(0);
    expect(trend.avg_recovery_eta_hours).toBe(12);
  });

  it("generates trend summary text", () => {
    const states = ["balanced", "balanced", "cautious"];
    states.forEach((s, i) => {
      const date = `2026-06-${String(26 + i).padStart(2, "0")}`;
      saveRecommendation(tmpDir, date, mockRec(s));
    });
    const history = loadRecommendationHistory(tmpDir);
    const trend = computeTrend(history);
    const summary = trendSummary(trend);
    expect(summary).toContain("CAUTIOUS");
    expect(summary).toContain("Consistency");
  });

  it("handles null recovery eta in trend computation", () => {
    saveRecommendation(tmpDir, "2026-06-28", mockRec("balanced", "high", null));
    saveRecommendation(tmpDir, "2026-06-29", mockRec("cautious", "medium", 15));
    const history = loadRecommendationHistory(tmpDir);
    const trend = computeTrend(history);
    expect(trend.avg_recovery_eta_hours).toBe(15);
  });
});

