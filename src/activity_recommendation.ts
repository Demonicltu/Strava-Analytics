import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { avg, type ActivitySummary } from "./summary_utils.js";
import { computeLatestLoadMetrics } from "./training_intelligence.js";
import { buildTrainingRecommendations, type RecommendationBlock, type TrainingRecommendationInput } from "./recommendations.js";
import { computeReadiness, hrvValue, meanHalfDelta } from "./readiness_utils.js";
import { saveRecommendation } from "./recommendation_history.js";

export function loadWellnessByDate(analysisDir: string): Map<string, any> {
  const garminPath = join(analysisDir, "garmin_wellness.json");
  const samsungPath = join(analysisDir, "samsung_wellness.json");
  const wellnessPath = existsSync(garminPath) ? garminPath : existsSync(samsungPath) ? samsungPath : null;
  if (!wellnessPath) return new Map();
  try {
    const raw = JSON.parse(readFileSync(wellnessPath, "utf-8"));
    return new Map(Object.entries(raw));
  } catch {
    return new Map();
  }
}

export function buildActivityRecommendation(
  allSummaries: ActivitySummary[],
  wellnessByDate: Map<string, any>,
  activityDate: string,
): RecommendationBlock | null {
  const input = recommendationInputForDate(allSummaries, wellnessByDate, activityDate);
  if (!input) return null;

  const rec = buildTrainingRecommendations(input);
  const prevDate = previousDate(allSummaries, wellnessByDate, activityDate);
  if (!prevDate) return rec;

  const prevInput = recommendationInputForDate(allSummaries, wellnessByDate, prevDate);
  if (!prevInput) return rec;

  const prevRec = buildTrainingRecommendations(prevInput);
  const changes = buildChanges(input, rec, prevInput, prevRec);
  const final = changes ? { ...rec, changes } : rec;

  const analysisDir = process.env["ANALYSIS_DIR"] ?? "./analysis";
  try {
    saveRecommendation(analysisDir, activityDate, final);
  } catch {
  }

  return final;
}

function recommendationInputForDate(
  allSummaries: ActivitySummary[],
  wellnessByDate: Map<string, any>,
  activityDate: string,
): TrainingRecommendationInput | null {
  const acts = allSummaries.filter(a => a.date <= activityDate);
  if (acts.length === 0) return null;

  const { ctl, atl, tsb } = computeLatestLoadMetrics(acts, activityDate);

  const wDates = [...wellnessByDate.keys()].filter(d => d <= activityDate).sort();
  const recent7 = wDates.slice(-7);
  const recent28 = wDates.slice(-28);

  const readiness7 = recent7.map(d => computeReadiness(wellnessByDate.get(d)).score).filter((v): v is number => v != null);
  const readiness28 = recent28.map(d => computeReadiness(wellnessByDate.get(d)).score).filter((v): v is number => v != null);
  const latestReadiness = readiness7.length > 0 ? readiness7[readiness7.length - 1] : null;

  const hrv7 = recent7.map(d => hrvValue(wellnessByDate.get(d))).filter((v): v is number => v != null);
  const hrvDelta7 = meanHalfDelta(hrv7);
  const hrvTrend = hrvDelta7 == null ? null : hrvDelta7 <= -3 ? "declining" : hrvDelta7 >= 3 ? "improving" : "stable";
  const { flags: qualityFlags, penalty: qualityPenalty } = computeQuality(activityDate, wellnessByDate);

  return {
    ctl,
    atl,
    tsb,
    goal_mode: (process.env["GOAL_MODE"] ?? "maintain") as any,
    readiness_score: latestReadiness,
    readiness_label: latestReadiness == null ? null : latestReadiness >= 75 ? "Ready" : latestReadiness >= 60 ? "Moderate" : "Low",
    hrv_trend: hrvTrend,
    hrv_delta_7: hrvDelta7,
    sleep_score: avg(recent7.map(d => wellnessByDate.get(d)?.sleep_score ?? null)),
    body_battery: avg(recent7.map(d => wellnessByDate.get(d)?.body_battery_start_of_day ?? null)),
    readiness_avg_7: avg(readiness7),
    readiness_avg_28: avg(readiness28),
    sleep_avg_7: avg(recent7.map(d => wellnessByDate.get(d)?.sleep_score ?? null)),
    sleep_avg_28: avg(recent28.map(d => wellnessByDate.get(d)?.sleep_score ?? null)),
    body_battery_avg_7: avg(recent7.map(d => wellnessByDate.get(d)?.body_battery_start_of_day ?? null)),
    body_battery_avg_28: avg(recent28.map(d => wellnessByDate.get(d)?.body_battery_start_of_day ?? null)),
    garmin_days_7: recent7.length,
    garmin_days_28: recent28.length,
    quality_flags: qualityFlags,
    quality_penalty: qualityPenalty,
    recent_activities: acts,
    goal_event_date: process.env["GOAL_EVENT_DATE"] ?? null,
  };
}

