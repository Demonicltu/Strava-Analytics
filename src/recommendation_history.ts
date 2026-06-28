/**
 * Recommendation history persistence and trend analysis.
 * Tracks past recommendations to enable effectiveness evaluation and trend visualization.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { RecommendationBlock } from "./recommendations.js";

export interface HistoricalRecommendation {
  date: string;
  state: string;
  session_type: string;
  confidence: string;
  recovery_eta_hours?: number | null;
}

export interface RecommendationTrend {
  dates: string[];
  states: string[];
  confidence_levels: string[];
  avg_recovery_eta_hours: number | null;
  state_consistency: number;
}

export function loadRecommendationHistory(dir: string): HistoricalRecommendation[] {
  const path = join(dir, "recommendation_history.json");
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return (raw.recommendations ?? []).slice(-90) as HistoricalRecommendation[];
  } catch {
    return [];
  }
}

export function saveRecommendation(dir: string, date: string, rec: RecommendationBlock): void {
  const path = join(dir, "recommendation_history.json");
  const existing = loadRecommendationHistory(dir);
  const dedupe = existing.filter(r => r.date !== date);
  const entry: HistoricalRecommendation = {
    date,
    state: rec.state,
    session_type: rec.session_type,
    confidence: rec.confidence,
    recovery_eta_hours: rec.recovery_eta_hours,
  };
  const updated = [...dedupe, entry].slice(-90);
  writeFileSync(path, JSON.stringify({ updated_at: new Date().toISOString(), recommendations: updated }, null, 2), "utf-8");
}

export function computeTrend(history: HistoricalRecommendation[], days: number = 14): RecommendationTrend {
  const recent = history.slice(-days);
  const dates = recent.map(r => r.date);
  const states = recent.map(r => r.state);
  const confidence_levels = recent.map(r => r.confidence);
  const etaValues = recent.map(r => r.recovery_eta_hours).filter((v): v is number => v != null);
  const avg_recovery_eta_hours = etaValues.length > 0 ? Math.round((etaValues.reduce((s, v) => s + v, 0) / etaValues.length) * 10) / 10 : null;

  const stateFreq: Record<string, number> = {};
  for (const s of states) stateFreq[s] = (stateFreq[s] ?? 0) + 1;
  const mostCommon = Object.entries(stateFreq).sort(([, a], [, b]) => b - a)[0];
  const maxFreq = mostCommon ? mostCommon[1] : 0;
  const state_consistency = states.length > 0 ? Math.round((maxFreq / states.length) * 100) : 0;

  return { dates, states, confidence_levels, avg_recovery_eta_hours, state_consistency };
}

export function trendSummary(trend: RecommendationTrend): string {
  const stateStr = trend.states.length > 0 ? trend.states[trend.states.length - 1] : "unknown";
  const confidenceStr = trend.confidence_levels.length > 0 ? trend.confidence_levels[trend.confidence_levels.length - 1] : "unknown";
  const etaStr = trend.avg_recovery_eta_hours != null ? `${trend.avg_recovery_eta_hours}h avg` : "unknown";
  return `Latest: ${stateStr.toUpperCase()} (${confidenceStr}) · Recovery ETA: ${etaStr} · Consistency: ${trend.state_consistency}%`;
}

