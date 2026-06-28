/**
 * Weekly/monthly digest: multi-week trend report with overtraining warning.
 * Not tied to a single activity — gives a "Sunday review" of training patterns.
 *
 * Usage: npm run digest
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import "dotenv/config";
import { ActivitySummary, avg, sum, round2, loadAllSummaries } from "./summary_utils.js";
import { computeLatestLoadMetrics } from "./training_intelligence.js";
import { buildTrainingRecommendations } from "./recommendations.js";
import { prompt } from "./cli_utils.js";
import { computeReadiness, hrvValue, meanHalfDelta } from "./readiness_utils.js";
import { loadAllConfigs, type AiConfig } from "./ai_client.js";
import { resolveBaseDir } from "./paths.js";

const BASE_DIR = resolveBaseDir(import.meta.url);
const ANALYSIS_DIR = join(BASE_DIR, "analysis");
const INSTRUCTIONS_PATH = join(BASE_DIR, "AI_DIGEST_INSTRUCTIONS.md");

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }


function buildPlanSuggestions(ctl: number, readiness: number | null, goalDate: string | null): any | null {
  if (!goalDate) return null;
  const goal = new Date(goalDate);
  if (isNaN(goal.getTime())) return null;

  const now = new Date();
  const daysLeft = Math.max(0, Math.floor((goal.getTime() - now.getTime()) / 86_400_000));
  if (daysLeft === 0) return null;

  const weeks = Math.min(8, Math.max(1, Math.ceil(daysLeft / 7)));
  const baseRamp = readiness != null && readiness < 60 ? 0.05 : readiness != null && readiness >= 75 ? 0.1 : 0.075;
  const out: any[] = [];
  let curCtl = Math.max(ctl, 1);

  for (let i = 1; i <= weeks; i++) {
    const isTaper = i === weeks || i === weeks - 1;
    const isDeload = !isTaper && i % 4 === 0;
    if (isTaper) curCtl *= 0.9;
    else if (isDeload) curCtl *= 0.92;
    else curCtl *= (1 + baseRamp);

    out.push({
      week_index: i,
      phase: isTaper ? "taper" : isDeload ? "deload" : "build",
      target_ctl: Math.round(curCtl * 10) / 10,
      target_weekly_tss: Math.round(curCtl * 7),
      notes: isTaper
        ? "Reduce load to freshen up for goal event"
        : isDeload
          ? "Planned deload week"
          : `Build week (${Math.round(baseRamp * 100)}% ramp)`,
    });
  }

  return {
    goal_event_date: goalDate,
    days_to_event: daysLeft,
    horizon_weeks: weeks,
    ramp_rate: Math.round(baseRamp * 1000) / 10,
    weeks: out,
  };
}

// ─── HR Zone distribution helper ───

function aggregateHrZones(acts: ActivitySummary[]): Record<string, number> | null {
  const totals: Record<string, number> = {};
  let count = 0;
  for (const a of acts) {
    if (!a.hr_zone_pct) continue;
    for (const [z, v] of Object.entries(a.hr_zone_pct)) {
      totals[z] = (totals[z] ?? 0) + v;
    }
    count++;
  }
  if (count === 0) return null;
  return Object.fromEntries(Object.entries(totals).map(([z, v]) => [z, Math.round(v / count)]));
}

// ─── EWMA CTL/ATL/TSB (Banister model) ───

/**
 * Compute CTL (Chronic Training Load, τ=42d), ATL (Acute Training Load, τ=7d),
 * and TSB (Training Stress Balance = CTL - ATL) using exponentially weighted moving averages.
 * Returns the current (latest day) values.
 */
function computeCtlAtlTsb(acts: ActivitySummary[]): { ctl: number; atl: number; tsb: number; acwr: number | null } {
  return computeLatestLoadMetrics(acts);
}

// ─── Overtraining warning ───

interface OvertTrainingWarning {
  flag: boolean;
  watch_zone: boolean;
  reason: string;
  /** ACWR = ATL / CTL (EWMA-based). Safe zone: 0.8–1.3 | Watch zone: 1.3–1.5 | Danger: >1.5 */
  load_ratio: number | null;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  hrv_trend: string | null;
}

