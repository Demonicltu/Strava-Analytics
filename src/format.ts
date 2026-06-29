/**
 * Shared formatting module — build Strava description and private notes.
 * Used by both update_strava.ts and fast.ts.
 *
 * Description (public) = SHAREABLE SUMMARY (scores + key stats + verdict + highlights)
 * Private Notes (private) = DEEPER ANALYSIS (tips + readiness + recommendation + history)
 */
import type { WellnessContext } from "./wellness.js";
import type { PeriodBaseline } from "./summary_utils.js";

// ─── Personal Score (cardiac-drift-aware) ───

export function buildPersonalScore(crunchedRaw: any, historicalCtx: any): any {
  if (!historicalCtx?.baselines?.length) return null;

  const raw = typeof crunchedRaw === "string" ? JSON.parse(crunchedRaw) : crunchedRaw;
  const baseline = historicalCtx.baselines.find((b: any) => b.days >= 85 && b.days <= 95)
    ?? historicalCtx.baselines.at(-1);
  if (!baseline || baseline.activity_count < 3) return null;

  const movingSec: number = raw.summary_card?.moving_time_seconds ?? 0;
  const isLongRide = movingSec > 9000;

  const pairs: { label: string; pct: number; weight: number }[] = [];

  const yourNP: number | null = raw.power?.normalized_power ?? null;
  if (yourNP && baseline.avg_normalized_power_w)
    pairs.push({ label: "normalized_power", pct: Math.round(yourNP / baseline.avg_normalized_power_w * 100), weight: isLongRide ? 30 : 40 });

  const yourEF: number | null = raw.training_metrics?.efficiency_factor ?? null;
  if (yourEF && baseline.avg_efficiency_factor)
    pairs.push({ label: "efficiency_factor", pct: Math.round(yourEF / baseline.avg_efficiency_factor * 100), weight: isLongRide ? 10 : 35 });

  const yourTSS: number | null = raw.training_metrics?.tss ?? null;
  if (yourTSS && baseline.avg_tss)
    pairs.push({ label: "tss", pct: Math.round(yourTSS / baseline.avg_tss * 100), weight: isLongRide ? 60 : 25 });

  if (pairs.length === 0) return null;

  const totalW = pairs.reduce((s, p) => s + p.weight, 0);
  const composite = Math.round(pairs.reduce((s, p) => s + p.pct * (p.weight / totalW), 0));

  let interpretation: string;
  if (composite < 70)       interpretation = "Well below typical — intentional recovery or easy base day";
  else if (composite < 90)  interpretation = "Below average effort — controlled training day";
  else if (composite < 110) interpretation = "On par with your typical effort";
  else if (composite < 130) interpretation = "Above your average — harder than usual";
  else                       interpretation = "Significantly above average — one of your biggest sessions";

  const metricsOut: Record<string, string> = {};
  for (const p of pairs) {
    const avgLabel = p.label === "normalized_power" ? `${baseline.avg_normalized_power_w} W`
      : p.label === "efficiency_factor" ? `${baseline.avg_efficiency_factor}`
      : `${baseline.avg_tss}`;
    metricsOut[p.label] = `${p.pct}% of 90d avg (${avgLabel})${isLongRide && p.label === "efficiency_factor" ? " [downweighted — long ride drift]" : ""}`;
  }

  return {
    composite_pct: composite,
    interpretation,
    long_ride_weighting: isLongRide,
    metrics: metricsOut,
    baseline_period: baseline.period_label,
    activities_in_window: baseline.activity_count,
  };
}

/**
 * Extract a section's content from AI analysis markdown by header keyword.
 * Captures text from the first header containing `keyword` until the next
 * header of equal or higher level (fewer #s = higher level).
 */
export function extractSection(markdown: string, keyword: string): string | null {
  const lines = markdown.split("\n");
  let capturing = false;
  let captureLevel = 0; // number of # in the header that started capture
  const result: string[] = [];
  const keywordLower = keyword.toLowerCase();
  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s/);
    if (headerMatch && line.toLowerCase().includes(keywordLower) && !capturing) {
      capturing = true;
      captureLevel = headerMatch[1].length;
      continue;
    }
    if (capturing) {
      // Stop at any header of same or higher level (same or fewer #s)
      if (headerMatch && headerMatch[1].length <= captureLevel) break;
      result.push(line);
    }
  }
  const text = result.join("\n").trim();
  return text.length > 0 ? text : null;
}

/** Strip leading/trailing markdown horizontal rules (---, ***, ___) from AI section content to prevent double separators. */
function stripMarkdownHR(text: string): string {
  const hrRe = /^(\s*[-*_]{3,}\s*)$/;
  const ls = text.split("\n");
  let s = 0, e = ls.length - 1;
  while (s <= e && hrRe.test(ls[s])) s++;
  while (e >= s && hrRe.test(ls[e])) e--;
  return ls.slice(s, e + 1).join("\n").trim();
}

/** Render AI section content: strip HR rules then format tables. */
function renderAI(content: string): string {
  return formatTablesForPlainText(stripMarkdownHR(content.trim()));
}

// ─── Markdown table → Strava plain text ───

/**
 * Convert markdown pipe tables to a Strava-friendly format.
 * Strava uses a PROPORTIONAL font — space-padded columns won't align,
 * and tabs are stripped.
 *
 * Strategy:
 * - 2-column tables → "key: value" list
 * - 3+ column tables → each row as a single line: "col1 · col2 · col3"
 *   with a header line showing column names
 * Also strips **bold** markdown.
 */
function formatTablesForPlainText(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    // Detect start of a markdown table: line with pipes, followed by separator line
    if (
      lines[i].includes("|") &&
      i + 1 < lines.length &&
      /^\s*\|?\s*[-:]+[-|:\s]+\s*\|?\s*$/.test(lines[i + 1])
    ) {
      const headerLine = lines[i];
      const dataLines: string[] = [];
      let rowCount = 0;
      while (i < lines.length && lines[i].includes("|")) {
        if (/^\s*\|?\s*[-:]+[-|:\s]+\s*\|?\s*$/.test(lines[i])) { i++; continue; }
        const stripped = lines[i].replace(/^\s*\|/, "").replace(/\|\s*$/, "");
        if (rowCount > 0) dataLines.push(stripped);
        rowCount++;
        i++;
      }

      if (rowCount === 0) continue;

      const headers = headerLine.replace(/^\s*\|/, "").replace(/\|\s*$/, "")
        .split("|").map(h => h.trim().replace(/\*\*/g, ""));
      const colCount = headers.length;
      const rows = dataLines.map(line =>
        line.split("|").map(cell => cell.trim().replace(/\*\*/g, ""))
      );

      if (rows.length === 0) continue;

      if (colCount === 2) {
        for (const row of rows) {
          result.push(`  ${row[0]}: ${row[1] || ""}`);
        }
      } else {
        // 3+ columns: emit header row, a divider, then data rows
        result.push(`  ${headers.join(" │ ")}`);
        result.push(`  ${"─".repeat(headers.join(" │ ").length)}`);
        for (const row of rows) {
          result.push(`  ${row.join(" │ ")}`);
        }
      }
    } else {
      result.push(lines[i].replace(/\*\*/g, ""));
      i++;
    }
  }

  return result.join("\n");
}

// ─── Activity type helpers ───

