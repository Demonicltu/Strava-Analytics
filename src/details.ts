import type { AxiosInstance } from "axios";
import type {
  DetailedActivity,
  Lap,
  ActivityZone,
  StreamEntry,
  StreamSet,
  StreamKeys,
  EnrichedActivity,
  AthleteStats,
} from "./types.js";
import { rateLimitDelay } from "./client.js";

const STREAM_KEYS: StreamKeys[] = [
  "time",
  "distance",
  "latlng",
  "altitude",
  "velocity_smooth",
  "heartrate",
  "cadence",
  "watts",
  "temp",
  "moving",
  "grade_smooth",
];

/**
 * Fetch full details for a single activity (detail, laps, zones, streams).
 */
export async function fetchEnrichedActivity(
  client: AxiosInstance,
  activityId: number,
  activityName: string
): Promise<EnrichedActivity> {
  // Fetch detailed activity
  await rateLimitDelay();
  const detailRes = await client.get<DetailedActivity>(`/activities/${activityId}`, {
    params: { include_all_efforts: true },
  });
  const activity = detailRes.data;

  // Fetch laps
  let laps: Lap[] = [];
  try {
    await rateLimitDelay();
    const lapsRes = await client.get<Lap[]>(`/activities/${activityId}/laps`);
    laps = lapsRes.data;
  } catch (err: any) {
    if (err?.response?.status === 404 || err?.response?.status === 402) {
      // No laps available
    } else {
      console.warn(`   ⚠️  Could not fetch laps for "${activityName}": ${err.message}`);
    }
  }

  // Fetch zones (only for activities with HR / power data)
  let zones: ActivityZone[] = [];
  try {
    await rateLimitDelay();
    const zonesRes = await client.get<ActivityZone[]>(`/activities/${activityId}/zones`);
    zones = zonesRes.data;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 404 || status === 403 || status === 402) {
      // Zones not available (404/403) or requires Strava Premium (402)
    } else {
      console.warn(`   ⚠️  Could not fetch zones for "${activityName}": ${err.message}`);
    }
  }

  // Fetch streams
  let streams: StreamSet = {};
  try {
    await rateLimitDelay();
    const streamsRes = await client.get<StreamEntry[]>(`/activities/${activityId}/streams`, {
      params: {
        keys: STREAM_KEYS.join(","),
        key_by_type: true,
      },
    });

    // The API returns an array of stream entries; convert to keyed object
    if (Array.isArray(streamsRes.data)) {
      for (const entry of streamsRes.data) {
        streams[entry.type as StreamKeys] = entry;
      }
    } else {
      // Sometimes it's already keyed
      streams = streamsRes.data as unknown as StreamSet;
    }
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 404 || status === 402) {
      // Streams not available (manual activity) or requires Premium
    } else {
      console.warn(`   ⚠️  Could not fetch streams for "${activityName}": ${err.message}`);
    }
  }

  return { activity, laps, zones, streams };
}

/**
 * Fetch athlete stats (totals, records).
 */
export async function fetchAthleteStats(
  client: AxiosInstance,
  athleteId: number
): Promise<AthleteStats | null> {
  try {
    await rateLimitDelay();
    const res = await client.get<AthleteStats>(`/athletes/${athleteId}/stats`);
    return res.data;
  } catch (err: any) {
    console.warn(`⚠️  Could not fetch athlete stats: ${err.message}`);
    return null;
  }
}

