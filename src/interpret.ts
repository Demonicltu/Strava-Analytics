/**
 * Builds focused AI interpretation requests for each analysis slot.
 * Each slot gets a small, targeted context object and a short system prompt.
 * Few-shot examples are appended from instructions/examples/{slot}.md when available.
 */
import type { AiRequest } from "./ai_client.js";
import { loadFewShot } from "./few_shot.js";

// ─── Shared context ───────────────────────────────────────────────────────────

interface ActivityDigest {
  sport: string;
  distance: string;
  duration: string;
  avgPace?: string;
  avgSpeed?: string;
  avgHR: number;
  maxHR: number;
  avgPower?: number;
  np?: number;
  tss?: number;
  ifactor?: number;
  ftp?: number;
  weight?: number;
  decoupling?: number;
  drift?: number;
}

function buildDigest(c: any): ActivityDigest {
  const sc = c.summary_card;
  const type = sc?.type ?? "Activity";
  const isRun = type.toLowerCase().includes("run");
  const avgSpeedKmh = c.pacing?.first_half?.avg_speed_kmh; // rough proxy
  let avgPace: string | undefined;
  if (isRun && avgSpeedKmh) {
    const s = 3600 / avgSpeedKmh;
    avgPace = `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}/km`;
  }
  return {
    sport: type,
    distance: sc?.distance ?? "—",
    duration: sc?.moving_time ?? "—",
    avgPace,
    avgSpeed: sc?.avg_speed,
    avgHR: Math.round(c.heart_rate?.stats?.avg ?? 0),
    maxHR: Math.round(c.heart_rate?.stats?.max ?? 0),
    avgPower: c.power?.avg_power ?? undefined,
    np: c.power?.normalized_power ?? undefined,
    tss: c.training_metrics?.tss ?? undefined,
    ifactor: c.training_metrics?.intensity_factor ?? undefined,
    ftp: c.training_metrics?.ftp_used ?? undefined,
    weight: undefined,
    decoupling: c.aerobic_decoupling?.decoupling_pct ?? undefined,
    drift: c.heart_rate?.cardiac_drift?.drift_bpm ?? undefined,
  };
}

const TONE = "Positive, specific, data-driven. No fluff, no filler phrases like 'Great job' or 'Overall'. Use exact numbers. 2-4 sentences unless specified.";

// ─── Slot builders ────────────────────────────────────────────────────────────

function verdictRequest(c: any, digest: ActivityDigest): AiRequest {
  const prCount = c.segments_summary?.prs ?? 0;
  return {
    slot: "verdict",
    system: `You analyze athlete activity data. Write a 2-3 sentence performance verdict. ${TONE}`,
    user: JSON.stringify({
      sport: digest.sport,
      distance: digest.distance,
      duration: digest.duration,
      avg_pace: digest.avgPace,
      avg_speed: digest.avgSpeed,
      avg_hr: digest.avgHR,
      avg_power: digest.avgPower,
      tss: digest.tss,
      intensity_factor: digest.ifactor,
      aerobic_decoupling_pct: digest.decoupling,
      cardiac_drift_bpm: digest.drift,
      pacing_type: c.pacing?.type,
      segment_prs: prCount,
      weather_condition: c.meteorology?.at_activity_start?.weather_description,
    }),
    maxTokens: 200,
  };
}

function pacingRequest(c: any, digest: ActivityDigest): AiRequest {
  const pac = c.pacing;
  return {
    slot: "pacing_interpretation",
    system: `You analyze athlete pacing data. State split type (positive/negative/even), by how much, and interpret quality in 2 sentences. ${TONE} Never repeat the numbers from the table — add interpretation only.`,
    user: JSON.stringify({
      sport: digest.sport,
      split_type: pac?.type,
      first_half_speed: pac?.first_half?.avg_speed_kmh,
      second_half_speed: pac?.second_half?.avg_speed_kmh,
      first_half_hr: pac?.first_half?.avg_hr,
      second_half_hr: pac?.second_half?.avg_hr,
      fastest_km: pac?.fastest_km,
      slowest_km: pac?.slowest_km,
    }),
    maxTokens: 150,
  };
}

