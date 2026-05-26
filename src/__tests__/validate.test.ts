import { describe, it, expect } from "vitest";
import { validateSlotOutput } from "../validate.js";

// ─── Default / generic rules ──────────────────────────────────────────────────

describe("validateSlotOutput — default rules", () => {
  it("passes a clean short text for unknown slot", () => {
    const { valid } = validateSlotOutput("unknown_slot", "The effort was 145 bpm average HR.");
    expect(valid).toBe(true);
  });

  it("fails on empty string (min length)", () => {
    const { valid, warnings } = validateSlotOutput("unknown_slot", "");
    expect(valid).toBe(false);
    expect(warnings.some(w => w.includes("too short"))).toBe(true);
  });

  it("fails on very short string below 20 chars", () => {
    const { valid, warnings } = validateSlotOutput("unknown_slot", "short");
    expect(valid).toBe(false);
    expect(warnings.some(w => w.includes("too short"))).toBe(true);
  });

  it("fails when output exceeds max length", () => {
    const { valid, warnings } = validateSlotOutput("unknown_slot", "x".repeat(2001));
    expect(valid).toBe(false);
    expect(warnings.some(w => w.includes("too long"))).toBe(true);
  });

  it("fails for banned phrase 'Great job'", () => {
    const { valid, warnings } = validateSlotOutput("verdict", "Great job on the 220W avg power today.");
    expect(valid).toBe(false);
    expect(warnings.some(w => w.includes("Great job"))).toBe(true);
  });

  it("fails for banned phrase 'In conclusion'", () => {
    const { valid, warnings } = validateSlotOutput("verdict", "In conclusion, this was a solid 148bpm effort.");
    expect(valid).toBe(false);
    expect(warnings.some(w => w.includes("In conclusion"))).toBe(true);
  });

  it("fails for banned phrase 'Overall,'", () => {
    const { valid, warnings } = validateSlotOutput("verdict", "Overall, the 120 TSS ride was solid.");
    expect(valid).toBe(false);
    expect(warnings.some(w => w.includes("Overall,"))).toBe(true);
  });
});

// ─── requiresNumbers ──────────────────────────────────────────────────────────

describe("validateSlotOutput — requiresNumbers", () => {
  it("fails verdict without any numbers", () => {
    const { valid, warnings } = validateSlotOutput("verdict", "This was a solid and efficient ride with good pacing.");
    expect(valid).toBe(false);
    expect(warnings.some(w => w.includes("no numbers"))).toBe(true);
  });

  it("passes verdict with numbers", () => {
    const { valid } = validateSlotOutput("verdict", "Averaged 220W normalized to 235W over 80km — aerobic decoupling of 4.2% sits well within the aerobic base range.");
    expect(valid).toBe(true);
  });
});

// ─── requiresBullets (tips) ───────────────────────────────────────────────────

describe("validateSlotOutput — tips slot", () => {
  it("fails tips without bullet points", () => {
    const { valid, warnings } = validateSlotOutput("tips", "Work on your cadence, target 90 rpm. HR was 148 bpm. TSS was 120.");
    expect(valid).toBe(false);
    expect(warnings.some(w => w.includes("bullets"))).toBe(true);
  });

  it("fails tips with fewer than 3 bullets", () => {
    const { valid, warnings } = validateSlotOutput("tips", "- 🚴 **Cadence** — aim for 90 rpm\n- ❤️ **HR** — keep below 155 bpm");
    expect(valid).toBe(false);
    expect(warnings.some(w => w.includes("bullets"))).toBe(true);
  });

  it("passes tips with 3+ bullets and emoji and numbers", () => {
    const output = [
      "- 🚴 **Cadence** — target 90 rpm, currently 82",
      "- ❤️ **HR Zone** — 68% in Z3, reduce to under 60% for base work",
      "- ⚡ **Power** — VI of 1.09 suggests surging, aim for <1.05",
      "- 📉 **Decoupling** — 4.2% is solid; push toward <3% for long rides",
    ].join("\n");
    const { valid } = validateSlotOutput("tips", output);
    expect(valid).toBe(true);
  });
});

