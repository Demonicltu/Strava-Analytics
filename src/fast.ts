/**
 * Fast mode: fetch → crunch → analyze → update in ONE command.
 * Just pick the activity and everything runs automatically.
 *
 * Usage: npm run fast
 */
import { createInterface } from "readline";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { loadConfig, loadRiderConfig } from "./config.js";
import { getAccessToken } from "./auth.js";
import { createStravaClient, rateLimitDelay } from "./client.js";
import { fetchEnrichedActivity } from "./details.js";
import { crunchActivity, formatDuration } from "./crunch.js";
import { buildDescription, buildPrivateNotes } from "./format.js";
import { fetchWeatherMultiPoint, buildWeatherWaypoints } from "./weather.js";
import type { SummaryActivity } from "./types.js";
import type { AxiosInstance } from "axios";

let __dirname: string;
try { __dirname = dirname(fileURLToPath(import.meta.url)); } catch { __dirname = process.cwd(); }
// In bundled mode, resolve dirs relative to cwd; in dev mode, relative to source
const BASE_DIR = existsSync(join(__dirname, "..", "package.json")) ? join(__dirname, "..") : process.cwd();
const OUTPUT_DIR = join(BASE_DIR, "output");
const ANALYSIS_DIR = join(BASE_DIR, "analysis");
const INSTRUCTIONS_PATH = join(__dirname, "..", "..", ".github", "AI_ANALYSIS_INSTRUCTIONS.md");

function getInstructions(): string {
  // Bundled mode: embedded at build time via esbuild define
  const embedded = (process.env as any).EMBEDDED_AI_INSTRUCTIONS;
  if (typeof embedded === "string" && embedded.length > 100) return embedded;
  // Dev mode: read from file
  if (existsSync(INSTRUCTIONS_PATH)) return readFileSync(INSTRUCTIONS_PATH, "utf-8");
  // Fallback: try cwd
  const cwdPath = join(process.cwd(), "AI_ANALYSIS_INSTRUCTIONS.md");
  if (existsSync(cwdPath)) return readFileSync(cwdPath, "utf-8");
  return "";
}

// ─── Helpers ───

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

