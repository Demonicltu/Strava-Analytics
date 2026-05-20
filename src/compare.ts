/**
 * Compare & trend analysis across multiple crunched activities.
 * Reads _crunched.json files, aggregates metrics, sends to AI.
 *
 * Usage: npm run compare
 */
import { createInterface } from "readline";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import {
  ActivitySummary, avg, sum, round2, loadAllSummaries,
} from "./summary_utils.js";

let __dirname2: string;
try { __dirname2 = dirname(fileURLToPath(import.meta.url)); } catch { __dirname2 = process.cwd(); }
const BASE_DIR = existsSync(join(__dirname2, "..", "package.json")) ? join(__dirname2, "..") : process.cwd();
const ANALYSIS_DIR = join(BASE_DIR, "analysis");
const INSTRUCTIONS_PATH = join(BASE_DIR, "AI_COMPARE_INSTRUCTIONS.md");

// ─── Types ───

interface AnalyzeConfig {
  provider: "openai" | "gemini" | "groq" | "openrouter";
  apiKey: string;
  model: string;
}

// ─── Helpers ───

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}


// ─── Period boundaries ───

type Period = "week" | "month" | "3months" | "year" | "2years" | "custom";

function getPeriodBounds(period: Period, customDays?: number): { from: Date; to: Date; label: string } {
  const to = new Date();
  const from = new Date();
  switch (period) {
    case "week":    from.setDate(from.getDate() - 7);    return { from, to, label: "last_7_days" };
    case "month":   from.setMonth(from.getMonth() - 1);  return { from, to, label: "last_30_days" };
    case "3months": from.setMonth(from.getMonth() - 3);  return { from, to, label: "last_3_months" };
    case "year":    from.setFullYear(from.getFullYear() - 1); return { from, to, label: "last_12_months" };
    case "2years":  from.setFullYear(from.getFullYear() - 2); return { from, to, label: "last_2_years" };
    case "custom":  from.setDate(from.getDate() - (customDays || 90)); return { from, to, label: `last_${customDays}_days` };
  }
}

// ─── Aggregate ───

