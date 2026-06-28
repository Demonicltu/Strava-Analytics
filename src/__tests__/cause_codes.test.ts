import { describe, it, expect } from "vitest";
import {
  CAUSE_CODE_META,
  causeCodeLabel,
  causeCodeDescription,
  causeCodeRank,
} from "../cause_codes.js";

describe("cause_codes", () => {
  it("contains expected metadata entries", () => {
    expect(CAUSE_CODE_META.LOAD_HIGH.label).toBe("High training load");
    expect(CAUSE_CODE_META.HRV_DROP.rank).toBe(3);
    expect(CAUSE_CODE_META.GARMIN_COVERAGE_LOW.description).toMatch(/coverage/i);
  });

  it("returns label for known code and passthrough for unknown code", () => {
    expect(causeCodeLabel("SLEEP_LOW")).toBe("Sleep deficit");
    expect(causeCodeLabel("UNKNOWN_CODE")).toBe("UNKNOWN_CODE");
  });

  it("returns description for known code and fallback for unknown code", () => {
    expect(causeCodeDescription("BB_LOW")).toMatch(/Body Battery/i);
    expect(causeCodeDescription("UNKNOWN_CODE")).toBe("No description available.");
  });

  it("returns rank for known code and fallback rank for unknown code", () => {
    expect(causeCodeRank("RECOVERY_GOOD")).toBe(6);
    expect(causeCodeRank("UNKNOWN_CODE")).toBe(99);
  });
});