function cardiacDriftRequest(c: any): AiRequest {
  const cd = c.heart_rate?.cardiac_drift;
  return {
    slot: "cardiac_drift_interpretation",
    system: `Write 1 sentence interpreting cardiac drift in context of the activity. Positive drift = fatigue / heat. Near-zero = efficient. Negative = terrain-driven. ${TONE}`,
    user: JSON.stringify({
      drift_bpm: cd?.drift_bpm,
      drift_pct: cd?.drift_pct,
      aerobic_decoupling_pct: c.aerobic_decoupling?.decoupling_pct,
      duration_min: Math.round((c.summary_card?.moving_time_seconds ?? 0) / 60),
    }),
    maxTokens: 80,
  };
}

function powerInterpretationRequest(c: any): AiRequest {
  return {
    slot: "power_interpretation",
    system: `Interpret the Variability Index (VI) in 1-2 sentences. VI near 1.0 = steady effort; higher = variable/surges. ${TONE}`,
    user: JSON.stringify({
      variability_index: c.power?.variability_index,
      avg_power: c.power?.avg_power,
      normalized_power: c.power?.normalized_power,
    }),
    maxTokens: 80,
  };
}

function efRequest(c: any): AiRequest {
  return {
    slot: "ef_interpretation",
    system: `Write 1 short phrase (not a full sentence) assessing Efficiency Factor quality. E.g. "strong, reflecting good aerobic fitness for the given power output." or "below average, suggesting fatigue or harder than usual terrain." ${TONE}`,
    user: JSON.stringify({
      efficiency_factor: c.training_metrics?.efficiency_factor,
      baseline_ef: null, // filled if historical available
    }),
    maxTokens: 40,
  };
}

function decouplingRequest(c: any): AiRequest {
  const ad = c.aerobic_decoupling;
  return {
    slot: "decoupling_interpretation",
    system: `Write 1 sentence interpreting aerobic decoupling. <3% = excellent aerobic base. 3-5% = good. 5-10% = needs more Z2. >10% = significant aerobic drift, focus on base building. ${TONE}`,
    user: JSON.stringify({
      decoupling_pct: ad?.decoupling_pct,
      first_half_power: ad?.first_half_power,
      second_half_power: ad?.second_half_power,
      first_half_hr: ad?.first_half_hr,
      second_half_hr: ad?.second_half_hr,
    }),
    maxTokens: 60,
  };
}

function powerSkillsRequest(c: any): AiRequest {
  return {
    slot: "power_skills_interpretation",
    system: `Write 2-3 sentences interpreting the power profile (sprint/attack/sustained). Identify primary strength, what it means for ride style. ${TONE}`,
    user: JSON.stringify({
      power_skills: c.power_skills,
      power_to_weight: c.power_to_weight,
      sport: c.summary_card?.type,
    }),
    maxTokens: 150,
  };
}

function hrZonesRequest(c: any): AiRequest {
  const hz = c.training_zones?.hr_zones;
  return {
    slot: "hr_zones_insight",
    system: `Write 1-2 sentences on which HR zone dominated and what it means for training quality. ${TONE}`,
    user: JSON.stringify({
      zones: hz?.zones?.map((z: any) => ({ zone: z.zone, pct: z.pct })),
      sport: c.summary_card?.type,
      intensity_factor: c.training_metrics?.intensity_factor,
    }),
    maxTokens: 80,
  };
}

function powerZonesRequest(c: any): AiRequest {
  const pz = c.training_zones?.power_zones;
  return {
    slot: "power_zones_insight",
    system: `Write 1-2 sentences on which power zones dominated and training stimulus. ${TONE}`,
    user: JSON.stringify({
      zones: pz?.zones?.map((z: any) => ({ zone: z.zone, pct: z.pct })),
      ftp: pz?.ftp_used,
      tss: c.training_metrics?.tss,
    }),
    maxTokens: 80,
  };
}