function computeQuality(activityDate: string, wellnessByDate: Map<string, any>): { flags: string[]; penalty: number } {
  const days = lastNDates(activityDate, 7);
  let missingDays = 0;
  let missingSleep = 0;
  let missingBodyBattery = 0;
  let hrvJump = false;
  let prevHrv: number | null = null;

  for (const d of days) {
    const row = wellnessByDate.get(d);
    if (!row) {
      missingDays++;
      continue;
    }
    if (typeof row?.sleep_score !== "number") missingSleep++;
    const bb = row?.body_battery_at_start ?? row?.body_battery_start ?? row?.body_battery_start_of_day ?? null;
    if (typeof bb !== "number") missingBodyBattery++;
    const hrv = hrvValue(row);
    if (prevHrv != null && hrv != null && Math.abs(hrv - prevHrv) >= 20) hrvJump = true;
    if (hrv != null) prevHrv = hrv;
  }

  const flags: string[] = [];
  if (missingDays > 0) flags.push("GARMIN_DAYS_MISSING");
  if (missingSleep > 0) flags.push("SLEEP_FIELDS_MISSING");
  if (missingBodyBattery > 0) flags.push("BB_FIELDS_MISSING");
  if (hrvJump) flags.push("HRV_IMPLAUSIBLE_JUMP");

  let penalty = 0;
  if (missingDays >= 2) penalty += 20;
  else if (missingDays === 1) penalty += 10;
  if (missingSleep >= 2) penalty += 10;
  else if (missingSleep === 1) penalty += 5;
  if (missingBodyBattery >= 2) penalty += 10;
  else if (missingBodyBattery === 1) penalty += 5;
  if (hrvJump) penalty += 10;

  return { flags, penalty: Math.min(35, penalty) };
}

function lastNDates(date: string, n: number): string[] {
  const base = new Date(`${date}T00:00:00Z`);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function previousDate(allSummaries: ActivitySummary[], wellnessByDate: Map<string, any>, activityDate: string): string | null {
  const dates = new Set<string>(allSummaries.map(a => a.date));
  for (const d of wellnessByDate.keys()) dates.add(d);
  const prior = [...dates].filter(d => d < activityDate).sort();
  return prior.length > 0 ? prior[prior.length - 1] : null;
}

function buildChanges(
  cur: TrainingRecommendationInput,
  curRec: RecommendationBlock,
  prev: TrainingRecommendationInput,
  prevRec: RecommendationBlock,
): RecommendationBlock["changes"] {
  const drivers: Array<{ key: string; delta: number; unit?: string }> = [];
  pushDelta(drivers, "TSB", cur.tsb, prev.tsb);
  pushDelta(drivers, "Readiness", cur.readiness_score, prev.readiness_score);
  pushDelta(drivers, "HRV 7d delta", cur.hrv_delta_7 ?? null, prev.hrv_delta_7 ?? null, "ms");
  pushDelta(drivers, "Sleep 7d avg", cur.sleep_avg_7 ?? null, prev.sleep_avg_7 ?? null);
  pushDelta(drivers, "Body Battery 7d avg", cur.body_battery_avg_7 ?? null, prev.body_battery_avg_7 ?? null);
  drivers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const stateChanged = curRec.state !== prevRec.state;
  const topDrivers = drivers.slice(0, 3);
  if (!stateChanged && topDrivers.length === 0) return undefined;
  return { state_changed: stateChanged, drivers: topDrivers };
}

function pushDelta(
  out: Array<{ key: string; delta: number; unit?: string }>,
  key: string,
  cur: number | null,
  prev: number | null,
  unit?: string,
): void {
  if (typeof cur !== "number" || typeof prev !== "number") return;
  const delta = Math.round((cur - prev) * 10) / 10;
  if (delta === 0) return;
  out.push({ key, delta, unit });
}

