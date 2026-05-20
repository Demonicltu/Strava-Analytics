/**
 * Bulk fetch + crunch for last 2 years of Strava activities.
 * No AI analysis — just raw download + crunch to _crunched.json.
 * Skips activities already downloaded / crunched.
 *
 * Usage: npm run bulk
 */
import { writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { loadConfig, loadRiderConfig } from "./config.js";
import { getAccessToken } from "./auth.js";
import { createStravaClient, rateLimitDelay } from "./client.js";
import { fetchActivities } from "./activities.js";
import { fetchEnrichedActivity } from "./details.js";
import { crunchActivity } from "./crunch.js";
import type { SummaryActivity } from "./types.js";

let __dirname2: string;
try { __dirname2 = dirname(fileURLToPath(import.meta.url)); } catch { __dirname2 = process.cwd(); }
const BASE_DIR = existsSync(join(__dirname2, "..", "package.json")) ? join(__dirname2, "..") : process.cwd();
const OUTPUT_DIR = join(BASE_DIR, "output");
const ANALYSIS_DIR = join(BASE_DIR, "analysis");

// ─── Helpers ───

function buildStreamTable(enriched: any): object[] {
  const s = enriched.streams;
  const timeData = s.time?.data as number[] | undefined;
  if (!timeData || timeData.length === 0) return [];
  const rows: object[] = [];
  for (let i = 0; i < timeData.length; i++) {
    const row: Record<string, number | boolean | null> = { time_seconds: timeData[i] };
    if (s.distance) row["distance_meters"] = s.distance.data[i] as number;
    if (s.velocity_smooth) {
      const speed = s.velocity_smooth.data[i] as number;
      row["speed_ms"] = speed;
      row["speed_kmh"] = Math.round(speed * 3.6 * 100) / 100;
    }
    if (s.heartrate) row["heartrate_bpm"] = s.heartrate.data[i] as number;
    if (s.watts) row["power_watts"] = s.watts.data[i] as number;
    if (s.cadence) row["cadence_rpm"] = s.cadence.data[i] as number;
    if (s.altitude) row["altitude_meters"] = s.altitude.data[i] as number;
    if (s.grade_smooth) row["grade_percent"] = s.grade_smooth.data[i] as number;
    if (s.temp) row["temperature_c"] = s.temp.data[i] as number;
    if (s.latlng) {
      const coords = s.latlng.data[i] as [number, number];
      if (coords) { row["latitude"] = coords[0]; row["longitude"] = coords[1]; }
    }
    if (s.moving) row["is_moving"] = s.moving.data[i] as boolean;
    rows.push(row);
  }
  return rows;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
}

function getExistingIds(dir: string, suffix: string): Set<number> {
  const ids = new Set<number>();
  if (!existsSync(dir)) return ids;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(suffix)) continue;
    const m = f.match(/activity_(\d+)_/);
    if (m) ids.add(parseInt(m[1], 10));
  }
  return ids;
}

// ─── Main ───

