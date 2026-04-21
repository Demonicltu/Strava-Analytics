import type { AxiosInstance } from "axios";
import type { SummaryActivity } from "./types.js";
import { rateLimitDelay } from "./client.js";

/**
 * Fetch paginated list of athlete activities.
 */
export async function fetchActivities(
  client: AxiosInstance,
  pageSize: number,
  maxPages: number,
  afterDate: Date | null
): Promise<SummaryActivity[]> {
  const allActivities: SummaryActivity[] = [];
  const params: Record<string, string | number> = {
    per_page: pageSize,
  };

  if (afterDate) {
    params["after"] = Math.floor(afterDate.getTime() / 1000);
    console.log(`📅 Fetching activities after ${afterDate.toISOString()}`);
  }

  for (let page = 1; page <= maxPages; page++) {
    params["page"] = page;
    console.log(`📄 Fetching activities page ${page}...`);

    await rateLimitDelay();
    const response = await client.get<SummaryActivity[]>("/athlete/activities", { params });
    const activities = response.data;

    if (activities.length === 0) {
      console.log(`   No more activities found. Total: ${allActivities.length}`);
      break;
    }

    allActivities.push(...activities);
    console.log(`   Got ${activities.length} activities (total so far: ${allActivities.length})`);

    if (activities.length < pageSize) {
      // Last page
      break;
    }
  }

  console.log(`\n📊 Total activities fetched: ${allActivities.length}\n`);
  return allActivities;
}

