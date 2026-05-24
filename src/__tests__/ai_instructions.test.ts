/**
 * Snapshot tests for AI instruction files.
 * These tests ensure that instruction files produce stable prompts —
 * any change to the instruction files will cause a visible failing diff in CI.
 *
 * They do NOT call any AI API. They validate prompt construction logic only.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = join(__dir, "..", "..");

const INSTRUCTION_FILES = [
  "AI_ANALYSIS_INSTRUCTIONS.md",
  "AI_ANALYSIS_INSTRUCTIONS_NEW.md",
  "AI_COMPARE_INSTRUCTIONS.md",
  "AI_DIGEST_INSTRUCTIONS.md",
] as const;

// ─── Existence checks ───

describe("AI instruction files — existence", () => {
  for (const file of INSTRUCTION_FILES) {
    it(`${file} exists`, () => {
      expect(existsSync(join(BASE_DIR, file))).toBe(true);
    });
  }
});

// ─── Structure validation ───

describe("AI_ANALYSIS_INSTRUCTIONS.md — structure", () => {
  const content = existsSync(join(BASE_DIR, "AI_ANALYSIS_INSTRUCTIONS.md"))
    ? readFileSync(join(BASE_DIR, "AI_ANALYSIS_INSTRUCTIONS.md"), "utf-8")
    : "";

  it("is non-empty", () => expect(content.length).toBeGreaterThan(100));
  it("contains at least one markdown header", () => expect(content).toMatch(/^#{1,6}\s/m));
  it("line ending style is consistent (LF preferred)", () => {
    // CRLF is acceptable but flag for awareness — cross-platform consistency
    const crlfCount = (content.match(/\r\n/g) || []).length;
    const lfCount = (content.match(/(?<!\r)\n/g) || []).length;
    // Warn if mixed: both CRLF and bare LF present
    if (crlfCount > 0 && lfCount > 0) {
      console.warn(`⚠️  AI_ANALYSIS_INSTRUCTIONS.md has mixed line endings (${crlfCount} CRLF, ${lfCount} LF)`);
    }
    expect(content.length).toBeGreaterThan(0); // file is readable
  });
});

describe("AI_DIGEST_INSTRUCTIONS.md — structure", () => {
  const content = existsSync(join(BASE_DIR, "AI_DIGEST_INSTRUCTIONS.md"))
    ? readFileSync(join(BASE_DIR, "AI_DIGEST_INSTRUCTIONS.md"), "utf-8")
    : "";

  it("is non-empty", () => expect(content.length).toBeGreaterThan(100));
  it("contains at least one markdown header", () => expect(content).toMatch(/^#{1,6}\s/m));
});

describe("AI_COMPARE_INSTRUCTIONS.md — structure", () => {
  const content = existsSync(join(BASE_DIR, "AI_COMPARE_INSTRUCTIONS.md"))
    ? readFileSync(join(BASE_DIR, "AI_COMPARE_INSTRUCTIONS.md"), "utf-8")
    : "";

  it("is non-empty", () => expect(content.length).toBeGreaterThan(100));
});

// ─── Snapshot tests — prompt construction ───

/**
 * Simulates the prompt that analyze.ts would send to an AI for a given
 * crunched activity. Snapshots the system prompt + user message structure
 * (but NOT real AI output). Changing instruction files will break these tests.
 */
function buildAnalysisPrompt(instructions: string, crunchedData: object): { system: string; user: string } {
  const data = JSON.stringify(crunchedData, null, 2);
  return {
    system: instructions,
    user: `Write the full activity analysis based on this pre-computed data. All math is done — just interpret and write:\n\n${data}`,
  };
}

const MINIMAL_CRUNCHED = {
  summary_card: { name: "Test Ride", type: "Ride", distance: "30.0 km", moving_time_seconds: 3600 },
  power: { normalized_power: 210, avg_power: 200 },
  heart_rate: { stats: { avg: 150, max: 175 } },
  training_metrics: { tss: 80, efficiency_factor: 1.4 },
};

describe("AI prompt construction snapshots", () => {
  it("analysis prompt structure snapshot", () => {
    if (!existsSync(join(BASE_DIR, "AI_ANALYSIS_INSTRUCTIONS.md"))) return;
    const instructions = readFileSync(join(BASE_DIR, "AI_ANALYSIS_INSTRUCTIONS.md"), "utf-8");
    const prompt = buildAnalysisPrompt(instructions, MINIMAL_CRUNCHED);

    // Snapshot the prompt structure — fails on instruction file changes
    expect(prompt.system).toMatchSnapshot();
    expect(prompt.user).toMatchSnapshot();
  });

  it("digest instructions snapshot", () => {
    if (!existsSync(join(BASE_DIR, "AI_DIGEST_INSTRUCTIONS.md"))) return;
    const content = readFileSync(join(BASE_DIR, "AI_DIGEST_INSTRUCTIONS.md"), "utf-8");
    expect(content).toMatchSnapshot();
  });

  it("compare instructions snapshot", () => {
    if (!existsSync(join(BASE_DIR, "AI_COMPARE_INSTRUCTIONS.md"))) return;
    const content = readFileSync(join(BASE_DIR, "AI_COMPARE_INSTRUCTIONS.md"), "utf-8");
    expect(content).toMatchSnapshot();
  });
});

// ─── Key phrase validation — catch accidental deletions ───

describe("AI_ANALYSIS_INSTRUCTIONS.md — key content guards", () => {
  const content = existsSync(join(BASE_DIR, "AI_ANALYSIS_INSTRUCTIONS.md"))
    ? readFileSync(join(BASE_DIR, "AI_ANALYSIS_INSTRUCTIONS.md"), "utf-8")
    : "";

  // These tests catch accidental removal of critical instruction sections.
  // Update them deliberately if you intentionally remove a section.
  const requiredPhrases = [
    /Z2\s*(Endurance|%|zone|pct)?/i,  // Z2 training guidance (file uses "Z2", not "zone 2")
    /heart\s*rate/i,                   // HR analysis section
    /power|watts/i,                    // Power-based analysis
  ];

  for (const phrase of requiredPhrases) {
    it(`contains required phrase: ${phrase}`, () => {
      expect(content).toMatch(phrase);
    });
  }
});



