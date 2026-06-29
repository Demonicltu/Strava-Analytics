/**
 * Fast mode: fetch → crunch → analyze → update in ONE command.
 * Just pick the activity and everything runs automatically.
 *
 * Usage: npm run fast
 */
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
import { loadWellnessContext } from "./wellness.js";
import type { SummaryActivity } from "./types.js";
import type { AxiosInstance } from "axios";
import { loadAllConfigs as loadAiConfigs, callAIBatch } from "./ai_client.js";
import { renderTemplate, fillSlots, getSlotNames } from "./template.js";
import { buildInterpretationRequests } from "./interpret.js";
import { buildFastContext } from "./fast_context.js";
import { prompt, parsePagedSelection } from "./cli_utils.js";

let __dirname: string;
try { __dirname = dirname(fileURLToPath(import.meta.url)); } catch { __dirname = process.cwd(); }
// In bundled mode, resolve dirs relative to cwd; in dev mode, relative to source
const BASE_DIR = existsSync(join(__dirname, "..", "package.json")) ? join(__dirname, "..") : process.cwd();
const OUTPUT_DIR = join(BASE_DIR, "output");
const ANALYSIS_DIR = join(BASE_DIR, "analysis");

// ─── Helpers ───

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

type FetchStepResult = {
  exportData: any;
  streamTable: object[];
  outputPath: string;
};

async function runFetchStep(
  client: AxiosInstance,
  athlete: any,
  selected: SummaryActivity,
  activityId: number,
  safeName: string,
  dateStr: string,
): Promise<FetchStepResult> {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  📥 STEP 1/4: Fetching "${selected.name}"...`);
  console.log(`${"═".repeat(60)}\n`);

  const enriched = await fetchEnrichedActivity(client, activityId, selected.name);
  const streamTable = buildStreamTable(enriched);

  const isIndoor = ["VirtualRide", "VirtualRun"].includes(enriched.activity.sport_type) || (enriched.activity as any).trainer === true;
  const fallbackLatLng: [number, number] | null = enriched.activity.start_latlng ?? null;
  const waypoints = buildWeatherWaypoints(
    streamTable as any[],
    enriched.activity.start_date,
    fallbackLatLng,
    enriched.activity.moving_time,
  );
  let weather = null;
  if (isIndoor && waypoints.length === 0) {
    console.log(`   🏠 Indoor/virtual activity — no start coordinates, skipping weather.`);
  } else if (waypoints.length > 0) {
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
    activity_summary: { id: enriched.activity.id, name: enriched.activity.name, sport_type: enriched.activity.sport_type || enriched.activity.type, date: enriched.activity.start_date_local, distance_km: Math.round(enriched.activity.distance / 10) / 100, moving_time_seconds: enriched.activity.moving_time, elapsed_time_seconds: enriched.activity.elapsed_time, total_elevation_gain_m: enriched.activity.total_elevation_gain, average_speed_kmh: Math.round(enriched.activity.average_speed * 3.6 * 100) / 100, max_speed_kmh: Math.round(enriched.activity.max_speed * 3.6 * 100) / 100, average_heartrate: enriched.activity.average_heartrate || null, max_heartrate: enriched.activity.max_heartrate || null, average_watts: enriched.activity.average_watts || null, max_watts: enriched.activity.max_watts || null, average_cadence: enriched.activity.average_cadence || null, calories: enriched.activity.calories || null, suffer_score: enriched.activity.suffer_score || null, gear: enriched.activity.gear?.name || null, device: enriched.activity.device_name || null, device_watts: enriched.activity.device_watts ?? null },
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

  return { exportData, streamTable, outputPath };
}

type CrunchStepResult = {
  crunched: any;
  crunchedPath: string;
  wellnessCtx: any;
};

function runCrunchStep(
  rider: any,
  exportData: any,
  streamTable: object[],
  activityId: number,
  dateStr: string,
  safeName: string,
): CrunchStepResult {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  🔬 STEP 2/4: Crunching ${streamTable.length} data points...`);
  console.log(`${"═".repeat(60)}\n`);

  const actStartIso: string | null = exportData?.detailed_activity?.start_date_local ?? exportData?.detailed_activity?.start_date ?? null;
  const utcOffset: number = exportData?.detailed_activity?.utc_offset
    ? Math.round(exportData.detailed_activity.utc_offset / 3600)
    : 0;
  const wellnessCtx = loadWellnessContext(ANALYSIS_DIR, dateStr, actStartIso, utcOffset);
  const garminRestHr = wellnessCtx?.night_before?.resting_hr ?? null;

  const crunched = crunchActivity(exportData, rider, garminRestHr);
  if (!existsSync(ANALYSIS_DIR)) mkdirSync(ANALYSIS_DIR, { recursive: true });
  const crunchedPath = join(ANALYSIS_DIR, `activity_${activityId}_${dateStr}_${safeName}_crunched.json`);
  writeFileSync(crunchedPath, JSON.stringify(crunched, null, 2), "utf-8");
  console.log(`✅ Crunched: ${Math.round(readFileSync(crunchedPath).length / 1024)} KB (zero sampling)`);
  if (crunched.pogacar_score) console.log(`   🏆 Pogačar Score: ${crunched.pogacar_score.composite_pct}% (${crunched.pogacar_score.reference})`);
  if (crunched.training_metrics) console.log(`   ⚙️ IF: ${crunched.training_metrics.intensity_factor} | TSS: ${crunched.training_metrics.tss}`);
  if (crunched.power_to_weight) console.log(`   💪 W/kg: ${crunched.power_to_weight.avg_wkg} avg`);
  console.log(`   📈 Pacing: ${crunched.pacing.type}`);

  return { crunched, crunchedPath, wellnessCtx };
}