function buildComparison(activities: ActivitySummary[], period: string, periodFrom: Date, periodTo: Date): any {
  const inPeriod = activities.filter(a => {
    const d = new Date(a.date);
    return d >= periodFrom && d <= periodTo;
  });

  // Prior equal-length period for delta comparison
  const periodMs = periodTo.getTime() - periodFrom.getTime();
  const priorTo = new Date(periodFrom.getTime() - 1);
  const priorFrom = new Date(priorTo.getTime() - periodMs);
  const priorPeriod = activities.filter(a => {
    const d = new Date(a.date);
    return d >= priorFrom && d <= priorTo;
  });

  if (inPeriod.length === 0) return { error: "No activities in selected period" };

  const latest = [...inPeriod].sort((a, b) => b.date.localeCompare(a.date))[0];

  // Per-sport stats
  const sportGroups = new Map<string, ActivitySummary[]>();
  for (const a of inPeriod) {
    if (!sportGroups.has(a.sport)) sportGroups.set(a.sport, []);
    sportGroups.get(a.sport)!.push(a);
  }

  const sport_breakdown: Record<string, any> = {};
  for (const [sport, acts] of sportGroups) {
    const paces = acts.map(a => a.pace_sec_per_km).filter((v): v is number => v != null);
    const powers = acts.map(a => a.normalized_power ?? a.avg_power_w).filter((v): v is number => v != null);
    const hrs = acts.map(a => a.avg_hr).filter((v): v is number => v != null);
    const dist = sum(acts.map(a => a.distance_km));
    const timeSec = sum(acts.map(a => a.moving_time_sec));
    const elev = sum(acts.map(a => a.elevation_m));
    const tssTotal = sum(acts.map(a => a.tss));
    const trimpTotal = sum(acts.map(a => a.trimp));

    // Prior period same sport
    const prior = priorPeriod.filter(a => a.sport === sport);
    const priorHrs = prior.map(a => a.avg_hr).filter((v): v is number => v != null);
    const priorPaces = prior.map(a => a.pace_sec_per_km).filter((v): v is number => v != null);
    const priorPowers = prior.map(a => a.normalized_power ?? a.avg_power_w).filter((v): v is number => v != null);

    const avgPace = avg(paces);
    const priorAvgPace = avg(priorPaces);
    const avgPower = avg(powers);
    const priorAvgPower = avg(priorPowers);
    const avgHr = avg(hrs);
    const priorAvgHr = avg(priorHrs);

    sport_breakdown[sport] = {
      count: acts.length,
      total_distance_km: round2(dist),
      total_time_h: round2(timeSec / 3600),
      total_elevation_m: Math.round(elev),
      total_tss: tssTotal > 0 ? Math.round(tssTotal) : null,
      total_trimp: trimpTotal > 0 ? Math.round(trimpTotal) : null,
      avg_hr: avgHr,
      avg_hr_delta_vs_prior: avgHr && priorAvgHr ? Math.round(avgHr - priorAvgHr) : null,
      avg_pace_sec_per_km: avgPace,
      avg_pace_delta_vs_prior_sec: avgPace && priorAvgPace ? Math.round(avgPace - priorAvgPace) : null,
      avg_normalized_power_w: round2(avgPower),
      avg_power_delta_vs_prior_w: avgPower && priorAvgPower ? Math.round(avgPower - priorAvgPower) : null,
      prior_period_count: prior.length,
    };
  }

  // Weekly summary
  const weekMap = new Map<string, { distance_km: number; time_h: number; tss: number; trimp: number; acts: number }>();
  for (const a of inPeriod) {
    if (!weekMap.has(a.week)) weekMap.set(a.week, { distance_km: 0, time_h: 0, tss: 0, trimp: 0, acts: 0 });
    const w = weekMap.get(a.week)!;
    w.distance_km += a.distance_km;
    w.time_h += a.moving_time_sec / 3600;
    w.tss += a.tss ?? 0;
    w.trimp += a.trimp ?? 0;
    w.acts++;
  }
  const weekly_summaries = [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, d]) => ({
      week,
      activities: d.acts,
      distance_km: round2(d.distance_km),
      time_h: round2(d.time_h),
      tss: d.tss > 0 ? Math.round(d.tss) : null,
      trimp: d.trimp > 0 ? Math.round(d.trimp) : null,
    }));

  // Load trend
  const weekLoads = weekly_summaries.map(w => w.tss ?? w.trimp ?? 0).filter(v => v > 0);
  let load_trend = "stable";
  if (weekLoads.length >= 3) {
    const firstHalf = avg(weekLoads.slice(0, Math.ceil(weekLoads.length / 2))) ?? 0;
    const secondHalf = avg(weekLoads.slice(Math.floor(weekLoads.length / 2))) ?? 0;
    const delta = (secondHalf - firstHalf) / (firstHalf || 1) * 100;
    if (delta > 15) load_trend = "rising";
    else if (delta < -15) load_trend = "falling";
  }

  // VO2max trend
  const vo2Activities = inPeriod
    .filter(a => a.vo2max != null)
    .map(a => ({ date: a.date, sport: a.sport, vo2max: a.vo2max! }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Latest vs period avg (for the same sport)
  const latestSportActs = inPeriod.filter(a => a.sport === latest.sport);
  const periodAvgHr = avg(latestSportActs.map(a => a.avg_hr).filter((v): v is number => v != null));
  const periodAvgPace = avg(latestSportActs.map(a => a.pace_sec_per_km).filter((v): v is number => v != null));
  const periodAvgPower = avg(latestSportActs.map(a => a.normalized_power ?? a.avg_power_w).filter((v): v is number => v != null));
  const periodAvgTrimp = avg(latestSportActs.map(a => a.trimp).filter((v): v is number => v != null));

  // Best performances
  const bests: any = {};
  for (const [sport, acts] of sportGroups) {
    const byDist = [...acts].sort((a, b) => b.distance_km - a.distance_km)[0];
    const byPace = acts.filter(a => a.pace_sec_per_km != null).sort((a, b) => a.pace_sec_per_km! - b.pace_sec_per_km!)[0];
    const byPower = acts.filter(a => a.normalized_power != null).sort((a, b) => b.normalized_power! - a.normalized_power!)[0];
    const byTss = acts.filter(a => a.tss != null).sort((a, b) => b.tss! - a.tss!)[0];
    bests[sport] = {
      longest_distance_km: byDist ? { km: round2(byDist.distance_km), date: byDist.date, name: byDist.name } : null,
      best_pace_sec_per_km: byPace ? { pace: byPace.pace_sec_per_km, date: byPace.date, name: byPace.name } : null,
      peak_normalized_power_w: byPower ? { watts: byPower.normalized_power, date: byPower.date, name: byPower.name } : null,
      highest_tss: byTss ? { tss: byTss.tss, date: byTss.date, name: byTss.name } : null,
    };
  }

  return {
    _instructions: "All math is pre-computed. DO NOT recalculate. Interpret and write the comparison analysis per AI_COMPARE_INSTRUCTIONS.md.",
    period,
    period_range: {
      from: periodFrom.toISOString().slice(0, 10),
      to: periodTo.toISOString().slice(0, 10),
    },
    prior_period_range: {
      from: priorFrom.toISOString().slice(0, 10),
      to: priorTo.toISOString().slice(0, 10),
    },
    total_activities: inPeriod.length,
    load_trend,
    sport_breakdown,
    weekly_summaries,
    best_performances: bests,
    vo2max_trend: vo2Activities.length > 1 ? vo2Activities : null,
    latest_activity: {
      date: latest.date,
      sport: latest.sport,
      name: latest.name,
      distance_km: round2(latest.distance_km),
      moving_time_h: round2(latest.moving_time_sec / 3600),
      avg_hr: latest.avg_hr,
      tss: latest.tss,
      trimp: latest.trimp,
      pace_sec_per_km: latest.pace_sec_per_km,
      normalized_power_w: latest.normalized_power,
      hr_zones: latest.hr_zone_pct,
    },
    latest_vs_period_avg: {
      sport: latest.sport,
      hr_delta: latest.avg_hr && periodAvgHr ? Math.round(latest.avg_hr - periodAvgHr) : null,
      pace_delta_sec: latest.pace_sec_per_km && periodAvgPace ? Math.round(latest.pace_sec_per_km - periodAvgPace) : null,
      power_delta_w: (latest.normalized_power ?? latest.avg_power_w) && periodAvgPower
        ? Math.round((latest.normalized_power ?? latest.avg_power_w ?? 0) - periodAvgPower)
        : null,
      trimp_delta: latest.trimp && periodAvgTrimp ? Math.round(latest.trimp - periodAvgTrimp) : null,
      period_avg_hr: periodAvgHr,
      period_avg_pace_sec_per_km: periodAvgPace,
      period_avg_power_w: round2(periodAvgPower),
      period_avg_trimp: round2(periodAvgTrimp),
    },
  };
}

// ─── AI providers (mirrors analyze.ts) ───

function loadAllConfigs(): AnalyzeConfig[] {
  const configs: AnalyzeConfig[] = [];
  const geminiKey = process.env["GEMINI_API_KEY"];
  const groqKey = process.env["GROQ_API_KEY"];
  const openrouterKey = process.env["OPENROUTER_API_KEY"];
  const openaiKey = process.env["OPENAI_API_KEY"];
  if (geminiKey) configs.push({ provider: "gemini", apiKey: geminiKey, model: process.env["GEMINI_MODEL"] || "gemini-2.5-flash" });
  if (groqKey) configs.push({ provider: "groq", apiKey: groqKey, model: process.env["GROQ_MODEL"] || "llama-3.3-70b-versatile" });
  if (openrouterKey) configs.push({ provider: "openrouter", apiKey: openrouterKey, model: process.env["OPENROUTER_MODEL"] || "deepseek/deepseek-chat-v3-0324" });
  if (openaiKey) configs.push({ provider: "openai", apiKey: openaiKey, model: process.env["OPENAI_MODEL"] || "gpt-4o" });
  return configs;
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

const PROVIDER_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

async function callOpenAICompat(provider: string, apiKey: string, model: string, instructions: string, data: string): Promise<string> {
  const { default: axios } = await import("axios");
  const url = PROVIDER_URLS[provider] || PROVIDER_URLS.openai;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.post(url, {
        model,
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: `Write the fitness comparison and trend analysis based on this pre-computed data:\n\n${data}` },
        ],
        temperature: 0.4,
        max_tokens: 6000,
      }, { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 180_000 });
      return res.data.choices[0].message.content;
    } catch (err: any) {
      const s = err.response?.status;
      if ((s === 429 || s === 503) && attempt < 3) { await sleep(s === 503 ? 30000 : 60000); continue; }
      throw err;
    }
  }
  throw new Error("Max retries");
}

