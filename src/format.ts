/**
 * Shared formatting module — build Strava description and private notes.
 * Used by both update_strava.ts and fast.ts.
 *
 * Description (public) = EVERYTHING (Pogačar Score + Summary + Verdict + Full Analysis)
 * Private Notes (private, mobile-friendly) = SHORT (Tips + Key Stats)
 */

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
  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s/);
    if (headerMatch && line.includes(keyword) && !capturing) {
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
        // 3+ columns: compact lines with │ separator (visually clear in proportional font)
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

type ActivityCategory = "ride" | "run" | "walk" | "surf" | "workout" | "other";

function categorize(type: string | undefined): ActivityCategory {
  if (!type) return "other";
  const t = type.toLowerCase();
  if (t.includes("ride") || t.includes("cycling")) return "ride";
  if (t.includes("run")) return "run";
  if (t.includes("walk") || t.includes("hike")) return "walk";
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
    case "workout": return { summary: "WORKOUT SUMMARY", emoji: "🏋️", speedLabel: "Duration" };
    default:        return { summary: "ACTIVITY SUMMARY", emoji: "🏅", speedLabel: "Avg Speed" };
  }
}

/**
 * Build description (public, visible to followers).
 * Adapts labels to activity type (ride/run/walk).
 */
export function buildDescription(crunched: any, analysisText: string | null): string {
  const lines: string[] = [];
  const cat = categorize(crunched.summary_card?.type);
  const label = activityLabel(cat);

  // ─── Workout Score ───
  if (cat === "workout" && crunched.workout_analysis) {
    const wa = crunched.workout_analysis;
    if (wa.wis) {
      lines.push(`🏋️ WORKOUT SCORE: ${wa.wis.score}/100 (${wa.wis.label})`);
      if (crunched.relative_effort) lines.push(`  TRIMP: ${crunched.relative_effort.score} (${crunched.relative_effort.interpretation})`);
      if (crunched.heart_points) lines.push(`  Heart Points: ${crunched.heart_points.total_points} pts`);
      lines.push(``);
    }
  }

  // ─── Pogačar / Kipchoge Score ───
  if (crunched.pogacar_score?.composite_pct) {
    const ps = crunched.pogacar_score;
    lines.push(`🏆 POGAČAR SCORE: ${ps.composite_pct}% (${ps.reference})`);
    for (const [key, val] of Object.entries(ps.metrics)) {
      lines.push(`  ${key}: ${val}`);
    }
    lines.push(``);
  }
  if (crunched.kipchoge_score?.composite_pct) {
    const ks = crunched.kipchoge_score;
    lines.push(`🏆 KIPCHOGE SCORE: ${ks.composite_pct}%`);
    for (const [key, val] of Object.entries(ks.metrics)) {
      lines.push(`  ${key}: ${val}`);
    }
    lines.push(``);
  }

  // ─── Surf Analysis ───
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
    lines.push(``);
  }

  // ─── Summary Card (adapted to activity type) ───
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
    // Power/cadence for rides; cadence for runs (spm)
    if (cat === "ride" && sc.avg_power) lines.push(`🦵 Avg Power:  ${sc.avg_power}`);
    if (sc.cadence) lines.push(`🔄 Cadence:    ${sc.cadence}`);
    if (sc.calories) lines.push(`🔥 Calories:   ${sc.calories}`);
    if (sc.gear) lines.push(`👟 Gear:       ${sc.gear}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  }

  // ─── Advanced Metrics (only for rides — skip for walks/hikes) ───
  if (cat === "ride") {
    const tm = crunched.training_metrics;
    const ptw = crunched.power_to_weight;
    const re = crunched.relative_effort;
    if (tm || ptw || re) {
      lines.push(``);
      lines.push(`⚙️ ADVANCED METRICS`);
      if (tm) {
        lines.push(`  IF: ${tm.intensity_factor} (${tm.intensity_factor_label}) | TSS: ${tm.tss}`);
        if (tm.ftp_warning) lines.push(`  ${tm.ftp_warning}`);
      }
      if (ptw) {
        lines.push(`  W/kg: ${ptw.avg_wkg} avg | NP: ${ptw.np_wkg || "-"} W/kg`);
        lines.push(`  Level: ${ptw.estimated_level}`);
      }
      if (re) {
        lines.push(`  Relative Effort: ${re.score} (${re.interpretation})`);
      }
      if (crunched.vo2max) {
        lines.push(`  VO2max: ${crunched.vo2max.value} ml/kg/min (${crunched.vo2max.level})`);
      }
    }
  } else if (cat === "workout") {
    const wa = crunched.workout_analysis;
    const re = crunched.relative_effort;
    if (wa || re) {
      lines.push(``);
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
  } else if (crunched.relative_effort) {
    // For runs/walks/surf, just show relative effort if available
    lines.push(``);
    lines.push(`⚙️ EFFORT`);
    lines.push(`  Relative Effort: ${crunched.relative_effort.score} (${crunched.relative_effort.interpretation})`);
  }

  // ─── Heart Points (all activity types) ───
  if (crunched.heart_points) {
    const hp = crunched.heart_points;
    lines.push(``);
    lines.push(`💚 HEART POINTS: ${hp.points} (${hp.pct_of_weekly_target} of weekly 150 target)`);
    if (hp.moderate_minutes != null && hp.vigorous_minutes != null) {
      lines.push(`  Moderate: ${hp.moderate_minutes} min | Vigorous: ${hp.vigorous_minutes} min`);
    }
  }

  // ─── Performance Verdict (from AI analysis) ───
  if (analysisText) {
    const verdict = extractSection(analysisText, "Performance Verdict");
    if (verdict) {
      lines.push(``);
      lines.push(`📈 PERFORMANCE VERDICT`);
      lines.push(formatTablesForPlainText(verdict.trim()));
    }
  }

  // ─── Training Zones (from AI if available, else from crunched) ───
  if (analysisText) {
    const zones = extractSection(analysisText, "Training Zones");
    if (zones) {
      const hrZoneHeader = crunched.training_zones?.hr_zones?.section_header
        ? `🎯 ${crunched.training_zones.hr_zones.section_header.toUpperCase()}`
        : `🎯 TRAINING ZONES`;
      lines.push(``);
      lines.push(hrZoneHeader);
      lines.push(formatTablesForPlainText(zones.trim()));
    }
  } else if (crunched.training_zones) {
    const tz = crunched.training_zones;
    lines.push(``);
    lines.push(`⚠️ AI analysis unavailable — raw metrics below`);

    // HR zones
    if (tz.hr_zones?.zones?.length) {
      const hdr = tz.hr_zones.section_header
        ? `🎯 ${tz.hr_zones.section_header.toUpperCase()}`
        : `🎯 HR ZONES`;
      lines.push(``);
      lines.push(hdr);
      for (const z of tz.hr_zones.zones) {
        lines.push(`  ${z.zone} (${z.range_bpm} bpm): ${z.time_formatted} — ${z.pct}%`);
      }
    }

    // Power zones
    if (tz.power_zones?.zones?.length) {
      lines.push(``);
      lines.push(`⚡ POWER ZONES (FTP: ${tz.power_zones.ftp_used}W)`);
      for (const z of tz.power_zones.zones) {
        lines.push(`  ${z.zone} (${z.range_watts}): ${z.time_formatted} — ${z.pct}%`);
      }
    }

    // Cadence zones
    if (tz.cadence_zones?.zones?.length) {
      lines.push(``);
      lines.push(`🔄 CADENCE ZONES`);
      for (const z of tz.cadence_zones.zones) {
        if (z.pct > 0) lines.push(`  ${z.zone}: ${z.time_formatted} — ${z.pct}%`);
      }
    }
  }

  // ─── No-AI fallback: Pacing, Peak Efforts, Power Skills, VAM, Gradient, Segments ───
  if (!analysisText) {
    // Pacing
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

    // Heart Rate peak efforts
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

    // Power best efforts
    const pwrEfforts = crunched.power?.best_efforts;
    if (pwrEfforts) {
      lines.push(``);
      lines.push(`⚡ POWER BEST EFFORTS`);
      for (const [dur, val] of Object.entries(pwrEfforts)) {
        lines.push(`  ${dur}: ${val}`);
      }
    }

    // Power skills
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

    // Aerobic decoupling
    const ad = crunched.aerobic_decoupling;
    if (ad) {
      const grade = Math.abs(ad.decoupling_pct) < 3 ? "excellent" : Math.abs(ad.decoupling_pct) < 5 ? "good" : Math.abs(ad.decoupling_pct) < 10 ? "needs work" : "poor";
      lines.push(``);
      lines.push(`🫀 AEROBIC DECOUPLING`);
      lines.push(`  ${ad.decoupling_pct}% (${grade} — <3% ideal)`);
    }

    // VAM
    const vam = crunched.vam_analysis;
    if (vam?.climbs?.length) {
      lines.push(``);
      lines.push(`🧗 VAM CLIMBS`);
      for (const c of vam.climbs) {
        lines.push(`  km ${c.start_km}: +${c.elevation_gain_m}m in ${c.duration_formatted} → ${c.vam} VAM`);
      }
    }

    // Gradient distribution
    const grad = crunched.gradient_analysis?.distribution;
    if (grad?.length) {
      lines.push(``);
      lines.push(`📐 GRADIENT`);
      for (const g of grad) {
        if (g.pct > 0) lines.push(`  ${g.label}: ${g.pct}%`);
      }
    }

    // Segment highlights
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

  // ─── Weather & Wind (built from crunched data — not AI text, avoids header-level parsing issues) ───
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
      const netStr = wind.net_wind_effect_kmh != null ? ` (net ${wind.net_wind_effect_kmh > 0 ? "+" : ""}${wind.net_wind_effect_kmh} km/h)` : ``;
      lines.push(`  ${wind.net_wind_label}${netStr}`);
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
          const netStr = seg.net_kmh != null ? `, net ${seg.net_kmh > 0 ? "+" : ""}${seg.net_kmh} km/h` : "";
          lines.push(`    ${timeLabel}: ${seg.wind_speed_kmh} km/h ${seg.wind_direction_cardinal ?? ""} → ${seg.headwind_pct}% head / ${seg.tailwind_pct}% tail${netStr}`);
        }
      }
    }
  }

  // ─── Full Detailed Analysis (from AI) ───
  if (analysisText) {
    const sections = cat === "surf" ? [
      { keyword: "Wave", emoji: "🌊" },
      { keyword: "Pacing", emoji: "📈" },
      { keyword: "Heart Rate", emoji: "❤️" },
      { keyword: "Training Load", emoji: "🏋️" },
      { keyword: "Temperature", emoji: "🌡️" },
    ] : cat === "workout" ? [
      { keyword: "Heart Rate", emoji: "❤️" },
      { keyword: "Training Load", emoji: "🏋️" },
      { keyword: "Workout Analysis", emoji: "🏋️" },
      { keyword: "Effort Intervals", emoji: "⚡" },
      { keyword: "Cadence", emoji: "🔄" },
    ] : [
      { keyword: "Pacing", emoji: "📈" },
      { keyword: "Heart Rate", emoji: "❤️" },
      { keyword: "Power Analysis", emoji: "⚡" },
      { keyword: "Training Load", emoji: "🏋️" },
      { keyword: "Power-to-Weight", emoji: "💪" },
      { keyword: "Climbing", emoji: "⛰️" },
      { keyword: "Cadence", emoji: "🔄" },
      { keyword: "Gradient", emoji: "📐" },
      { keyword: "VAM", emoji: "🧗" },
      { keyword: "Torque", emoji: "🔧" },
      { keyword: "Segment", emoji: "🏅" },
    ];
    for (const sec of sections) {
      const content = extractSection(analysisText, sec.keyword);
      if (content) {
        lines.push(``);
        lines.push(`${sec.emoji} ${sec.keyword.toUpperCase()}`);
        lines.push(formatTablesForPlainText(content.trim()));
      }
    }
  }


  // PRs mention
  if (crunched.segments_summary?.prs > 0) {
    lines.push(``);
    lines.push(`🏅 ${crunched.segments_summary.prs} personal record${crunched.segments_summary.prs > 1 ? "s" : ""}!`);
  }

  lines.push(``);
  lines.push(`📊 Analyzed with Strava Analytics`);

  return lines.join("\n");
}

/**
 * Build private notes (only visible to you).
 * SHORT format: Actionable Tips (training-focused only) + key one-liner stats.
 * Designed to be readable on mobile. No duplication of description content.
 */
export function buildPrivateNotes(crunched: any, analysisText: string | null): string {
  const lines: string[] = [];

  // 1. Actionable Tips from AI — filter out segment/PR tips (already in description)
  if (analysisText) {
    const tips = extractSection(analysisText, "Actionable Tips");
    if (tips) {
      // Filter out lines that are about segments/PRs (already in description)
      const tipLines = tips.split("\n").filter(line => {
        const lower = line.toLowerCase();
        return !(lower.includes("segment") || lower.includes("personal record") || lower.includes("pr day") || lower.includes("top spot") || lower.includes("claim"));
      });
      const filtered = tipLines.join("\n").trim();
      if (filtered.length > 0) {
        lines.push(`💡 TIPS`);
        lines.push(formatTablesForPlainText(filtered));
        lines.push(``);
      }
    }
  }

  // 2. Key stats one-liners (only metrics NOT already shown in description summary)
  lines.push(`📋 KEY STATS`);

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

  // Wind summary
  const wind = crunched.meteorology?.wind_analysis;
  if (wind) {
    const netStr = wind.net_wind_effect_kmh != null ? ` | net ${wind.net_wind_effect_kmh > 0 ? "+" : ""}${wind.net_wind_effect_kmh} km/h` : "";
    lines.push(`Wind: ${wind.headwind_pct}% head · ${wind.tailwind_pct}% tail · ${wind.crosswind_pct}% cross${netStr} (${wind.net_wind_label})`);
  }


  // If no AI tips were available, add basic tips from data
  if (!analysisText) {
    lines.push(``);
    if (crunched.cadence?.is_low) {
      const unit = crunched.cadence.unit || "rpm";
      const tip = unit === "spm" ? "try aiming for 170-180 spm" : "try 80-85 on flats";
      lines.push(`💡 Cadence low (${crunched.cadence.stats.avg} ${unit}) — ${tip}`);
    }
    if (crunched.heart_rate?.cardiac_drift?.drift_bpm > 5) lines.push(`💡 HR drift +${crunched.heart_rate.cardiac_drift.drift_bpm}bpm — start easier`);
  }

  return lines.join("\n");
}


