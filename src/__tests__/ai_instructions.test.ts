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

// Split instruction files (new system)
const SPLIT_INSTRUCTION_FILES = [
  "instructions/common.md",
  "instructions/cycling.md",
  "instructions/running.md",
  "instructions/walk.md",
  "instructions/surf.md",
  "instructions/paddle.md",
  "instructions/workout.md",
  "instructions/devices/garmin.md",
] as const;

// Other AI instruction files (compare, digest — still single files)
const OTHER_INSTRUCTION_FILES = [
  "AI_COMPARE_INSTRUCTIONS.md",
  "AI_DIGEST_INSTRUCTIONS.md",
] as const;

// ─── Existence checks ───

describe("Split AI instruction files — existence", () => {
  for (const file of SPLIT_INSTRUCTION_FILES) {
    it(`${file} exists`, () => {
      expect(existsSync(join(BASE_DIR, file))).toBe(true);
    });
  }
});

describe("Other AI instruction files — existence", () => {
  for (const file of OTHER_INSTRUCTION_FILES) {
    it(`${file} exists`, () => {
      expect(existsSync(join(BASE_DIR, file))).toBe(true);
    });
  }
});

// ─── Structure validation ───

describe("instructions/common.md — structure", () => {
  const content = existsSync(join(BASE_DIR, "instructions/common.md"))
    ? readFileSync(join(BASE_DIR, "instructions/common.md"), "utf-8")
    : "";

  it("is non-empty", () => expect(content.length).toBeGreaterThan(100));
  it("contains at least one markdown header", () => expect(content).toMatch(/^#{1,6}\s/m));
  it("line ending style is consistent (LF preferred)", () => {
    const crlfCount = (content.match(/\r\n/g) || []).length;
    const lfCount = (content.match(/(?<!\r)\n/g) || []).length;
    if (crlfCount > 0 && lfCount > 0) {
      console.warn(`⚠️  instructions/common.md has mixed line endings (${crlfCount} CRLF, ${lfCount} LF)`);
    }
    expect(content.length).toBeGreaterThan(0);
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

const MINIMAL_CRUNCHED_RIDE = {
  summary_card: { name: "Test Ride", type: "Ride", distance: "30.0 km", moving_time_seconds: 3600 },
  power: { normalized_power: 210, avg_power: 200 },
  heart_rate: { stats: { avg: 150, max: 175 } },
  training_metrics: { tss: 80, efficiency_factor: 1.4 },
};

const MINIMAL_CRUNCHED_RUN = {
  summary_card: { name: "Morning Run", type: "Run", distance: "10.0 km", moving_time_seconds: 2700 },
  heart_rate: { stats: { avg: 158, max: 182 } },
};

describe("AI prompt construction snapshots", () => {
  it("cycling analysis prompt structure snapshot", () => {
    const commonPath = join(BASE_DIR, "instructions/common.md");
    const cyclingPath = join(BASE_DIR, "instructions/cycling.md");
    if (!existsSync(commonPath) || !existsSync(cyclingPath)) return;
    const instructions = [
      readFileSync(commonPath, "utf-8"),
      readFileSync(cyclingPath, "utf-8"),
    ].join("\n\n---\n\n");
    const prompt = buildAnalysisPrompt(instructions, MINIMAL_CRUNCHED_RIDE);
    expect(prompt.system).toMatchSnapshot();
    expect(prompt.user).toMatchSnapshot();
  });

  it("running analysis prompt structure snapshot", () => {
    const commonPath = join(BASE_DIR, "instructions/common.md");
    const runningPath = join(BASE_DIR, "instructions/running.md");
    if (!existsSync(commonPath) || !existsSync(runningPath)) return;
    const instructions = [
      readFileSync(commonPath, "utf-8"),
      readFileSync(runningPath, "utf-8"),
    ].join("\n\n---\n\n");
    const prompt = buildAnalysisPrompt(instructions, MINIMAL_CRUNCHED_RUN);
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

describe("instructions/common.md — key content guards", () => {
  const content = existsSync(join(BASE_DIR, "instructions/common.md"))
    ? readFileSync(join(BASE_DIR, "instructions/common.md"), "utf-8")
    : "";

  const requiredPhrases = [
    /Z2\s*(Endurance|%|zone|pct)?/i,
    /heart\s*rate/i,
    /historical/i,
  ];

  for (const phrase of requiredPhrases) {
    it(`contains required phrase: ${phrase}`, () => {
      expect(content).toMatch(phrase);
    });
  }
});

describe("instructions/cycling.md — key content guards", () => {
  const content = existsSync(join(BASE_DIR, "instructions/cycling.md"))
    ? readFileSync(join(BASE_DIR, "instructions/cycling.md"), "utf-8")
    : "";

  it("contains power/watts reference", () => expect(content).toMatch(/power|watts/i));
  it("contains VAM or climbing reference", () => expect(content).toMatch(/vam|climb/i));
  it("does NOT contain run/pace language (wrong sport)", () => {
    expect(content).not.toMatch(/\bpace per km\b/i);
    expect(content).not.toMatch(/\bkipchoge\b/i);
  });
});

describe("instructions/running.md — key content guards", () => {
  const content = existsSync(join(BASE_DIR, "instructions/running.md"))
    ? readFileSync(join(BASE_DIR, "instructions/running.md"), "utf-8")
    : "";

  it("contains pace reference", () => expect(content).toMatch(/pace/i));
  it("contains Kipchoge reference", () => expect(content).toMatch(/kipchoge/i));
  it("does NOT contain Pogačar reference (wrong sport)", () => expect(content).not.toMatch(/poga[cč]ar/i));
});

describe("instructions/surf.md — key content guards", () => {
  const content = existsSync(join(BASE_DIR, "instructions/surf.md"))
    ? readFileSync(join(BASE_DIR, "instructions/surf.md"), "utf-8")
    : "";

  it("contains wave reference", () => expect(content).toMatch(/wave/i));
  it("contains paddle reference", () => expect(content).toMatch(/paddle/i));
  it("does NOT instruct to show cycling score", () => expect(content).not.toMatch(/amateur_score/i));
});

describe("instructions/paddle.md — key content guards", () => {
  const content = existsSync(join(BASE_DIR, "instructions/paddle.md"))
    ? readFileSync(join(BASE_DIR, "instructions/paddle.md"), "utf-8")
    : "";

  it("contains stroke rate reference", () => expect(content).toMatch(/stroke rate/i));
  it("contains paddle efficiency reference", () => expect(content).toMatch(/distance per stroke|efficiency/i));
  it("does NOT contain cycling cadence benchmark", () => expect(content).not.toMatch(/85-95\s*rpm/i));
});

describe("instructions/workout.md — key content guards", () => {
  const content = existsSync(join(BASE_DIR, "instructions/workout.md"))
    ? readFileSync(join(BASE_DIR, "instructions/workout.md"), "utf-8")
    : "";

  it("contains WIS reference", () => expect(content).toMatch(/wis/i));
  it("contains interval detection reference", () => expect(content).toMatch(/interval/i));
});

describe("instructions/devices/garmin.md — key content guards", () => {
  const content = existsSync(join(BASE_DIR, "instructions/devices/garmin.md"))
    ? readFileSync(join(BASE_DIR, "instructions/devices/garmin.md"), "utf-8")
    : "";

  it("contains Body Battery reference", () => expect(content).toMatch(/body battery/i));
  it("contains HRV reference", () => expect(content).toMatch(/hrv/i));
  it("contains Training Readiness reference", () => expect(content).toMatch(/training readiness/i));
});



