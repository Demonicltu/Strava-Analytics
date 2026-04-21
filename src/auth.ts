import axios from "axios";
import type { TokenResponse, AthleteSummary } from "./types.js";

/**
 * Exchange a refresh token for a fresh access token.
 * Note: refresh_token grant type does NOT return the athlete object,
 * so we fetch the athlete profile separately.
 */
export async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ accessToken: string; athlete: AthleteSummary }> {
  console.log("🔑 Authenticating with Strava...");

  const response = await axios.post<TokenResponse>(
    "https://www.strava.com/oauth/token",
    {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }
  );

  const { access_token, expires_at } = response.data;

  if (!access_token) {
    console.error("❌ Authentication failed. API response:", JSON.stringify(response.data, null, 2));
    process.exit(1);
  }

  const expiresDate = new Date(expires_at * 1000);
  console.log(`✅ Token obtained (expires ${expiresDate.toLocaleString()})`);

  // Fetch athlete profile separately since refresh_token grant doesn't include it
  console.log("👤 Fetching athlete profile...");
  const athleteRes = await axios.get<AthleteSummary>(
    "https://www.strava.com/api/v3/athlete",
    { headers: { Authorization: `Bearer ${access_token}` } }
  );

  const athlete = athleteRes.data;
  console.log(`✅ Authenticated as ${athlete.firstname} ${athlete.lastname}\n`);

  return { accessToken: access_token, athlete };
}