function checkOvertTraining(
  acts: ActivitySummary[],
  wellnessByDate: Map<string, any>,
): OvertTrainingWarning {
  // EWMA-based ACWR: ATL (7d) / CTL (42d)
  const { ctl, atl, tsb, acwr } = computeCtlAtlTsb(acts);

  // HRV trend from wellness (last 7 days)
  const recentDates = [...wellnessByDate.keys()].sort().slice(-7);
  const hrvValues = recentDates.map(d => wellnessByDate.get(d)?.hrv_last_night).filter((v): v is number => v != null);
  let hrvTrend: string | null = null;
  if (hrvValues.length >= 3) {
    const first = hrvValues.slice(0, Math.ceil(hrvValues.length / 2));
    const last = hrvValues.slice(Math.floor(hrvValues.length / 2));
    const fAvg = first.reduce((a, b) => a + b, 0) / first.length;
    const lAvg = last.reduce((a, b) => a + b, 0) / last.length;
    const delta = lAvg - fAvg;
    if (delta < -3) hrvTrend = "declining";
    else if (delta > 3) hrvTrend = "improving";
    else hrvTrend = "stable";
  }

  // Thresholds: 0.8–1.3 = sweet spot, 1.3–1.5 = watch zone, >1.5 = danger
  const dangerReasons: string[] = [];
  const watchReasons: string[] = [];
  if (acwr !== null && acwr > 1.5) dangerReasons.push(`ACWR ${acwr} > 1.5 (danger zone — injury risk elevated)`);
  else if (acwr !== null && acwr > 1.3) watchReasons.push(`ACWR ${acwr} in 1.3–1.5 watch zone — monitor closely`);
  if (hrvTrend === "declining") dangerReasons.push("HRV declining over last 7 days");

  const flag = dangerReasons.length > 0;
  const watchZone = !flag && watchReasons.length > 0;

  return {
    flag,
    watch_zone: watchZone,
    reason: [...dangerReasons, ...watchReasons].join("; ") || "None",
    load_ratio: acwr,
    ctl: ctl > 0 ? ctl : null,
    atl: atl > 0 ? atl : null,
    tsb: ctl > 0 ? tsb : null,
    hrv_trend: hrvTrend,
  };
}

// ─── Race prediction (Riegel formula) ───

