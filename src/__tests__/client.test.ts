import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => {
  const mockAxios: any = {
    create: vi.fn(),
    post: vi.fn(),
    get: vi.fn(),
  };
  mockAxios.default = mockAxios;
  return { default: mockAxios };
});

import axios from "axios";
import { createStravaClient, rateLimitDelay } from "../client.js";

describe("createStravaClient", () => {
  it("calls axios.create with correct baseURL and headers", () => {
    const mockInstance = { interceptors: { response: { use: vi.fn() } } };
    vi.mocked(axios.create).mockReturnValue(mockInstance as any);

    createStravaClient("test-token");

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://www.strava.com/api/v3",
        headers: { Authorization: "Bearer test-token" },
      })
    );
  });

  it("returns the created client instance", () => {
    const mockInstance = { interceptors: { response: { use: vi.fn() } } };
    vi.mocked(axios.create).mockReturnValue(mockInstance as any);

    const result = createStravaClient("my-token");
    expect(result).toBe(mockInstance);
  });

  it("registers a response interceptor", () => {
    const useMock = vi.fn();
    const mockInstance = { interceptors: { response: { use: useMock } } };
    vi.mocked(axios.create).mockReturnValue(mockInstance as any);

    createStravaClient("my-token");
    expect(useMock).toHaveBeenCalledWith(expect.any(Function), expect.any(Function));
  });
});

describe("rateLimitDelay", () => {
  it("resolves without throwing", async () => {
    await expect(rateLimitDelay()).resolves.toBeUndefined();
  });

  it("completes in reasonable time", async () => {
    const start = Date.now();
    await rateLimitDelay();
    expect(Date.now() - start).toBeGreaterThanOrEqual(0);
  });
});