function cadenceZonesRequest(c: any): AiRequest {
  const cz = c.training_zones?.cadence_zones;
  const sport = (c.summary_card?.type ?? "").toLowerCase().includes("run") ? "running" : "cycling";
  return {
    slot: "cadence_zones_insight",
    system: `Write 1 sentence on cadence pattern quality. Running: optimal = 170-180 spm. Cycling: optimal = 85-95 rpm. ${TONE}`,
    user: JSON.stringify({
      zones: cz?.zones?.map((z: any) => ({ zone: z.zone, pct: z.pct })),
      avg_cadence: c.cadence?.stats?.avg,
      sport,
    }),
    maxTokens: 60,
  };
}

function vamRequest(c: any): AiRequest {
  const vam = c.vam_analysis;
  const sport = (c.summary_card?.type ?? "").toLowerCase().includes("run") ? "running" : "cycling";
  const refs = sport === "running"
    ? "hiking=200-400, trail runner=400-700, elite trail=800-1000"
    : "recreational=600-800, good amateur=800-1200, elite=1500+, Pogačar=1800-2000";
  return {
    slot: "vam_interpretation",
    system: `Write 1-2 sentences interpreting the VAM values in context of the sport. Reference: ${refs}. ${TONE}`,
    user: JSON.stringify({
      best_vam: vam?.best_vam_climb?.vam,
      overall_vam: vam?.overall_vam,
      sport,
      total_ascent_m: c.climbing_analysis?.total_ascent_m,
    }),
    maxTokens: 80,
  };
}

function torqueRequest(c: any): AiRequest {
  const sport = (c.summary_card?.type ?? "").toLowerCase().includes("run") ? "running" : "cycling";
  const refs = sport === "running"
    ? "recreational=10-18Nm, trained=18-28Nm, elite=28-40Nm, world-class=40+Nm"
    : "recreational=15-25Nm, strong amateur=25-40Nm, pro=40-60Nm";
  return {
    slot: "torque_interpretation",
    system: `Write 1-2 sentences interpreting torque values. Reference: ${refs}. ${TONE}`,
    user: JSON.stringify({ avg_nm: c.torque?.avg_torque_nm ?? c.torque?.avg_nm, peak_nm: c.torque?.peak_torque_nm ?? c.torque?.peak_nm, sport }),
    maxTokens: 80,
  };
}

function tipsRequest(c: any, digest: ActivityDigest, historical: any | null, wellness: any | null): AiRequest {
  const n = wellness?.night_before ?? null;
  const d = wellness?.day_of ?? null;
  return {
    slot: "tips",
    system: `Write at least 3 actionable training tips as consecutive markdown bullet points with NO blank lines between them. Each tip MUST reference a specific number from the data. Frame weaknesses as improvement opportunities. Format: "- **emoji Title** — specific advice with number." ${TONE}`,
    user: JSON.stringify({
      sport: digest.sport,
      avg_hr: digest.avgHR,
      avg_power: digest.avgPower,
      tss: digest.tss,
      intensity_factor: digest.ifactor,
      aerobic_decoupling_pct: digest.decoupling,
      cardiac_drift_bpm: digest.drift,
      pacing_type: c.pacing?.type,
      variability_index: c.power?.variability_index,
      avg_cadence: c.cadence?.stats?.avg,
      cadence_is_low: c.cadence?.is_low,
      segment_prs: c.segments_summary?.prs ?? 0,
      climbing_total_ascent_m: c.climbing_analysis?.total_ascent_m,
      best_vam: c.vam_analysis?.best_vam_climb?.vam,
      torque_avg_nm: c.torque?.avg_torque_nm ?? c.torque?.avg_nm,
      historical_avg_decoupling: historical?.baselines?.find((b: any) => b.days >= 160)?.avg_aerobic_decoupling_pct ?? null,
      historical_avg_tss_3mo: historical?.baselines?.find((b: any) => b.days >= 85 && b.days <= 95)?.avg_tss ?? null,
      historical_avg_trimp_3mo: historical?.baselines?.find((b: any) => b.days >= 85 && b.days <= 95)?.avg_trimp ?? null,
      garmin_sleep_score: n?.sleep_score ?? null,
      garmin_sleep_duration_h: n?.sleep_duration_h ?? null,
      garmin_hrv_last_5_min: n?.hrv_last_5_min ?? null,
      garmin_hrv_vs_baseline: n?.hrv_vs_baseline ?? null,
      garmin_resting_hr: n?.resting_hr ?? null,
      garmin_training_readiness: n?.training_readiness_score ?? null,
      garmin_body_battery_at_start: d?.body_battery_at_start ?? n?.body_battery_start ?? null,
      garmin_stress_high_pct: n?.stress_high_pct ?? null,
    }),
    maxTokens: 350,
  };
}

