/**
 * Garmin wellness context reader.
 * Reads analysis/garmin_wellness.json and returns a compact WellnessContext
 * for a given activity date (night-before + day-of data).
 *
 * Used by analyze.ts and fast.ts to enrich single-activity analysis.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface WellnessContext {
  /** Date of the activity */
  activity_date: string;
  /** Night before the activity */
  night_before: WellnessDay | null;
  /** Day of the activity (intraday metrics: body battery, steps, stress) */
  day_of: WellnessDayOf | null;
  /** Human-readable readiness summary for AI interpretation */
  readiness_note: string;
}

export interface WellnessDay {
  date: string;
  // Sleep
  sleep_score: number | null;
  sleep_duration_h: number | null;
  sleep_deep_pct: number | null;
  sleep_rem_pct: number | null;
  sleep_avg_spo2: number | null;
  sleep_avg_stress: number | null;
  // HRV — hrv_last_night is always null from this API; use hrv_last_5_min (5-min peak HRV during sleep)
  hrv_last_5_min: number | null;
  hrv_weekly_avg: number | null;
  hrv_status: string | null;
  hrv_vs_baseline: number | null;    // hrv_last_5_min - weeklyAvg
  // Resting HR
  resting_hr: number | null;
  // Training readiness (Garmin composite score 0–100)
  training_readiness_score: number | null;
  training_readiness_level: string | null;
  // Stress breakdown
  stress_low_pct: number | null;
  stress_medium_pct: number | null;
  stress_high_pct: number | null;
  // Body Battery
  body_battery_start: number | null;
  body_battery_end: number | null;
  body_battery_charged: number | null;   // charged during the day
  body_battery_drained: number | null;   // drained during the day
  // SpO2
  spo2_avg: number | null;
  spo2_min: number | null;
}

export interface WellnessDayOf {
  date: string;
  // Body Battery at start of activity — from intraday lookup if available, else start-of-day
  body_battery_at_start: number | null;
  // Full intraday array [[timestamp_ms, value], ...] — used for activity-time lookup
  body_battery_intraday: [number, number][] | null;
  // Stress
  avg_stress: number | null;
  // Steps before activity (approximated as total daily steps — no intraday step split)
  daily_steps: number | null;
  // Intensity minutes
  intensity_minutes_moderate: number | null;
  intensity_minutes_vigorous: number | null;
}

function round1(v: number | null | undefined): number | null {
  return v != null ? Math.round(v * 10) / 10 : null;
}

function pct(part: number | null | undefined, total: number | null | undefined): number | null {
  if (!part || !total || total === 0) return null;
  return Math.round((part / total) * 100);
}

/**
 * Find the body battery value at the closest timestamp to activityStartIso.
 * intraday: [[timestamp_ms, value], ...]
 */
function bodyBatteryAtTime(intraday: [number, number][] | null, activityStartIso: string | null): number | null {
  if (!intraday || intraday.length === 0 || !activityStartIso) return null;
  const targetMs = new Date(activityStartIso).getTime();
  if (isNaN(targetMs)) return null;
  let closest = intraday[0];
  let minDiff = Math.abs(intraday[0][0] - targetMs);
  for (const pair of intraday) {
    const diff = Math.abs(pair[0] - targetMs);
    if (diff < minDiff) { minDiff = diff; closest = pair; }
  }
  return closest[1];
}

function buildReadinessNote(night: WellnessDay | null, dayOf: WellnessDayOf | null): string {
  if (!night && !dayOf) return "No Garmin wellness data available for this date.";

  const parts: string[] = [];

  if (night) {
    // HRV assessment
    if (night.hrv_last_5_min != null) {
      const vs = night.hrv_vs_baseline != null
        ? ` (${night.hrv_vs_baseline > 0 ? "+" : ""}${night.hrv_vs_baseline} vs 7d avg)`
        : "";
      const status = night.hrv_status ? ` — ${night.hrv_status}` : "";
      parts.push(`HRV 5-min peak: ${night.hrv_last_5_min} ms${vs}${status}`);
    }

    // Sleep
    if (night.sleep_score != null) {
      const dur = night.sleep_duration_h != null ? ` (${night.sleep_duration_h}h)` : "";
      parts.push(`Sleep score: ${night.sleep_score}/100${dur}`);
    }

    // Resting HR
    if (night.resting_hr != null) {
      parts.push(`Resting HR: ${night.resting_hr} bpm`);
    }

    // Training readiness
    if (night.training_readiness_score != null) {
      const level = night.training_readiness_level ? ` (${night.training_readiness_level})` : "";
      parts.push(`Training readiness: ${night.training_readiness_score}/100${level}`);
    }

    // Stress breakdown (only if meaningful — high stress > 10%)
    if (night.stress_high_pct != null && night.stress_high_pct > 10) {
      parts.push(`High stress: ${night.stress_high_pct}% of day`);
    }
  }

  // Body Battery at start of activity
  const bb = dayOf?.body_battery_at_start ?? night?.body_battery_start ?? null;
  if (bb != null) {
    parts.push(`Body Battery at activity start: ${bb}/100`);
  }

  if (parts.length === 0) return "Garmin data present but no key metrics available.";
  return parts.join(" | ");
}

