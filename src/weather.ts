/**
 * Fetch historical meteorological data from Open-Meteo (free, no API key).
 * Supports multi-point sampling for long activities (0%, 25%, 50%, 75% of route).
 */

/** A weather snapshot at a specific GPS waypoint + hour during the activity */
export interface WeatherSnapshot {
  /** Position in the ride (0 = start, 25 = quarter, 50 = half, 75 = three-quarters) */
  waypoint_pct: number;
  lat: number;
  lng: number;
  utc_time: string;
  hour: number;
  temperature_c: number | null;
  apparent_temperature_c: number | null;
  precipitation_mm: number | null;
  windspeed_kmh: number | null;
  wind_direction_deg: number | null;
  wind_gusts_kmh: number | null;
  weathercode: number | null;
  weather_description: string | null;
  relative_humidity_pct: number | null;
}

/** Multi-point weather covering the full activity route */
export interface WeatherMultiPoint {
  source: string;
  /** Number of waypoints successfully fetched */
  waypoints_fetched: number;
  snapshots: WeatherSnapshot[];
  /** Most common weather condition across all snapshots */
  condition_summary: string | null;
  /** Convenience: first snapshot (activity start) */
  at_start: WeatherSnapshot | null;
}

// Legacy single-point shape (backward compat for old output/ JSON files)
export interface WeatherData {
  source: string;
  latitude: number;
  longitude: number;
  date: string;
  at_start: { windspeed_kmh: number | null; wind_direction_deg: number | null; wind_gusts_kmh: number | null; temperature_c: number | null; apparent_temperature_c: number | null; precipitation_mm: number | null; relative_humidity_pct: number | null; weathercode: number | null; weather_description: string | null } | null;
  condition_summary: string | null;
}

const HOURLY_FIELDS = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation",
  "windspeed_10m",
  "winddirection_10m",
  "windgusts_10m",
  "weathercode",
  "relativehumidity_2m",
];

/** WMO weather code → human-readable description */
export function wmoDescription(code: number | null): string | null {
  if (code == null) return null;
  const map: Record<number, string> = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Icy fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
  };
  return map[code] ?? `WMO code ${code}`;
}