async function callGemini(apiKey: string, model: string, instructions: string, data: string): Promise<string> {
  const { default: axios } = await import("axios");
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt === 1) console.log(`\n🤖 Sending to Google Gemini (${model})...\n`);
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          system_instruction: { parts: [{ text: instructions }] },
          contents: [{ parts: [{ text: `Write the fitness comparison and trend analysis based on this pre-computed data:\n\n${data}` }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 6000 },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 180_000 }
      );
      return res.data.candidates[0].content.parts.map((p: any) => p.text).join("");
    } catch (err: any) {
      const s = err.response?.status;
      if ((s === 429 || s === 503) && attempt < 3) { await sleep(60000); continue; }
      throw err;
    }
  }
  throw new Error("Max retries");
}

async function analyzeWithFallback(configs: AnalyzeConfig[], instructions: string, data: string): Promise<{ analysis: string; provider: string; model: string }> {
  for (let i = 0; i < configs.length; i++) {
    const cfg = configs[i];
    try {
      console.log(`\n🤖 Sending to ${cfg.provider.toUpperCase()} (${cfg.model})...\n`);
      const analysis = cfg.provider === "gemini"
        ? await callGemini(cfg.apiKey, cfg.model, instructions, data)
        : await callOpenAICompat(cfg.provider, cfg.apiKey, cfg.model, instructions, data);
      return { analysis, provider: cfg.provider, model: cfg.model };
    } catch (err: any) {
      const next = configs[i + 1];
      if (next) { console.log(`⚠️  ${cfg.provider} failed. Falling back to ${next.provider}...`); }
      else throw err;
    }
  }
  throw new Error("All providers failed");
}

