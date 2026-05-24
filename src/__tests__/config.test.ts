import { describe, it, expect, vi, afterEach } from "vitest";

describe("loadRiderConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses all env vars when set", async () => {
    vi.stubEnv("RIDER_WEIGHT_KG", "72");
    vi.stubEnv("RIDER_FTP_W", "260");
    vi.stubEnv("RUNNER_RFTP_W", "320");
    vi.stubEnv("RIDER_MAX_HR", "190");
    vi.stubEnv("RUNNER_MAX_HR", "185");
    vi.stubEnv("RIDER_LTHR", "168");
    vi.stubEnv("RUNNER_LTHR", "165");
    vi.stubEnv("RIDER_REST_HR", "50");

    const { loadRiderConfig } = await import("../config.js");
    const cfg = loadRiderConfig();
    expect(cfg.weightKg).toBe(72);
    expect(cfg.ftpW).toBe(260);
    expect(cfg.rFtpW).toBe(320);
    expect(cfg.maxHr).toBe(190);
    expect(cfg.runnerMaxHr).toBe(185);
    expect(cfg.lthr).toBe(168);
    expect(cfg.runnerLthr).toBe(165);
    expect(cfg.restHr).toBe(50);
  });

  it("returns null for missing optional env vars", async () => {
    vi.stubEnv("RIDER_WEIGHT_KG", "");
    vi.stubEnv("RIDER_FTP_W", "");
    vi.stubEnv("RUNNER_RFTP_W", "");
    vi.stubEnv("RIDER_MAX_HR", "");
    vi.stubEnv("RUNNER_MAX_HR", "");
    vi.stubEnv("RIDER_LTHR", "");
    vi.stubEnv("RUNNER_LTHR", "");
    vi.stubEnv("RIDER_REST_HR", "");

    const { loadRiderConfig } = await import("../config.js");
    const cfg = loadRiderConfig();
    expect(cfg.weightKg).toBeNull();
    expect(cfg.ftpW).toBeNull();
    expect(cfg.maxHr).toBeNull();
    expect(cfg.restHr).toBeNull();
  });
});