type ActivityCategory = "ride" | "run" | "walk" | "surf" | "paddle" | "workout" | "other";
type StravaContentPolicy = "balanced" | "strict" | "mirror";
type AnalysisSectionSpec = { keyword: string; emoji: string; title?: string };

function categorize(type: string | undefined): ActivityCategory {
  if (!type) return "other";
  const t = type.toLowerCase();
  const compact = t.replace(/[^a-z0-9]/g, "");
  if (t.includes("ride") || t.includes("cycling")) return "ride";
  if (t.includes("run")) return "run";
  if (t.includes("walk") || t.includes("hike")) return "walk";
  if (["standuppaddling", "stand up paddling", "sup", "paddle", "paddling"].some(k => t.includes(k) || compact.includes(k.replace(/[^a-z0-9]/g, "")))) return "paddle";
  if (t.includes("surf")) return "surf";
  if (["workout", "weighttraining", "crossfit", "hiit", "yoga", "pilates", "rowing", "elliptical", "stairstepper"].includes(t)) return "workout";
  return "other";
}

function activityLabel(cat: ActivityCategory): { summary: string; emoji: string; speedLabel: string } {
  switch (cat) {
    case "walk":    return { summary: "WALK SUMMARY",    emoji: "🚶", speedLabel: "Avg Pace" };
    case "run":     return { summary: "RUN SUMMARY",     emoji: "🏃", speedLabel: "Avg Pace" };
    case "ride":    return { summary: "RIDE SUMMARY",    emoji: "🚴", speedLabel: "Avg Speed" };
    case "surf":    return { summary: "SURF SESSION",    emoji: "🏄", speedLabel: "Avg Speed" };
    case "paddle":  return { summary: "PADDLE SESSION",  emoji: "🛶", speedLabel: "Avg Speed" };
    case "workout": return { summary: "WORKOUT SUMMARY", emoji: "🏋️", speedLabel: "Duration" };
    default:        return { summary: "ACTIVITY SUMMARY", emoji: "🏅", speedLabel: "Avg Speed" };
  }
}

function getStravaContentPolicy(): StravaContentPolicy {
  const raw = (process.env["STRAVA_CONTENT_POLICY"] || "balanced").trim().toLowerCase();
  if (raw === "strict" || raw === "mirror") return raw;
  return "balanced";
}

function detailedAnalysisSections(cat: ActivityCategory): AnalysisSectionSpec[] {
  if (cat === "surf") {
    return [
      { keyword: "Wave", emoji: "🌊", title: "WAVE" },
      { keyword: "Pacing", emoji: "📈" },
      { keyword: "Heart Rate", emoji: "❤️" },
      { keyword: "Training Load", emoji: "🏋️" },
      { keyword: "Temperature", emoji: "🌡️" },
    ];
  }
  if (cat === "paddle") {
    return [
      { keyword: "Pacing", emoji: "📈" },
      { keyword: "Heart Rate", emoji: "❤️" },
      { keyword: "Stroke Rate", emoji: "🛶" },
      { keyword: "Paddle Metrics", emoji: "🧭" },
      { keyword: "Temperature", emoji: "🌡️" },
    ];
  }
  if (cat === "workout") {
    return [
      { keyword: "Training Load", emoji: "🏋️" },
      { keyword: "Heart Rate", emoji: "❤️" },
      { keyword: "Workout Analysis", emoji: "🏋️" },
      { keyword: "Effort Intervals", emoji: "⚡" },
      { keyword: "Cadence", emoji: "🔄" },
    ];
  }
  return [
    { keyword: "Training Load", emoji: "🏋️" },
    { keyword: "Heart Rate", emoji: "❤️" },
    { keyword: "Power Analysis", emoji: "⚡" },
    { keyword: "Power-to-Weight", emoji: "💪" },
    { keyword: "Torque", emoji: "🔧" },
    { keyword: "Cadence", emoji: "🔄" },
    { keyword: "Climbing", emoji: "⛰️" },
    { keyword: "Gradient", emoji: "📐", title: "GRADIENT & VAM" },
    { keyword: "Pacing", emoji: "📈" },
  ];
}

function publicAlwaysSections(): AnalysisSectionSpec[] {
  return [
    { keyword: "Segment", emoji: "🏅" },
  ];
}

/**
 * Extract all analysis sections into a map for reuse across policy pipelines.
 * Prevents redundant parsing of large markdown text.
 */
function buildAnalysisSectionMap(analysisText: string | null, cat: ActivityCategory): Map<string, string> {
  const map = new Map<string, string>();
  if (!analysisText) return map;

  // Extract all keywords used by any pipeline
  const allKeywords = [
    "Readiness",
    "Training Recommendation",
    "Historical Context",
    "Performance Verdict",
    "Training Zones",
    "Actionable Tips",
    ...detailedAnalysisSections(cat).map(s => s.keyword),
    ...publicAlwaysSections().map(s => s.keyword),
  ];

  for (const keyword of allKeywords) {
    const content = extractSection(analysisText, keyword);
    if (content) map.set(keyword, content);
  }
  return map;
}

// ─── Section Builders (return lines or null if data unavailable) ───

interface SectionContent {
  lines: string[];
  hasContent: boolean;
}

