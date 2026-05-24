/**
 * Tests for the axios interceptor rate-limit retry logic in client.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to test the interceptor error handler registered in createStravaClient.
// Strategy: capture the interceptor callbacks and call them directly.
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
import { createStravaClient } from "../client.js";

describe("createStravaClient — interceptor", () => {
  let successHandler: (r: any) => any;
  let errorHandler: (e: any) => any;
  let mockInstance: any;

  beforeEach(() => {
    vi.mocked(axios.create).mockReset();
    mockInstance = {
      interceptors: {
        response: {
          use: vi.fn((s, e) => { successHandler = s; errorHandler = e; }),
        },
      },
      request: vi.fn(),
    };
    vi.mocked(axios.create).mockReturnValue(mockInstance);
    createStravaClient("token");
  });

  it("success handler passes through responses unchanged", () => {
    const fakeResponse = { status: 200, data: "ok" };
    expect(successHandler(fakeResponse)).toBe(fakeResponse);
  });

  it("non-429 errors (500) are re-thrown immediately", async () => {
    const err = { response: { status: 500 }, message: "Server error" };
    await expect(errorHandler(err)).rejects.toEqual(err);
  });

  it("503 errors are re-thrown (only 429 retried by client interceptor)", async () => {
    const err = { response: { status: 503, headers: {} }, config: { url: "/test" }, message: "Service unavailable" };
    await expect(errorHandler(err)).rejects.toEqual(err);
  });

  it("errors with no response status are re-thrown", async () => {
    const err = { message: "Network error" };
    await expect(errorHandler(err)).rejects.toEqual(err);
  });

  it("429 error: reads rate limit header and retries via client.request", async () => {
    vi.useFakeTimers();
    mockInstance.request.mockResolvedValue({ status: 200, data: "retried" });

    const err = {
      response: { status: 429, headers: { "x-ratelimit-limit": "600,30000" } },
      config: { url: "/api/v3/athlete" },
    };

    const retryProm = errorHandler(err);
    await vi.advanceTimersByTimeAsync(61_000);
    const result = await retryProm;

    expect(mockInstance.request).toHaveBeenCalledWith(err.config);
    expect(result.status).toBe(200);
    vi.useRealTimers();
  });
});