// ─── Main ───

async function main() {
  console.log("\n📊 Strava Fitness Comparison & Trend Analyzer\n");

  if (!existsSync(ANALYSIS_DIR)) {
    console.error("❌ No analysis/ directory. Run 'npm run bulk' first."); process.exit(1);
  }

  // Load all summaries via shared utility
  const allSummaries = loadAllSummaries(ANALYSIS_DIR);

  if (allSummaries.length === 0) {
    console.error("❌ No crunched files found. Run 'npm run bulk' or 'npm run crunch' first."); process.exit(1);
  }


  const dateRange = `${allSummaries[0].date} → ${allSummaries[allSummaries.length - 1].date}`;
  console.log(`✅ Loaded ${allSummaries.length} activities (${dateRange})\n`);

  // Period picker
  console.log("📅 Choose analysis period:");
  console.log("  1. This week (last 7 days)");
  console.log("  2. This month (last 30 days)");
  console.log("  3. Last 3 months");
  console.log("  4. This year (last 12 months)");
  console.log("  5. Last 2 years");
  console.log("  6. Custom (enter days)");

  const pick = await prompt("\n👉 Pick period (1-6): ");
  const periodMap: Record<string, Period> = {
    "1": "week", "2": "month", "3": "3months", "4": "year", "5": "2years",
  };

  let period: Period = periodMap[pick] || "month";
  let customDays: number | undefined;
  if (pick === "6") {
    const d = await prompt("   Enter number of days: ");
    customDays = parseInt(d, 10) || 90;
    period = "custom";
  }

  const { from, to, label } = getPeriodBounds(period, customDays);
  const inPeriod = allSummaries.filter(a => new Date(a.date) >= from && new Date(a.date) <= to);

  if (inPeriod.length === 0) {
    console.error(`❌ No activities found in the selected period (${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)})`);
    process.exit(1);
  }

  console.log(`\n📋 Found ${inPeriod.length} activities in ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`);

  // Build comparison context
  const comparison = buildComparison(allSummaries, label, from, to);
  const jsonPayload = JSON.stringify(comparison, null, 2);
  const tokens = Math.ceil(jsonPayload.length / 4);
  console.log(`   📦 Payload: ~${tokens.toLocaleString()} tokens`);

  // Load AI instructions
  if (!existsSync(INSTRUCTIONS_PATH)) {
    console.error("❌ AI_COMPARE_INSTRUCTIONS.md not found!"); process.exit(1);
  }
  const instructions = readFileSync(INSTRUCTIONS_PATH, "utf-8");

  // AI providers
  const configs = loadAllConfigs();
  if (configs.length === 0) {
    console.error("❌ No AI API key found. Add GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY or OPENAI_API_KEY to .env");
    process.exit(1);
  }
  console.log(`✅ AI providers: ${configs.map(c => `${c.provider.toUpperCase()} (${c.model})`).join(" → ")}`);

  // Send to AI
  let analysis: string;
  try {
    const result = await analyzeWithFallback(configs, instructions, jsonPayload);
    analysis = result.analysis;
    console.log(`   ✅ Generated by ${result.provider.toUpperCase()} (${result.model})`);
  } catch (err: any) {
    console.error("\n❌ AI error:", err.message);
    process.exit(1);
  }

  console.log("\n" + "═".repeat(80));
  console.log(analysis);
  console.log("═".repeat(80));

  // Save
  const dateTag = new Date().toISOString().slice(0, 10);
  const outputPath = join(ANALYSIS_DIR, `comparison_${label}_${dateTag}.md`);
  writeFileSync(outputPath, analysis, "utf-8");
  console.log(`\n✅ Analysis saved: ${outputPath}`);
}

main().catch((err) => { console.error("\n❌ Fatal:", err.message); process.exit(1); });

