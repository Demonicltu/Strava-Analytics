/**
 * Re-crunch all existing output/*.json files to regenerate analysis/*_crunched.json.
 * Use this after adding new metrics to crunch.ts — no Strava API calls needed.
 *
 * Usage:
 *   npm run recrunch           → re-crunch everything in output/
 *   npm run recrunch -- --new  → only re-crunch if _crunched.json is missing
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { loadRiderConfig } from "./config.js";
import { crunchActivity } from "./crunch.js";

let __dirname2: string;
try { __dirname2 = dirname(fileURLToPath(import.meta.url)); } catch { __dirname2 = process.cwd(); }
const BASE_DIR = existsSync(join(__dirname2, "..", "package.json")) ? join(__dirname2, "..") : process.cwd();
const OUTPUT_DIR = join(BASE_DIR, "output");
const ANALYSIS_DIR = join(BASE_DIR, "analysis");

const NEW_ONLY = process.argv.includes("--new");

async function main() {
  console.log("\n🔬 Bulk Re-Crunch — regenerate all _crunched.json from existing output files\n");
  if (NEW_ONLY) {
    console.log("   Mode: --new (skip already-crunched files)\n");
  } else {
    console.log("   Mode: overwrite ALL (re-crunch everything to pick up new metrics)\n");
  }

  if (!existsSync(OUTPUT_DIR)) {
    console.error("❌ No output/ directory. Run 'npm run bulk' first to download activities.");
    process.exit(1);
  }

  const rider = loadRiderConfig();
  if (rider.weightKg) console.log(`   ⚖️  Rider weight: ${rider.weightKg} kg`);
  if (rider.ftpW)     console.log(`   ⚡ FTP: ${rider.ftpW} W`);
  if (rider.maxHr)    console.log(`   ❤️  Max HR: ${rider.maxHr} bpm`);
  console.log();

  if (!existsSync(ANALYSIS_DIR)) mkdirSync(ANALYSIS_DIR, { recursive: true });

  const outputFiles = readdirSync(OUTPUT_DIR)
    .filter(f => f.endsWith(".json"))
    .sort();

  if (outputFiles.length === 0) {
    console.error("❌ No JSON files in output/. Run 'npm run bulk' first.");
    process.exit(1);
  }

  // Build set of already-crunched IDs for --new mode
  const crunchedIds = new Set<string>();
  if (NEW_ONLY) {
    for (const f of readdirSync(ANALYSIS_DIR)) {
      if (!f.endsWith("_crunched.json")) continue;
      const m = f.match(/activity_(\d+)_/);
      if (m) crunchedIds.add(m[1]);
    }
  }

  let done = 0, skipped = 0, failed = 0;
  const total = outputFiles.length;

  for (let i = 0; i < outputFiles.length; i++) {
    const fname = outputFiles[i];
    const m = fname.match(/activity_(\d+)_/);
    const id = m?.[1] ?? "";

    if (NEW_ONLY && crunchedIds.has(id)) {
      skipped++;
      continue;
    }

    const outputPath = join(OUTPUT_DIR, fname);
    // Derive crunched path: same name stem + _crunched.json
    const stem = basename(fname, ".json");
    const crunchedPath = join(ANALYSIS_DIR, `${stem}_crunched.json`);

    process.stdout.write(`[${i + 1}/${total}] ${fname.slice(0, 70).padEnd(70)} `);

    try {
      const raw = JSON.parse(readFileSync(outputPath, "utf-8"));
      const result = crunchActivity(raw, rider);
      writeFileSync(crunchedPath, JSON.stringify(result, null, 2), "utf-8");
      done++;

      const pts = (raw.stream_data || []).length;
      const score = result.pogacar_score?.composite_pct ?? result.kipchoge_score?.composite_pct ?? null;
      const scoreStr = score != null ? ` | score ${score}%` : "";
      console.log(`✅ (${pts} pts${scoreStr})`);
    } catch (err: any) {
      failed++;
      console.log(`❌ ${err.message}`);
    }
  }

  console.log("\n" + "═".repeat(70));
  console.log(`✅ Re-crunched: ${done}  |  ⏭️  Skipped: ${skipped}  |  ❌ Failed: ${failed}`);
  console.log(`\n💡 Historical context will now include all new metrics (EF, NP, Z2%, etc.)`);
  console.log(`💡 Run 'npm run records' to refresh personal records database.`);
  console.log(`💡 Run 'npm run dashboard' to regenerate the HTML dashboard.\n`);
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err.message);
  process.exit(1);
});

