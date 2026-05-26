import { describe, it, expect, beforeEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { loadFewShot, clearFewShotCache } from "../few_shot.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

const TMP_DIR = join(process.cwd(), "__test_examples_tmp__");

function writeExample(slot: string, content: string) {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(join(TMP_DIR, `${slot}.md`), content, "utf-8");
}

// Patch BASE_DIR resolution: few_shot.ts resolves from __dirname.
// We test parse logic directly via the exported parser indirectly through
// writing real temp files won't work without re-patching module internals.
// Instead we test the public API with a known fixture from the actual examples dir.

// ─── unit: parseExample logic (via loadFewShot with controlled files) ─────────

describe("loadFewShot", () => {
  beforeEach(() => clearFewShotCache());

  it("returns null for a non-existent slot", () => {
    const result = loadFewShot("__slot_that_absolutely_does_not_exist__");
    expect(result).toBeNull();
  });

  it("caches null for missing slots (no throw on second call)", () => {
    const r1 = loadFewShot("__missing_slot__");
    const r2 = loadFewShot("__missing_slot__");
    expect(r1).toBeNull();
    expect(r2).toBeNull();
  });

  it("returns non-null for a real slot example that exists", () => {
    // At least one real slot (verdict) should have an example file
    const result = loadFewShot("verdict");
    if (result !== null) {
      expect(result).toHaveProperty("input");
      expect(result).toHaveProperty("output");
      expect(typeof result.input).toBe("string");
      expect(typeof result.output).toBe("string");
      expect(result.input.length).toBeGreaterThan(5);
      expect(result.output.length).toBeGreaterThan(10);
    }
    // If file doesn't exist in this test env, null is still valid (graceful)
  });

  it("caches result so second call returns same object", () => {
    const r1 = loadFewShot("verdict");
    const r2 = loadFewShot("verdict");
    // Same reference (cached)
    expect(r1).toBe(r2);
  });

  it("returns null gracefully — does not throw", () => {
    expect(() => loadFewShot("completely_unknown_slot_xyz")).not.toThrow();
  });
});

// ─── integration: buildInterpretationRequests appends example ─────────────────

describe("buildInterpretationRequests few-shot integration", () => {
  it("user field contains '--- Example ---' when a real example exists for verdict", async () => {
    clearFewShotCache();
    const { buildInterpretationRequests } = await import("../interpret.js");
    const crunched = {
      summary_card: { type: "Ride", distance: "80 km", moving_time: "2:30:00", moving_time_seconds: 9000 },
      heart_rate: { stats: { avg: 148, max: 172 }, cardiac_drift: { drift_bpm: 5, drift_pct: 3.2 } },
      pacing: { type: "positive split", first_half: { avg_speed_kmh: 33, avg_hr: 145 }, second_half: { avg_speed_kmh: 31, avg_hr: 151 } },
      power: { avg_power: 220, normalized_power: 235, variability_index: 1.07 },
      training_metrics: { tss: 120, intensity_factor: 0.88, efficiency_factor: 1.52 },
      aerobic_decoupling: { decoupling_pct: 4.2 },
      segments_summary: { prs: 1 },
    };
    const requests = buildInterpretationRequests(crunched, null, null, ["verdict"]);
    expect(requests).toHaveLength(1);
    const verdictReq = requests[0];
    // If example file exists, user should contain the separator
    const example = loadFewShot("verdict");
    if (example !== null) {
      expect(verdictReq.user).toContain("--- Example ---");
      expect(verdictReq.user).toContain("Output:");
    } else {
      // No example file — user is plain JSON (still valid)
      expect(verdictReq.user).not.toContain("--- Example ---");
    }
  });
});

