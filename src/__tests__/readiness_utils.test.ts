 import { describe, it, expect } from "vitest";
import { bodyBatteryNorm, computeReadiness, hrvNorm, hrvValue, meanHalfDelta } from "../readiness_utils.js";

describe("readiness_utils", () => {
  it("normalizes HRV from baseline delta", () => {
    expect(hrvNorm({ hrv_vs_baseline: 4 })).toBe(70);
    expect(hrvNorm({ hrv_vs_baseline: -20 })).toBe(0);
  });

  it("normalizes body battery from supported fields", () => {
    expect(bodyBatteryNorm({ body_battery_at_start: 55 })).toBe(55);
    expect(bodyBatteryNorm({ body_battery_start: 105 })).toBe(100);
    expect(bodyBatteryNorm({ body_battery_start_of_day: -5 })).toBe(0);
  });

  it("computes readiness with weighted components", () => {
    const r = computeReadiness({ sleep_score: 80, hrv_vs_baseline: 2, body_battery_at_start: 60 });
    expect(r.score).toBe(68);
    expect(r.label).toBe("Moderate");
    expect(r.components.sleep).toBe(80);
  });

  it("returns null readiness when no components exist", () => {
    const r = computeReadiness({});
    expect(r.score).toBeNull();
    expect(r.label).toBeNull();
  });

  it("extracts hrv value and computes half delta", () => {
    expect(hrvValue({ hrv_last_5_min: 42 })).toBe(42);
    expect(hrvValue({ hrv_last_night: 40 })).toBe(40);
    expect(meanHalfDelta([40, 41, 42, 44])).toBeCloseTo(2.5, 6);
    expect(meanHalfDelta([40, 41])).toBeNull();
  });
});


