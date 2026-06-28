import type { ActivitySummary } from "./summary_utils.js";

export interface TrainingRecommendationInput {
  ctl: number;
  atl: number;
  tsb: number;
  readiness_score: number | null;
  readiness_label: string | null;
  hrv_trend: string | null;
  sleep_score: number | null;
  body_battery: number | null;
  readiness_avg_7?: number | null;
  readiness_avg_28?: number | null;
  sleep_avg_7?: number | null;
  sleep_avg_28?: number | null;
  body_battery_avg_7?: number | null;
  body_battery_avg_28?: number | null;
  garmin_days_7?: number | null;
  garmin_days_28?: number | null;
  hrv_delta_7?: number | null;
  quality_flags?: string[] | null;
  quality_penalty?: number | null;
  recent_activities: ActivitySummary[];
  goal_event_date?: string | null;
  goal_mode?: "build_fitness" | "maintain" | "fat_loss" | "race_prep" | null;
  recent_sports?: string[] | null;
}

export interface RecommendationBlock {
  state: "fresh" | "balanced" | "cautious" | "fatigued";
  session_type: "rest" | "recovery" | "endurance" | "tempo" | "quality";
  next_24h: string;
  next_72h: string;
  suggested_next_session_tss_range: [number, number] | null;
  suggested_weekly_tss_range: [number, number] | null;
  session_plan?: {
    type: "recovery_spin" | "aerobic_endurance" | "tempo_intervals" | "threshold_intervals" | "long_easy";
    duration_min_range: [number, number];
    intensity_hint: string;
    tss_target_range: [number, number] | null;
  };
  recovery_eta_hours?: number | null;
  rationale: string[];
  signals: string[];
  confidence: "low" | "medium" | "high";
  cause_codes?: string[];
  quality_flags?: string[];
  confidence_factors?: {
    coverage: number;
    agreement: number;
    stability: number;
  };
  changes?: {
    state_changed: boolean;
    drivers: Array<{ key: string; delta: number; unit?: string }>;
  };
  suggested_weekly_microcycle?: Array<{ day: number; intensity: string; note: string }>;
}