type AnalyzeStepResult = {
  analysisText: string | null;
  historicalCtx: any;
  personalScore: any;
};

async function runAnalyzeStep(
  crunched: any,
  wellnessCtx: any,
  activityId: number,
  dateStr: string,
  safeName: string,
): Promise<AnalyzeStepResult> {
  const aiConfigs = loadAiConfigs();
  let analysisText: string | null = null;
  const {
    historicalCtx,
    personalScore,
    prCheck,
    recommendation,
  } = buildFastContext(
    ANALYSIS_DIR,
    dateStr,
    crunched,
    `activity_${activityId}_${dateStr}_${safeName}_crunched.json`,
  );

  if (historicalCtx) console.log(`   📈 Historical: ${historicalCtx.baselines.length} period(s) loaded`);
  else console.log(`   💡 No historical baseline — run 'npm run bulk' to enable context-aware analysis`);
  if (wellnessCtx) console.log(`   🛌 Garmin wellness: ${wellnessCtx.readiness_note}`);
  else console.log(`   💡 No Garmin data — run 'python garmin_sync.py' to enable readiness context`);
  if (prCheck && prCheck.pr_labels.length > 0) console.log(`   🏅 NEW PRs: ${prCheck.pr_labels.join(" | ")}`);

  if (aiConfigs.length > 0) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  🤖 STEP 3/4: AI analysis (${aiConfigs.map(c => c.provider.toUpperCase()).join(" → ")})...`);
    console.log(`${"═".repeat(60)}\n`);

    console.log(`   🏗️  Rendering template...`);
    const skeleton = renderTemplate(crunched, historicalCtx, wellnessCtx, recommendation);
    const slots = getSlotNames(skeleton);
    console.log(`   🎯 Slots: ${slots.length} (${slots.join(", ")})`);

    const requests = buildInterpretationRequests(crunched, historicalCtx, wellnessCtx, slots);
    const primaryCfg = aiConfigs[0];
    console.log(`   🤖 ${requests.length} calls → ${primaryCfg.provider.toUpperCase()} (${primaryCfg.model})`);

    const start = Date.now();
    try {
      const interpretations = await callAIBatch(primaryCfg, requests);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      analysisText = fillSlots(skeleton, interpretations);
      const analysisPath = join(ANALYSIS_DIR, `activity_${activityId}_${dateStr}_${safeName}_analysis.md`);
      writeFileSync(analysisPath, analysisText, "utf-8");
      console.log(`✅ AI analysis saved in ${elapsed}s: ${basename(analysisPath)}`);
    } catch (err: any) {
      const slotInfo = err.failedSlot ? ` (slot: ${err.failedSlot})` : "";
      const httpStatus = err.response?.status ? ` [HTTP ${err.response.status}]` : "";
      if (aiConfigs.length > 1) {
        console.log(`⚠️  ${aiConfigs[0].provider.toUpperCase()} failed${slotInfo}${httpStatus}: ${err.message}`);
        console.log(`   🔄 Retrying with ${aiConfigs[1].provider.toUpperCase()} (${aiConfigs[1].model})...`);
        try {
          const interpretations = await callAIBatch(aiConfigs[1], requests);
          analysisText = fillSlots(skeleton, interpretations);
          const analysisPath = join(ANALYSIS_DIR, `activity_${activityId}_${dateStr}_${safeName}_analysis.md`);
          writeFileSync(analysisPath, analysisText, "utf-8");
          console.log(`✅ AI analysis saved: ${basename(analysisPath)}`);
        } catch (err2: any) {
          const slotInfo2 = err2.failedSlot ? ` (slot: ${err2.failedSlot})` : "";
          const httpStatus2 = err2.response?.status ? ` [HTTP ${err2.response.status}]` : "";
          console.error(`⚠️  AI analysis failed${slotInfo2}${httpStatus2}: ${err2.message}`);
          console.log(`   Continuing without AI analysis — will use structured fallback.`);
        }
      } else {
        console.error(`⚠️  AI analysis failed${slotInfo}${httpStatus}: ${err.message}`);
        console.log(`   Continuing without AI analysis — will use structured fallback.`);
      }
    }
  } else {
    console.log(`\n⚠️  STEP 3/4: Skipped (no AI API keys in .env)`);
  }

  return { analysisText, historicalCtx, personalScore };
}

async function runUpdateStep(
  client: AxiosInstance,
  config: any,
  activityId: number,
  crunched: any,
  analysisText: string | null,
  historicalCtx: any,
  wellnessCtx: any,
  personalScore: any,
): Promise<void> {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  📤 STEP 4/4: Updating Strava activity...`);
  console.log(`${"═".repeat(60)}\n`);

  const description = buildDescription(crunched, analysisText, historicalCtx, wellnessCtx, personalScore);
  const privateNotes = buildPrivateNotes(crunched, analysisText, wellnessCtx);

  try {
    await client.put(`/activities/${activityId}`, { description, private_note: privateNotes });
    console.log(`✅ Strava updated!`);
    console.log(`   ✏️ Description: ${description.length} chars (public — shareable summary)`);
    console.log(`   🔒 Private notes: ${privateNotes.length} chars (private — deeper analysis)`);
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
    const sel = parsePagedSelection(input, activities.length);

    if (sel.action === "quit") { console.log("👋 Bye!"); return; }
    if (sel.action === "next") {
      if (hasMore) { currentPage++; } else { console.log("   ⚠️  Already on last page."); }
      continue;
    }
    if (sel.action === "prev") {
      if (currentPage > 1) { currentPage--; } else { console.log("   ⚠️  Already on first page."); }
      continue;
    }
    if (sel.action === "invalid") { console.log("❌ Invalid."); continue; }
    const selected = activities[sel.index];

    const activityId = selected.id;
    const safeName = selected.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
    const dateStr = new Date(selected.start_date_local).toISOString().slice(0, 10);

    const fetchStep = await runFetchStep(client, athlete, selected, activityId, safeName, dateStr);
    const crunchStep = runCrunchStep(rider, fetchStep.exportData, fetchStep.streamTable, activityId, dateStr, safeName);
    const analyzeStep = await runAnalyzeStep(crunchStep.crunched, crunchStep.wellnessCtx, activityId, dateStr, safeName);
    await runUpdateStep(
      client,
      config,
      activityId,
      crunchStep.crunched,
      analyzeStep.analysisText,
      analyzeStep.historicalCtx,
      crunchStep.wellnessCtx,
      analyzeStep.personalScore,
    );

    console.log(`\n${"═".repeat(60)}`);
    console.log(`  ✅ DONE!`);
    console.log(`${"═".repeat(60)}`);
    console.log(`  📥 Activity: ${fetchStep.outputPath}`);
    console.log(`  🔬 Crunched: ${crunchStep.crunchedPath}`);
    if (analyzeStep.analysisText) console.log(`  🤖 Analysis: analysis/...analysis.md`);
    console.log(`  📤 Strava:   https://www.strava.com/activities/${activityId}`);
    console.log(`${"═".repeat(60)}\n`);
  } // end while(true)
}

main().catch((err) => { console.error("\n❌ Fatal:", err.message); if (err.response?.data) console.error("   API:", JSON.stringify(err.response.data, null, 2)); process.exit(1); });

