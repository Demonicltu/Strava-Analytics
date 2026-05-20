/**
 * Shared helpers for compact activity summary extraction and historical context building.
 * Used by analyze.ts and compare.ts.
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

// ─── Types ───

export interface ActivitySummary {
  id: string;
  date: string;        // ISO YYYY-MM-DD
  week: string;        // YYYY-Www
  sport: string;       // grouped (see groupSport)
  sport_raw: string;   // original Strava sport_type
  name: string;
  distance_km: number;
  moving_time_sec: number;
  elevation_m: number;
  avg_hr: number | null;
  max_hr: number | null;
  avg_speed_kmh: number | null;
  avg_power_w: number | null;
  normalized_power: number | null;
  tss: number | null;
  trimp: number | null;
  vo2max: number | null;
  calories: number | null;
  hr_zone_pct: Record<string, number> | null;
  hr_zone_sec: Record<string, number> | null;  // actual seconds per zone — use for time-weighted aggregation
  efficiency_factor: number | null;
  pace_sec_per_km: number | null;
  avg_cadence: number | null;
  variability_index: number | null;
  cardiac_drift_bpm: number | null;
  z2_pct: number | null;
  best_20min_power_w: number | null;
  aerobic_decoupling_pct: number | null;
}

export interface PeriodBaseline {
  period_label: string;
  days: number;
  activity_count: number;
  total_distance_km: number | null;
  total_time_h: number | null;
  avg_hr: number | null;
  avg_pace_sec_per_km: number | null;
  avg_normalized_power_w: number | null;
  avg_tss: number | null;
  avg_trimp: number | null;
  avg_efficiency_factor: number | null;
  avg_vo2max: number | null;
  avg_cadence: number | null;
  avg_variability_index: number | null;
  avg_cardiac_drift_bpm: number | null;
  avg_z2_pct: number | null;
  avg_best_20min_power_w: number | null;
  avg_aerobic_decoupling_pct: number | null;
  weekly_avg_distance_km: number | null;
  weekly_avg_trimp: number | null;
}

/** Minimum historical activities required per period to emit a baseline */
export const MIN_HISTORY_COUNT = 3;

// ─── Helpers ───

/** Group fine-grained Strava sport types into coarse categories */
export function groupSport(sportType: string): string {
  const t = sportType || "Unknown";
  if (["Run", "TrailRun", "VirtualRun"].includes(t)) return "Run";
  if (["Ride", "GravelRide", "MountainBikeRide", "VirtualRide", "EBikeRide"].includes(t)) return "Ride";
  if (["Swim", "OpenWaterSwim"].includes(t)) return "Swim";
  if (["Walk", "Hike"].includes(t)) return "Walk";
  if (["Surf", "Windsurf", "Kitesurf"].includes(t)) return "Surf";
  if (["WeightTraining", "Yoga", "Pilates", "Crossfit", "Workout"].includes(t)) return "Strength";
  return t;
}

export function isoWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function avg(arr: (number | null)[]): number | null {
  const v = arr.filter((x): x is number => x != null && !isNaN(x));
  return v.length > 0 ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
}

export function sum(arr: (number | null)[]): number {
  return arr.reduce((a: number, b) => a + (b ?? 0), 0);
}

export function round2(v: number | null): number | null {
  return v != null ? Math.round(v * 100) / 100 : null;
}

// ─── Core extraction ───