function buildSevenDayPlan(
  state: RecommendationBlock["state"],
  sessionType: RecommendationBlock["session_type"],
  ctlWeek: number,
  readiness: number | null,
  goalMode?: TrainingRecommendationInput["goal_mode"],
): Array<{ day: number; intensity: string; note: string }> {
  const plan: Array<{ day: number; intensity: string; note: string }> = [];
  const perfMode = goalMode === "build_fitness" || goalMode === "race_prep";

  if (state === "fatigued") {
    plan.push(
      { day: 1, intensity: "rest", note: "Full rest or very light" },
      { day: 2, intensity: "easy", note: "Easy aerobic if refreshed" },
      { day: 3, intensity: "rest", note: "Recovery day" },
      { day: 4, intensity: "easy", note: "Gentle spindle" },
      { day: 5, intensity: "rest", note: "Off" },
      { day: 6, intensity: "easy", note: "Very easy if energy returns" },
      { day: 7, intensity: "rest", note: "Final recovery day" }
    );
  } else if (state === "cautious") {
    if (perfMode) {
      plan.push(
        { day: 1, intensity: "easy", note: "Aerobic maintenance" },
        { day: 2, intensity: "rest", note: "Recovery focus" },
        { day: 3, intensity: "moderate", note: "Controlled tempo if readiness holds" },
        { day: 4, intensity: "easy", note: "Low strain endurance" },
        { day: 5, intensity: "moderate", note: "Short quality block, no all-out work" },
        { day: 6, intensity: "easy", note: "Easy spin after load" },
        { day: 7, intensity: "rest", note: "Prep for next week" }
      );
    } else {
      plan.push(
        { day: 1, intensity: "easy", note: "Aerobic maintenance" },
        { day: 2, intensity: "rest", note: "Recovery focus" },
        { day: 3, intensity: "easy", note: "Light workout if feeling good" },
        { day: 4, intensity: "rest", note: "Midweek break" },
        { day: 5, intensity: "moderate", note: "Tempo session if ready" },
        { day: 6, intensity: "easy", note: "Easy spin after hard work" },
        { day: 7, intensity: "rest", note: "Prep for next week" }
      );
    }
  } else if (state === "balanced") {
    if (perfMode) {
      plan.push(
        { day: 1, intensity: "moderate", note: "Steady aerobic with controlled pressure" },
        { day: 2, intensity: "hard", note: "Primary quality session" },
        { day: 3, intensity: "easy", note: "Recovery between efforts" },
        { day: 4, intensity: "moderate", note: "Tempo support work" },
        { day: 5, intensity: "easy", note: "Low-intensity absorption day" },
        { day: 6, intensity: "hard", note: "Secondary quality session" },
        { day: 7, intensity: "rest", note: "Complete recovery" }
      );
    } else {
      plan.push(
        { day: 1, intensity: "easy", note: "Aerobic base" },
        { day: 2, intensity: "moderate", note: "Steady or threshold work" },
        { day: 3, intensity: "easy", note: "Recovery between efforts" },
        { day: 4, intensity: "hard", note: "Quality session (intervals/VO2)" },
        { day: 5, intensity: "easy", note: "Easy spin to absorb load" },
        { day: 6, intensity: "moderate", note: "Tempo or long endurance" },
        { day: 7, intensity: "rest", note: "Complete recovery" }
      );
    }
  } else {
    if (perfMode) {
      plan.push(
        { day: 1, intensity: "hard", note: "Primary quality intervals" },
        { day: 2, intensity: "easy", note: "Recovery spin" },
        { day: 3, intensity: "hard", note: "Secondary quality session" },
        { day: 4, intensity: "easy", note: "Shakeout ride" },
        { day: 5, intensity: "hard", note: "Race-specific or threshold work" },
        { day: 6, intensity: "easy", note: "Aerobic reset" },
        { day: 7, intensity: "rest", note: "Full rest or very light" }
      );
    } else {
      plan.push(
        { day: 1, intensity: "hard", note: "Quality or intervals" },
        { day: 2, intensity: "easy", note: "Recovery spin" },
        { day: 3, intensity: "hard", note: "Another quality session" },
        { day: 4, intensity: "easy", note: "Shake out ride" },
        { day: 5, intensity: "moderate", note: "Sustained effort or tempo" },
        { day: 6, intensity: "easy", note: "Aerobic base or rest" },
        { day: 7, intensity: "rest", note: "Full rest or very light" }
      );
    }
  }

  return plan;
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function loadOf(a: ActivitySummary): number {
  return a.tss ?? a.trimp ?? 0;
}

function sumRecentLoads(acts: ActivitySummary[], days: number): number {
  if (acts.length === 0) return 0;
  const sorted = [...acts].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const cutoff = new Date(latest.date);
  cutoff.setDate(cutoff.getDate() - days + 1);
  return sorted
    .filter(a => new Date(a.date) >= cutoff)
    .reduce((s, a) => s + loadOf(a), 0);
}

function countHardDays(acts: ActivitySummary[], days: number): number {
  if (acts.length === 0) return 0;
  const sorted = [...acts].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const cutoff = new Date(latest.date);
  cutoff.setDate(cutoff.getDate() - days + 1);
  return sorted.filter(a => new Date(a.date) >= cutoff && loadOf(a) >= 100).length;
}

function buildSignals(input: TrainingRecommendationInput, read: number | null, hard7: number): string[] {
  const signals: string[] = [];
  const r7 = input.readiness_avg_7 ?? null;
  const r28 = input.readiness_avg_28 ?? null;
  const s7 = input.sleep_avg_7 ?? null;
  const s28 = input.sleep_avg_28 ?? null;
  const b7 = input.body_battery_avg_7 ?? null;
  const b28 = input.body_battery_avg_28 ?? null;

  if (input.tsb < -15) signals.push(`TSB ${input.tsb} indicates accumulated fatigue`);
  else if (input.tsb < -5) signals.push(`TSB ${input.tsb} is moderately negative`);
  else if (input.tsb > 10) signals.push(`TSB ${input.tsb} suggests freshness`);

  if (read != null) {
    let readinessText = `Readiness ${read}/100`;
    if (input.readiness_label) readinessText += ` (${input.readiness_label})`;
    signals.push(readinessText);
    if (read < 60) signals.push("Readiness is low");
    else if (read >= 75) signals.push("Readiness is high");
  }

  if (input.hrv_trend === "declining") signals.push("HRV trend is declining");
  if (typeof input.hrv_delta_7 === "number") signals.push(`HRV 7d delta ${Math.round(input.hrv_delta_7)} ms`);
  if (input.sleep_score != null && input.sleep_score < 60) signals.push(`Sleep score ${input.sleep_score} is low`);
  if (input.body_battery != null && input.body_battery < 40) signals.push(`Body Battery ${input.body_battery}/100 is low`);
  if (r7 != null) signals.push(`Readiness 7d avg ${Math.round(r7)}/100`);
  if (r7 != null && r28 != null && r7 <= r28 - 5) signals.push(`Readiness is down vs 28d baseline (${Math.round(r7)} vs ${Math.round(r28)})`);
  if (s7 != null) signals.push(`Sleep 7d avg ${Math.round(s7)}/100`);
  if (s7 != null && s28 != null && s7 <= s28 - 5) signals.push(`Sleep is down vs 28d baseline (${Math.round(s7)} vs ${Math.round(s28)})`);
  if (b7 != null && b7 < 45) signals.push(`Body Battery 7d avg ${Math.round(b7)}/100 is low`);
  if (b7 != null && b28 != null && b7 <= b28 - 8) signals.push(`Body Battery is down vs 28d baseline (${Math.round(b7)} vs ${Math.round(b28)})`);
  if (input.garmin_days_7 != null) signals.push(`Garmin coverage: ${input.garmin_days_7}/7 days`);
  if (hard7 >= 3) signals.push(`${hard7} hard days in the last 7 days`);

  return signals;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function buildCauseCodes(input: TrainingRecommendationInput, flags: {
  veryFatigued: boolean;
  cautious: boolean;
  fresh: boolean;
  hrvDrop: boolean;
  readinessDrop: boolean;
  sleepDrop: boolean;
  bbDrop: boolean;
  hard7: number;
  load7: number;
  load28: number;
}): string[] {
  const out: string[] = [];
  const loadRatio = flags.load28 > 0 ? flags.load7 / (flags.load28 / 4) : 1;

  if (input.tsb < -15 || flags.veryFatigued) out.push("LOAD_HIGH");
  if (flags.hard7 >= 3 || loadRatio >= 1.3) out.push("LOAD_SPIKE");
  if (flags.hrvDrop || input.hrv_trend === "declining") out.push("HRV_DROP");
  if ((input.sleep_score ?? 100) < 70 || flags.sleepDrop) out.push("SLEEP_LOW");
  if ((input.body_battery ?? 100) < 45 || flags.bbDrop) out.push("BB_LOW");
  if (flags.fresh && (input.readiness_score ?? 0) >= 75 && !flags.hrvDrop) out.push("RECOVERY_GOOD");
  if ((input.garmin_days_7 ?? 0) < 4) out.push("GARMIN_COVERAGE_LOW");

  return [...new Set(out)];
}

function computeConfidenceFactors(input: TrainingRecommendationInput, state: RecommendationBlock["state"], flags: {
  hrvDrop: boolean;
  readinessDrop: boolean;
  sleepDrop: boolean;
  bbDrop: boolean;
  hard7: number;
}): { coverage: number; agreement: number; stability: number } {
  const coverage = input.garmin_days_7 == null
    ? 60
    : clamp01(Math.round(((input.garmin_days_7 / 7) * 100)));

  const negatives = [
    input.tsb < -5,
    (input.readiness_score ?? 100) < 60,
    input.hrv_trend === "declining" || flags.hrvDrop,
    (input.sleep_score ?? 100) < 70 || flags.sleepDrop,
    (input.body_battery ?? 100) < 45 || flags.bbDrop,
    flags.hard7 >= 2,
  ].filter(Boolean).length;
  const positives = [
    input.tsb > 8,
    (input.readiness_score ?? 0) >= 75,
    input.hrv_trend !== "declining" && !flags.hrvDrop,
    (input.sleep_score ?? 0) >= 70,
    (input.body_battery ?? 0) >= 60,
  ].filter(Boolean).length;

  let agreement = 60;
  if (state === "fatigued" || state === "cautious") agreement = clamp01(Math.round((negatives / 6) * 100));
  else if (state === "fresh") agreement = clamp01(Math.round((positives / 5) * 100));
  else agreement = clamp01(Math.round((Math.max(positives, negatives) / 6) * 100));

  let stability = 85;
  if (typeof input.hrv_delta_7 === "number" && Math.abs(input.hrv_delta_7) >= 6) stability -= 20;
  if (flags.readinessDrop) stability -= 10;
  if (flags.sleepDrop) stability -= 10;
  if (flags.bbDrop) stability -= 10;
  if ((input.quality_flags?.length ?? 0) > 0) stability -= 8;
  stability = clamp01(stability);

  return { coverage, agreement, stability };
}

function confidenceFromFactors(f: { coverage: number; agreement: number; stability: number }): RecommendationBlock["confidence"] {
  const score = Math.round(f.coverage * 0.35 + f.agreement * 0.45 + f.stability * 0.2);
  if (score >= 74) return "high";
  if (score >= 52) return "medium";
  return "low";
}

function buildSessionPlan(
  rec: RecommendationBlock,
  input: TrainingRecommendationInput,
  hard7: number,
): RecommendationBlock["session_plan"] {
  if (rec.state === "fatigued") {
    return {
      type: "recovery_spin",
      duration_min_range: [30, 45],
      intensity_hint: "Z1 recovery only; keep HR low and stop early if heavy",
      tss_target_range: rec.suggested_next_session_tss_range,
    };
  }

  if (rec.state === "cautious") {
    return {
      type: "aerobic_endurance",
      duration_min_range: [45, 75],
      intensity_hint: "Mostly Z2 with smooth cadence; avoid hard surges",
      tss_target_range: rec.suggested_next_session_tss_range,
    };
  }

  if (rec.state === "fresh") {
    const thresholdLike = input.tsb > 14 || (input.readiness_score ?? 0) >= 82;
    return {
      type: thresholdLike ? "threshold_intervals" : "tempo_intervals",
      duration_min_range: thresholdLike ? [60, 90] : [55, 80],
      intensity_hint: thresholdLike
        ? "Main set near threshold with full recoveries"
        : "Steady tempo blocks with controlled breathing",
      tss_target_range: rec.suggested_next_session_tss_range,
    };
  }

  const longEasy = rec.session_type === "endurance" && hard7 <= 1;
  return {
    type: longEasy ? "long_easy" : rec.session_type === "tempo" ? "tempo_intervals" : "aerobic_endurance",
    duration_min_range: longEasy ? [90, 150] : rec.session_type === "tempo" ? [55, 85] : [60, 100],
    intensity_hint: longEasy ? "Long Z2 session, keep fueling steady" : "Controlled aerobic progression",
    tss_target_range: rec.suggested_next_session_tss_range,
  };
}

function applyQualityPenalty(base: RecommendationBlock["confidence"], penalty: number): RecommendationBlock["confidence"] {
  const score = base === "high" ? 2 : base === "medium" ? 1 : 0;
  if (penalty >= 20) return score >= 2 ? "medium" : "low";
  if (penalty >= 10) return score >= 1 ? "medium" : "low";
  return base;
}

function estimateRecoveryEta(input: TrainingRecommendationInput, state: RecommendationBlock["state"]): number | null {
  if (state === "fresh" || state === "balanced") return null;

  const readiness = input.readiness_score ?? 70;
  const targetReadiness = 70;
  const readinessDelta = Math.max(0, targetReadiness - readiness);

  const tsbDelta = Math.max(0, Math.abs(input.tsb) >= 15 ? (input.tsb < -15 ? 5 : 2) : input.tsb < -5 ? 2 : 0);

  const hrvTrend = input.hrv_trend === "declining" ? 1 : input.hrv_trend === "improving" ? -0.5 : 0;
  const sleepDeficit = Math.max(0, 75 - (input.sleep_score ?? 75));

  let eta = 6;
  eta += (readinessDelta / 20) * 8;
  eta += tsbDelta;
  eta += hrvTrend * 2;
  eta += (sleepDeficit / 20) * 4;

  const hasGarminData = (input.garmin_days_7 ?? 0) >= 4;
  if (!hasGarminData) eta += 4;

  eta = Math.max(2, Math.min(72, Math.round(eta * 2) / 2));
  return eta;
}

function fatiguedRecommendation(ctlWeek: number): RecommendationBlock {
  return {
    state: "fatigued",
    session_type: "rest",
    next_24h: "Full rest or 30–45 min recovery only",
    next_72h: "Return with easy aerobic work if freshness improves",
    suggested_next_session_tss_range: [0, 35],
    suggested_weekly_tss_range: [Math.round(ctlWeek * 0.8), Math.round(ctlWeek * 0.92)],
    rationale: ["Load and recovery signals suggest backing off"],
    signals: [],
    confidence: "high",
  };
}

function cautiousRecommendation(ctlWeek: number): RecommendationBlock {
  return {
    state: "cautious",
    session_type: "recovery",
    next_24h: "Easy aerobic / mobility / technique session",
    next_72h: "One easy day, then endurance if recovery holds",
    suggested_next_session_tss_range: [20, 50],
    suggested_weekly_tss_range: [Math.round(ctlWeek * 0.9), Math.round(ctlWeek)],
    rationale: ["Moderate fatigue suggests prioritizing recovery and aerobic maintenance"],
    signals: [],
    confidence: "high",
  };
}

function freshRecommendation(ctlWeek: number): RecommendationBlock {
  return {
    state: "fresh",
    session_type: "quality",
    next_24h: "Quality session: tempo, threshold, or race-specific intervals",
    next_72h: "Quality day followed by easy endurance and recovery",
    suggested_next_session_tss_range: [70, 120],
    suggested_weekly_tss_range: [Math.round(ctlWeek), Math.round(ctlWeek * 1.12)],
    rationale: ["Freshness and readiness are aligned for a harder session"],
    signals: [],
    confidence: "high",
  };
}

function balancedRecommendation(input: TrainingRecommendationInput, ctlWeek: number): RecommendationBlock {
  const isTempo = input.tsb > 5;
  return {
    state: "balanced",
    session_type: isTempo ? "tempo" : "endurance",
    next_24h: isTempo ? "Tempo or steady aerobic session" : "Endurance session with controlled intensity",
    next_72h: "Maintain load with one quality or steady session and one easy day",
    suggested_next_session_tss_range: isTempo ? [60, 100] : [45, 80],
    suggested_weekly_tss_range: [Math.round(ctlWeek * 0.95), Math.round(ctlWeek * 1.08)],
    rationale: ["Current balance supports a controlled build phase"],
    signals: [],
    confidence: "medium",
  };
}

function selectRecommendation(input: TrainingRecommendationInput, ctlWeek: number, veryFatigued: boolean, cautious: boolean, fresh: boolean): RecommendationBlock {
  if (veryFatigued) return fatiguedRecommendation(ctlWeek);
  if (cautious) return cautiousRecommendation(ctlWeek);
  if (fresh) return freshRecommendation(ctlWeek);
  return balancedRecommendation(input, ctlWeek);
}

function isPerformanceMode(mode: TrainingRecommendationInput["goal_mode"]): boolean {
  return mode === "build_fitness" || mode === "race_prep";
}

function applyGoalModeAdjustments(rec: RecommendationBlock, mode: string | null | undefined, ctlWeek: number): RecommendationBlock {
  if (!mode || mode === "maintain") return rec;

  if (mode === "build_fitness") {
    const buildText = rec.state === "cautious"
      ? {
          next_24h: "Easy-to-steady aerobic session; avoid high neuromuscular strain",
          next_72h: "Resume build with one controlled quality touch if recovery remains stable",
        }
      : {
          next_24h: "Progressive quality-focused session with disciplined pacing",
          next_72h: "Two build days across 72h with one recovery day between hard efforts",
        };
    return {
      ...rec,
      ...buildText,
      suggested_next_session_tss_range: rec.suggested_next_session_tss_range
        ? [Math.round(rec.suggested_next_session_tss_range[0] * 1.15), Math.round(rec.suggested_next_session_tss_range[1] * 1.15)]
        : null,
      suggested_weekly_tss_range: rec.suggested_weekly_tss_range
        ? [Math.round(rec.suggested_weekly_tss_range[0] * 1.15), Math.round(rec.suggested_weekly_tss_range[1] * 1.15)]
        : null,
      rationale: [...rec.rationale, "Goal mode: building fitness — slightly higher load targets"],
    };
  }

  if (mode === "fat_loss") {
    return {
      ...rec,
      suggested_next_session_tss_range: rec.suggested_next_session_tss_range
        ? [rec.suggested_next_session_tss_range[0], Math.round(rec.suggested_next_session_tss_range[1] * 0.9)]
        : null,
      suggested_weekly_tss_range: rec.suggested_weekly_tss_range
        ? [rec.suggested_weekly_tss_range[0], Math.round(rec.suggested_weekly_tss_range[1] * 0.9)]
        : null,
      rationale: [...rec.rationale, "Goal mode: fat loss — emphasis on consistency over peak load"],
    };
  }

  if (mode === "race_prep") {
    const isCloseToPeak = ctlWeek > 80;
    const raceText = rec.state === "fatigued"
      ? {
          next_24h: rec.next_24h,
          next_72h: rec.next_72h,
        }
      : isCloseToPeak
        ? {
            next_24h: "Race-pace sharpening with restrained volume",
            next_72h: "One race-specific session plus freshness-preserving easy work",
          }
        : {
            next_24h: "Race-specific quality session with full fueling",
            next_72h: "Two race-relevant sessions separated by an easy day",
          };
    return {
      ...rec,
      ...raceText,
      suggested_next_session_tss_range: isCloseToPeak
        ? rec.suggested_next_session_tss_range
        : rec.suggested_next_session_tss_range
          ? [Math.round(rec.suggested_next_session_tss_range[0] * 1.2), Math.round(rec.suggested_next_session_tss_range[1] * 1.2)]
          : null,
      suggested_weekly_tss_range: isCloseToPeak
        ? rec.suggested_weekly_tss_range
        : rec.suggested_weekly_tss_range
          ? [Math.round(rec.suggested_weekly_tss_range[0] * 1.2), Math.round(rec.suggested_weekly_tss_range[1] * 1.2)]
          : null,
      rationale: [...rec.rationale, isCloseToPeak ? "Goal mode: race prep — tapering phase" : "Goal mode: race prep — building intensity"],
    };
  }

  return rec;
}

function detectSportProfile(activities: ActivitySummary[]): { isRunner: boolean; isCyclist: boolean; isMixed: boolean } {
  if (activities.length === 0) return { isRunner: false, isCyclist: false, isMixed: false };
  const recent = activities.slice(-14);
  const runCount = recent.filter(a => a.sport_raw?.toLowerCase().includes("run")).length;
  const cycleCount = recent.filter(a => a.sport_raw?.toLowerCase().includes("ride") || a.sport_raw?.toLowerCase().includes("cycling")).length;
  return {
    isRunner: runCount > cycleCount && runCount >= 2,
    isCyclist: cycleCount > runCount && cycleCount >= 2,
    isMixed: runCount > 0 && cycleCount > 0,
  };
}

function applySportSpecificAdjustments(rec: RecommendationBlock, profile: { isRunner: boolean; isCyclist: boolean; isMixed: boolean }): RecommendationBlock {
  if (!profile.isRunner && !profile.isCyclist) return rec;

  if (profile.isRunner && !profile.isMixed) {
    return {
      ...rec,
      rationale: [...rec.rationale, "Sport profile: primarily running — higher recovery sensitivity"],
      confidence: rec.confidence === "low" ? "low" : rec.confidence,
    };
  }

  if (profile.isCyclist && !profile.isMixed) {
    return {
      ...rec,
      rationale: [...rec.rationale, "Sport profile: primarily cycling — standard thresholds"],
    };
  }

  return {
    ...rec,
    rationale: [...rec.rationale, "Sport profile: mixed activities — flexible recovery rules"],
  };
}

function applyGoalDate(rec: RecommendationBlock, state: RecommendationBlock["state"], ctlWeek: number, goalEventDate: string | null | undefined): RecommendationBlock {
  if (!goalEventDate) return rec;

  let weeklyRange = rec.suggested_weekly_tss_range;
  if (state === "fatigued") {
    weeklyRange = [Math.round(ctlWeek * 0.8), Math.round(ctlWeek * 0.92)];
  } else if (state === "fresh") {
    weeklyRange = [Math.round(ctlWeek), Math.round(ctlWeek * 1.12)];
  }

  return {
    ...rec,
    suggested_weekly_tss_range: weeklyRange,
    rationale: [...rec.rationale, `Goal event date set: ${goalEventDate}`],
  };
}

export function buildTrainingRecommendations(input: TrainingRecommendationInput): RecommendationBlock {
  const read = input.readiness_score === null || input.readiness_score === undefined ? null : clamp(input.readiness_score);
  const hard7 = countHardDays(input.recent_activities, 7);
  const load7 = sumRecentLoads(input.recent_activities, 7);
  const load28 = sumRecentLoads(input.recent_activities, 28);
  const ctlWeek = Math.max(input.ctl * 7, 1);

  const r7 = input.readiness_avg_7 ?? null;
  const r28 = input.readiness_avg_28 ?? null;
  const s7 = input.sleep_avg_7 ?? null;
  const s28 = input.sleep_avg_28 ?? null;
  const b7 = input.body_battery_avg_7 ?? null;
  const b28 = input.body_battery_avg_28 ?? null;
  const hrvDrop = typeof input.hrv_delta_7 === "number" && input.hrv_delta_7 <= -3;
  const readinessDrop = r7 != null && r28 != null && r7 <= r28 - 5;
  const sleepDrop = s7 != null && s28 != null && s7 <= s28 - 5;
  const bbDrop = b7 != null && b28 != null && b7 <= b28 - 8;
  const garminStrong = (input.garmin_days_7 ?? 0) >= 4;
  const perfMode = isPerformanceMode(input.goal_mode);
  const veryFatiguedTsb = perfMode ? -18 : -15;
  const veryFatiguedReadiness = perfMode ? 56 : 60;
  const cautiousTsb = perfMode ? -8 : -5;
  const cautiousHardDays = perfMode ? 3 : 2;
  const freshTsb = perfMode ? 6 : 8;
  const freshReadiness = perfMode ? 72 : 75;

  const veryFatigued = input.tsb < veryFatiguedTsb
    || read !== null && read < veryFatiguedReadiness
    || input.hrv_trend === "declining"
    || input.body_battery != null && input.body_battery < 40
    || garminStrong && (hrvDrop || readinessDrop)
    || garminStrong && b7 != null && b7 < 40;

  const cautious = !veryFatigued && (
    input.tsb < cautiousTsb
    || hard7 >= cautiousHardDays
    || input.sleep_score != null && input.sleep_score < 70
    || garminStrong && (sleepDrop || bbDrop)
  );

  const fresh = !veryFatigued && !cautious
    && input.tsb > freshTsb
    && read !== null && read >= freshReadiness
    && (!garminStrong || (r7 != null && r7 >= 75 && !hrvDrop));

  const signals = buildSignals(input, read, hard7);
  const base = selectRecommendation(input, ctlWeek, veryFatigued, cautious, fresh);
  const rationale = [...base.rationale];

  if (load28 > 0 && load7 > load28 / 4) {
    rationale.push("Recent 7-day load is elevated relative to 4-week baseline");
  }

  const flags = { veryFatigued, cautious, fresh, hrvDrop, readinessDrop, sleepDrop, bbDrop, hard7, load7, load28 };
  const causeCodes = buildCauseCodes(input, flags);
  const confidenceFactors = computeConfidenceFactors(input, base.state, { hrvDrop, readinessDrop, sleepDrop, bbDrop, hard7 });
  const confidenceBase = confidenceFromFactors(confidenceFactors);
  const confidence = applyQualityPenalty(confidenceBase, input.quality_penalty ?? 0);
  const recoveryEta = estimateRecoveryEta({ ...input }, base.state);

  const withGoalDate = applyGoalDate(
    {
      ...base,
      session_plan: buildSessionPlan(base, input, hard7),
      signals,
      rationale,
      cause_codes: causeCodes,
      quality_flags: input.quality_flags ?? undefined,
      confidence_factors: confidenceFactors,
      confidence,
      recovery_eta_hours: recoveryEta,
    },
    base.state,
    ctlWeek,
    input.goal_event_date,
  );
  const withGoalMode = applyGoalModeAdjustments(withGoalDate, input.goal_mode, ctlWeek);
  const sportProfile = detectSportProfile(input.recent_activities);
  const withSportThresholds = applySportSpecificAdjustments(withGoalMode, sportProfile);
  const sevenDayPlan = buildSevenDayPlan(base.state, base.session_type, ctlWeek, input.readiness_score ?? null, input.goal_mode);

  return {
    ...withSportThresholds,
    suggested_weekly_microcycle: sevenDayPlan,
  };
}

