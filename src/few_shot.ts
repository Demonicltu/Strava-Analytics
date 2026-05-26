/**
 * Few-shot example loader.
 * Reads instructions/examples/{slot}.md, parses ### Input / ### Output sections.
 * Returns null gracefully when no example exists for a slot.
 * Results are cached in-process so each file is read at most once.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let __dirname2: string;
try { __dirname2 = dirname(fileURLToPath(import.meta.url)); } catch { __dirname2 = process.cwd(); }
const BASE_DIR = existsSync(join(__dirname2, "..", "package.json")) ? join(__dirname2, "..") : process.cwd();
const EXAMPLES_DIR = join(BASE_DIR, "instructions", "examples");

export interface FewShotExample {
  input: string;
  output: string;
}

const _cache = new Map<string, FewShotExample | null>();

/**
 * Load a few-shot example for the given slot name.
 * Returns null if the file doesn't exist or can't be parsed.
 */
export function loadFewShot(slot: string): FewShotExample | null {
  if (_cache.has(slot)) return _cache.get(slot)!;

  const filePath = join(EXAMPLES_DIR, `${slot}.md`);
  if (!existsSync(filePath)) {
    _cache.set(slot, null);
    return null;
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const result = parseExample(raw);
    _cache.set(slot, result);
    return result;
  } catch {
    _cache.set(slot, null);
    return null;
  }
}

function parseExample(content: string): FewShotExample | null {
  const inputMatch = content.match(/###\s+Input\s*\n([\s\S]*?)(?=###\s+Output|$)/i);
  const outputMatch = content.match(/###\s+Output\s*\n([\s\S]*?)(?=###|$)/i);
  if (!inputMatch || !outputMatch) return null;

  // Strip markdown code fences from input block
  let input = inputMatch[1].trim();
  input = input.replace(/^```(?:json)?\n?/, "").replace(/\n?```\s*$/, "").trim();

  const output = outputMatch[1].trim();
  if (!input || !output) return null;

  return { input, output };
}

/** Clear the cache (useful in tests) */
export function clearFewShotCache(): void {
  _cache.clear();
}