function racePredictions(acts: ActivitySummary[]): Record<string, string> | null {
  // Find best 5K-ish pace (shortest distance run with decent HR)
  const runs = acts
    .filter(a => a.sport === "Run" && a.pace_sec_per_km != null && a.distance_km >= 3)
    .sort((a, b) => (a.pace_sec_per_km ?? 999) - (b.pace_sec_per_km ?? 999));

  if (runs.length === 0) return null;

  const best = runs[0];
  const basePaceSec = best.pace_sec_per_km!;
  const baseDistKm = best.distance_km;

  // Riegel: T2 = T1 * (D2/D1)^1.06
  const predict = (targetKm: number): string => {
    const t1 = basePaceSec * baseDistKm; // total seconds for base
    const t2 = t1 * Math.pow(targetKm / baseDistKm, 1.06);
    const totalSec = Math.round(t2);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const results: Record<string, string> = {};
  if (baseDistKm < 5) results["5K"] = predict(5);
  if (baseDistKm < 10) results["10K"] = predict(10);
  if (baseDistKm < 21.1) results["Half Marathon"] = predict(21.1);
  if (baseDistKm < 42.2) results["Marathon"] = predict(42.2);
  results["_based_on"] = `${best.name} (${round2(best.distance_km)} km @ ${Math.floor(basePaceSec / 60)}:${String(Math.round(basePaceSec % 60)).padStart(2, "0")}/km on ${best.date})`;

  return Object.keys(results).length > 1 ? results : null;
}

// ─── Digest builder ───

function buildDigest(allSummaries: ActivitySummary[], weeks: number, wellnessByDate: Map<string, any>): any {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - weeks * 7);

  const acts = allSummaries.filter(a => new Date(a.date) >= from);
  if (acts.length === 0) return { error: "No activities in selected period" };

  // Per-week breakdown
  const weekMap = new Map<string, ActivitySummary[]>();
  for (const a of acts) {
    const w = a.week;
    if (!weekMap.has(w)) weekMap.set(w, []);
    weekMap.get(w)!.push(a);
  }

  const weeklyBreakdown = [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, wActs]) => {
      const bySport: Record<string, any> = {};
      for (const [sp, sActs] of Object.entries(
        wActs.reduce((acc, a) => { (acc[a.sport] ??= []).push(a); return acc; }, {} as Record<string, ActivitySummary[]>)
      )) {
        bySport[sp] = {
          count: sActs.length,
          distance_km: round2(sum(sActs.map(a => a.distance_km))),
          time_h: round2(sum(sActs.map(a => a.moving_time_sec)) / 3600),
          elevation_m: Math.round(sum(sActs.map(a => a.elevation_m))),
          avg_hr: avg(sActs.map(a => a.avg_hr)),
          trimp: Math.round(sum(sActs.map(a => a.trimp ?? 0))),
          tss: Math.round(sum(sActs.map(a => a.tss ?? 0))),
        };
      }
      return {
        week,
        total_activities: wActs.length,
        total_distance_km: round2(sum(wActs.map(a => a.distance_km))),
        total_time_h: round2(sum(wActs.map(a => a.moving_time_sec)) / 3600),
        total_elevation_m: Math.round(sum(wActs.map(a => a.elevation_m))),
        total_trimp: Math.round(sum(wActs.map(a => a.trimp ?? 0))),
        total_tss: Math.round(sum(wActs.map(a => a.tss ?? 0))),
        by_sport: bySport,
        hr_zones_avg: aggregateHrZones(wActs),
      };
    });

  // Per-sport aggregate
  const sportGroups: Record<string, ActivitySummary[]> = {};
  for (const a of acts) { (sportGroups[a.sport] ??= []).push(a); }

  const sportSummary: Record<string, any> = {};
  for (const [sp, sActs] of Object.entries(sportGroups)) {
    sportSummary[sp] = {
      count: sActs.length,
      total_distance_km: round2(sum(sActs.map(a => a.distance_km))),
      total_time_h: round2(sum(sActs.map(a => a.moving_time_sec)) / 3600),
      total_elevation_m: Math.round(sum(sActs.map(a => a.elevation_m))),
      avg_hr: avg(sActs.map(a => a.avg_hr)),
      avg_pace_sec_per_km: avg(sActs.map(a => a.pace_sec_per_km)),
      avg_normalized_power_w: avg(sActs.map(a => a.normalized_power ?? a.avg_power_w)),
      total_trimp: Math.round(sum(sActs.map(a => a.trimp ?? 0))),
      total_tss: Math.round(sum(sActs.map(a => a.tss ?? 0))),
      hr_zones_avg: aggregateHrZones(sActs),
    };
  }

  // Recent Garmin wellness summary (last 7 / 28 days)
  const allWellnessDates = [...wellnessByDate.keys()].sort();
  const recentDates = allWellnessDates.slice(-7);
  const recentDates28 = allWellnessDates.slice(-28);
  const readinessSeries = recentDates.map(d => {
    const r = computeReadiness(wellnessByDate.get(d));
    return { date: d, score: r.score, label: r.label, components: r.components };
  }).filter(x => x.score != null);
  const latestReadiness = readinessSeries.length > 0 ? readinessSeries[readinessSeries.length - 1] : null;

  const readinessSeries28 = recentDates28.map(d => {
    const r = computeReadiness(wellnessByDate.get(d));
    return r.score;
  }).filter((v): v is number => v != null);

  const hrv7 = recentDates.map(d => hrvValue(wellnessByDate.get(d))).filter((v): v is number => v != null);
  const hrvDelta7 = meanHalfDelta(hrv7);
  const hrvTrend = hrvDelta7 == null ? null : hrvDelta7 <= -3 ? "declining" : hrvDelta7 >= 3 ? "improving" : "stable";

  const sleepAvg7 = avg(recentDates.map(d => wellnessByDate.get(d)?.sleep_score ?? null));
  const sleepAvg28 = avg(recentDates28.map(d => wellnessByDate.get(d)?.sleep_score ?? null));
  const bbAvg7 = avg(recentDates.map(d => wellnessByDate.get(d)?.body_battery_start_of_day ?? null));
  const bbAvg28 = avg(recentDates28.map(d => wellnessByDate.get(d)?.body_battery_start_of_day ?? null));

  const wellnessSummary = recentDates.length > 0 ? {
    dates: recentDates,
    avg_hrv: avg(recentDates.map(d => hrvValue(wellnessByDate.get(d)) ?? null)),
    avg_sleep_score: sleepAvg7,
    avg_resting_hr: avg(recentDates.map(d => wellnessByDate.get(d)?.resting_hr ?? null)),
    avg_body_battery_start: bbAvg7,
    avg_sleep_score_28d: sleepAvg28,
    avg_body_battery_start_28d: bbAvg28,
    readiness_avg_7d: avg(readinessSeries.map(r => r.score)),
    readiness_avg_28d: avg(readinessSeries28),
    garmin_days_7d: recentDates.length,
    garmin_days_28d: recentDates28.length,
    hrv_delta_7d: hrvDelta7 != null ? Math.round(hrvDelta7 * 10) / 10 : null,
    hrv_trend_7d: hrvTrend,
    latest_training_status: wellnessByDate.get(recentDates[recentDates.length - 1])?.training_status ?? null,
    latest_acute_load: wellnessByDate.get(recentDates[recentDates.length - 1])?.acute_load ?? null,
    latest_load_ratio: wellnessByDate.get(recentDates[recentDates.length - 1])?.load_ratio ?? null,
    latest_readiness_score: latestReadiness?.score ?? null,
    latest_readiness_label: latestReadiness?.label ?? null,
    avg_readiness_score: avg(readinessSeries.map(r => r.score)),
    readiness_series: readinessSeries,
  } : null;

  const overtTraining = checkOvertTraining(acts, wellnessByDate);
  const racePrediction = racePredictions(acts);

  // CTL/ATL/TSB over full history (needs all history for EWMA warmup, not just digest window)
  const { ctl, atl, tsb } = computeCtlAtlTsb(allSummaries);
  const planSuggestions = buildPlanSuggestions(ctl, latestReadiness?.score ?? null, process.env["GOAL_EVENT_DATE"] ?? null);
  const trainingRecommendations = buildTrainingRecommendations({
    ctl,
    atl,
    tsb,
    readiness_score: latestReadiness?.score ?? null,
    readiness_label: latestReadiness?.label ?? null,
    hrv_trend: hrvTrend,
    hrv_delta_7: hrvDelta7,
    sleep_score: wellnessSummary?.avg_sleep_score ?? null,
    body_battery: wellnessSummary?.avg_body_battery_start ?? null,
    readiness_avg_7: wellnessSummary?.readiness_avg_7d ?? null,
    readiness_avg_28: wellnessSummary?.readiness_avg_28d ?? null,
    sleep_avg_7: wellnessSummary?.avg_sleep_score ?? null,
    sleep_avg_28: wellnessSummary?.avg_sleep_score_28d ?? null,
    body_battery_avg_7: wellnessSummary?.avg_body_battery_start ?? null,
    body_battery_avg_28: wellnessSummary?.avg_body_battery_start_28d ?? null,
    garmin_days_7: wellnessSummary?.garmin_days_7d ?? null,
    garmin_days_28: wellnessSummary?.garmin_days_28d ?? null,
    recent_activities: acts,
    goal_event_date: process.env["GOAL_EVENT_DATE"] ?? null,
  });

  // Training plan adherence (from .env — optional)
  const weeklyTargets: any = {};
  const tgtKm = process.env["WEEKLY_TARGET_KM"] ? parseFloat(process.env["WEEKLY_TARGET_KM"]) : null;
  const tgtHours = process.env["WEEKLY_TARGET_HOURS"] ? parseFloat(process.env["WEEKLY_TARGET_HOURS"]) : null;
  const tgtElev = process.env["WEEKLY_TARGET_ELEVATION_M"] ? parseFloat(process.env["WEEKLY_TARGET_ELEVATION_M"]) : null;

  let trainingAdherence: any = null;
  if (tgtKm || tgtHours || tgtElev) {
    weeklyTargets.km = tgtKm;
    weeklyTargets.hours = tgtHours;
    weeklyTargets.elevation_m = tgtElev;

    const adherence = weeklyBreakdown.map(w => {
      const a: Record<string, any> = { week: w.week };
      if (tgtKm) { a.km_actual = w.total_distance_km; a.km_target = tgtKm; a.km_pct = round2(((w.total_distance_km ?? 0) / tgtKm) * 100); }
      if (tgtHours) { a.hours_actual = w.total_time_h; a.hours_target = tgtHours; a.hours_pct = round2(((w.total_time_h ?? 0) / tgtHours) * 100); }
      if (tgtElev) { a.elevation_actual = w.total_elevation_m; a.elevation_target = tgtElev; a.elevation_pct = round2((w.total_elevation_m / tgtElev) * 100); }
      return a;
    });

    const completedWeeks = adherence.length;
    const avgKmPct = tgtKm ? round2(avg(adherence.map((a: any) => a.km_pct ?? null))) : null;
    const avgHoursPct = tgtHours ? round2(avg(adherence.map((a: any) => a.hours_pct ?? null))) : null;
    const avgElevPct = tgtElev ? round2(avg(adherence.map((a: any) => a.elevation_pct ?? null))) : null;

    trainingAdherence = {
      targets: weeklyTargets,
      weeks: adherence,
      summary: { completed_weeks: completedWeeks, avg_km_compliance_pct: avgKmPct, avg_hours_compliance_pct: avgHoursPct, avg_elevation_compliance_pct: avgElevPct },
    };
  }

  return {
    _instructions: "All math is pre-computed. Interpret and write the digest per AI_DIGEST_INSTRUCTIONS.md.",
    period_weeks: weeks,
    period_range: { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) },
    total_activities: acts.length,
    sport_summary: sportSummary,
    weekly_breakdown: weeklyBreakdown,
    overtraining_warning: overtTraining,
    /** CTL/ATL/TSB — Banister model, EWMA over full training history.
     *  CTL (τ=42d) = Fitness, ATL (τ=7d) = Fatigue, TSB = Form (CTL-ATL).
     *  TSB>+10 = fresh/undertrained, -10 to +10 = optimal, <-10 = fatigued */
    fitness_fatigue: (ctl !== null && ctl > 0) ? {
      ctl_fitness: ctl,
      atl_fatigue: atl,
      tsb_form: tsb,
      acwr: overtTraining.load_ratio,
      tsb_label: (tsb ?? 0) > 10 ? "Fresh / Undertrained" : (tsb ?? 0) >= -10 ? "Optimal Training Form" : "Fatigued — consider recovery",
      readiness_score: latestReadiness?.score ?? null,
      readiness_label: latestReadiness?.label ?? null,
    } : null,
    race_predictions: racePrediction,
    garmin_wellness_summary: wellnessSummary,
    training_plan_suggestions: planSuggestions,
    training_recommendations: trainingRecommendations,
    ...(trainingAdherence ? { training_plan_adherence: trainingAdherence } : {}),
  };
}