function buildScoreSection(crunched: any, personalScore?: any): SectionContent {
  const lines: string[] = [];
  const cat = categorize(crunched.summary_card?.type);

  // Workout Score
  if (cat === "workout" && crunched.workout_analysis?.wis) {
    const wa = crunched.workout_analysis;
    lines.push(`🏋️ WORKOUT SCORE: ${wa.wis.score}/100 (${wa.wis.label})`);
    if (crunched.relative_effort) lines.push(`  TRIMP: ${crunched.relative_effort.score} (${crunched.relative_effort.interpretation})`);
    if (crunched.heart_points) lines.push(`  Heart Points: ${crunched.heart_points.total_points} pts`);
  }
  // Runner Score
  else if (crunched.runner_score?.composite_pct != null) {
    const rs = crunched.runner_score;
    const rsTierLabel = rs.tier_position ? `${rs.category} — ${rs.tier_position}` : rs.category;
    lines.push(`🏅 YOUR RUNNER SCORE`);
    lines.push(`  🎯 Category:         ${rsTierLabel}`);
    if (rs.composite_pct != null)
      lines.push(`  📊 Tier progress:    ${rs.composite_pct}% toward next tier${rs.near_promotion ? " 🔝" : ""}`);
    if (crunched.kipchoge_score?.composite_pct)
      lines.push(`  🏆 Kipchoge Factor:  ${crunched.kipchoge_score.composite_pct}%   (world's best — for fun)`);
    if (rs.metrics && Object.keys(rs.metrics).length > 0) {
      lines.push(``);
      lines.push(`── ${rs.category} breakdown (pace ceiling: ${rs.metrics.pace?.split('/')[1]?.split('→')[0]?.trim() ?? ''}) ──`);
      for (const [, val] of Object.entries(rs.metrics)) lines.push(`  ${val}`);
    }
    if (rs.near_promotion && rs.next_category) {
      lines.push(``);
      lines.push(`  ↗️ Approaching ${rs.next_category} — one strong block away 🚀`);
    }
  }
  // Cycling Score
  else if (crunched.amateur_score?.composite_pct != null) {
    const as = crunched.amateur_score;
    const tierLabel = as.tier_position ? `${as.category} — ${as.tier_position}` : as.category;
    lines.push(`🏅 YOUR CYCLING SCORE`);
    lines.push(`  🎯 Category:         ${tierLabel}`);
    if (as.composite_pct != null)
      lines.push(`  📊 Tier progress:    ${as.composite_pct}% toward next tier${as.near_promotion ? " 🔝" : ""}`);
    if (personalScore?.composite_pct != null) {
      const arrow = personalScore.composite_pct >= 110 ? "⬆️" : personalScore.composite_pct >= 90 ? "➡️" : "⬇️";
      lines.push(`  👤 vs. Your Typical: ${personalScore.composite_pct}%  (vs. your 90d avg — ${arrow})`);
    }
    if (crunched.pogacar_score?.composite_pct != null)
      lines.push(`  🏆 Pogačar Factor:   ${crunched.pogacar_score.composite_pct}%   (world's best — for fun)`);
    if (as.metrics && Object.keys(as.metrics).length > 0) {
      lines.push(``);
      lines.push(`── ${as.category} breakdown ──`);
      for (const [, val] of Object.entries(as.metrics)) lines.push(`  ${val}`);
    }
    if (as.near_promotion && as.next_category)
      lines.push(`  ↗️ Approaching ${as.next_category} — one strong block away 🚀`);
    if (personalScore?.long_ride_weighting)
      lines.push(`  ℹ️ Personal score uses TSS-dominant weighting (>2.5h ride) — EF downweighted for cardiac drift.`);
  } else if (crunched.pogacar_score?.composite_pct) {
    const ps = crunched.pogacar_score;
    lines.push(`🏆 POGAČAR SCORE: ${ps.composite_pct}% (${ps.reference})`);
    for (const [key, val] of Object.entries(ps.metrics)) lines.push(`  ${key}: ${val}`);
  } else if (crunched.kipchoge_score?.composite_pct) {
    const ks = crunched.kipchoge_score;
    lines.push(`🏆 KIPCHOGE SCORE: ${ks.composite_pct}%`);
    for (const [key, val] of Object.entries(ks.metrics)) lines.push(`  ${key}: ${val}`);
  }

  return { lines, hasContent: lines.length > 0 };
}

