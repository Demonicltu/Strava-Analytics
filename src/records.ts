/**
 * Personal Records tracker.
 * Auto-detects PRs from _crunched.json files:
 *   - Fastest 1K / 5K / 10K pace
 *   - Longest ride / run / walk / swim
 *   - Biggest single climb (elevation gain)
 *   - Highest normalized power
 *   - Best VO2max estimate
 *   - Highest TSS / TRIMP single session
 *
 * Usage: npm run records
 *
 * Saves analysis/personal_records.json and prints a summary.
 * When run after a new crunched file was added, flags any newly broken records.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { loadAllSummaries, round2, ActivitySummary } from "./summary_utils.js";

let __dirname2: string;
try { __dirname2 = dirname(fileURLToPath(import.meta.url)); } catch { __dirname2 = process.cwd(); }
const BASE_DIR = existsSync(join(__dirname2, "..", "package.json")) ? join(__dirname2, "..") : process.cwd();
const ANALYSIS_DIR = join(BASE_DIR, "analysis");
const RECORDS_PATH = join(ANALYSIS_DIR, "personal_records.json");

export interface PR {
  value: number;       // numeric value (pace: sec/km, dist: km, power: W, elev: m, etc.)
  label: string;       // human-readable value
  date: string;
  name: string;
  sport: string;
}

export interface PersonalRecords {
  updated_at: string;
  total_activities_scanned: number;

  // Running
  run_fastest_km_pace: PR | null;        // lowest sec/km from any activity with dist ≥ 1 km
  run_fastest_5k_pace: PR | null;        // lowest sec/km from activities ≥ 5 km
  run_fastest_10k_pace: PR | null;       // lowest sec/km from activities ≥ 10 km
  run_longest_km: PR | null;

  // Cycling
  ride_longest_km: PR | null;
  ride_best_normalized_power_w: PR | null;

  // All sports
  biggest_climb_m: PR | null;            // highest elevation_m in a single activity
  best_vo2max: PR | null;
  highest_tss: PR | null;
  highest_trimp: PR | null;

  // By sport: longest distance
  longest_by_sport: Record<string, PR>;
}

function fmtPace(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}/km`;
}

export function buildRecords(summaries: ActivitySummary[]): PersonalRecords {
  const runs = summaries.filter(a => a.sport === "Run");
  const rides = summaries.filter(a => a.sport === "Ride");

  const best = <T extends keyof ActivitySummary>(
    acts: ActivitySummary[],
    field: T,
    direction: "min" | "max",
    minDist = 0,
    label: (v: number) => string,
  ): PR | null => {
    const filtered = acts.filter(a => (a[field] as any) != null && a.distance_km >= minDist);
    if (filtered.length === 0) return null;
    const sorted = [...filtered].sort((a, b) =>
      direction === "min"
        ? (a[field] as number) - (b[field] as number)
        : (b[field] as number) - (a[field] as number),
    );
    const winner = sorted[0];
    const val = winner[field] as number;
    return { value: val, label: label(val), date: winner.date, name: winner.name, sport: winner.sport };
  };

  // Longest by sport
  const longestBySport: Record<string, PR> = {};
  const sportSet = new Set(summaries.map(a => a.sport));
  for (const sp of sportSet) {
    const r = best(summaries.filter(a => a.sport === sp), "distance_km", "max", 0, v => `${round2(v)} km`);
    if (r) longestBySport[sp] = r;
  }

  return {
    updated_at: new Date().toISOString(),
    total_activities_scanned: summaries.length,

    run_fastest_km_pace: best(runs, "pace_sec_per_km", "min", 1, fmtPace),
    run_fastest_5k_pace: best(runs, "pace_sec_per_km", "min", 5, fmtPace),
    run_fastest_10k_pace: best(runs, "pace_sec_per_km", "min", 10, fmtPace),
    run_longest_km: best(runs, "distance_km", "max", 0, v => `${round2(v)} km`),

    ride_longest_km: best(rides, "distance_km", "max", 0, v => `${round2(v)} km`),
    ride_best_normalized_power_w: best(rides, "normalized_power", "max", 0, v => `${Math.round(v)} W`),

    biggest_climb_m: best(summaries, "elevation_m", "max", 0, v => `${Math.round(v)} m`),
    best_vo2max: best(summaries, "vo2max", "max", 0, v => `${Math.round(v * 10) / 10} mL/kg/min`),
    highest_tss: best(summaries, "tss", "max", 0, v => `${Math.round(v)}`),
    highest_trimp: best(summaries, "trimp", "max", 0, v => `${Math.round(v)}`),

    longest_by_sport: longestBySport,
  };
}

function printRecords(records: PersonalRecords, previous: PersonalRecords | null, newActivity: string | null): void {
  console.log("\n🏅 PERSONAL RECORDS\n");
  console.log(`   Scanned: ${records.total_activities_scanned} activities | Updated: ${records.updated_at.slice(0, 10)}\n`);

  const checkNew = (current: PR | null, prev: PR | null): string => {
    if (!current || !newActivity) return "";
    if (!prev) return " 🆕 (first record)";
    if (current.date !== prev.date && current.value !== prev.value) return " 🔥 NEW PR!";
    return "";
  };

  const prevRec = previous;

  const row = (label: string, pr: PR | null, prev: PR | null) => {
    if (!pr) { console.log(`   ${label.padEnd(30)} —`); return; }
    const flag = checkNew(pr, prev);
    console.log(`   ${label.padEnd(30)} ${pr.label.padEnd(20)} ${pr.date}  ${pr.name.slice(0, 35)}${flag}`);
  };

  console.log("  ─── Running ──────────────────────────────────────────────────────");
  row("🏃 Fastest km pace", records.run_fastest_km_pace, prevRec?.run_fastest_km_pace ?? null);
  row("🏃 Fastest 5K pace", records.run_fastest_5k_pace, prevRec?.run_fastest_5k_pace ?? null);
  row("🏃 Fastest 10K pace", records.run_fastest_10k_pace, prevRec?.run_fastest_10k_pace ?? null);
  row("📏 Longest run", records.run_longest_km, prevRec?.run_longest_km ?? null);

  console.log("\n  ─── Cycling ─────────────────────────────────────────────────────");
  row("📏 Longest ride", records.ride_longest_km, prevRec?.ride_longest_km ?? null);
  row("⚡ Best normalized power", records.ride_best_normalized_power_w, prevRec?.ride_best_normalized_power_w ?? null);

  console.log("\n  ─── Overall ─────────────────────────────────────────────────────");
  row("⛰️  Biggest climb", records.biggest_climb_m, prevRec?.biggest_climb_m ?? null);
  row("🫁 Best VO2max", records.best_vo2max, prevRec?.best_vo2max ?? null);
  row("📈 Highest TSS", records.highest_tss, prevRec?.highest_tss ?? null);
  row("❤️  Highest TRIMP", records.highest_trimp, prevRec?.highest_trimp ?? null);

  if (Object.keys(records.longest_by_sport).length > 0) {
    console.log("\n  ─── Longest by sport ────────────────────────────────────────────");
    for (const [sport, pr] of Object.entries(records.longest_by_sport)) {
      row(`📏 ${sport}`, pr, prevRec?.longest_by_sport[sport] ?? null);
    }
  }

  console.log();
}

async function main() {
  console.log("\n🏅 Personal Records Tracker\n");

  if (!existsSync(ANALYSIS_DIR)) { console.error("❌ No analysis/ directory."); process.exit(1); }

  const summaries = loadAllSummaries(ANALYSIS_DIR);
  if (summaries.length === 0) { console.error("❌ No crunched files. Run 'npm run bulk' first."); process.exit(1); }

  console.log(`✅ Scanning ${summaries.length} activities...\n`);

  const previous: PersonalRecords | null = existsSync(RECORDS_PATH)
    ? JSON.parse(readFileSync(RECORDS_PATH, "utf-8"))
    : null;

  const records = buildRecords(summaries);

  printRecords(records, previous, null);

  writeFileSync(RECORDS_PATH, JSON.stringify(records, null, 2), "utf-8");
  console.log(`✅ Records saved: ${RECORDS_PATH}`);
}

main().catch(err => { console.error("\n❌ Fatal:", err.message); process.exit(1); });