/** Strip excessive repeated characters (█░▓ spam) and duplicate markdown blocks */
function sanitizeAIOutput(text: string): string {
  let cleaned = text.replace(/(.)\1{9,}/g, (match, char) => char.repeat(Math.min(match.length, 10)));
  cleaned = cleaned.replace(/^[█░▓\s]{20,}$/gm, "");
  const marker = "## 🏆 POGAČAR SCORE";
  const firstIdx = cleaned.indexOf(marker);
  const secondIdx = firstIdx >= 0 ? cleaned.indexOf(marker, firstIdx + 1) : -1;
  if (secondIdx > 0) cleaned = cleaned.substring(0, secondIdx).trimEnd();
  return cleaned;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Step 1: Fetch ───

async function fetchActivitiesPage(client: AxiosInstance, perPage: number, page: number): Promise<SummaryActivity[]> {
  await rateLimitDelay();
  const response = await client.get("/athlete/activities", { params: { per_page: perPage, page } });
  return response.data as SummaryActivity[];
}

function buildStreamTable(enriched: any): object[] {
  const s = enriched.streams;
  const timeData = s.time?.data as number[] | undefined;
  if (!timeData || timeData.length === 0) return [];
  const rows: object[] = [];
  for (let i = 0; i < timeData.length; i++) {
    const row: Record<string, any> = { time_seconds: timeData[i] };
    if (s.distance) row["distance_meters"] = s.distance.data[i];
    if (s.velocity_smooth) { const speed = s.velocity_smooth.data[i] as number; row["speed_ms"] = speed; row["speed_kmh"] = Math.round(speed * 3.6 * 100) / 100; }
    if (s.heartrate) row["heartrate_bpm"] = s.heartrate.data[i];
    if (s.watts) row["power_watts"] = s.watts.data[i];
    if (s.cadence) row["cadence_rpm"] = s.cadence.data[i];
    if (s.altitude) row["altitude_meters"] = s.altitude.data[i];
    if (s.grade_smooth) row["grade_percent"] = s.grade_smooth.data[i];
    if (s.temp) row["temperature_c"] = s.temp.data[i];
    if (s.latlng) { const c = s.latlng.data[i] as [number, number]; if (c) { row["latitude"] = c[0]; row["longitude"] = c[1]; } }
    if (s.moving) row["is_moving"] = s.moving.data[i];
    rows.push(row);
  }
  return rows;
}

// ─── Step 3: Analyze (AI) ───

function loadAIConfig() {
  const configs: { provider: string; apiKey: string; model: string }[] = [];
  const geminiKey = process.env["GEMINI_API_KEY"];
  const groqKey = process.env["GROQ_API_KEY"];
  const openrouterKey = process.env["OPENROUTER_API_KEY"];
  const openaiKey = process.env["OPENAI_API_KEY"];

  if (geminiKey) configs.push({ provider: "gemini", apiKey: geminiKey, model: process.env["GEMINI_MODEL"] || "gemini-2.5-flash" });
  if (groqKey) configs.push({ provider: "groq", apiKey: groqKey, model: process.env["GROQ_MODEL"] || "llama-3.3-70b-versatile" });
  if (openrouterKey) configs.push({ provider: "openrouter", apiKey: openrouterKey, model: process.env["OPENROUTER_MODEL"] || "deepseek/deepseek-chat-v3-0324" });
  if (openaiKey) configs.push({ provider: "openai", apiKey: openaiKey, model: process.env["OPENAI_MODEL"] || "gpt-4o" });

  return configs.length > 0 ? configs : null;
}

const PROVIDER_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

async function callAI(provider: string, apiKey: string, model: string, instructions: string, data: string): Promise<string> {
  const { default: axios } = await import("axios");
  const userMsg = `Write the full activity analysis based on this pre-computed data. All math is done — just interpret and write:\n\n${data}`;

  // OpenAI-compatible providers (OpenAI, Groq, OpenRouter)
  if (provider !== "gemini") {
    const url = PROVIDER_URLS[provider] || PROVIDER_URLS.openai;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await axios.post(url, { model, messages: [{ role: "system", content: instructions }, { role: "user", content: userMsg }], temperature: 0.4, max_tokens: 8000 }, { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 180_000 });
        return res.data.choices[0].message.content;
      } catch (err: any) {
        const status = err.response?.status;
        if ((status === 429 || status === 503) && attempt < 3) {
          const wait = status === 503 ? 30 : 60;
          console.log(`   ⏳ ${provider.toUpperCase()} ${status === 503 ? "unavailable" : "rate limited"}. Waiting ${wait}s (${attempt + 1}/3)...`);
          await sleep(wait * 1000);
          continue;
        }
        throw err;
      }
    }
    throw new Error(`${provider.toUpperCase()} max retries exceeded`);
  }

  // Gemini with retry
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, { system_instruction: { parts: [{ text: instructions }] }, contents: [{ parts: [{ text: userMsg }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 8000 } }, { headers: { "Content-Type": "application/json" }, timeout: 180_000 });
      const c = res.data.candidates;
      if (!c || c.length === 0) throw new Error("No candidates");
      return c[0].content.parts.map((p: any) => p.text).join("");
    } catch (err: any) {
      const status = err.response?.status;
      if ((status === 429 || status === 503) && attempt < 3) {
        let wait = status === 503 ? 30 : 60;
        try { const d = err.response.data?.error?.details?.find((d: any) => d["@type"]?.includes("RetryInfo")); if (d?.retryDelay) wait = Math.ceil(parseFloat(d.retryDelay.replace("s", ""))) + 5; } catch {}
        console.log(`   ⏳ ${status === 503 ? "Service unavailable" : "Rate limited"}. Waiting ${wait}s (attempt ${attempt + 1}/3)...`);
        await sleep(wait * 1000);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}


// ─── Main ───

function displayActivities(activities: SummaryActivity[], page: number, hasMore: boolean) {
  console.log("═".repeat(100));
  console.log(`  Page ${page}                                                                          `);
  console.log("  #  │ Date       │ Type            │ Name                           │ Dist (km) │ Time");
  console.log(" ────┼────────────┼─────────────────┼────────────────────────────────┼───────────┼──────────");
  for (let i = 0; i < activities.length; i++) {
    const a = activities[i];
    const num = String(i + 1).padStart(3);
    const date = new Date(a.start_date_local).toISOString().slice(0, 10);
    const type = (a.sport_type || a.type).padEnd(15);
    const name = a.name.length > 30 ? a.name.slice(0, 27) + "..." : a.name.padEnd(30);
    const dist = (a.distance / 1000).toFixed(2).padStart(9);
    const time = formatDuration(a.moving_time).padStart(9);
    console.log(` ${num} │ ${date} │ ${type} │ ${name} │ ${dist} │ ${time}`);
  }
  console.log("═".repeat(100));
  const nav: string[] = [];
  if (page > 1) nav.push("'p' = previous page");
  if (hasMore) nav.push("'n' = next page");
  if (nav.length > 0) console.log(`  📖 ${nav.join(" | ")}`);
}

async function main() {
  console.log("\n⚡ FAST MODE — Fetch → Crunch → Analyze → Update\n");

  // Authenticate
  const config = loadConfig();
  const rider = loadRiderConfig();
  const { accessToken, athlete } = await getAccessToken(config.clientId, config.clientSecret, config.refreshToken);
  const client = createStravaClient(accessToken);

  if (rider.weightKg) {
    const ftpInfo = [rider.ftpW ? `FTP: ${rider.ftpW} W` : null, rider.rFtpW ? `rFTP: ${rider.rFtpW} W` : null].filter(Boolean).join(" | ") || "FTP: ?";
    const hrInfo = [
      rider.maxHr ? `MaxHR: ${rider.maxHr}` : null,
      rider.lthr ? `LTHR: ${rider.lthr}` : null,
      rider.runnerMaxHr && rider.runnerMaxHr !== rider.maxHr ? `RunMaxHR: ${rider.runnerMaxHr}` : null,
      rider.runnerLthr ? `RunLTHR: ${rider.runnerLthr}` : null,
    ].filter(Boolean).join(" | ") || "MaxHR: ?";
    console.log(`   ⚖️ Rider: ${rider.weightKg} kg | ${ftpInfo} | ${hrInfo} bpm`);
  }

  // Main loop — after processing, come back to activity list
  const PER_PAGE = config.pageSize;
  let currentPage = 1;

  while (true) {
    console.log(`📋 Fetching activities (page ${currentPage})...\n`);
    let activities = await fetchActivitiesPage(client, PER_PAGE, currentPage);

    if (activities.length === 0 && currentPage > 1) {
      console.log("   No more activities. Going back...");
      currentPage--;
      continue;
    }
    if (activities.length === 0) { console.log("No activities found."); return; }

    const hasMore = activities.length === PER_PAGE;
    displayActivities(activities, currentPage, hasMore);

    const input = await prompt(`\n👉 Pick activity (1-${activities.length}), 'n'ext, 'p'rev, or 'q' to quit: `);
    const cmd = input.toLowerCase();

    if (cmd === "q") { console.log("👋 Bye!"); return; }
    if (cmd === "n" || cmd === "next") {
      if (hasMore) { currentPage++; } else { console.log("   ⚠️  Already on last page."); }
      continue;
    }
    if (cmd === "p" || cmd === "prev" || cmd === "previous") {
      if (currentPage > 1) { currentPage--; } else { console.log("   ⚠️  Already on first page."); }
      continue;
    }

    let selected: SummaryActivity;
    const num = parseInt(input, 10);
    if (isNaN(num) || num < 1 || num > activities.length) { console.log("❌ Invalid."); continue; }
    selected = activities[num - 1];

    const activityId = selected.id;
    const safeName = selected.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
    const dateStr = new Date(selected.start_date_local).toISOString().slice(0, 10);

    // ═══ STEP 1: FETCH ═══
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  📥 STEP 1/4: Fetching "${selected.name}"...`);
    console.log(`${"═".repeat(60)}\n`);

    const enriched = await fetchEnrichedActivity(client, activityId, selected.name);
    const streamTable = buildStreamTable(enriched);

    // ─── Fetch weather (multi-point: 0/25/50/75% of route, parallel) ───
    const waypoints = buildWeatherWaypoints(streamTable as any[], enriched.activity.start_date);
    let weather = null;
    if (waypoints.length > 0) {
      console.log(`   🌤️ Fetching weather (${waypoints.length} hour${waypoints.length > 1 ? "s" : ""} covered, parallel)...`);
      weather = await fetchWeatherMultiPoint(waypoints);
      if (weather?.at_start) {
        const ws = weather.at_start;
        const windChange = weather.snapshots.length > 1
          ? ` → ${weather.snapshots[weather.snapshots.length - 1].windspeed_kmh} km/h end`
          : "";
        console.log(`   🌡️ ${ws.temperature_c}°C | 💨 ${ws.windspeed_kmh} km/h from ${ws.wind_direction_deg}° (${ws.weather_description})${windChange}`);
      }
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      athlete: { id: athlete.id, firstname: athlete.firstname, lastname: athlete.lastname },
      activity_summary: { id: enriched.activity.id, name: enriched.activity.name, sport_type: enriched.activity.sport_type || enriched.activity.type, date: enriched.activity.start_date_local, distance_km: Math.round(enriched.activity.distance / 10) / 100, moving_time_seconds: enriched.activity.moving_time, elapsed_time_seconds: enriched.activity.elapsed_time, total_elevation_gain_m: enriched.activity.total_elevation_gain, average_speed_kmh: Math.round(enriched.activity.average_speed * 3.6 * 100) / 100, max_speed_kmh: Math.round(enriched.activity.max_speed * 3.6 * 100) / 100, average_heartrate: enriched.activity.average_heartrate || null, max_heartrate: enriched.activity.max_heartrate || null, average_watts: enriched.activity.average_watts || null, max_watts: enriched.activity.max_watts || null, average_cadence: enriched.activity.average_cadence || null, calories: enriched.activity.calories || null, suffer_score: enriched.activity.suffer_score || null, gear: enriched.activity.gear?.name || null, device: enriched.activity.device_name || null },
      detailed_activity: enriched.activity, laps: enriched.laps, zones: enriched.zones,
      splits_metric: enriched.activity.splits_metric || [], splits_standard: enriched.activity.splits_standard || [],
      segment_efforts: enriched.activity.segment_efforts || [], best_efforts: enriched.activity.best_efforts || [],
      stream_data: streamTable, streams_raw: enriched.streams,
      weather: weather ?? null,
    };

    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
    const outputPath = join(OUTPUT_DIR, `activity_${activityId}_${dateStr}_${safeName}.json`);
    writeFileSync(outputPath, JSON.stringify(exportData, null, 2), "utf-8");
    console.log(`✅ Saved: ${basename(outputPath)} (${(Buffer.byteLength(JSON.stringify(exportData)) / 1024 / 1024).toFixed(2)} MB, ${streamTable.length} stream points)`);

    // ═══ STEP 2: CRUNCH ═══
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  🔬 STEP 2/4: Crunching ${streamTable.length} data points...`);
    console.log(`${"═".repeat(60)}\n`);

    const crunched = crunchActivity(exportData, rider);
    if (!existsSync(ANALYSIS_DIR)) mkdirSync(ANALYSIS_DIR, { recursive: true });
    const crunchedPath = join(ANALYSIS_DIR, `activity_${activityId}_${dateStr}_${safeName}_crunched.json`);
    writeFileSync(crunchedPath, JSON.stringify(crunched, null, 2), "utf-8");
    console.log(`✅ Crunched: ${Math.round(readFileSync(crunchedPath).length / 1024)} KB (zero sampling)`);
    if (crunched.pogacar_score) console.log(`   🏆 Pogačar Score: ${crunched.pogacar_score.composite_pct}% (${crunched.pogacar_score.reference})`);
    if (crunched.training_metrics) console.log(`   ⚙️ IF: ${crunched.training_metrics.intensity_factor} | TSS: ${crunched.training_metrics.tss}`);
    if (crunched.power_to_weight) console.log(`   💪 W/kg: ${crunched.power_to_weight.avg_wkg} avg`);
    console.log(`   📈 Pacing: ${crunched.pacing.type}`);

    // ═══ STEP 3: AI ANALYSIS ═══
    const aiConfigs = loadAIConfig();
    let analysisText: string | null = null;

    if (aiConfigs) {
      console.log(`\n${"═".repeat(60)}`);
      console.log(`  🤖 STEP 3/4: AI analysis (${aiConfigs.map(c => c.provider.toUpperCase()).join(" → ")})...`);
      console.log(`${"═".repeat(60)}\n`);

      const instructions = getInstructions();
      const data = JSON.stringify(crunched);
      const approxInputTokens = Math.round((instructions.length + data.length) / 4);
      console.log(`   📊 Input: ~${approxInputTokens.toLocaleString()} tokens (instructions: ${Math.round(instructions.length / 4).toLocaleString()} + data: ${Math.round(data.length / 4).toLocaleString()})\n`);

      for (let i = 0; i < aiConfigs.length; i++) {
        const cfg = aiConfigs[i];
        try {
          console.log(`🤖 Trying ${cfg.provider.toUpperCase()} (${cfg.model})...`);
          analysisText = sanitizeAIOutput(await callAI(cfg.provider, cfg.apiKey, cfg.model, instructions, data));
          const approxOutputTokens = Math.round(analysisText.length / 4);
          const analysisPath = join(ANALYSIS_DIR, `activity_${activityId}_${dateStr}_${safeName}_analysis.md`);
          writeFileSync(analysisPath, analysisText, "utf-8");
          console.log(`✅ AI analysis saved: ${basename(analysisPath)}`);
          console.log(`   📊 Output: ~${approxOutputTokens.toLocaleString()} tokens | ${analysisText.split(/\s+/).length.toLocaleString()} words | ${analysisText.length.toLocaleString()} chars`);
          break;
        } catch (err: any) {
          const next = i + 1 < aiConfigs.length ? aiConfigs[i + 1] : null;
          if (next) {
            console.log(`⚠️  ${cfg.provider.toUpperCase()} failed: ${err.message}`);
            console.log(`   🔄 Falling back to ${next.provider.toUpperCase()} (${next.model})...`);
          } else {
            console.error(`⚠️  AI analysis failed: ${err.message}`);
            console.log(`   Continuing without AI analysis — will use structured fallback for notes.`);
          }
        }
      }
    } else {
      console.log(`\n⚠️  STEP 3/4: Skipped (no AI API keys in .env)`);
    }

    // ═══ STEP 4: UPDATE STRAVA ═══
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  📤 STEP 4/4: Updating Strava activity...`);
    console.log(`${"═".repeat(60)}\n`);

    const description = buildDescription(crunched, analysisText);
    const privateNotes = buildPrivateNotes(crunched, analysisText);

    try {
      await client.put(`/activities/${activityId}`, { description, private_note: privateNotes });
      console.log(`✅ Strava updated!`);
      console.log(`   ✏️ Description: ${description.length} chars (public — full analysis)`);
      console.log(`   🔒 Private notes: ${privateNotes.length} chars (short tips)`);
      console.log(`\n🔗 https://www.strava.com/activities/${activityId}`);
    } catch (err: any) {
      if (err.response?.status === 401 && err.response?.data?.errors?.[0]?.field === "activity:write_permission") {
        console.error(`⚠️  Can't update — token missing 'activity:write' scope.`);
        console.error(`   Re-authorize: https://www.strava.com/oauth/authorize?client_id=${config.clientId}&response_type=code&redirect_uri=http://localhost&scope=read_all,activity:read_all,activity:write,profile:read_all&approval_prompt=force`);
        console.log(`\n   ✅ But all files were saved! You can run 'npm run update' later after re-authorizing.`);
      } else {
        console.error(`⚠️  Update failed: ${err.message}`);
        console.log(`   ✅ All files saved — run 'npm run update' to retry.`);
      }
    }

    console.log(`\n${"═".repeat(60)}`);
    console.log(`  ✅ DONE!`);
    console.log(`${"═".repeat(60)}`);
    console.log(`  📥 Activity: ${outputPath}`);
    console.log(`  🔬 Crunched: ${crunchedPath}`);
    if (analysisText) console.log(`  🤖 Analysis: analysis/...analysis.md`);
    console.log(`  📤 Strava:   https://www.strava.com/activities/${activityId}`);
    console.log(`${"═".repeat(60)}\n`);
  } // end while(true)
}

main().catch((err) => { console.error("\n❌ Fatal:", err.message); if (err.response?.data) console.error("   API:", JSON.stringify(err.response.data, null, 2)); process.exit(1); });