function baseUrl(utcIso: string): string {
  const daysDiff = (Date.now() - new Date(utcIso).getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff > 7
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";
}

async function fetchOneWaypoint(
  axios: any,
  lat: number,
  lng: number,
  utcIso: string,
  waypointPct: number
): Promise<WeatherSnapshot | null> {
  try {
    const date = utcIso.slice(0, 10);
    const targetHour = new Date(utcIso).getUTCHours();
    const url = baseUrl(utcIso);

    const res = await axios.get(url, {
      params: {
        latitude: lat,
        longitude: lng,
        start_date: date,
        end_date: date,
        hourly: HOURLY_FIELDS.join(","),
        timezone: "UTC",
        windspeed_unit: "kmh",
      },
      timeout: 15_000,
    });

    const d = res.data;
    if (!d?.hourly?.time) return null;

    // Find the hour entry closest to the activity's actual hour at this waypoint
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < d.hourly.time.length; i++) {
      const h = new Date(d.hourly.time[i]).getUTCHours();
      const diff = Math.abs(h - targetHour);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    const i = best;

    return {
      waypoint_pct: waypointPct,
      lat,
      lng,
      utc_time: utcIso,
      hour: new Date(d.hourly.time[i]).getUTCHours(),
      temperature_c: d.hourly.temperature_2m?.[i] ?? null,
      apparent_temperature_c: d.hourly.apparent_temperature?.[i] ?? null,
      precipitation_mm: d.hourly.precipitation?.[i] ?? null,
      windspeed_kmh: d.hourly.windspeed_10m?.[i] ?? null,
      wind_direction_deg: d.hourly.winddirection_10m?.[i] ?? null,
      wind_gusts_kmh: d.hourly.windgusts_10m?.[i] ?? null,
      weathercode: d.hourly.weathercode?.[i] ?? null,
      weather_description: wmoDescription(d.hourly.weathercode?.[i] ?? null),
      relative_humidity_pct: d.hourly.relativehumidity_2m?.[i] ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch weather at multiple GPS waypoints spread across the activity.
 * Each waypoint = { lat, lng, utcIso, waypointPct (0/25/50/75) }
 * All requests run in parallel.
 */
export async function fetchWeatherMultiPoint(
  waypoints: { lat: number; lng: number; utcIso: string; waypointPct: number }[]
): Promise<WeatherMultiPoint | null> {
  if (waypoints.length === 0) return null;
  try {
    const { default: axios } = await import("axios");

    const results = await Promise.all(
      waypoints.map(w => fetchOneWaypoint(axios, w.lat, w.lng, w.utcIso, w.waypointPct))
    );
    const snapshots = results.filter((s): s is WeatherSnapshot => s !== null);
    if (snapshots.length === 0) return null;

    // Dominant condition across all snapshots
    const codeCounts: Record<number, number> = {};
    for (const s of snapshots) {
      if (s.weathercode != null) codeCounts[s.weathercode] = (codeCounts[s.weathercode] ?? 0) + 1;
    }
    const dominantCode = Object.keys(codeCounts).length > 0
      ? Number(Object.keys(codeCounts).sort((a, b) => codeCounts[+b] - codeCounts[+a])[0])
      : null;

    const src = baseUrl(waypoints[0].utcIso).includes("archive")
      ? "Open-Meteo Archive (ERA5)"
      : "Open-Meteo Forecast";

    return {
      source: src,
      waypoints_fetched: snapshots.length,
      snapshots,
      condition_summary: wmoDescription(dominantCode),
      at_start: snapshots.find(s => s.waypoint_pct === 0) ?? snapshots[0],
    };
  } catch (err: any) {
    console.warn(`   ⚠️  Weather fetch failed: ${err.message}`);
    return null;
  }
}

/**
 * Build waypoint inputs from stream_data rows + activity start UTC time.
 * Samples ONE waypoint per unique UTC hour the activity spans — no redundant calls.
 * e.g. 45-min ride → 1 call, 2.5h ride → 3 calls, 5h ride → 6 calls.
 */
export function buildWeatherWaypoints(
  streamRows: { latitude?: number; longitude?: number; time_seconds?: number }[],
  activityStartUtc: string
): { lat: number; lng: number; utcIso: string; waypointPct: number }[] {
  const gpsRows = streamRows.filter(r => r.latitude != null && r.longitude != null);
  if (gpsRows.length === 0) return [];

  const startMs = new Date(activityStartUtc).getTime();
  const startHour = Math.floor(startMs / 3_600_000); // UTC hour index

  // Find how many UTC hours the activity spans
  const lastRow = gpsRows[gpsRows.length - 1];
  const endMs = startMs + (lastRow.time_seconds ?? 0) * 1000;
  const endHour = Math.floor(endMs / 3_600_000);

  const waypoints: { lat: number; lng: number; utcIso: string; waypointPct: number }[] = [];
  const totalDurationSec = (lastRow.time_seconds ?? 0) || 1;

  for (let hourIdx = startHour; hourIdx <= endHour; hourIdx++) {
    const hourStartMs = hourIdx * 3_600_000;
    // Find the GPS row whose absolute time is closest to the start of this UTC hour
    const targetOffsetSec = Math.max(0, (hourStartMs - startMs) / 1000);
    let best = gpsRows[0];
    let bestDiff = Infinity;
    for (const row of gpsRows) {
      const diff = Math.abs((row.time_seconds ?? 0) - targetOffsetSec);
      if (diff < bestDiff) { bestDiff = diff; best = row; }
    }
    const waypointPct = Math.round((best.time_seconds ?? 0) / totalDurationSec * 100);
    waypoints.push({
      lat: best.latitude!,
      lng: best.longitude!,
      utcIso: new Date(startMs + (best.time_seconds ?? 0) * 1000).toISOString(),
      waypointPct,
    });
  }

  return waypoints;
}