async function main() {
  console.log("\n📦 Strava Bulk Fetcher — Last 2 Years\n");
  console.log("   ⚠️  Weather data is skipped in bulk mode (speeds up the run).");
  console.log("   ✅ Re-run safe: already downloaded / crunched activities are skipped.\n");

  const config = loadConfig();
  const rider = loadRiderConfig();

  const { accessToken, athlete } = await getAccessToken(
    config.clientId,
    config.clientSecret,
    config.refreshToken
  );
  const client = createStravaClient(accessToken);

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!existsSync(ANALYSIS_DIR)) mkdirSync(ANALYSIS_DIR, { recursive: true });

  // Two years back from today
  const afterDate = new Date();
  afterDate.setFullYear(afterDate.getFullYear() - 2);

  console.log(`📅 Fetching activities since ${afterDate.toISOString().slice(0, 10)}...\n`);
  const activities = await fetchActivities(client, 200, 100, afterDate);

  if (activities.length === 0) {
    console.log("No activities found.");
    return;
  }

  const existingOutputIds = getExistingIds(OUTPUT_DIR, ".json");
  const existingCrunchedIds = getExistingIds(ANALYSIS_DIR, "_crunched.json");

  const toFetch = activities.filter((a: SummaryActivity) => !existingOutputIds.has(a.id));
  const toCrunch = activities.filter((a: SummaryActivity) =>
    existingOutputIds.has(a.id) && !existingCrunchedIds.has(a.id)
  );

  console.log(`📊 Total activities: ${activities.length}`);
  console.log(`   ✅ Already downloaded: ${existingOutputIds.size}`);
  console.log(`   ⬇️  To download + crunch: ${toFetch.length}`);
  console.log(`   🔬 To crunch only (already downloaded): ${toCrunch.length}\n`);

  let downloaded = 0, crunched = 0, failed = 0;

  // ─── Process activities that need downloading ───
  for (let i = 0; i < toFetch.length; i++) {
    const a = toFetch[i];
    const dateStr = new Date(a.start_date_local).toISOString().slice(0, 10);
    const name = safeName(a.name);
    const outputPath = join(OUTPUT_DIR, `activity_${a.id}_${dateStr}_${name}.json`);
    const crunchedPath = join(ANALYSIS_DIR, `activity_${a.id}_${dateStr}_${name}_crunched.json`);

    process.stdout.write(`[${i + 1}/${toFetch.length}] ⬇️  ${dateStr} ${a.name.slice(0, 40)}... `);

    try {
      const enriched = await fetchEnrichedActivity(client, a.id, a.name);
      const streamTable = buildStreamTable(enriched);

      const exportData = {
        exported_at: new Date().toISOString(),
        athlete: { id: athlete.id, firstname: athlete.firstname, lastname: athlete.lastname },
        activity_summary: {
          id: enriched.activity.id,
          name: enriched.activity.name,
          sport_type: enriched.activity.sport_type || enriched.activity.type,
          date: enriched.activity.start_date_local,
          distance_km: Math.round(enriched.activity.distance / 10) / 100,
          moving_time_seconds: enriched.activity.moving_time,
          elapsed_time_seconds: enriched.activity.elapsed_time,
          total_elevation_gain_m: enriched.activity.total_elevation_gain,
          average_speed_kmh: Math.round(enriched.activity.average_speed * 3.6 * 100) / 100,
          max_speed_kmh: Math.round(enriched.activity.max_speed * 3.6 * 100) / 100,
          average_heartrate: enriched.activity.average_heartrate || null,
          max_heartrate: enriched.activity.max_heartrate || null,
          average_watts: enriched.activity.average_watts || null,
          max_watts: enriched.activity.max_watts || null,
          average_cadence: enriched.activity.average_cadence || null,
          calories: enriched.activity.calories || null,
          suffer_score: enriched.activity.suffer_score || null,
          gear: enriched.activity.gear?.name || null,
          device: enriched.activity.device_name || null,
          device_watts: enriched.activity.device_watts ?? null,
        },
        detailed_activity: enriched.activity,
        laps: enriched.laps,
        zones: enriched.zones,
        splits_metric: enriched.activity.splits_metric || [],
        splits_standard: enriched.activity.splits_standard || [],
        segment_efforts: enriched.activity.segment_efforts || [],
        best_efforts: enriched.activity.best_efforts || [],
        stream_data: streamTable,
        streams_raw: enriched.streams,
        weather: null, // skipped in bulk mode
      };

      writeFileSync(outputPath, JSON.stringify(exportData, null, 2), "utf-8");
      downloaded++;

      // Crunch immediately
      const crunched_data = crunchActivity(exportData, rider);
      writeFileSync(crunchedPath, JSON.stringify(crunched_data, null, 2), "utf-8");
      crunched++;

      const pts = streamTable.length;
      console.log(`✅ (${pts} pts)`);
    } catch (err: any) {
      failed++;
      console.log(`❌ ${err.message}`);
    }
  }

  // ─── Crunch activities that were downloaded but not yet crunched ───
  if (toCrunch.length > 0) {
    const { readFileSync } = await import("fs");
    console.log(`\n🔬 Crunching ${toCrunch.length} previously downloaded activities...\n`);

    for (let i = 0; i < toCrunch.length; i++) {
      const a = toCrunch[i];
      const dateStr = new Date(a.start_date_local).toISOString().slice(0, 10);
      const name = safeName(a.name);

      // Find the output file (name might differ slightly)
      const existing = readdirSync(OUTPUT_DIR).find(f => f.startsWith(`activity_${a.id}_`));
      if (!existing) continue;

      const outputPath = join(OUTPUT_DIR, existing);
      const crunchedPath = join(ANALYSIS_DIR, `activity_${a.id}_${dateStr}_${name}_crunched.json`);

      process.stdout.write(`[${i + 1}/${toCrunch.length}] 🔬 ${dateStr} ${a.name.slice(0, 40)}... `);
      try {
        const raw = JSON.parse(readFileSync(outputPath, "utf-8"));
        const crunched_data = crunchActivity(raw, rider);
        writeFileSync(crunchedPath, JSON.stringify(crunched_data, null, 2), "utf-8");
        crunched++;
        console.log("✅");
      } catch (err: any) {
        failed++;
        console.log(`❌ ${err.message}`);
      }
    }
  }

  console.log("\n" + "═".repeat(60));
  console.log(`✅ Downloaded: ${downloaded}  |  🔬 Crunched: ${crunched}  |  ❌ Failed: ${failed}`);
  console.log(`\n💡 Run 'npm run compare' to analyse trends across all activities.`);
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err.message);
  if (err.response?.data) console.error("   API:", JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});

