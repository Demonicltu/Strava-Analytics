/**
 * Pre-analyze a Strava activity JSON — compute ALL stats from full data (no sampling).
 * Outputs a compact, AI-ready summary with all math pre-done.
 *
 * Usage:
 *   npx tsx src/pre_analyze.ts                    → interactive picker
 *   npx tsx src/pre_analyze.ts path/to/file.json  → specific file
 */
import { createInterface } from "readline";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { loadRiderConfig } from "./config.js";
import { crunchActivity } from "./crunch.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_DIR = join(__dirname, "..", "output");
const ANALYSIS_DIR = join(__dirname, "..", "analysis");

// ─── Helpers ───

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

// ─── Pick file ───

async function pickFile(): Promise<string> {
  if (process.argv[2]) return process.argv[2];

  if (!existsSync(OUTPUT_DIR)) { console.error("❌ No output/ directory. Run 'npm start' first."); process.exit(1); }
  const files = readdirSync(OUTPUT_DIR).filter(f => f.endsWith(".json")).sort().reverse();
  if (files.length === 0) { console.error("❌ No JSON files in output/."); process.exit(1); }

  console.log("\n📁 Available activity files:\n");
  for (let i = 0; i < files.length; i++) {
    const size = (readFileSync(join(OUTPUT_DIR, files[i])).length / 1024 / 1024).toFixed(2);
    const name = files[i].replace("activity_", "").replace(".json", "").replace(/_/g, " ");
    console.log(`  ${i + 1}. ${name} (${size} MB)`);
  }
  const input = await prompt(`\n👉 Pick a file (1-${files.length}): `);
  const num = parseInt(input, 10);
  if (isNaN(num) || num < 1 || num > files.length) { console.error("❌ Invalid."); process.exit(1); }
  return join(OUTPUT_DIR, files[num - 1]);
}

// ─── Main ───

async function main() {
  console.log("\n🔬 Strava Pre-Analyzer (full data, zero sampling)\n");

  const rider = loadRiderConfig();
  if (rider.weightKg) console.log(`   ⚖️ Rider weight: ${rider.weightKg} kg`);
  if (rider.ftpW) console.log(`   ⚡ Rider FTP: ${rider.ftpW} W`);
  if (rider.maxHr) console.log(`   ❤️ Max HR: ${rider.maxHr} bpm`);

  const targetFile = await pickFile();
  console.log(`\n📄 Reading: ${basename(targetFile)}`);
  const raw = JSON.parse(readFileSync(targetFile, "utf-8"));

  const totalPoints = (raw.stream_data || []).length;
  console.log(`   Stream data points: ${totalPoints}`);

  const output = crunchActivity(raw, rider);

  if (!existsSync(ANALYSIS_DIR)) mkdirSync(ANALYSIS_DIR, { recursive: true });
  const outPath = join(ANALYSIS_DIR, `${basename(targetFile).replace(".json", "")}_crunched.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");

  const sizeKB = Math.round(readFileSync(outPath).length / 1024);
  console.log(`\n✅ Pre-analysis saved: ${outPath}`);
  console.log(`   Size: ${sizeKB} KB (from ${(readFileSync(targetFile).length / 1024 / 1024).toFixed(2)} MB raw)`);
  console.log(`   Points: ${totalPoints} → all processed, zero sampling`);
  if (output.pogacar_score) console.log(`   🏆 Pogačar Score: ${output.pogacar_score.composite_pct}% (${output.pogacar_score.reference})`);
  if (output.training_metrics) console.log(`   ⚙️ IF: ${output.training_metrics.intensity_factor} | TSS: ${output.training_metrics.tss}`);
  if (output.power_to_weight) console.log(`   💪 W/kg: ${output.power_to_weight.avg_wkg} avg | Level: ${output.power_to_weight.estimated_level}`);
  if (output.relative_effort) console.log(`   🔥 Relative Effort: ${output.relative_effort.score} (${output.relative_effort.interpretation})`);
  console.log(`   🏅 PRs: ${output.segments_summary?.prs || 0} | Pacing: ${output.pacing.type}`);
  console.log(`\n💡 Send the _crunched.json to AI (or share with Copilot) for written analysis.`);
}

main().catch((err) => { console.error("\n❌ Error:", err.message); process.exit(1); });
