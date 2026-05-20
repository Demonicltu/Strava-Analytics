/**
 * Weekly/monthly digest: multi-week trend report with overtraining warning.
 * Not tied to a single activity — gives a "Sunday review" of training patterns.
 *
 * Usage: npm run digest
 */
import { createInterface } from "readline";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { ActivitySummary, avg, sum, round2, loadAllSummaries } from "./summary_utils.js";

let __dirname2: string;
try { __dirname2 = dirname(fileURLToPath(import.meta.url)); } catch { __dirname2 = process.cwd(); }
const BASE_DIR = existsSync(join(__dirname2, "..", "package.json")) ? join(__dirname2, "..") : process.cwd();
const ANALYSIS_DIR = join(BASE_DIR, "analysis");
const INSTRUCTIONS_PATH = join(BASE_DIR, "AI_DIGEST_INSTRUCTIONS.md");

interface AnalyzeConfig {
  provider: "openai" | "gemini" | "groq" | "openrouter";
  apiKey: string;
  model: string;
}

function prompt(q: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => { rl.question(q, a => { rl.close(); r(a.trim()); }); });
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

function loadConfigs(): AnalyzeConfig[] {
  const c: AnalyzeConfig[] = [];
  const g = process.env["GEMINI_API_KEY"];
  const gr = process.env["GROQ_API_KEY"];
  const or = process.env["OPENROUTER_API_KEY"];
  const oa = process.env["OPENAI_API_KEY"];
  if (g) c.push({ provider: "gemini", apiKey: g, model: process.env["GEMINI_MODEL"] || "gemini-2.5-flash" });
  if (gr) c.push({ provider: "groq", apiKey: gr, model: process.env["GROQ_MODEL"] || "llama-3.3-70b-versatile" });
  if (or) c.push({ provider: "openrouter", apiKey: or, model: process.env["OPENROUTER_MODEL"] || "deepseek/deepseek-chat-v3-0324" });
  if (oa) c.push({ provider: "openai", apiKey: oa, model: process.env["OPENAI_MODEL"] || "gpt-4o" });
  return c;
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

// ─── Overtraining warning ───

interface OvertTrainingWarning {
  flag: boolean;
  reason: string;
  load_ratio: number | null;
  hrv_trend: string | null;
}

function checkOvertTraining(
  acts: ActivitySummary[],
  wellnessByDate: Map<string, any>,
): OvertTrainingWarning {
  // Acute load = sum TRIMP last 7 days, Chronic = avg weekly TRIMP last 4 weeks
  const now = new Date();
  const day7 = new Date(now); day7.setDate(day7.getDate() - 7);
  const day28 = new Date(now); day28.setDate(day28.getDate() - 28);

  const acuteFacts = acts.filter(a => new Date(a.date) >= day7);
  const chronicActs = acts.filter(a => new Date(a.date) >= day28);

  const acuteLoad = sum(acuteFacts.map(a => a.trimp ?? a.tss ?? 0));
  const chronicLoad = sum(chronicActs.map(a => a.trimp ?? a.tss ?? 0)) / 4; // per week avg

  const loadRatio = chronicLoad > 0 ? Math.round((acuteLoad / chronicLoad) * 100) / 100 : null;

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

  const reasons: string[] = [];
  if (loadRatio !== null && loadRatio > 1.3) reasons.push(`Load ratio ${loadRatio} > 1.3`);
  if (hrvTrend === "declining") reasons.push("HRV declining over last 7 days");

  return {
    flag: reasons.length > 0,
    reason: reasons.join("; ") || "None",
    load_ratio: loadRatio,
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

  // Recent Garmin wellness summary (last 7 days)
  const recentDates = [...wellnessByDate.keys()].sort().slice(-7);
  const wellnessSummary = recentDates.length > 0 ? {
    dates: recentDates,
    avg_hrv: avg(recentDates.map(d => wellnessByDate.get(d)?.hrv_last_night ?? null)),
    avg_sleep_score: avg(recentDates.map(d => wellnessByDate.get(d)?.sleep_score ?? null)),
    avg_resting_hr: avg(recentDates.map(d => wellnessByDate.get(d)?.resting_hr ?? null)),
    avg_body_battery_start: avg(recentDates.map(d => wellnessByDate.get(d)?.body_battery_start_of_day ?? null)),
    latest_training_status: wellnessByDate.get(recentDates[recentDates.length - 1])?.training_status ?? null,
    latest_acute_load: wellnessByDate.get(recentDates[recentDates.length - 1])?.acute_load ?? null,
    latest_load_ratio: wellnessByDate.get(recentDates[recentDates.length - 1])?.load_ratio ?? null,
  } : null;

  const overtTraining = checkOvertTraining(acts, wellnessByDate);
  const racePrediction = racePredictions(acts);

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

    const weeksWithData = weeklyBreakdown;
    const adherence = weeksWithData.map(w => {
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
    race_predictions: racePrediction,
    garmin_wellness_summary: wellnessSummary,
    ...(trainingAdherence ? { training_plan_adherence: trainingAdherence } : {}),
  };
}

// ─── AI call with fallback ───

const PROVIDER_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

async function callAI(cfg: AnalyzeConfig, instructions: string, data: string): Promise<string> {
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

  // Load Garmin wellness if available
  const wellnessPath = join(ANALYSIS_DIR, "garmin_wellness.json");
  const wellnessByDate: Map<string, any> = new Map();
  if (existsSync(wellnessPath)) {
    try {
      const raw = JSON.parse(readFileSync(wellnessPath, "utf-8"));
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
    console.log(`\n⚠️  OVERTRAINING WARNING: ${digest.overtraining_warning.reason}`);
    console.log(`   Load ratio: ${digest.overtraining_warning.load_ratio ?? "N/A"} | HRV trend: ${digest.overtraining_warning.hrv_trend ?? "N/A"}\n`);
  }

  const jsonPayload = JSON.stringify(digest, null, 2);
  console.log(`   📦 Payload: ~${Math.ceil(jsonPayload.length / 4).toLocaleString()} tokens`);

  // Load instructions
  if (!existsSync(INSTRUCTIONS_PATH)) { console.error("❌ AI_DIGEST_INSTRUCTIONS.md not found!"); process.exit(1); }
  const instructions = readFileSync(INSTRUCTIONS_PATH, "utf-8");

  const configs = loadConfigs();
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



