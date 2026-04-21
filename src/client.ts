import axios, { type AxiosInstance, type AxiosError } from "axios";

const RATE_LIMIT_DELAY_MS = 250; // delay between requests to stay under limits

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates an Axios client with Strava auth headers and automatic rate-limit handling.
 */
export function createStravaClient(accessToken: string): AxiosInstance {
  const client = axios.create({
    baseURL: "https://www.strava.com/api/v3",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    timeout: 30_000,
  });

  // Response interceptor: handle 429 rate limiting
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      if (error.response?.status === 429) {
        const rateLimitReset = error.response.headers["x-ratelimit-limit"];
        const waitTime = 60_000; // wait 60 seconds on rate limit
        console.warn(`⚠️  Rate limited by Strava. Waiting ${waitTime / 1000}s before retrying...`);
        console.warn(`   Rate limit info: ${rateLimitReset}`);
        await sleep(waitTime);
        // Retry the request
        return client.request(error.config!);
      }
      throw error;
    }
  );

  return client;
}

/**
 * Small delay to respect Strava rate limits (100 req / 15 min, 1000 req / day).
 */
export async function rateLimitDelay(): Promise<void> {
  await sleep(RATE_LIMIT_DELAY_MS);
}

