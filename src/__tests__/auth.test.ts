import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => {
  const mockAxios: any = {
    post: vi.fn(),
    get: vi.fn(),
  };
  mockAxios.default = mockAxios;
  return { default: mockAxios };
});

import axios from "axios";
import { getAccessToken } from "../auth.js";

const MOCK_TOKEN_RESPONSE = {
  data: {
    access_token: "access-abc-123",
    refresh_token: "refresh-xyz",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "Bearer",
  },
};

const MOCK_ATHLETE = {
  data: {
    id: 12345,
    firstname: "John",
    lastname: "Doe",
    username: "johndoe",
    city: "Vilnius",
    state: "Vilnius",
    country: "Lithuania",
    sex: "M",
    premium: false,
    created_at: "2020-01-01",
    updated_at: "2024-01-01",
    profile_medium: "",
    profile: "",
  },
};

describe("getAccessToken", () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
    vi.mocked(axios.get).mockReset();
  });

  it("posts to Strava OAuth token endpoint", async () => {
    vi.mocked(axios.post).mockResolvedValue(MOCK_TOKEN_RESPONSE);
    vi.mocked(axios.get).mockResolvedValue(MOCK_ATHLETE);

    await getAccessToken("client-id", "client-secret", "refresh-token");

    expect(axios.post).toHaveBeenCalledWith(
      "https://www.strava.com/oauth/token",
      expect.objectContaining({
        client_id: "client-id",
        client_secret: "client-secret",
        refresh_token: "refresh-token",
        grant_type: "refresh_token",
      })
    );
  });

  it("fetches athlete profile with the obtained access token", async () => {
    vi.mocked(axios.post).mockResolvedValue(MOCK_TOKEN_RESPONSE);
    vi.mocked(axios.get).mockResolvedValue(MOCK_ATHLETE);

    await getAccessToken("cid", "csecret", "rtoken");

    expect(axios.get).toHaveBeenCalledWith(
      "https://www.strava.com/api/v3/athlete",
      expect.objectContaining({
        headers: { Authorization: "Bearer access-abc-123" },
      })
    );
  });

  it("returns accessToken and athlete", async () => {
    vi.mocked(axios.post).mockResolvedValue(MOCK_TOKEN_RESPONSE);
    vi.mocked(axios.get).mockResolvedValue(MOCK_ATHLETE);

    const result = await getAccessToken("cid", "csecret", "rtoken");
    expect(result.accessToken).toBe("access-abc-123");
    expect(result.athlete.firstname).toBe("John");
    expect(result.athlete.lastname).toBe("Doe");
  });

  it("throws when post rejects", async () => {
    vi.mocked(axios.post).mockRejectedValue(new Error("Network error"));
    await expect(getAccessToken("cid", "csecret", "rtoken")).rejects.toThrow("Network error");
  });
});

