import { createInterface } from "readline";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadConfig } from "./config.js";
import { getAccessToken } from "./auth.js";
import { createStravaClient } from "./client.js";
import { fetchEnrichedActivity } from "./details.js";
import { rateLimitDelay } from "./client.js";
import type { SummaryActivity, EnrichedActivity } from "./types.js";
import type { AxiosInstance } from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_DIR = join(__dirname, "..", "output");

// ─── Helpers ───

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatPace(speedMs: number): string {
  if (speedMs <= 0) return "-";
  const paceSecPerKm = 1000 / speedMs;
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.round(paceSecPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── Fetch latest N activities ───

async function fetchLatestActivities(client: AxiosInstance, count: number): Promise<SummaryActivity[]> {
  await rateLimitDelay();
  const response = await client.get<SummaryActivity[]>("/athlete/activities", {
    params: { per_page: count, page: 1 },
  });
  return response.data;
}

// ─── Display activities table ───

function displayActivitiesTable(activities: SummaryActivity[]) {
  console.log("\n" + "═".repeat(110));
  console.log(
    "  #  │ Date       │ Type            │ Name                           │ Dist (km) │ Time      │ Avg HR │ Elev"
  );
  console.log(
    " ────┼────────────┼─────────────────┼────────────────────────────────┼───────────┼───────────┼────────┼──────"
  );

  for (let i = 0; i < activities.length; i++) {
    const a = activities[i];
    const num = String(i + 1).padStart(3);
    const date = new Date(a.start_date_local).toISOString().slice(0, 10);
    const type = (a.sport_type || a.type).padEnd(15);
    const name = a.name.length > 30 ? a.name.slice(0, 27) + "..." : a.name.padEnd(30);
    const dist = (a.distance / 1000).toFixed(2).padStart(9);
    const time = formatDuration(a.moving_time).padStart(9);
    const hr = a.average_heartrate ? String(Math.round(a.average_heartrate)).padStart(6) : "     -";
    const elev = a.total_elevation_gain.toFixed(0).padStart(5);

    console.log(` ${num} │ ${date} │ ${type} │ ${name} │ ${dist} │ ${time} │ ${hr} │ ${elev}`);
  }

  console.log("═".repeat(110));
}

// ─── Print detailed activity info ───

function printActivityDetails(enriched: EnrichedActivity) {
  const a = enriched.activity;

  console.log("\n" + "═".repeat(70));
  console.log(`  📋 ${a.name}`);
  console.log("═".repeat(70));
  console.log(`  Type:        ${a.sport_type || a.type}`);
  console.log(`  Date:        ${new Date(a.start_date_local).toLocaleString()}`);
  console.log(`  Distance:    ${(a.distance / 1000).toFixed(2)} km`);
  console.log(`  Moving time: ${formatDuration(a.moving_time)}`);
  console.log(`  Elapsed:     ${formatDuration(a.elapsed_time)}`);
  console.log(`  Avg speed:   ${(a.average_speed * 3.6).toFixed(1)} km/h (${formatPace(a.average_speed)})`);
  console.log(`  Max speed:   ${(a.max_speed * 3.6).toFixed(1)} km/h`);
  console.log(`  Elevation:   ${a.total_elevation_gain.toFixed(0)} m`);
  if (a.average_heartrate) console.log(`  Avg HR:      ${a.average_heartrate} bpm`);
  if (a.max_heartrate) console.log(`  Max HR:      ${a.max_heartrate} bpm`);
  if (a.average_watts) console.log(`  Avg power:   ${a.average_watts} W`);
  if (a.max_watts) console.log(`  Max power:   ${a.max_watts} W`);
  if (a.weighted_average_watts) console.log(`  NP:          ${a.weighted_average_watts} W`);
  if (a.average_cadence) console.log(`  Avg cadence: ${a.average_cadence} rpm`);
  if (a.calories) console.log(`  Calories:    ${a.calories}`);
  if (a.suffer_score) console.log(`  Suffer score:${a.suffer_score}`);
  if (a.gear) console.log(`  Gear:        ${a.gear.name}`);
  if (a.device_name) console.log(`  Device:      ${a.device_name}`);

  if (enriched.laps.length > 0) {
    console.log(`\n  Laps (${enriched.laps.length}):`);
    for (const lap of enriched.laps) {
      const d = (lap.distance / 1000).toFixed(2) + "km";
      const t = formatDuration(lap.moving_time);
      const hr = lap.average_heartrate ? `${Math.round(lap.average_heartrate)}bpm` : "";
      console.log(`    Lap ${lap.lap_index}: ${d} in ${t} ${hr}`);
    }
  }

  const streamKeys = Object.keys(enriched.streams);
  if (streamKeys.length > 0) {
    const pts = enriched.streams.time?.data?.length || 0;
    console.log(`\n  Streams: ${streamKeys.join(", ")} (${pts} data points)`);
  }

  if (a.segment_efforts?.length > 0) {
    console.log(`\n  Segments (${a.segment_efforts.length}):`);
    for (const seg of a.segment_efforts.slice(0, 5)) {
      const pr = seg.pr_rank ? ` PR#${seg.pr_rank}` : "";
      console.log(`    ${seg.name} - ${(seg.distance / 1000).toFixed(2)}km ${formatDuration(seg.elapsed_time)}${pr}`);
    }
    if (a.segment_efforts.length > 5) console.log(`    ... +${a.segment_efforts.length - 5} more`);
  }

  console.log("═".repeat(70));
}

// ─── Build second-by-second table from streams ───

function buildStreamTable(enriched: EnrichedActivity): object[] {
  const s = enriched.streams;
  const timeData = s.time?.data as number[] | undefined;
  if (!timeData || timeData.length === 0) return [];

  const rows: object[] = [];
  for (let i = 0; i < timeData.length; i++) {
    const row: Record<string, number | boolean | null> = {
      time_seconds: timeData[i],
    };
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
      if (coords) {
        row["latitude"] = coords[0];
        row["longitude"] = coords[1];
      }
    }
    if (s.moving) row["is_moving"] = s.moving.data[i] as boolean;
    rows.push(row);
  }
  return rows;
}

// ─── Main ───

async function main() {
  console.log("\n🏃 Strava Activity Extractor\n");

  // 1. Load config & authenticate
  const config = loadConfig();
  const { accessToken, athlete } = await getAccessToken(
    config.clientId,
    config.clientSecret,
    config.refreshToken
  );
  const client = createStravaClient(accessToken);

  // 2. Fetch last 5 activities
  console.log("📋 Fetching your last 5 activities...\n");
  const activities = await fetchLatestActivities(client, 5);

  if (activities.length === 0) {
    console.log("No activities found.");
    return;
  }

  // 3. Display table
  displayActivitiesTable(activities);

  // 4. Interactive loop
  while (true) {
    console.log(`\nEnter 1-${activities.length} to scrape an activity, 'more' for 20 activities, or 'q' to quit`);
    const input = await prompt("\n👉 Pick activity: ");

    if (input.toLowerCase() === "q") {
      console.log("👋 Bye!");
      break;
    }

    if (input.toLowerCase() === "more") {
      console.log("\n📋 Fetching last 20 activities...\n");
      const moreActivities = await fetchLatestActivities(client, 20);
      activities.length = 0;
      activities.push(...moreActivities);
      displayActivitiesTable(activities);
      continue;
    }

    const num = parseInt(input, 10);
    if (isNaN(num) || num < 1 || num > activities.length) {
      console.log(`❌ Enter a number between 1 and ${activities.length}`);
      continue;
    }

    const selected = activities[num - 1];
    console.log(`\n🔍 Scraping all data for "${selected.name}"...\n`);

    try {
      const enriched = await fetchEnrichedActivity(client, selected.id, selected.name);

      // Show details in terminal
      printActivityDetails(enriched);

      // Build export
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
      };

      // Save
      if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
      const safeName = selected.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
      const dateStr = new Date(selected.start_date_local).toISOString().slice(0, 10);
      const outputPath = join(OUTPUT_DIR, `activity_${selected.id}_${dateStr}_${safeName}.json`);
      writeFileSync(outputPath, JSON.stringify(exportData, null, 2), "utf-8");

      const sizeMB = (Buffer.byteLength(JSON.stringify(exportData)) / 1024 / 1024).toFixed(2);
      console.log(`\n✅ Saved: ${outputPath}`);
      console.log(`   Size: ${sizeMB} MB | Stream points: ${streamTable.length}`);
      console.log(`   Streams: ${Object.keys(enriched.streams).join(", ") || "none"}`);
      console.log(`\n💡 Feed this JSON to an AI for insights on pacing, HR drift, power, etc.`);
    } catch (err: any) {
      console.error(`\n❌ Error: ${err.message}`);
      if (err.response?.data) console.error("   API:", JSON.stringify(err.response.data, null, 2));
    }
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err.message);
  if (err.response?.data) console.error("   API:", JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});