function buildSummarySection(crunched: any): SectionContent {
  const lines: string[] = [];
  const cat = categorize(crunched.summary_card?.type);
  const label = activityLabel(cat);

  // Surf wave report
  if (cat === "surf" && crunched.surf_analysis) {
    const sa = crunched.surf_analysis;
    lines.push(`🏄 WAVE REPORT`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`  🌊 Waves caught:   ~${sa.wave_count}`);
    lines.push(`  🚀 Max wave speed: ${sa.max_wave_speed_kmh} km/h`);
    if (sa.avg_wave_speed_kmh) lines.push(`  ⚡ Avg wave speed: ${sa.avg_wave_speed_kmh} km/h`);
    if (sa.longest_wave_seconds) lines.push(`  ⏱️ Longest wave:   ${sa.longest_wave_seconds}s (${sa.longest_wave_speed_kmh} km/h)`);
    lines.push(`  🏄 Riding time:    ${sa.riding_time_formatted} (${sa.ride_pct}%)`);
    lines.push(`  🏊 Paddling time:  ${sa.paddling_time_formatted} (${sa.paddle_pct}%)`);
    lines.push(`  ⏳ Wait time:      ${sa.wait_time}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  // Core activity summary
  const sc = crunched.summary_card;
  if (sc) {
    lines.push(`📊 ${label.summary}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    if (sc.type) lines.push(`${label.emoji} Type:       ${sc.type}`);
    if (sc.date) lines.push(`📅 Date:       ${sc.date}`);
    if (sc.distance) lines.push(`📏 Distance:   ${sc.distance}`);
    if (sc.moving_time) lines.push(`⏱️ Time:       ${sc.moving_time} (moving) / ${sc.elapsed_time} (total)`);
    if (sc.avg_speed) lines.push(`⚡ ${label.speedLabel}:  ${sc.avg_speed}`);
    if (sc.max_speed) lines.push(`🔝 Max Speed:  ${sc.max_speed}`);
    if (sc.elevation) lines.push(`⛰️ Elevation:  ${sc.elevation}`);
    if (sc.temperature) lines.push(`🌡️ Temp:       ${sc.temperature}`);
    if (sc.avg_hr) lines.push(`❤️ Avg HR:     ${sc.avg_hr}`);
    if (cat === "ride" && sc.avg_power) lines.push(`🦵 Avg Power:  ${sc.avg_power}`);
    if (sc.cadence) lines.push(cat === "paddle" ? `🛶 Stroke Rate:${sc.cadence}` : `🔄 Cadence:    ${sc.cadence}`);
    if (sc.calories) lines.push(`🔥 Calories:   ${sc.calories}`);
    if (sc.gear) lines.push(`👟 Gear:       ${sc.gear}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  return { lines, hasContent: lines.length > 0 };
}

function buildAdvancedMetricsSection(crunched: any, historicalCtx?: any): SectionContent {
  const lines: string[] = [];
  const cat = categorize(crunched.summary_card?.type);
  const sc = crunched.summary_card;

  if (cat === "ride") {
    const tm = crunched.training_metrics;
    const ptw = crunched.power_to_weight;
    const re = crunched.relative_effort;
    if (tm || ptw || re) {
      lines.push(`⚙️ ADVANCED METRICS`);
      if (tm) {
        lines.push(`  IF: ${tm.intensity_factor} (${tm.intensity_factor_label}) | TSS: ${tm.tss}`);
        const movingSec = Number(sc?.moving_time_seconds ?? 0);
        if (tm.tss != null && movingSec > 0) {
          const tssPerHour = Math.round((tm.tss / (movingSec / 3600)) * 10) / 10;
          lines.push(`  TSS/h: ${tssPerHour}`);
        }
        const baseline3m = historicalCtx?.baselines?.find((b: any) => b.days >= 85 && b.days <= 95)
          ?? historicalCtx?.baselines?.at?.(-1) ?? null;
        const avgTss = baseline3m?.avg_tss ?? null;
        if (tm.tss != null && avgTss != null && avgTss > 0) {
          const pct = Math.round((tm.tss / avgTss - 1) * 100);
          const sign = pct > 0 ? "+" : "";
          const label = baseline3m?.period_label ?? "baseline";
          lines.push(`  TSS vs ${label}: ${tm.tss} vs ${Math.round(avgTss)} (${sign}${pct}%)`);
        }
        if (tm.ftp_warning) lines.push(`  ${tm.ftp_warning}`);
      }
      if (ptw) {
        lines.push(`  W/kg: ${ptw.avg_wkg} avg | NP: ${ptw.np_wkg || "-"} W/kg`);
        lines.push(`  Level: ${ptw.estimated_level}`);
      }
      if (re) lines.push(`  Relative Effort: ${re.score} (${re.interpretation})`);
      if (crunched.vo2max) lines.push(`  VO2max: ${crunched.vo2max.value} ml/kg/min (${crunched.vo2max.level})`);
    }
  } else if (cat === "workout") {
    const wa = crunched.workout_analysis;
    const re = crunched.relative_effort;
    if (wa || re) {
      lines.push(`⚙️ WORKOUT METRICS`);
      if (wa?.wis) lines.push(`  Intensity Score: ${wa.wis.score}/100 (${wa.wis.label})`);
      if (wa?.intervals_detected > 0) {
        lines.push(`  Intervals: ${wa.intervals_detected} detected`);
        if (wa.avg_work_duration) lines.push(`  Avg Work: ${wa.avg_work_duration} | Avg Rest: ${wa.avg_rest_duration || "—"}`);
        if (wa.work_rest_ratio) lines.push(`  Work:Rest ratio: ${wa.work_rest_ratio}:1`);
      }
      if (wa?.consistency_score) lines.push(`  Consistency: CV ${wa.consistency_score.cv_pct}% — ${wa.consistency_score.label}`);
      if (wa?.hr_progression) lines.push(`  HR Pattern: ${wa.hr_progression.pattern} (${wa.hr_progression.early_avg}→${wa.hr_progression.mid_avg}→${wa.hr_progression.late_avg} bpm)`);
      if (wa?.time_to_peak_hr) lines.push(`  Peak HR: at ${wa.time_to_peak_hr.at_formatted} (${wa.time_to_peak_hr.at_pct}%) — ${wa.time_to_peak_hr.label}`);
      if (wa?.recovery_ratio) lines.push(`  Recovery ratio: ${wa.recovery_ratio.recovery_pct}% below ${wa.recovery_ratio.threshold_bpm} bpm`);
      if (wa?.hr_recovery_rate?.drop_60s_bpm != null) lines.push(`  HR Recovery: -${wa.hr_recovery_rate.drop_60s_bpm} bpm/min (${wa.hr_recovery_rate.label})`);
      if (wa?.epoc_estimate) lines.push(`  EPOC (afterburn): ~${wa.epoc_estimate.kcal} kcal — ${wa.epoc_estimate.label}`);
      if (re) lines.push(`  Relative Effort: ${re.score} (${re.interpretation})`);
      if (crunched.vo2max) lines.push(`  VO2max: ${crunched.vo2max.value} ml/kg/min (${crunched.vo2max.level})`);
    }
  } else if (cat === "paddle") {
    const pa = crunched.paddle_analysis;
    const re = crunched.relative_effort;
    if (pa || re) {
      lines.push(`🛶 PADDLE METRICS`);
      if (pa?.avg_stroke_rate_spm != null) lines.push(`  Avg Stroke Rate: ${pa.avg_stroke_rate_spm} spm`);
      if (pa?.max_stroke_rate_spm != null) lines.push(`  Max Stroke Rate: ${pa.max_stroke_rate_spm} spm`);
      if (pa?.estimated_total_strokes != null) lines.push(`  Estimated Strokes: ${pa.estimated_total_strokes}`);
      if (pa?.distance_per_stroke_m != null) lines.push(`  Distance/Stroke: ${pa.distance_per_stroke_m} m`);
      if (pa?.pace_sec_per_km != null) {
        const sec = pa.pace_sec_per_km;
        const mm = Math.floor(sec / 60);
        const ss = Math.round(sec % 60).toString().padStart(2, "0");
        lines.push(`  Pace: ${mm}:${ss}/km`);
      }
      if (re) lines.push(`  Relative Effort: ${re.score} (${re.interpretation})`);
    }
  } else if (crunched.relative_effort) {
    lines.push(`⚙️ EFFORT`);
    lines.push(`  Relative Effort: ${crunched.relative_effort.score} (${crunched.relative_effort.interpretation})`);
  }

  return { lines, hasContent: lines.length > 0 };
}

function buildHeartPointsSection(crunched: any): SectionContent {
  const lines: string[] = [];
  if (crunched.heart_points) {
    const hp = crunched.heart_points;
    lines.push(`💚 HEART POINTS: ${hp.points} (${hp.pct_of_weekly_target} of weekly 150 target)`);
    if (hp.moderate_minutes != null && hp.vigorous_minutes != null) {
      lines.push(`  Moderate: ${hp.moderate_minutes} min | Vigorous: ${hp.vigorous_minutes} min`);
    }
  }
  return { lines, hasContent: lines.length > 0 };
}

function buildRouteDifficultySection(crunched: any): SectionContent {
  const lines: string[] = [];
  if (crunched.route_difficulty?.score != null) {
    const rd = crunched.route_difficulty;
    lines.push(`🧭 ROUTE DIFFICULTY: ${rd.score}/100 (${rd.label})`);
    if (rd.components?.ascent_density_m_per_km != null) {
      lines.push(`  Ascent density: ${rd.components.ascent_density_m_per_km} m/km`);
    }
  }
  return { lines, hasContent: lines.length > 0 };
}

function buildVerdictSection(analysisText: string | null, analysisSectionMap: Map<string, string>): SectionContent {
  const lines: string[] = [];
  const content = analysisSectionMap.get("Performance Verdict");
  if (content) {
    lines.push(`📈 PERFORMANCE VERDICT`);
    lines.push(renderAI(content));
  }
  return { lines, hasContent: lines.length > 0 };
}

function buildTrainingZonesSection(crunched: any, analysisText: string | null, analysisSectionMap: Map<string, string>): SectionContent {
  const lines: string[] = [];

  if (analysisText) {
    const content = analysisSectionMap.get("Training Zones");
    if (content) {
      const hrZoneHeader = crunched.training_zones?.hr_zones?.section_header
        ? `🎯 ${crunched.training_zones.hr_zones.section_header.toUpperCase()}`
        : `🎯 TRAINING ZONES`;
      lines.push(hrZoneHeader);
      lines.push(renderAI(content));
    }
  } else if (crunched.training_zones) {
    const tz = crunched.training_zones;
    if (tz.hr_zones?.zones?.length) {
      const hdr = tz.hr_zones.section_header
        ? `🎯 ${tz.hr_zones.section_header.toUpperCase()}`
        : `🎯 HR ZONES`;
      lines.push(hdr);
      for (const z of tz.hr_zones.zones) {
        lines.push(`  ${z.zone} (${z.range_bpm} bpm): ${z.time_formatted} — ${z.pct}%`);
      }
    }
    if (tz.power_zones?.zones?.length) {
      lines.push(``);
      lines.push(`⚡ POWER ZONES (FTP: ${tz.power_zones.ftp_used}W)`);
      for (const z of tz.power_zones.zones) {
        lines.push(`  ${z.zone} (${z.range_watts}): ${z.time_formatted} — ${z.pct}%`);
      }
    }
    if (tz.cadence_zones?.zones?.length) {
      lines.push(``);
      lines.push(`🔄 CADENCE ZONES`);
      for (const z of tz.cadence_zones.zones) {
        if (z.pct > 0) lines.push(`  ${z.zone}: ${z.time_formatted} — ${z.pct}%`);
      }
    }
  }

  return { lines, hasContent: lines.length > 0 };
}

function buildDetailedAnalysisSectionsFromMap(analysisText: string | null, analysisSectionMap: Map<string, string>, cat: ActivityCategory): SectionContent {
  const lines: string[] = [];
  if (!analysisText) return { lines, hasContent: false };

  for (const spec of detailedAnalysisSections(cat)) {
    const content = analysisSectionMap.get(spec.keyword);
    if (!content) continue;
    lines.push(``);
    lines.push(`${spec.emoji} ${(spec.title ?? spec.keyword).toUpperCase()}`);
    lines.push(renderAI(content));
  }

  return { lines, hasContent: lines.length > 0 };
}

function buildSegmentsSection(analysisText: string | null, analysisSectionMap: Map<string, string>, crunched: any): SectionContent {
  const lines: string[] = [];

  if (analysisText) {
    const content = analysisSectionMap.get("Segment");
    if (content) {
      lines.push(``);
      lines.push(`🏅 SEGMENT`);
      lines.push(renderAI(content));
    }
  } else if (!analysisText) {
    const segs = crunched.segments_summary?.highlight_table;
    if (segs?.length) {
      lines.push(``);
      lines.push(`🏅 TOP SEGMENTS`);
      for (const s of segs) {
        const pr = s.pr ? ` ${s.pr}` : ``;
        lines.push(`  ${s.name} — ${s.distance} in ${s.time} @ ${s.avg_hr} bpm${pr}`);
      }
    }
  }

  return { lines, hasContent: lines.length > 0 };
}

function buildWeatherWindSection(crunched: any): SectionContent {
  const lines: string[] = [];
  const meteo = crunched.meteorology;
  if (meteo) {
    lines.push(``);
    lines.push(`🌤️ WEATHER & WIND`);
    const ws = meteo.at_activity_start;
    if (ws) {
      if (ws.temperature_c != null) lines.push(`  🌡️ Temp: ${ws.temperature_c}°C${ws.apparent_temperature_c != null ? ` (feels like ${ws.apparent_temperature_c}°C)` : ``}`);
      if (ws.humidity_pct != null) lines.push(`  💧 Humidity: ${ws.humidity_pct}%`);
      if (ws.precipitation_mm != null) lines.push(`  🌧️ Precipitation: ${ws.precipitation_mm} mm`);
      if (ws.windspeed_kmh != null) {
        const gustStr = ws.wind_gusts_kmh != null ? ` (gusts ${ws.wind_gusts_kmh} km/h)` : ``;
        lines.push(`  💨 Wind: ${ws.windspeed_kmh} km/h from ${ws.wind_direction}${gustStr}`);
      }
      if (ws.weather_description) lines.push(`  ☁️ Conditions: ${ws.weather_description}`);
    }
    const wind = meteo.wind_analysis;
    if (wind) {
      lines.push(``);
      lines.push(`  Wind Impact:`);
      lines.push(`  ${wind.headwind_pct}% headwind · ${wind.tailwind_pct}% tailwind · ${wind.crosswind_pct}% crosswind`);
      const netStr = wind.headwind_exposure_kmh != null ? ` (net ${wind.headwind_exposure_kmh > 0 ? "+" : ""}${wind.headwind_exposure_kmh} km/h)` : "";
      lines.push(`  ${wind.headwind_label ?? ""}${netStr}`);
      if (wind.by_segment && wind.by_segment.length > 1) {
        const snapshots: any[] = crunched.meteorology?.snapshots ?? [];
        const offsetHours: number = crunched.summary_card?.local_utc_offset_hours ?? 0;
        for (const seg of wind.by_segment) {
          const snap = snapshots.find((s: any) => s.waypoint_pct === seg.waypoint_pct);
          let timeLabel = `~${seg.waypoint_pct}%`;
          if (snap?.utc_time) {
            const localHour = (new Date(snap.utc_time).getUTCHours() + offsetHours + 24) % 24;
            timeLabel = `${localHour}:00`;
          }
          const netStr2 = seg.net_kmh != null ? `, net ${seg.net_kmh > 0 ? "+" : ""}${seg.net_kmh} km/h` : "";
          lines.push(`    ${timeLabel}: ${seg.wind_speed_kmh} km/h ${seg.wind_direction_cardinal ?? ""} → ${seg.headwind_pct}% head / ${seg.tailwind_pct}% tail${netStr2}`);
        }
      }
    }
  }

  return { lines, hasContent: lines.length > 0 };
}

function buildPRsSection(crunched: any): SectionContent {
  const lines: string[] = [];
  if (crunched.segments_summary?.prs > 0) {
    lines.push(``);
    lines.push(`🏅 ${crunched.segments_summary.prs} personal record${crunched.segments_summary.prs > 1 ? "s" : ""}!`);
  }
  return { lines, hasContent: lines.length > 0 };
}

function buildNoAIFallbackSection(crunched: any): SectionContent {
  const lines: string[] = [];

  // Pacing fallback
  const pac = crunched.pacing;
  if (pac) {
    lines.push(``);
    lines.push(`📈 PACING`);
    lines.push(`  Type: ${pac.type}`);
    if (pac.first_half && pac.second_half) {
      lines.push(`  1st half: ${pac.first_half.avg_speed_kmh} km/h @ ${pac.first_half.avg_hr} bpm`);
      lines.push(`  2nd half: ${pac.second_half.avg_speed_kmh} km/h @ ${pac.second_half.avg_hr} bpm`);
    }
    if (pac.fastest_km) lines.push(`  Fastest km: #${pac.fastest_km.km} — ${pac.fastest_km.speed_kmh} km/h (${pac.fastest_km.moving_time})`);
    if (pac.slowest_km) lines.push(`  Slowest km: #${pac.slowest_km.km} — ${pac.slowest_km.speed_kmh} km/h (${pac.slowest_km.moving_time})`);
  }

  // Heart Rate peak efforts fallback
  const hrPeaks = crunched.heart_rate?.peak_efforts;
  if (hrPeaks) {
    lines.push(``);
    lines.push(`❤️ HEART RATE PEAKS`);
    for (const [dur, val] of Object.entries(hrPeaks)) {
      lines.push(`  ${dur}: ${val}`);
    }
    if (crunched.heart_rate?.cardiac_drift) {
      const cd = crunched.heart_rate.cardiac_drift;
      lines.push(`  Cardiac drift: ${cd.drift_bpm > 0 ? "+" : ""}${cd.drift_bpm} bpm (${cd.drift_pct}%)`);
    }
  }

  // Power best efforts fallback
  const pwrEfforts = crunched.power?.best_efforts;
  if (pwrEfforts) {
    lines.push(``);
    lines.push(`⚡ POWER BEST EFFORTS`);
    for (const [dur, val] of Object.entries(pwrEfforts)) {
      lines.push(`  ${dur}: ${val}`);
    }
  }

  // Power skills fallback
  const ps = crunched.power_skills;
  if (ps) {
    lines.push(``);
    lines.push(`💪 POWER SKILLS`);
    if (ps.sprint_5s_pct_ftp) lines.push(`  Sprint (5s): ${ps.sprint_5s_pct_ftp}`);
    if (ps.attack_1min_pct_ftp) lines.push(`  Attack (1min): ${ps.attack_1min_pct_ftp}`);
    if (ps.sustained_5min_pct_ftp) lines.push(`  Sustained (5min): ${ps.sustained_5min_pct_ftp}`);
    if (ps.sustained_20min_pct_ftp) lines.push(`  Sustained (20min): ${ps.sustained_20min_pct_ftp}`);
    if (ps.primary_strength) lines.push(`  Primary strength: ${ps.primary_strength}`);
  }

  // Aerobic decoupling fallback
  const ad = crunched.aerobic_decoupling;
  if (ad) {
    const grade = Math.abs(ad.decoupling_pct) < 3 ? "excellent" : Math.abs(ad.decoupling_pct) < 5 ? "good" : Math.abs(ad.decoupling_pct) < 10 ? "needs work" : "poor";
    lines.push(``);
    lines.push(`🫀 AEROBIC DECOUPLING`);
    lines.push(`  ${ad.decoupling_pct}% (${grade} — <3% ideal)`);
  }

  // VAM fallback
  const vam = crunched.vam_analysis;
  if (vam?.climbs?.length) {
    lines.push(``);
    lines.push(`🧗 VAM CLIMBS`);
    for (const c of vam.climbs) {
      lines.push(`  km ${c.start_km}: +${c.elevation_gain_m}m in ${c.duration_formatted} → ${c.vam} VAM`);
    }
  }

  // Gradient distribution fallback
  const grad = crunched.gradient_analysis?.distribution;
  if (grad?.length) {
    lines.push(``);
    lines.push(`📐 GRADIENT`);
    for (const g of grad) {
      if (g.pct > 0) lines.push(`  ${g.label}: ${g.pct}%`);
    }
  }

  return { lines, hasContent: lines.length > 0 };
}

function buildHistoricalContextFallback(historicalCtx?: any): SectionContent {
  const lines: string[] = [];
  if (historicalCtx?.baselines?.length) {
    lines.push(``);
    lines.push(`📈 HISTORICAL CONTEXT (${historicalCtx.sport})`);
    for (const b of historicalCtx.baselines as PeriodBaseline[]) {
      const parts: string[] = [`${b.period_label} (${b.activity_count} activities)`];
      if (b.total_distance_km != null) parts.push(`${b.total_distance_km} km total`);
      if (b.weekly_avg_distance_km != null) parts.push(`${b.weekly_avg_distance_km} km/wk avg`);
      if (b.avg_normalized_power_w != null) parts.push(`NP ${b.avg_normalized_power_w} W avg`);
      if (b.avg_tss != null) parts.push(`TSS ${b.avg_tss} avg`);
      if (b.avg_efficiency_factor != null) parts.push(`EF ${b.avg_efficiency_factor}`);
      lines.push(`  ${parts.join(" · ")}`);
    }
  }
  return { lines, hasContent: lines.length > 0 };
}

function buildReadinessFallback(wellnessCtx?: WellnessContext | null): SectionContent {
  const lines: string[] = [];
  if (wellnessCtx) {
    const n = wellnessCtx.night_before;
    const d = wellnessCtx.day_of;
    lines.push(``);
    lines.push(`🛌 READINESS (Garmin)`);
    if (n?.training_readiness_score != null) {
      const level = n.training_readiness_level ? ` (${n.training_readiness_level})` : ``;
      lines.push(`  🎯 Training Readiness: ${n.training_readiness_score}/100${level}`);
    }
    if (n?.sleep_score != null) {
      const dur = n.sleep_duration_h != null ? ` — ${n.sleep_duration_h}h` : ``;
      lines.push(`  💤 Sleep: ${n.sleep_score}/100${dur}`);
    }
    if (n?.hrv_last_5_min != null) {
      const vs = n.hrv_vs_baseline != null ? ` (${n.hrv_vs_baseline > 0 ? "+" : ""}${n.hrv_vs_baseline} vs 7d avg)` : ``;
      const status = n.hrv_status ? ` — ${n.hrv_status}` : ``;
      lines.push(`  📡 HRV: ${n.hrv_last_5_min} ms${vs}${status}`);
    }
    if (n?.resting_hr != null) lines.push(`  ❤️ Resting HR: ${n.resting_hr} bpm`);
    const bb = d?.body_battery_at_start ?? n?.body_battery_start ?? null;
    if (bb != null) lines.push(`  🔋 Body Battery at start: ${bb}/100`);
  }
  return { lines, hasContent: lines.length > 0 };
}

function buildFooterSection(): SectionContent {
  const lines: string[] = [];
  lines.push(``);
  lines.push(`📊 Analyzed with Strava Analytics`);
  return { lines, hasContent: true };
}

/**
 * Build description (public, visible to followers).
 * Policy-driven: balanced, strict, or mirror orderings.
 */
/**
 * Build description (public, visible to followers).
 * Policy-driven: Three distinct orderings optimized for different audiences.
 *
 * BALANCED MODE (default):
 *   Public: Score → Summary → Metrics → Verdict → Performance Sections → Weather → Segments
 *   Private: Readiness → Recommendations → History → Tips
 *   Use: Social engagement + private coaching
 *
 * STRICT MODE:
 *   Public: Full score + Summary + Metrics + Verdict + Weather + Segments (NO zones, NO HR/Cadence/Climbing/Gradient/Pacing)
 *   Private: Key Stats → Tips → Zones + Performance Sections → Readiness → Recommendation → History
 *   Use: Privacy-first + comprehensive training log
 *
  * MIRROR MODE:
  *   Public: Full narrative (Score → Summary → Metrics → HP/Route → Verdict → Zones → Sections → Weather → Segment)
  *   Private: [Duplicate public] + Backend metrics (Key Stats → Readiness → Recommendation → History)
 *   Use: Complete public record + private reference copy
 */
export function buildDescription(crunched: any, analysisText: string | null, historicalCtx?: any, wellnessCtx?: WellnessContext | null, personalScore?: any): string {
  const cat = categorize(crunched.summary_card?.type);
  const contentPolicy = getStravaContentPolicy();
  const analysisSectionMap = buildAnalysisSectionMap(analysisText, cat);

  // Build all sections
  const scoreSection = buildScoreSection(crunched, personalScore);
  const summarySection = buildSummarySection(crunched);
  const advancedMetricsSection = buildAdvancedMetricsSection(crunched, historicalCtx);
  const heartPointsSection = buildHeartPointsSection(crunched);
  const routeDifficultySection = buildRouteDifficultySection(crunched);
  const verdictSection = buildVerdictSection(analysisText, analysisSectionMap);
  const trainingZonesSection = buildTrainingZonesSection(crunched, analysisText, analysisSectionMap);
  const detailedAnalysisSection = buildDetailedAnalysisSectionsFromMap(analysisText, analysisSectionMap, cat);
  const noAIFallbackSection = buildNoAIFallbackSection(crunched);
  const segmentsSection = buildSegmentsSection(analysisText, analysisSectionMap, crunched);
  const weatherSection = buildWeatherWindSection(crunched);
  const prsSection = buildPRsSection(crunched);
  const historicalContextSection = buildHistoricalContextFallback(historicalCtx);
  const readinessSection = buildReadinessFallback(wellnessCtx);
  const footerSection = buildFooterSection();

  const lines: string[] = [];

  // ─── Policy-driven ordering ───
  if (contentPolicy === "balanced") {
    // Social engagement first: score → summary → metrics → verdict → performance sections → segments
    if (scoreSection.hasContent) lines.push(...scoreSection.lines, ``);
    if (summarySection.hasContent) lines.push(...summarySection.lines, ``);
    if (advancedMetricsSection.hasContent) lines.push(...advancedMetricsSection.lines, ``);
    if (heartPointsSection.hasContent) lines.push(...heartPointsSection.lines, ``);
    if (routeDifficultySection.hasContent) lines.push(...routeDifficultySection.lines, ``);
    if (verdictSection.hasContent) lines.push(...verdictSection.lines, ``);
    if (trainingZonesSection.hasContent) lines.push(...trainingZonesSection.lines, ``);
    // Performance analysis sections when AI is available
    if (analysisText && detailedAnalysisSection.hasContent) lines.push(...detailedAnalysisSection.lines, ``);
    // No-AI fallback sections
    if (!analysisText && noAIFallbackSection.hasContent) lines.push(...noAIFallbackSection.lines, ``);
    if (weatherSection.hasContent) lines.push(...weatherSection.lines, ``);
    if (segmentsSection.hasContent) lines.push(...segmentsSection.lines, ``);
    if (prsSection.hasContent) lines.push(...prsSection.lines, ``);
    // Fallbacks when no AI
    if (!analysisText && historicalContextSection.hasContent) lines.push(...historicalContextSection.lines, ``);
    if (!analysisText && readinessSection.hasContent) lines.push(...readinessSection.lines, ``);
  } else if (contentPolicy === "strict") {
    // Structured public: full score/summary/metrics/verdict/weather/segments — no zones or detailed performance sections
    if (scoreSection.hasContent) lines.push(...scoreSection.lines, ``);
    if (summarySection.hasContent) lines.push(...summarySection.lines, ``);
    if (advancedMetricsSection.hasContent) lines.push(...advancedMetricsSection.lines, ``);
    if (heartPointsSection.hasContent) lines.push(...heartPointsSection.lines, ``);
    if (routeDifficultySection.hasContent) lines.push(...routeDifficultySection.lines, ``);
    if (verdictSection.hasContent) lines.push(...verdictSection.lines, ``);
    if (weatherSection.hasContent) lines.push(...weatherSection.lines, ``);
    if (segmentsSection.hasContent) lines.push(...segmentsSection.lines, ``);
    if (prsSection.hasContent) lines.push(...prsSection.lines, ``);
    // No-AI fallback
    if (!analysisText && noAIFallbackSection.hasContent) lines.push(...noAIFallbackSection.lines, ``);
    if (!analysisText && historicalContextSection.hasContent) lines.push(...historicalContextSection.lines, ``);
    if (!analysisText && readinessSection.hasContent) lines.push(...readinessSection.lines, ``);
  } else if (contentPolicy === "mirror") {
    // Full public narrative with zones before detailed analysis; segment closes the narrative.
    if (scoreSection.hasContent) lines.push(...scoreSection.lines, ``);
    if (summarySection.hasContent) lines.push(...summarySection.lines, ``);
    if (advancedMetricsSection.hasContent) lines.push(...advancedMetricsSection.lines, ``);
    if (heartPointsSection.hasContent) lines.push(...heartPointsSection.lines, ``);
    if (routeDifficultySection.hasContent) lines.push(...routeDifficultySection.lines, ``);
    if (verdictSection.hasContent) lines.push(...verdictSection.lines, ``);
    if (trainingZonesSection.hasContent) lines.push(...trainingZonesSection.lines, ``);
    if (analysisText && detailedAnalysisSection.hasContent) lines.push(...detailedAnalysisSection.lines, ``);
    // No-AI fallback sections
    if (!analysisText && noAIFallbackSection.hasContent) lines.push(...noAIFallbackSection.lines, ``);
    if (weatherSection.hasContent) lines.push(...weatherSection.lines, ``);
    if (prsSection.hasContent) lines.push(...prsSection.lines, ``);
    if (segmentsSection.hasContent) lines.push(...segmentsSection.lines, ``);
    // Fallbacks when no AI
    if (!analysisText && historicalContextSection.hasContent) lines.push(...historicalContextSection.lines, ``);
    if (!analysisText && readinessSection.hasContent) lines.push(...readinessSection.lines, ``);
  }

  // Footer always at end
  lines.push(...footerSection.lines);

  return lines.join("\n").trimEnd();
}

/**
 * Build private notes (only visible to you).
 * Policy-driven: Complements public description with different focus per policy.
 *
 * BALANCED MODE (default):
 *   Private: Key Stats → Tips → Readiness → Recommendation → History
 *   Purpose: Personal coaching, recovery insights, actionable next steps
 *
 * STRICT MODE:
 *   Private: Key Stats → Tips → Zones + Performance Sections → Readiness → Recommendation → History
 *   Purpose: Deep training log; all performance data here; public gets the narrative only
 *
  * MIRROR MODE:
  *   Private: [Copy of public] + Backend Summary (Key Stats → Readiness → Recommendation → History)
 *   Purpose: Full retention (public + backend for reference)
 */
export function buildPrivateNotes(crunched: any, analysisText: string | null, wellnessCtx?: WellnessContext | null): string {
  const lines: string[] = [];
  const cat = categorize(crunched.summary_card?.type);
  const contentPolicy = getStravaContentPolicy();
  const analysisSectionMap = buildAnalysisSectionMap(analysisText, cat);

  if (contentPolicy === "balanced") {
    // ─── Balanced: Private notes prioritize key stats, then coaching context ───
    lines.push(`📋 KEY STATS`);
    buildKeyStatsLines(lines, crunched);

    if (analysisText) {
      lines.push(``);
      const tips = analysisSectionMap.get("Actionable Tips");
      if (tips) {
        const tipLines = tips.split("\n").filter(line => {
          const lower = line.toLowerCase();
          return !(lower.includes("segment") || lower.includes("personal record") || lower.includes("pr day") || lower.includes("top spot") || lower.includes("claim"));
        });
        const filtered = tipLines.join("\n").trim();
        if (filtered.length > 0) {
          lines.push(`💡 TIPS`);
          lines.push(renderAI(filtered));
          lines.push(``);
        }
      }

      const readiness = analysisSectionMap.get("Readiness");
      if (readiness) {
        lines.push(`🛌 READINESS`);
        lines.push(renderAI(readiness));
        lines.push(``);
      }

      const recommendation = analysisSectionMap.get("Training Recommendation");
      if (recommendation) {
        lines.push(`🧭 TRAINING RECOMMENDATION`);
        lines.push(renderAI(recommendation));
        lines.push(``);
      }

      const hist = analysisSectionMap.get("Historical Context");
      if (hist) {
        lines.push(`📈 HISTORICAL CONTEXT`);
        lines.push(renderAI(hist));
        lines.push(``);
      }
    }

    if (!analysisText) {
      lines.push(``);
      if (crunched.cadence?.is_low) {
        const unit = crunched.cadence.unit || "rpm";
        const tip = unit === "spm" ? "try aiming for 170-180 spm" : "try 80-85 on flats";
        lines.push(`💡 Cadence low (${crunched.cadence.stats.avg} ${unit}) — ${tip}`);
      }
      if (crunched.heart_rate?.cardiac_drift?.drift_bpm > 5) lines.push(`💡 HR drift +${crunched.heart_rate.cardiac_drift.drift_bpm}bpm — start easier`);
      if (wellnessCtx) {
        lines.push(``);
        lines.push(`🛌 READINESS`);
        lines.push(wellnessCtx.readiness_note);
      }
    }
  } else if (contentPolicy === "strict") {
    // ─── Strict: Private = compact stats → tips → zones → performance blocks → readiness → recommendation → history ───

    // Key stats block — no leading separator, starts immediately
    lines.push(`📋 KEY STATS`);
    buildKeyStatsLines(lines, crunched);
    lines.push(``);

    if (analysisText) {
      // Tips first — actionable coaching right up top
      const tips = analysisSectionMap.get("Actionable Tips");
      if (tips) {
        const tipLines = tips.split("\n").filter(line => {
          const lower = line.toLowerCase();
          return !(lower.includes("segment") || lower.includes("personal record") || lower.includes("pr day") || lower.includes("top spot") || lower.includes("claim"));
        });
        const filtered = tipLines.join("\n").trim();
        if (filtered.length > 0) {
          lines.push(`---`);
          lines.push(``);
          lines.push(`💡 TIPS`);
          lines.push(renderAI(filtered));
          lines.push(``);
        }
      }

      // Zones + all detailed performance sections (HR, Cadence, Climbing, Gradient+VAM, Pacing)
      lines.push(`---`);
      lines.push(``);
      const zonesContent = analysisSectionMap.get("Training Zones");
      if (zonesContent) {
        const hrZoneHeader = crunched.training_zones?.hr_zones?.section_header
          ? `🎯 ${crunched.training_zones.hr_zones.section_header.toUpperCase()}`
          : `🎯 TRAINING ZONES`;
        lines.push(hrZoneHeader);
        lines.push(renderAI(zonesContent));
        lines.push(``);
      }
      const detailedAnalysisSection = buildDetailedAnalysisSectionsFromMap(analysisText, analysisSectionMap, cat);
      if (detailedAnalysisSection.hasContent) {
        lines.push(...detailedAnalysisSection.lines, ``);
      }

      // Readiness
      const readiness = analysisSectionMap.get("Readiness");
      if (readiness) {
        lines.push(`🛌 READINESS`);
        lines.push(renderAI(readiness));
        lines.push(``);
      }

      // Training Recommendation
      const recommendation = analysisSectionMap.get("Training Recommendation");
      if (recommendation) {
        lines.push(`🧭 TRAINING RECOMMENDATION`);
        lines.push(renderAI(recommendation));
        lines.push(``);
      }

      // Historical context last
      const hist = analysisSectionMap.get("Historical Context");
      if (hist) {
        lines.push(`---`);
        lines.push(``);
        lines.push(`📈 HISTORICAL CONTEXT`);
        lines.push(renderAI(hist));
        lines.push(``);
      }
    } else {
      // No-AI fallback
      if (crunched.cadence?.is_low) {
        const unit = crunched.cadence.unit || "rpm";
        const tip = unit === "spm" ? "try aiming for 170-180 spm" : "try 80-85 on flats";
        lines.push(`---`);
        lines.push(``);
        lines.push(`💡 ${crunched.cadence.stats.avg} ${unit} cadence — ${tip}`);
        lines.push(``);
      }
      if (wellnessCtx) {
        lines.push(`---`);
        lines.push(``);
        lines.push(`🛌 READINESS`);
        lines.push(wellnessCtx.readiness_note);
      }
    }
  } else if (contentPolicy === "mirror") {
    // ─── Mirror: Duplicate public description + private backend metrics ───
    const publicDesc = buildDescription(crunched, analysisText, undefined, wellnessCtx);
    lines.push(publicDesc);
    lines.push(``);
    lines.push(`────────────────────────────────────────`);
    lines.push(`📋 BACKEND SUMMARY`);
    lines.push(``);

    // Key stats
    buildKeyStatsLines(lines, crunched);
    lines.push(``);

    if (analysisText) {
      // Backend-only context that is not already repeated in the mirrored public copy.
      const readiness = analysisSectionMap.get("Readiness");
      if (readiness) {
        lines.push(`🛌 READINESS DETAILS`);
        lines.push(renderAI(readiness));
        lines.push(``);
      }

      const recommendation = analysisSectionMap.get("Training Recommendation");
      if (recommendation) {
        lines.push(`🧭 TRAINING RECOMMENDATION`);
        lines.push(renderAI(recommendation));
        lines.push(``);
      }


      // Historical context
      const hist = analysisSectionMap.get("Historical Context");
      if (hist) {
        lines.push(`📈 HISTORICAL CONTEXT`);
        lines.push(renderAI(hist));
        lines.push(``);
      }
    }
  }

  return lines.join("\n").trimEnd();
}

function buildKeyStatsLines(lines: string[], crunched: any): void {
  if (crunched.surf_analysis) {
    const sa = crunched.surf_analysis;
    lines.push(`🌊 Waves: ~${sa.wave_count} | Max: ${sa.max_wave_speed_kmh} km/h`);
    lines.push(`🏄 Ride: ${sa.ride_pct}% | Paddle: ${sa.paddle_pct}%`);
  }

  if (crunched.heart_points) {
    lines.push(`💚 Heart Points: ${crunched.heart_points.points} / 150 weekly`);
  }

  if (crunched.training_metrics) {
    const tm = crunched.training_metrics;
    lines.push(`IF: ${tm.intensity_factor} (${tm.intensity_factor_label})`);
    lines.push(`TSS: ${tm.tss} (${tm.tss_label})`);
    if (tm.ftp_warning) lines.push(tm.ftp_warning);
  }

  if (crunched.power?.has_power_meter) {
    lines.push(`NP: ${crunched.power.normalized_power}W | VI: ${crunched.power.variability_index}`);
  }

  if (crunched.power_to_weight) {
    lines.push(`W/kg: ${crunched.power_to_weight.avg_wkg} avg | Level: ${crunched.power_to_weight.estimated_level}`);
  }

  if (crunched.relative_effort) {
    lines.push(`Effort: ${crunched.relative_effort.score} (${crunched.relative_effort.interpretation})`);
  }

  if (crunched.vo2max) {
    lines.push(`VO2max: ~${crunched.vo2max.value} ml/kg/min (${crunched.vo2max.level}, via ${crunched.vo2max.method})`);
  }

  if (crunched.aerobic_decoupling) {
    const ad = crunched.aerobic_decoupling;
    const pct = ad.decoupling_pct;
    const grade = Math.abs(pct) < 3 ? "excellent" : Math.abs(pct) < 5 ? "good" : Math.abs(pct) < 10 ? "needs work" : "poor";
    lines.push(`Aero decoupling: ${pct}% (${grade} — <3% ideal)`);
  }

  if (crunched.heart_rate?.cardiac_drift) {
    const cd = crunched.heart_rate.cardiac_drift;
    lines.push(`Drift: ${cd.drift_bpm > 0 ? "+" : ""}${cd.drift_bpm}bpm (${cd.drift_pct}%)`);
  }

  if (crunched.pacing) {
    lines.push(`Pacing: ${crunched.pacing.type}`);
  }

  const wind = crunched.meteorology?.wind_analysis;
  if (wind) {
    const netStr = wind.headwind_exposure_kmh != null ? ` | net ${wind.headwind_exposure_kmh > 0 ? "+" : ""}${wind.headwind_exposure_kmh} km/h` : "";
    lines.push(`Wind: ${wind.headwind_pct}% head · ${wind.tailwind_pct}% tail · ${wind.crosswind_pct}% cross${netStr} (${wind.headwind_label ?? ""})`);
  }
}
