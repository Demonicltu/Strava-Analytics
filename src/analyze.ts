import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { loadAllConfigs, callAIBatch } from "./ai_client.js";
import { renderTemplate, fillSlots, getSlotNames } from "./template.js";
import { buildInterpretationRequests } from "./interpret.js";
import { buildAnalyzeContext } from "./analyze_context.js";
import { prompt, parseNumberSelection } from "./cli_utils.js";

let __dirname2: string;
try { __dirname2 = dirname(fileURLToPath(import.meta.url)); } catch { __dirname2 = process.cwd(); }
const BASE_DIR = existsSync(join(__dirname2, "..", "package.json")) ? join(__dirname2, "..") : process.cwd();
const ANALYSIS_DIR = join(BASE_DIR, "analysis");

// ─── Helpers ───

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

function providerLabel(configs: { provider: string; model: string }[]): string {
  return configs.map(c => `${c.provider.toUpperCase()} (${c.model})`).join(" → ");
}

function listCrunchedFiles(analysisDir: string): string[] {
  return readdirSync(analysisDir)
    .filter(f => f.endsWith("_crunched.json"))
    .sort((a, b) => b.localeCompare(a));
}

async function pickCrunchedFile(crunchedFiles: string[]): Promise<string> {
  console.log("📁 Available pre-analyzed files:\n");
  for (let i = 0; i < crunchedFiles.length; i++) {
    const fp = join(ANALYSIS_DIR, crunchedFiles[i]);
    const size = formatFileSize(readFileSync(fp).length);
    const name = crunchedFiles[i]
      .replace("activity_", "")
      .replace("_crunched.json", "")
      .replaceAll("_", " ");
    console.log(`  ${i + 1}. ${name} (${size})`);
  }

  console.log("");
  const input = await prompt(`👉 Pick a file (1-${crunchedFiles.length}): `);
  const num = parseNumberSelection(input, crunchedFiles.length);
  if (num == null) {
    console.log("❌ Invalid.");
    process.exit(1);
  }
  return crunchedFiles[num - 1];
}

function printContextSummary(historicalCtx: any, wellnessCtx: any, bytes: number, tokens: number): void {
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
  console.log(`   Size: ${formatFileSize(bytes)} (~${tokens.toLocaleString()} tokens)`);
}

async function generateAnalysis(
  configs: any[],
  selectedFile: string,
  crunchedParsed: any,
  historicalCtx: any,
  wellnessCtx: any,
  recommendation: any,
): Promise<string> {
  console.log(`\n📄 ${selectedFile}`);
  console.log(`   🏗️  Rendering template...`);

  const skeleton = renderTemplate(crunchedParsed, historicalCtx, wellnessCtx, recommendation);
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
    return fillSlots(skeleton, interpretations);
  } catch (err: any) {
    const slotInfo = err.failedSlot ? ` (slot: ${err.failedSlot})` : "";
    const httpStatus = err.response?.status ? ` [HTTP ${err.response.status}]` : "";
    if (configs.length > 1) {
      const fb = configs[1];
      console.log(`   ⚠️  ${primaryCfg.provider.toUpperCase()} failed${slotInfo}${httpStatus}: ${err.message}`);
      console.log(`   🔄 Retrying with ${fb.provider.toUpperCase()} (${fb.model})...`);
      const interpretations = await callAIBatch(fb, requests);
      return fillSlots(skeleton, interpretations);
    }
    console.error(`\n❌ AI error${slotInfo}${httpStatus}: ${err.message}`);
    process.exit(1);
  }
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
  console.log(`✅ AI providers: ${providerLabel(configs)}\n`);

  // Find crunched files
  if (!existsSync(ANALYSIS_DIR)) { console.error("❌ No analysis/ directory. Run 'npm run crunch' first."); process.exit(1); }
  const crunchedFiles = listCrunchedFiles(ANALYSIS_DIR);

  if (crunchedFiles.length === 0) {
    console.error("❌ No crunched files. Run 'npm run crunch' first to pre-analyze an activity.");
    process.exit(1);
  }

  const selectedFile = await pickCrunchedFile(crunchedFiles);
  const filePath = join(ANALYSIS_DIR, selectedFile);
  const crunchedData = readFileSync(filePath, "utf-8");
  const tokens = Math.ceil(crunchedData.length / 4);

  // Common context loading (shared between both pipelines)
  const rawForPR = JSON.parse(crunchedData);
  const {
    historicalCtx,
    prCheck,
    wellnessCtx,
    recommendation,
  } = buildAnalyzeContext(ANALYSIS_DIR, selectedFile, rawForPR);
  if (prCheck && prCheck.pr_labels.length > 0) {
    console.log(`   🏅 NEW PRs detected: ${prCheck.pr_labels.join(" | ")}`);
  }
  const crunchedParsed = rawForPR;

  printContextSummary(historicalCtx, wellnessCtx, crunchedData.length, tokens);

  const analysis = await generateAnalysis(
    configs,
    selectedFile,
    crunchedParsed,
    historicalCtx,
    wellnessCtx,
    recommendation,
  );

  console.log("\n" + "═".repeat(80));
  console.log(analysis);
  console.log("═".repeat(80));

  // Save
  const analysisPath = filePath.replace("_crunched.json", "_analysis.md");
  writeFileSync(analysisPath, analysis, "utf-8");
  console.log(`\n✅ Analysis saved: ${analysisPath}`);
}

main().catch((err) => { console.error("\n❌ Fatal:", err.message); process.exit(1); });