/** Extract a compact ActivitySummary from a raw _crunched.json object */
export function extractSummary(raw: any, filename: string): ActivitySummary | null {
  try {
    const s = raw.summary_card;
    const idMatch = filename.match(/activity_(\d+)_/);
    const id = idMatch ? idMatch[1] : filename;

    const fileDate = filename.match(/_(\d{4}-\d{2}-\d{2})_/);
    const date = fileDate
      ? fileDate[1]
      : (s?.date ? new Date(s.date).toISOString().slice(0, 10) : "unknown");
    if (date === "unknown") return null;

    const sport_raw = s?.type || "Unknown";
    const sport = groupSport(sport_raw);

    const hrZones = raw.training_zones?.hr_zones?.zones as any[] | undefined;
    const hr_zone_pct: Record<string, number> | null = hrZones
      ? Object.fromEntries(hrZones.map((z: any, i: number) => [`z${i + 1}`, z.pct ?? 0]))
      : null;
    const hr_zone_sec: Record<string, number> | null = hrZones
      ? Object.fromEntries(hrZones.map((z: any, i: number) => [`z${i + 1}`, z.time_seconds ?? 0]))
      : null;

    const avgHr: number | null = raw.heart_rate?.stats?.avg ?? null;
    const np: number | null = raw.power?.normalized_power ?? null;
    const ef: number | null = (np && avgHr) ? Math.round((np / avgHr) * 1000) / 1000 : null;

    let pace_sec: number | null = null;
    if (sport === "Run" && (raw.summary_card?.avg_speed as string | undefined)?.includes("/km")) {
      const m = (raw.summary_card.avg_speed as string).match(/(\d+):(\d+)\/km/);
      if (m) pace_sec = parseInt(m[1]) * 60 + parseInt(m[2]);
    }

    // Z2 % — from hr_zones array (index 1 = Z2)
    const z2_pct: number | null = hrZones?.[1]?.pct ?? null;

    // Best 20-min power — parse "206.4 W" string
    const p20raw: string | null = raw.power?.best_efforts?.["20min"] ?? null;
    const best_20min_power_w: number | null = p20raw ? parseFloat(p20raw) : null;

    const distRaw = raw.summary_card?.distance;
    const distance_km = distRaw ? parseFloat((distRaw as string).replace(" km", "")) : 0;

    const tssRaw = raw.training_metrics?.tss ?? null;
    const trimpRaw = raw.relative_effort?.score ?? null;
    const vo2maxRaw = raw.vo2max?.value ?? null;

    return {
      id,
      date,
      week: isoWeek(date),
      sport,
      sport_raw,
      name: raw.summary_card?.name ?? filename,
      distance_km,
      moving_time_sec: raw.summary_card?.moving_time_seconds ?? 0,
      elevation_m: raw.climbing?.total_ascent_m ?? 0,
      avg_hr: avgHr,
      max_hr: raw.heart_rate?.stats?.max ?? null,
      avg_speed_kmh: null,
      avg_power_w: raw.power?.avg_power ?? null,
      normalized_power: np,
      tss: tssRaw != null ? Math.round(tssRaw) : null,
      trimp: trimpRaw != null ? Math.round(trimpRaw) : null,
      vo2max: vo2maxRaw ? Math.round(vo2maxRaw * 10) / 10 : null,
      calories: null,
      hr_zone_pct,
      hr_zone_sec,
      efficiency_factor: ef,
      pace_sec_per_km: pace_sec,
      avg_cadence: raw.cadence?.stats?.avg ?? null,
      variability_index: raw.power?.variability_index ?? null,
      cardiac_drift_bpm: raw.heart_rate?.cardiac_drift?.drift_bpm ?? null,
      z2_pct,
      best_20min_power_w: best_20min_power_w && !isNaN(best_20min_power_w) ? Math.round(best_20min_power_w) : null,
      aerobic_decoupling_pct: raw.aerobic_decoupling?.decoupling_pct ?? null,
    };
  } catch {
    return null;
  }
}

/** Load and parse all ActivitySummary objects from an analysis directory */
export function loadAllSummaries(analysisDir: string): ActivitySummary[] {
  if (!existsSync(analysisDir)) return [];
  const files = readdirSync(analysisDir).filter(f => f.endsWith("_crunched.json"));
  const summaries: ActivitySummary[] = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(join(analysisDir, f), "utf-8"));
      const s = extractSummary(raw, f);
      if (s) summaries.push(s);
    } catch { /* skip corrupt */ }
  }
  return summaries.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Historical context ───

/**
 * Build historical baselines for 7d / 30d / 90d / 365d strictly BEFORE activityDate.
 * Filters to the same sport GROUP. Omits any window with < MIN_HISTORY_COUNT activities.
 * Returns null when there is no usable history at all.
 */