// ─── AI call with fallback ───

const PROVIDER_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

async function callAI(cfg: AiConfig, instructions: string, data: string): Promise<string> {
  const { default: axios } = await import("axios");
  const msg = `Write the weekly training digest based on this pre-computed data:\n\n${data}`;

  if (cfg.provider === "gemini") {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`, { system_instruction: { parts: [{ text: instructions }] }, contents: [{ parts: [{ text: msg }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 6000 } }, { headers: { "Content-Type": "application/json" }, timeout: 180_000 });
        return res.data.candidates[0].content.parts.map((p: any) => p.text).join("");
      } catch (err: any) {
        const s = err.response?.status;
        if ((s === 429 || s === 503) && attempt < 3) { await sleep(60000); continue; }
        throw err;
      }
    }
    throw new Error("Gemini max retries");
  }

  const url = PROVIDER_URLS[cfg.provider] || PROVIDER_URLS.openai;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.post(url, { model: cfg.model, messages: [{ role: "system", content: instructions }, { role: "user", content: msg }], temperature: 0.4, max_tokens: 6000 }, { headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" }, timeout: 180_000 });
      return res.data.choices[0].message.content;
    } catch (err: any) {
      const s = err.response?.status;
      if ((s === 429 || s === 503) && attempt < 3) { await sleep(s === 503 ? 30000 : 60000); continue; }
      throw err;
    }
  }
  throw new Error("Max retries");
}

// ─── Main ───

async function main() {
  console.log("\n📅 Training Digest — Weekly/Monthly Review\n");

  if (!existsSync(ANALYSIS_DIR)) { console.error("❌ No analysis/ directory."); process.exit(1); }

  const allSummaries = loadAllSummaries(ANALYSIS_DIR);
  if (allSummaries.length === 0) { console.error("❌ No crunched files. Run 'npm run bulk' first."); process.exit(1); }

  console.log(`✅ Loaded ${allSummaries.length} activities (${allSummaries[0].date} → ${allSummaries[allSummaries.length - 1].date})\n`);

  // Load wellness data (Garmin or Samsung) if available
  const garminWPath = join(ANALYSIS_DIR, "garmin_wellness.json");
  const samsungWPath = join(ANALYSIS_DIR, "samsung_wellness.json");
  const wellnessFilePath = existsSync(garminWPath) ? garminWPath : existsSync(samsungWPath) ? samsungWPath : null;
  const wellnessByDate: Map<string, any> = new Map();
  if (wellnessFilePath) {
    try {
      const raw = JSON.parse(readFileSync(wellnessFilePath, "utf-8"));
      for (const [d, v] of Object.entries(raw)) wellnessByDate.set(d, v);
      console.log(`   🛌 Garmin wellness loaded (${wellnessByDate.size} days)\n`);
    } catch { /* ignore */ }
  }

  console.log("📅 Choose digest period:");
  console.log("  1. Last 2 weeks");
  console.log("  2. Last 4 weeks (1 month)");
  console.log("  3. Last 8 weeks (2 months)");
  console.log("  4. Last 12 weeks (3 months)");
  console.log("  5. Custom (weeks)");

  const pick = await prompt("\n👉 Pick period (1-5): ");
  const weeksMap: Record<string, number> = { "1": 2, "2": 4, "3": 8, "4": 12 };
  let weeks = weeksMap[pick] ?? 4;

  if (pick === "5") {
    const w = await prompt("   Enter number of weeks: ");
    weeks = parseInt(w, 10) || 4;
  }

  console.log(`\n📊 Building ${weeks}-week digest...\n`);
  const digest = buildDigest(allSummaries, weeks, wellnessByDate);

  if (digest.error) { console.error("❌", digest.error); process.exit(1); }
  if (digest.overtraining_warning.flag) {
    console.log(`\n⚠️  OVERTRAINING DANGER: ${digest.overtraining_warning.reason}`);
    console.log(`   ACWR: ${digest.overtraining_warning.load_ratio ?? "N/A"} | HRV trend: ${digest.overtraining_warning.hrv_trend ?? "N/A"}\n`);
  } else if (digest.overtraining_warning.watch_zone) {
    console.log(`\n⚡ WATCH ZONE: ${digest.overtraining_warning.reason}`);
    console.log(`   ACWR: ${digest.overtraining_warning.load_ratio ?? "N/A"} | HRV trend: ${digest.overtraining_warning.hrv_trend ?? "N/A"}\n`);
  }

  const jsonPayload = JSON.stringify(digest, null, 2);
  console.log(`   📦 Payload: ~${Math.ceil(jsonPayload.length / 4).toLocaleString()} tokens`);

  // Load instructions
  if (!existsSync(INSTRUCTIONS_PATH)) { console.error("❌ AI_DIGEST_INSTRUCTIONS.md not found!"); process.exit(1); }
  const instructions = readFileSync(INSTRUCTIONS_PATH, "utf-8");

  const configs = loadAllConfigs();
  if (configs.length === 0) { console.error("❌ No AI API key found."); process.exit(1); }
  console.log(`✅ AI providers: ${configs.map(c => `${c.provider.toUpperCase()} (${c.model})`).join(" → ")}`);

  let analysis = "";
  for (let i = 0; i < configs.length; i++) {
    try {
      console.log(`\n🤖 Sending to ${configs[i].provider.toUpperCase()} (${configs[i].model})...\n`);
      analysis = await callAI(configs[i], instructions, jsonPayload);
      console.log(`✅ Generated by ${configs[i].provider.toUpperCase()}`);
      break;
    } catch (err: any) {
      const next = configs[i + 1];
      if (next) { console.log(`⚠️  ${configs[i].provider} failed: ${err.message}. Trying ${next.provider}...`); }
      else { console.error("❌ All AI providers failed:", err.message); process.exit(1); }
    }
  }

  console.log("\n" + "═".repeat(80));
  console.log(analysis);
  console.log("═".repeat(80));

  const dateTag = new Date().toISOString().slice(0, 10);
  const outPath = join(ANALYSIS_DIR, `digest_${weeks}w_${dateTag}.md`);
  writeFileSync(outPath, analysis, "utf-8");
  console.log(`\n✅ Digest saved: ${outPath}`);
}

main().catch(err => { console.error("\n❌ Fatal:", err.message); process.exit(1); });



