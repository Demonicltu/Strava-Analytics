import { createInterface } from "readline";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { loadAllSummaries, buildHistoricalContext, groupSport, extractSummary, checkPRs } from "./summary_utils.js";
import { loadWellnessContext } from "./wellness.js";
import { buildPersonalScore } from "./format.js";
import { loadAllConfigs, callAIBatch } from "./ai_client.js";
import { renderTemplate, fillSlots, getSlotNames } from "./template.js";
import { buildInterpretationRequests } from "./interpret.js";

let __dirname2: string;
try { __dirname2 = dirname(fileURLToPath(import.meta.url)); } catch { __dirname2 = process.cwd(); }
const BASE_DIR = existsSync(join(__dirname2, "..", "package.json")) ? join(__dirname2, "..") : process.cwd();
const ANALYSIS_DIR = join(BASE_DIR, "analysis");

// ─── Historical context ───

function loadHistoricalContext(selectedFile: string, crunchedData: string): object | null {
  try {
    const raw = JSON.parse(crunchedData);
    const sport_raw: string = raw.summary_card?.type ?? "Unknown";
    const sport = groupSport(sport_raw);
    const fileDate = selectedFile.match(/_(\d{4}-\d{2}-\d{2})_/);
    if (!fileDate) return null;
    const activityDate = fileDate[1];
    const allSummaries = loadAllSummaries(ANALYSIS_DIR);
    return buildHistoricalContext(allSummaries, activityDate, sport);
  } catch {
    return null;
  }
}

// ─── Helpers ───


function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

// ─── Main ───

async function main() {
  console.log("\n📊 Strava Activity Analyzer\n");


  const configs = loadAllConfigs();
  if (configs.length === 0) {
    console.error("❌ No AI API key found. Add at least one to .env:");
    console.error("   GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY");
    process.exit(1);
  }
  console.log(`✅ AI providers: ${configs.map(c => `${c.provider.toUpperCase()} (${c.model})`).join(" → ")}\n`);

  // Find crunched files
  if (!existsSync(ANALYSIS_DIR)) { console.error("❌ No analysis/ directory. Run 'npm run crunch' first."); process.exit(1); }
  const crunchedFiles = readdirSync(ANALYSIS_DIR).filter(f => f.endsWith("_crunched.json")).sort().reverse();

  if (crunchedFiles.length === 0) {
    console.error("❌ No crunched files. Run 'npm run crunch' first to pre-analyze an activity.");
    process.exit(1);
  }

  console.log("📁 Available pre-analyzed files:\n");
  for (let i = 0; i < crunchedFiles.length; i++) {
    const fp = join(ANALYSIS_DIR, crunchedFiles[i]);
    const size = formatFileSize(readFileSync(fp).length);
    const name = crunchedFiles[i].replace("activity_", "").replace("_crunched.json", "").replace(/_/g, " ");
    console.log(`  ${i + 1}. ${name} (${size})`);
  }

  console.log("");
  const input = await prompt(`👉 Pick a file (1-${crunchedFiles.length}): `);
  const num = parseInt(input, 10);
  if (isNaN(num) || num < 1 || num > crunchedFiles.length) { console.log("❌ Invalid."); process.exit(1); }

  const selectedFile = crunchedFiles[num - 1];
  const filePath = join(ANALYSIS_DIR, selectedFile);
  const crunchedData = readFileSync(filePath, "utf-8");
  const tokens = Math.ceil(crunchedData.length / 4);

  // Common context loading (shared between both pipelines)
  const historicalCtx = loadHistoricalContext(selectedFile, crunchedData);
  const personalScore = buildPersonalScore(crunchedData, historicalCtx);
  const allSummariesForPR = loadAllSummaries(ANALYSIS_DIR);
  const rawForPR = JSON.parse(crunchedData);
  const summaryForPR = extractSummary(rawForPR, selectedFile);
  const prCheck = summaryForPR ? checkPRs(allSummariesForPR, summaryForPR) : null;
  if (prCheck && prCheck.pr_labels.length > 0) {
    console.log(`   🏅 NEW PRs detected: ${prCheck.pr_labels.join(" | ")}`);
  }
  const fileDate = selectedFile.match(/_(\d{4}-\d{2}-\d{2})_/);
  const actDate = fileDate ? fileDate[1] : null;
  const crunchedParsed = JSON.parse(crunchedData);
  const actStartIso: string | null = crunchedParsed?.summary_card?.start_date_local
    ?? crunchedParsed?.activity_meta?.start_date_local ?? null;
  const utcOffset: number = crunchedParsed?.summary_card?.local_utc_offset_hours ?? 0;
  const wellnessCtx = actDate ? loadWellnessContext(ANALYSIS_DIR, actDate, actStartIso, utcOffset) : null;

  if (historicalCtx) {
    const ctx = historicalCtx as any;
    console.log(`   📈 Historical baseline: ${ctx.baselines?.length ?? 0} period(s) for ${ctx.sport}`);
  } else {
    console.log(`   💡 No historical baseline — run 'npm run bulk' to enable`);
  }
  if (wellnessCtx) {
    console.log(`   🛌 Garmin wellness: ${wellnessCtx.readiness_note}`);
  } else {
    console.log(`   💡 No Garmin wellness — run 'python garmin_sync.py' to enable`);
  }
  console.log(`   Size: ${formatFileSize(crunchedData.length)} (~${tokens.toLocaleString()} tokens)`);

  let analysis: string;

  // ─── Template + parallel micro-calls pipeline ──────────────────────────
  console.log(`\n📄 ${selectedFile}`);
  console.log(`   🏗️  Rendering template...`);

  const skeleton = renderTemplate(crunchedParsed, historicalCtx, wellnessCtx);
  const slots = getSlotNames(skeleton);
  console.log(`   🎯 Slots to fill: ${slots.join(", ")}`);

  const requests = buildInterpretationRequests(crunchedParsed, historicalCtx, wellnessCtx, slots);
  const primaryCfg = configs[0];
  console.log(`   🤖 Running ${requests.length} AI calls (${primaryCfg.provider.toUpperCase()} ${primaryCfg.model})...`);

  const start = Date.now();
  try {
    const interpretations = await callAIBatch(primaryCfg, requests);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`   ✅ All ${requests.length} slots filled in ${elapsed}s`);
    analysis = fillSlots(skeleton, interpretations);
  } catch (err: any) {
    const slotInfo = err.failedSlot ? ` (slot: ${err.failedSlot})` : "";
    const httpStatus = err.response?.status ? ` [HTTP ${err.response.status}]` : "";
    if (configs.length > 1) {
      const fb = configs[1];
      console.log(`   ⚠️  ${primaryCfg.provider.toUpperCase()} failed${slotInfo}${httpStatus}: ${err.message}`);
      console.log(`   🔄 Retrying with ${fb.provider.toUpperCase()} (${fb.model})...`);
      const interpretations = await callAIBatch(fb, requests);
      analysis = fillSlots(skeleton, interpretations);
    } else {
      console.error(`\n❌ AI error${slotInfo}${httpStatus}: ${err.message}`);
      process.exit(1);
    }
  }

  console.log("\n" + "═".repeat(80));
  console.log(analysis);
  console.log("═".repeat(80));

  // Save
  const analysisPath = filePath.replace("_crunched.json", "_analysis.md");
  writeFileSync(analysisPath, analysis, "utf-8");
  console.log(`\n✅ Analysis saved: ${analysisPath}`);
}

main().catch((err) => { console.error("\n❌ Fatal:", err.message); process.exit(1); });
