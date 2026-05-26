/**
 * Shared AI client — Gemini / OpenAI-compatible (Groq, OpenRouter, OpenAI).
 * Supports single calls and parallel batch calls with controlled concurrency.
 * For interpretation calls, use callAI / callAIBatch with the primary config.
 */
import "dotenv/config";
import axios from "axios";
import { validateSlotOutput } from "./validate.js";

export interface AiConfig {
  provider: "openai" | "gemini" | "groq" | "openrouter";
  apiKey: string;
  model: string;
}

export interface AiRequest {
  slot: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface TokenUsage {
  sent: number;   // prompt / input tokens
  received: number; // completion / output tokens
}

// Session-level accumulator — call resetTokenUsage() between runs if needed
const _usage: TokenUsage = { sent: 0, received: 0 };

export function getTokenUsage(): Readonly<TokenUsage> { return { ..._usage }; }
export function resetTokenUsage(): void { _usage.sent = 0; _usage.received = 0; }

const PROVIDER_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

export function loadAllConfigs(): AiConfig[] {
  const configs: AiConfig[] = [];
  const geminiKey = process.env["GEMINI_API_KEY"];
  const groqKey = process.env["GROQ_API_KEY"];
  const openrouterKey = process.env["OPENROUTER_API_KEY"];
  const openaiKey = process.env["OPENAI_API_KEY"];
  if (geminiKey) configs.push({ provider: "gemini", apiKey: geminiKey, model: process.env["GEMINI_MODEL"] || "gemini-2.5-flash" });
  if (groqKey) configs.push({ provider: "groq", apiKey: groqKey, model: process.env["GROQ_MODEL"] || "llama-3.3-70b-versatile" });
  if (openrouterKey) configs.push({ provider: "openrouter", apiKey: openrouterKey, model: process.env["OPENROUTER_MODEL"] || "deepseek/deepseek-chat-v3-0324" });
  if (openaiKey) configs.push({ provider: "openai", apiKey: openaiKey, model: process.env["OPENAI_MODEL"] || "gpt-4o" });
  return configs;
}

async function callGemini(cfg: AiConfig, system: string, user: string, maxTokens = 512, temperature = 0.4): Promise<string> {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`,
        {
          system_instruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: user }] }],
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        },
        { headers: { "Content-Type": "application/json" }, timeout: 120_000 }
      );
      const candidates = res.data.candidates;
      if (!candidates?.length) throw new Error("No candidates: " + JSON.stringify(res.data));
      // Gemini usage: usageMetadata.promptTokenCount / candidatesTokenCount
      const meta = res.data.usageMetadata;
      if (meta) {
        const sent = meta.promptTokenCount ?? 0;
        const received = meta.candidatesTokenCount ?? 0;
        _usage.sent += sent;
        _usage.received += received;
        console.log(`   📊 Tokens — ↑ sent: ${sent.toLocaleString()} | ↓ received: ${received.toLocaleString()} | session total: ↑${_usage.sent.toLocaleString()} ↓${_usage.received.toLocaleString()}`);
      }
      return candidates[0].content.parts.map((p: any) => p.text).join("");
    } catch (err: any) {
      const status = err.response?.status;
      if ((status === 429 || status === 503) && attempt < maxRetries) {
        let wait = status === 503 ? 30 : 60;
        try { const d = err.response.data?.error?.details?.find((d: any) => d["@type"]?.includes("RetryInfo")); if (d?.retryDelay) wait = Math.ceil(parseFloat(d.retryDelay.replace("s", ""))) + 5; } catch {}
        await sleep(wait * 1000);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Gemini max retries exceeded");
}

async function callOpenAICompat(cfg: AiConfig, system: string, user: string, maxTokens = 512, temperature = 0.4): Promise<string> {
  const url = PROVIDER_URLS[cfg.provider] || PROVIDER_URLS.openai;
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.post(url, {
        model: cfg.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature,
        max_tokens: maxTokens,
      }, { headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" }, timeout: 120_000 });
      // OpenAI-compat usage: usage.prompt_tokens / completion_tokens
      const u = res.data.usage;
      if (u) {
        const sent = u.prompt_tokens ?? 0;
        const received = u.completion_tokens ?? 0;
        _usage.sent += sent;
        _usage.received += received;
        console.log(`   📊 Tokens — ↑ sent: ${sent.toLocaleString()} | ↓ received: ${received.toLocaleString()} | session total: ↑${_usage.sent.toLocaleString()} ↓${_usage.received.toLocaleString()}`);
      }
      return res.data.choices[0].message.content;
    } catch (err: any) {
      const status = err.response?.status;
      if ((status === 429 || status === 503) && attempt < maxRetries) {
        await sleep(status === 503 ? 30_000 : 60_000);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${cfg.provider} max retries exceeded`);
}

/** Single AI call — routes to correct provider */
export async function callAI(cfg: AiConfig, system: string, user: string, maxTokens = 512, temperature = 0.4): Promise<string> {
  if (cfg.provider === "gemini") return callGemini(cfg, system, user, maxTokens, temperature);
  return callOpenAICompat(cfg, system, user, maxTokens, temperature);
}

/** Max concurrent AI requests — set to 1 to avoid 429 rate limits; raise later without rewriting logic */
const AI_CONCURRENCY = 1;

/** Run AI requests with controlled concurrency against the same config */
export async function callAIBatch(cfg: AiConfig, requests: AiRequest[]): Promise<Record<string, string>> {
  const results: [string, string][] = [];
  const queue = [...requests];

  async function worker() {
    while (queue.length > 0) {
      const req = queue.shift()!;
      try {
        const text = await callAI(cfg, req.system, req.user, req.maxTokens ?? 512, req.temperature ?? 0.4);
        const trimmed = text.trim();
        // Validate output quality — log-only (non-blocking)
        // TODO: --strict mode could retry on validation failure
        const validation = validateSlotOutput(req.slot, trimmed);
        if (!validation.valid) {
          console.log(`   ⚠️  Validation [${req.slot}]: ${validation.warnings.join("; ")}`);
        }
        results.push([req.slot, trimmed]);
      } catch (err: any) {
        err.failedSlot = req.slot;
        throw err;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(AI_CONCURRENCY, requests.length) }, worker));
  return Object.fromEntries(results);
}