export function buildHistoricalContext(
  allSummaries: ActivitySummary[],
  activityDate: string,   // ISO YYYY-MM-DD of the activity being analysed
  activitySport: string,  // already-grouped sport string
): { sport: string; baselines: PeriodBaseline[] } | null {
  const cutoff = new Date(activityDate);
  // Strictly before this activity's date
  const history = allSummaries.filter(
    a => new Date(a.date) < cutoff && a.sport === activitySport,
  );

  if (history.length < MIN_HISTORY_COUNT) return null;

  const PERIODS = [
    { label: "1 week",   days: 7 },
    { label: "1 month",  days: 30 },
    { label: "3 months", days: 90 },
    { label: "6 months", days: 180 },
    // 1 year removed — too distant for meaningful comparison per AI instructions
  ];

  const baselines: PeriodBaseline[] = [];

  for (const { label, days } of PERIODS) {
    const from = new Date(cutoff);
    from.setDate(from.getDate() - days);
    const inWindow = history.filter(a => new Date(a.date) >= from);

    if (inWindow.length < MIN_HISTORY_COUNT) continue;

    const distTotal = round2(sum(inWindow.map(a => a.distance_km)));
    const timeTotal = round2(sum(inWindow.map(a => a.moving_time_sec)) / 3600);
    const weeksInWindow = days / 7;

    baselines.push({
      period_label: label,
      days,
      activity_count: inWindow.length,
      total_distance_km: distTotal,
      total_time_h: timeTotal,
      avg_hr: avg(inWindow.map(a => a.avg_hr)),
      avg_pace_sec_per_km: avg(inWindow.map(a => a.pace_sec_per_km)),
      avg_normalized_power_w: avg(inWindow.map(a => a.normalized_power ?? a.avg_power_w)),
      avg_tss: avg(inWindow.map(a => a.tss)),
      avg_trimp: avg(inWindow.map(a => a.trimp)),
      avg_efficiency_factor: avg(inWindow.map(a => a.efficiency_factor)),
      avg_vo2max: avg(inWindow.map(a => a.vo2max)),
      avg_cadence: avg(inWindow.map(a => a.avg_cadence)),
      avg_variability_index: avg(inWindow.map(a => a.variability_index)),
      avg_cardiac_drift_bpm: avg(inWindow.map(a => a.cardiac_drift_bpm)),
      avg_z2_pct: avg(inWindow.map(a => a.z2_pct)),
      avg_best_20min_power_w: avg(inWindow.map(a => a.best_20min_power_w)),
      avg_aerobic_decoupling_pct: avg(inWindow.map(a => a.aerobic_decoupling_pct)),
      weekly_avg_distance_km: round2((distTotal ?? 0) / weeksInWindow),
      weekly_avg_trimp: round2(sum(inWindow.map(a => a.trimp)) / weeksInWindow),
    });
  }

  if (baselines.length === 0) return null;

  return { sport: activitySport, baselines };
}

// ─── PR check ───

export interface PRCheck {
  is_pr_longest_distance: boolean;
  is_pr_fastest_pace: boolean;
  is_pr_best_power: boolean;
  is_pr_biggest_climb: boolean;
  pr_labels: string[];
}

/**
 * Check whether this activity sets any personal records vs all prior activities (same sport).
 * Returns a PRCheck with flags and human-readable labels.
 */
export function checkPRs(
  allSummaries: ActivitySummary[],
  activity: ActivitySummary,
): PRCheck {
  const prior = allSummaries.filter(
    a => a.date < activity.date && a.sport === activity.sport,
  );

  if (prior.length < 3) {
    return { is_pr_longest_distance: false, is_pr_fastest_pace: false, is_pr_best_power: false, is_pr_biggest_climb: false, pr_labels: [] };
  }

  const maxDist = Math.max(...prior.map(a => a.distance_km));
  const minPace = Math.min(...prior.filter(a => a.pace_sec_per_km != null).map(a => a.pace_sec_per_km!).filter(v => v > 0));
  const maxPower = Math.max(...prior.filter(a => a.normalized_power != null).map(a => a.normalized_power!));
  const maxElev = Math.max(...prior.map(a => a.elevation_m));

  const labels: string[] = [];
  const isLongest = activity.distance_km > maxDist;
  const isFastest = activity.pace_sec_per_km != null && isFinite(minPace) && activity.pace_sec_per_km < minPace;
  const isBestPow = activity.normalized_power != null && isFinite(maxPower) && activity.normalized_power > maxPower;
  const isBigClimb = activity.elevation_m > maxElev;

  if (isLongest) labels.push(`🏅 Longest ${activity.sport} (${round2(activity.distance_km)} km)`);
  if (isFastest) labels.push(`🏅 Fastest ${activity.sport} pace (${Math.floor(activity.pace_sec_per_km!/60)}:${String(Math.round(activity.pace_sec_per_km!%60)).padStart(2,"0")}/km)`);
  if (isBestPow) labels.push(`🏅 Best normalized power (${Math.round(activity.normalized_power!)} W)`);
  if (isBigClimb) labels.push(`🏅 Biggest climb (${Math.round(activity.elevation_m)} m)`);

  return {
    is_pr_longest_distance: isLongest,
    is_pr_fastest_pace: isFastest,
    is_pr_best_power: isBestPow,
    is_pr_biggest_climb: isBigClimb,
    pr_labels: labels,
  };
}