/**
 * Remove keys where the value is null/undefined in activityObj AND null/undefined in ALL baselines
 * for the corresponding key (prefixed with "avg_"). Mutates and returns activityObj.
 */
function filterNullNull(activityObj: Record<string, any>, baselines: (Record<string, any> | null)[]): Record<string, any> {
  const validBaselines = baselines.filter((b): b is Record<string, any> => b != null);
  for (const key of Object.keys(activityObj)) {
    if (activityObj[key] != null) continue;
    // Corresponding baseline key strategies: exact match or "avg_" prefix
    const baselineKeys = [`avg_${key}`, key];
    const allNull = validBaselines.every(b =>
      baselineKeys.every(bk => b[bk] == null)
    );
    if (allNull) delete activityObj[key];
  }
  return activityObj;
}

function historicalRequest(c: any, digest: ActivityDigest, historical: any): AiRequest {
  const baselines = historical.baselines ?? [];
  const primary = baselines.find((b: any) => b.days >= 85 && b.days <= 95) ?? baselines.at(-1);
  const slow = baselines.find((b: any) => b.days >= 160) ?? baselines.at(-1);

  // Parse best 20min power from string "206.4 W" to number
  const raw20min = c.power?.best_efforts?.["20min"];
  const best20minW = typeof raw20min === "string" ? parseFloat(raw20min) || null : raw20min ?? null;

  // Cadence range (p5-p95)
  const cadStats = c.cadence?.stats;
  const cadenceRange = cadStats?.p5 != null && cadStats?.p95 != null
    ? `${cadStats.p5}-${cadStats.p95} ${c.cadence?.unit ?? "rpm"}` : null;

  // ─── Local fallbacks for power-less activities ───
  const movingTimeSec: number = c.summary_card?.moving_time_seconds ?? 0;
  const elapsedTimeSec: number = c.summary_card?.elapsed_time_seconds ?? movingTimeSec;
  const moveRatio = elapsedTimeSec > 0 ? movingTimeSec / elapsedTimeSec : 1;

  // TSS fallback: TRIMP when no power TSS
  const trimpRaw: number | null = c.relative_effort?.score ?? null;
  let tssVal: number | null = c.training_metrics?.tss ?? null;
  let tss_is_fallback = false;
  if (tssVal == null && trimpRaw != null) {
    tssVal = Math.round(trimpRaw);
    tss_is_fallback = true;
  }

  // Pace-based VI fallback: 4th-power normalised speed / mean speed
  let viVal: number | null = c.power?.variability_index ?? null;
  let vi_is_fallback = false;
  if (viVal == null && moveRatio > 0.9) {
    const windows: any[] = Array.isArray(c.five_minute_windows) ? c.five_minute_windows : [];
    const speeds = windows.map((w: any) => w.avg_speed_kmh).filter((s: any) => typeof s === "number" && s > 0);
    if (speeds.length >= 3) {
      const mean = speeds.reduce((a: number, b: number) => a + b, 0) / speeds.length;
      const np4 = Math.pow(speeds.reduce((a: number, b: number) => a + Math.pow(b, 4), 0) / speeds.length, 0.25);
      if (mean > 0) {
        viVal = Math.round((np4 / mean) * 100) / 100;
        vi_is_fallback = true;
      }
    }
  }

  // Aerobic decoupling fallback: cardiac drift %
  let decouplingVal: number | null = c.aerobic_decoupling?.decoupling_pct ?? null;
  let decoupling_is_fallback = false;
  if (decouplingVal == null) {
    const driftPct: number | null = c.heart_rate?.cardiac_drift?.drift_pct ?? null;
    if (driftPct != null) {
      decouplingVal = driftPct;
      decoupling_is_fallback = true;
    }
  }

  // EF fallback: pace_sec_per_km / avg_hr (pace-based, inverse scale — lower = better for running)
  let efVal: number | null = c.training_metrics?.efficiency_factor ?? null;
  let ef_is_pace_based = false;
  if (efVal == null) {
    const avgHr: number | null = c.heart_rate?.stats?.avg ?? null;
    const speedStr: string | undefined = c.summary_card?.avg_speed;
    let paceSec: number | null = null;
    if (speedStr?.includes("/km")) {
      const m = speedStr.match(/(\d+):(\d+)\/km/);
      if (m) paceSec = parseInt(m[1]) * 60 + parseInt(m[2]);
    }
    if (paceSec != null && avgHr != null && avgHr > 0) {
      efVal = Math.round((paceSec / avgHr) * 1000) / 1000;
      ef_is_pace_based = true;
    }
  }

  // Build this_activity — flags sit alongside their values
  const thisActivity: Record<string, any> = {
    avg_hr: digest.avgHR,
    avg_power: digest.avgPower,
    np: digest.np,
    tss: tssVal,
    ...(tss_is_fallback && { tss_is_fallback: true }),
    ef: efVal,
    ...(ef_is_pace_based && { ef_is_pace_based: true, ef_unit: "s/km/bpm (pace÷HR, lower=better)" }),
    cadence: c.cadence?.stats?.avg,
    cadence_range_p5_p95: cadenceRange,
    z2_pct: c.training_zones?.hr_zones?.zones?.find((z: any) => z.zone?.includes("Z2"))?.pct,
    vi: viVal,
    ...(vi_is_fallback && { vi_is_fallback: true }),
    drift_bpm: digest.drift,
    decoupling_pct: decouplingVal,
    ...(decoupling_is_fallback && { decoupling_is_fallback: true }),
    vo2max: c.vo2max?.value,
    trimp: trimpRaw,
    best_20min_power_w: best20minW,
  };

  const primaryBaseline = primary ? {
    period: primary.period_label,
    avg_hr: primary.avg_hr ?? primary.avg_hr_bpm,
    avg_np: primary.avg_normalized_power_w,
    avg_tss: primary.avg_tss,
    avg_cadence: primary.avg_cadence,
    avg_vi: primary.avg_variability_index ?? primary.avg_vi,
    avg_drift: primary.avg_cardiac_drift_bpm,
    avg_trimp: primary.avg_trimp,
    avg_best_20min_power_w: primary.avg_best_20min_power_w ?? primary.best_20min_power_w,
    activity_count: primary.activity_count,
  } : null;

  const slowBaseline = slow ? {
    period: slow.period_label,
    avg_ef: slow.avg_efficiency_factor,
    ...(slow.ef_is_pace_based && { avg_ef_is_pace_based: true, avg_ef_unit: "s/km/bpm (pace÷HR, lower=better)" }),
    avg_z2_pct: slow.avg_z2_pct,
    avg_decoupling: slow.avg_aerobic_decoupling_pct,
    avg_vo2max: slow.avg_vo2max,
  } : null;

  // Strip metrics where both activity and ALL baselines are null — reduce AI noise
  filterNullNull(thisActivity, [primaryBaseline, slowBaseline]);

  return {
    slot: "historical_comparison",
    system: `Write structured bullet comparison. Format per metric: "- emoji **Label:** X unit vs. N-month avg Y unit → short explanation with context label emoji". After the → add 3-8 words of context (e.g. "higher = stronger effort ⬆️", "less Z2 = more intensity in this ride ", "<3% = excellent base fitness ", "rising = aerobic fitness improving "). Use ONLY these emojis for context labels: ⬆️ (higher/above avg), ⬇️ (lower/below avg),  (good/optimal),  (neutral/in range),  (concern/warning). Include units (bpm, W, rpm, %, etc). Use 3mo baseline for HR/power/NP/cadence/TSS/VI/drift/TRIMP/best20min. Use 6mo baseline for EF/Z2%/decoupling/VO2max. For EF: if ef_is_pace_based=true, label it "EF (pace/HR)". If avg_ef_is_pace_based=true in slow_baseline, both values use the same s/km/bpm unit — compare them normally (lower = better). If avg_ef is null or absent from slow_baseline, write "(no prior baseline)" instead of "vs. N/A" and note the value establishes a new baseline. Mark fallback values (tss_is_fallback, vi_is_fallback, decoupling_is_fallback) with †. Last bullet MUST be: "-  **Trend:** Improving/Stable/Declining — 2-3 sentences explaining direction based on available metrics vs baseline and any PRs". ONLY output bullet points for metric keys present in the JSON payload. If a metric key is absent from this_activity, do NOT mention it. ${TONE}`,
    user: JSON.stringify({
      this_activity: thisActivity,
      primary_baseline: primaryBaseline,
      slow_baseline: slowBaseline,
    }),
    maxTokens: 800,
  };
}