/**
 * Load wellness context for a given activity date.
 * Returns null if garmin_wellness.json doesn't exist.
 * Returns WellnessContext with null fields if data is missing for that date.
 */
export function loadWellnessContext(
  analysisDir: string,
  activityDate: string,    // ISO YYYY-MM-DD
  activityStartIso?: string | null,  // ISO datetime for intraday body battery lookup (e.g. start_date_local)
): WellnessContext | null {
  const wellnessPath = join(analysisDir, "garmin_wellness.json");
  if (!existsSync(wellnessPath)) return null;

  let wellness: Record<string, any>;
  try {
    wellness = JSON.parse(readFileSync(wellnessPath, "utf-8"));
  } catch {
    return null;
  }

  // Night before = previous calendar day (sleep data is attributed to the morning wake-up date)
  const actDate = new Date(activityDate);
  const nightBeforeDate = new Date(actDate);
  nightBeforeDate.setDate(nightBeforeDate.getDate() - 1);
  const nightBeforeStr = nightBeforeDate.toISOString().slice(0, 10);

  const nightRaw = wellness[nightBeforeStr] ?? null;
  const dayRaw = wellness[activityDate] ?? null;

  const night: WellnessDay | null = nightRaw ? (() => {
    const sleepTotal = nightRaw.sleep_duration_sec ?? null;
    const hvd = nightRaw.hrv_last_5_min ?? null;
    const hvw = nightRaw.hrv_weekly_avg ?? null;

    // Stress breakdown — convert seconds to % of waking day (assume 16h = 57600s)
    const WAKING_SEC = 57600;
    const stressPct = (sec: number | null) =>
      sec != null ? Math.round((sec / WAKING_SEC) * 100) : null;

    return {
      date: nightBeforeStr,
      sleep_score: nightRaw.sleep_score ?? null,
      sleep_duration_h: sleepTotal ? round1(sleepTotal / 3600) : null,
      sleep_deep_pct: pct(nightRaw.sleep_deep_sec, sleepTotal),
      sleep_rem_pct: pct(nightRaw.sleep_rem_sec, sleepTotal),
      sleep_avg_spo2: nightRaw.sleep_average_spo2 ?? null,
      sleep_avg_stress: nightRaw.sleep_avg_stress ?? null,
      hrv_last_5_min: hvd,
      hrv_weekly_avg: hvw,
      hrv_status: nightRaw.hrv_status ?? null,
      hrv_vs_baseline: (hvd != null && hvw != null) ? Math.round(hvd - hvw) : null,
      resting_hr: nightRaw.resting_hr ?? null,
      training_readiness_score: nightRaw.training_readiness_score ?? null,
      training_readiness_level: nightRaw.training_readiness_level ?? null,
      stress_low_pct: stressPct(nightRaw.stress_low_sec ?? null),
      stress_medium_pct: stressPct(nightRaw.stress_medium_sec ?? null),
      stress_high_pct: stressPct(nightRaw.stress_high_sec ?? null),
      body_battery_start: nightRaw.body_battery_start_of_day ?? nightRaw.body_battery_highest ?? null,
      body_battery_end: nightRaw.body_battery_end_of_day ?? nightRaw.body_battery_lowest ?? null,
      body_battery_charged: nightRaw.body_battery_charged ?? null,
      body_battery_drained: nightRaw.body_battery_drained ?? null,
      spo2_avg: nightRaw.spo2_avg ?? null,
      spo2_min: nightRaw.spo2_min ?? null,
    };
  })() : null;

  const dayOf: WellnessDayOf | null = dayRaw ? (() => {
    const intraday: [number, number][] | null = Array.isArray(dayRaw.body_battery_intraday)
      ? dayRaw.body_battery_intraday : null;
    // Use intraday lookup at activity start time; fall back to start_of_day, then highest
    const bbAtStart = bodyBatteryAtTime(intraday, activityStartIso ?? null)
      ?? dayRaw.body_battery_start_of_day
      ?? dayRaw.body_battery_highest
      ?? null;
    return {
      date: activityDate,
      body_battery_at_start: bbAtStart,
      body_battery_intraday: intraday,
      avg_stress: dayRaw.avg_daily_stress ?? null,
      daily_steps: dayRaw.steps ?? null,
      intensity_minutes_moderate: dayRaw.intensity_minutes_moderate ?? null,
      intensity_minutes_vigorous: dayRaw.intensity_minutes_vigorous ?? null,
    };
  })() : null;

  const readiness_note = buildReadinessNote(night, dayOf);

  return { activity_date: activityDate, night_before: night, day_of: dayOf, readiness_note };
}

