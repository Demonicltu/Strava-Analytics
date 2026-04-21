import { createInterface } from "readline";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ANALYSIS_DIR = join(__dirname, "..", "analysis");
const INSTRUCTIONS_PATH = join(__dirname, "..", "..", ".github", "AI_ANALYSIS_INSTRUCTIONS.md");

// ─── Config ───

interface AnalyzeConfig {
  provider: "openai" | "gemini" | "groq" | "openrouter";
  apiKey: string;
  model: string;
}

function loadAllConfigs(): AnalyzeConfig[] {
  const configs: AnalyzeConfig[] = [];
  const geminiKey = process.env["GEMINI_API_KEY"];
  const groqKey = process.env["GROQ_API_KEY"];
  const openrouterKey = process.env["OPENROUTER_API_KEY"];
  const openaiKey = process.env["OPENAI_API_KEY"];

  // Priority order: Gemini (free) → Groq (fast) → OpenRouter (flexible) → OpenAI
  if (geminiKey) configs.push({ provider: "gemini", apiKey: geminiKey, model: process.env["GEMINI_MODEL"] || "gemini-2.5-flash" });
  if (groqKey) configs.push({ provider: "groq", apiKey: groqKey, model: process.env["GROQ_MODEL"] || "llama-3.3-70b-versatile" });
  if (openrouterKey) configs.push({ provider: "openrouter", apiKey: openrouterKey, model: process.env["OPENROUTER_MODEL"] || "deepseek/deepseek-chat-v3-0324" });
  if (openaiKey) configs.push({ provider: "openai", apiKey: openaiKey, model: process.env["OPENAI_MODEL"] || "gpt-4o" });

  return configs;
}

function loadAnalyzeConfig(): AnalyzeConfig {
  const configs = loadAllConfigs();
  if (configs.length === 0) {
    console.error("❌ No AI API key found. Add at least one to .env:");
    console.error("   GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY");
    process.exit(1);
  }
  return configs[0];
}

/** Strip excessive repeated characters (█░▓ spam) and duplicate markdown blocks from AI output */
function sanitizeAIOutput(text: string): string {
  // Replace runs of 10+ identical characters with max 10
  let cleaned = text.replace(/(.)\1{9,}/g, (match, char) => char.repeat(Math.min(match.length, 10)));
  // Remove entire lines that are just block chars
  cleaned = cleaned.replace(/^[█░▓\s]{20,}$/gm, "");
  // Remove duplicate markdown code blocks (AI sometimes repeats the whole analysis)
  const marker = "## 🏆 POGAČAR SCORE";
  const firstIdx = cleaned.indexOf(marker);
  const secondIdx = firstIdx >= 0 ? cleaned.indexOf(marker, firstIdx + 1) : -1;
  if (secondIdx > 0) cleaned = cleaned.substring(0, secondIdx).trimEnd();
  return cleaned;
}// ─── Helpers ───

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

// ─── OpenAI-compatible API (works for OpenAI, Groq, OpenRouter) ───

const PROVIDER_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

async function analyzeWithOpenAICompatible(provider: string, apiKey: string, model: string, instructions: string, data: string): Promise<string> {
  const { default: axios } = await import("axios");
  const url = PROVIDER_URLS[provider] || PROVIDER_URLS.openai;
  const label = provider.toUpperCase();
  console.log(`\n🤖 Sending to ${label} (${model})...\n`);

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.post(url, {
        model,
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: `Write the full activity analysis based on this pre-computed data. All math is done — just interpret and write:\n\n${data}` },
        ],
        temperature: 0.4,
        max_tokens: 8000,
      }, { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 180_000 });
      return res.data.choices[0].message.content;
    } catch (err: any) {
      const status = err.response?.status;
      if ((status === 429 || status === 503) && attempt < maxRetries) {
        const wait = status === 503 ? 30 : 60;
        console.log(`   ⏳ ${label} ${status === 503 ? "unavailable" : "rate limited"}. Waiting ${wait}s (${attempt + 1}/${maxRetries})...`);
        await sleep(wait * 1000);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label} max retries exceeded`);
}

// ─── Unified AI call with provider fallback ───

async function analyzeWithFallback(configs: AnalyzeConfig[], instructions: string, data: string): Promise<{ analysis: string; provider: string; model: string }> {
  for (let i = 0; i < configs.length; i++) {
    const cfg = configs[i];
    try {
      let analysis: string;
      if (cfg.provider === "gemini") {
        analysis = await analyzeWithGemini(cfg.apiKey, cfg.model, instructions, data);
      } else {
        analysis = await analyzeWithOpenAICompatible(cfg.provider, cfg.apiKey, cfg.model, instructions, data);
      }
      return { analysis, provider: cfg.provider, model: cfg.model };
    } catch (err: any) {
      const next = i + 1 < configs.length ? configs[i + 1] : null;
      if (next) {
        console.log(`\n⚠️  ${cfg.provider.toUpperCase()} failed: ${err.message}`);
        console.log(`   🔄 Falling back to ${next.provider.toUpperCase()} (${next.model})...`);
      } else {
        throw err; // Last provider, propagate error
      }
    }
  }
  throw new Error("All AI providers failed");
}

// ─── Gemini API (with auto-retry on 429) ───

async function analyzeWithGemini(apiKey: string, model: string, instructions: string, data: string): Promise<string> {
  const { default: axios } = await import("axios");
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt === 1) console.log(`\n🤖 Sending to Google Gemini (${model})...\n`);
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          system_instruction: { parts: [{ text: instructions }] },
          contents: [{ parts: [{ text: `Write the full activity analysis based on this pre-computed data. All math is done — just interpret and write:\n\n${data}` }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 8000 },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 180_000 }
      );
      const candidates = response.data.candidates;
      if (!candidates || candidates.length === 0) throw new Error("No candidates: " + JSON.stringify(response.data));
      return candidates[0].content.parts.map((p: any) => p.text).join("");
    } catch (err: any) {
      const status = err.response?.status;
      if ((status === 429 || status === 503) && attempt < maxRetries) {
        let waitSec = status === 503 ? 30 : 60;
        try { const d = err.response.data?.error?.details?.find((d: any) => d["@type"]?.includes("RetryInfo")); if (d?.retryDelay) waitSec = Math.ceil(parseFloat(d.retryDelay.replace("s",""))) + 5; } catch {}
        console.log(`⏳ ${status === 503 ? "Service unavailable" : "Rate limited"}. Waiting ${waitSec}s (retry ${attempt + 1}/${maxRetries})...`);
        await sleep(waitSec * 1000);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
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

  // Load instructions
  if (!existsSync(INSTRUCTIONS_PATH)) { console.error("❌ AI_ANALYSIS_INSTRUCTIONS.md not found!"); process.exit(1); }
  const instructions = readFileSync(INSTRUCTIONS_PATH, "utf-8");

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

  console.log(`\n📄 ${selectedFile}`);
  console.log(`   Size: ${formatFileSize(crunchedData.length)} (~${tokens.toLocaleString()} tokens)`);
  console.log(`   ✅ Pre-computed data — no sampling, all math done`);

  // Send to AI (with automatic fallback)
  let analysis: string;
  try {
    const result = await analyzeWithFallback(configs, instructions, crunchedData);
    analysis = sanitizeAIOutput(result.analysis);
    console.log(`   ✅ Generated by ${result.provider.toUpperCase()} (${result.model})`);
  } catch (err: any) {
    console.error("\n❌ AI error:", err.message);
    if (err.response?.data) console.error("   Response:", JSON.stringify(err.response.data, null, 2));
    process.exit(1);
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