// ─── requiresEmoji (historical_comparison) ───────────────────────────────────

describe("validateSlotOutput — historical_comparison slot", () => {
  it("fails without emoji", () => {
    const { valid, warnings } = validateSlotOutput(
      "historical_comparison",
      "- **HR:** 148 bpm vs 3mo avg 144 bpm\n- **NP:** 235W vs 3mo avg 228W\n- **TSS:** 120 vs 3mo avg 115",
    );
    expect(valid).toBe(false);
    expect(warnings.some(w => w.includes("emoji"))).toBe(true);
  });

  it("passes with emoji and bullets and numbers", () => {
    const output = [
      "- ❤️ **HR:** 148 bpm vs 3mo avg 144 bpm ⬆️",
      "- ⚡ **NP:** 235W vs 3mo avg 228W 🟢",
      "- 📊 **TSS:** 120 vs 3mo avg 115 🟢",
      "- 📈 **Trend:** Improving — power and HR efficiency both tracking upward over 12 activities.",
    ].join("\n");
    const { valid } = validateSlotOutput("historical_comparison", output);
    expect(valid).toBe(true);
  });
});

// ─── maxSentences ─────────────────────────────────────────────────────────────

describe("validateSlotOutput — maxSentences", () => {
  it("fails cardiac_drift_interpretation with 3+ sentences", () => {
    const { valid, warnings } = validateSlotOutput(
      "cardiac_drift_interpretation",
      "Drift was 5 bpm. This indicates moderate fatigue. HR rose 3.2% from first to second half. Recovery was good.",
    );
    expect(valid).toBe(false);
    expect(warnings.some(w => w.includes("sentences"))).toBe(true);
  });

  it("passes cardiac_drift_interpretation with 1 sentence", () => {
    const { valid } = validateSlotOutput(
      "cardiac_drift_interpretation",
      "A +5 bpm cardiac drift over 90 min points to moderate aerobic drift, consistent with the 3.2% decoupling.",
    );
    expect(valid).toBe(true);
  });
});

// ─── noMarkdownHeaders ────────────────────────────────────────────────────────

describe("validateSlotOutput — noMarkdownHeaders", () => {
  it("fails verdict containing markdown header", () => {
    const { valid, warnings } = validateSlotOutput("verdict", "## Summary\nAveraged 220W over 80km — 148 bpm HR was well-controlled.");
    expect(valid).toBe(false);
    expect(warnings.some(w => w.includes("markdown headers"))).toBe(true);
  });

  it("passes verdict without headers", () => {
    const { valid } = validateSlotOutput("verdict", "Averaged 220W normalized to 235W over 80km — 148 bpm HR met the IF of 0.88 expected for this effort.");
    expect(valid).toBe(true);
  });
});

// ─── multiple warnings ────────────────────────────────────────────────────────

describe("validateSlotOutput — multiple violations", () => {
  it("accumulates multiple warnings for a bad output", () => {
    const { valid, warnings } = validateSlotOutput("verdict", "Great job");
    expect(valid).toBe(false);
    // Triggers: banned phrase, no numbers, too short
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── ef_interpretation (short phrase, no number required) ────────────────────

describe("validateSlotOutput — ef_interpretation", () => {
  it("passes short phrase without numbers", () => {
    const { valid } = validateSlotOutput("ef_interpretation", "solid, reflecting good aerobic fitness for the given power output.");
    expect(valid).toBe(true);
  });

  it("fails if too long", () => {
    const { valid, warnings } = validateSlotOutput("ef_interpretation", "x".repeat(201));
    expect(valid).toBe(false);
    expect(warnings.some(w => w.includes("too long"))).toBe(true);
  });
});

