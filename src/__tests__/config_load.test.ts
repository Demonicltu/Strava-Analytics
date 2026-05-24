/**
 * config.ts — loadConfig with mocked process.env.
 * requireEnv calls process.exit(1) when env var is missing,
 * so we test only the happy path for loadConfig.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

describe("loadConfig", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns all fields when env vars set", async () => {
    vi.stubEnv("STRAVA_CLIENT_ID", "abc123");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "secret456");
    vi.stubEnv("STRAVA_REFRESH_TOKEN", "refresh789");
    vi.stubEnv("PAGE_SIZE", "20");

    const { loadConfig } = await import("../config.js");
    const cfg = loadConfig();
    expect(cfg.clientId).toBe("abc123");
    expect(cfg.clientSecret).toBe("secret456");
    expect(cfg.refreshToken).toBe("refresh789");
    expect(cfg.pageSize).toBe(20);
  });

  it("defaults PAGE_SIZE to 10 when not set", async () => {
    vi.stubEnv("STRAVA_CLIENT_ID", "id");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "sec");
    vi.stubEnv("STRAVA_REFRESH_TOKEN", "tok");
    vi.stubEnv("PAGE_SIZE", "");

    const { loadConfig } = await import("../config.js");
    const cfg = loadConfig();
    expect(cfg.pageSize).toBe(10);
  });
});