function readinessRequest(wellness: any, digest: ActivityDigest, c: any): AiRequest {
  const n2 = wellness.night_before;
  const d = wellness.day_of;
  return {
    slot: "readiness_verdict",
    system: `Write one bold sentence (no ** needed, caller adds it) summarising readiness going into the activity. Reference 1-2 specific metrics. ${TONE}`,
    user: JSON.stringify({
      sleep_score: n2?.sleep_score,
      hrv_ms: n2?.hrv_last_5_min,
      hrv_vs_baseline: n2?.hrv_vs_baseline,
      resting_hr: n2?.resting_hr,
      body_battery_at_start: d?.body_battery_at_start ?? n2?.body_battery_start,
      training_readiness: n2?.training_readiness_score,
      stress_high_pct: n2?.stress_high_pct,
      activity_avg_hr: digest.avgHR,
      activity_tss: digest.tss,
      prs: c.segments_summary?.prs ?? 0,
    }),
    maxTokens: 80,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Append a few-shot example to an AiRequest's user field if one exists for the slot.
 */
function withFewShot(req: AiRequest): AiRequest {
  const example = loadFewShot(req.slot);
  if (!example) return req;
  return {
    ...req,
    user: `${req.user}\n\n--- Example ---\nInput: ${example.input}\nOutput: ${example.output}`,
  };
}

/**
 * Build all interpretation requests for a given crunched activity.
 * Only requests for slots that have data are included.
 * Few-shot examples are appended when available.
 */
export function buildInterpretationRequests(
  crunched: any,
  historical: any | null,
  wellness: any | null,
  slotNames: string[],
): AiRequest[] {
  const c = crunched;
  const digest = buildDigest(c);
  const has = (slot: string) => slotNames.includes(slot);
  const requests: AiRequest[] = [];

  if (has("verdict"))                   requests.push(withFewShot(verdictRequest(c, digest)));
  if (has("pacing_interpretation"))     requests.push(withFewShot(pacingRequest(c, digest)));
  if (has("cardiac_drift_interpretation")) requests.push(withFewShot(cardiacDriftRequest(c)));
  if (has("power_interpretation"))      requests.push(withFewShot(powerInterpretationRequest(c)));
  if (has("ef_interpretation"))         requests.push(withFewShot(efRequest(c)));
  if (has("decoupling_interpretation")) requests.push(withFewShot(decouplingRequest(c)));
  if (has("power_skills_interpretation")) requests.push(withFewShot(powerSkillsRequest(c)));
  if (has("hr_zones_insight"))          requests.push(withFewShot(hrZonesRequest(c)));
  if (has("power_zones_insight"))       requests.push(withFewShot(powerZonesRequest(c)));
  if (has("cadence_zones_insight"))     requests.push(withFewShot(cadenceZonesRequest(c)));
  if (has("vam_interpretation"))        requests.push(withFewShot(vamRequest(c)));
  if (has("torque_interpretation"))     requests.push(withFewShot(torqueRequest(c)));
  if (has("tips"))                      requests.push(withFewShot(tipsRequest(c, digest, historical, wellness)));
  if (has("historical_comparison") && historical) requests.push(withFewShot(historicalRequest(c, digest, historical)));
  if (has("readiness_verdict") && wellness)       requests.push(withFewShot(readinessRequest(wellness, digest, c)));

  return requests;
}






