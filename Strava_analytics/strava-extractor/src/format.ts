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

// ─── Activity type helpers ───

type ActivityCategory = "ride" | "run" | "walk" | "surf" | "other";

function categorize(type: string | undefined): ActivityCategory {
  if (!type) return "other";
  const t = type.toLowerCase();
  if (t.includes("ride") || t.includes("cycling")) return "ride";
  if (t.includes("run")) return "run";
  if (t.includes("walk") || t.includes("hike")) return "walk";
  if (t.includes("surf")) return "surf";
  return "other";
}

function activityLabel(cat: ActivityCategory): { summary: string; emoji: string; speedLabel: string } {
  switch (cat) {
    case "walk": return { summary: "WALK SUMMARY", emoji: "🚶", speedLabel: "Avg Pace" };
    case "run":  return { summary: "RUN SUMMARY",  emoji: "🏃", speedLabel: "Avg Pace" };
    case "ride": return { summary: "RIDE SUMMARY", emoji: "🚴", speedLabel: "Avg Speed" };
    case "surf": return { summary: "SURF SESSION", emoji: "🏄", speedLabel: "Avg Speed" };
    default:     return { summary: "ACTIVITY SUMMARY", emoji: "🏅", speedLabel: "Avg Speed" };
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

  // ─── Pogačar / Kipchoge Score ───
  if (crunched.pogacar_score?.composite_pct) {
    const ps = crunched.pogacar_score;
    lines.push(`🏆 POGAČAR SCORE: ${ps.composite_pct}% (${ps.reference})`);
    for (const [key, val] of Object.entries(ps.metrics)) {
      lines.push(`  ${key}: ${val}`);
    }
    lines.push(``);
  }
  if (crunched.kipchoge_score?.pct) {
    const ks = crunched.kipchoge_score;
    lines.push(`🏆 KIPCHOGE SCORE: ${ks.pct}%`);
    lines.push(`  Pace: ${ks.your_pace} (Kipchoge: ${ks.kipchoge_pace})`);
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
    // Power/cadence only for rides
    if (cat === "ride" && sc.avg_power) lines.push(`🦵 Avg Power:  ${sc.avg_power}`);
    if (cat === "ride" && sc.cadence) lines.push(`🔄 Cadence:    ${sc.cadence}`);
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
      lines.push(verdict.trim());
    }
  }

  // ─── Training Zones (right after verdict — most visual/useful) ───
  if (analysisText) {
    const zones = extractSection(analysisText, "Training Zones");
    if (zones) {
      lines.push(``);
      lines.push(`🎯 TRAINING ZONES`);
      lines.push(zones.trim());
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
        lines.push(content.trim());
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
        lines.push(filtered);
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


  // If no AI tips were available, add basic tips from data
  if (!analysisText) {
    lines.push(``);
    if (crunched.cadence?.is_low) lines.push(`💡 Cadence low (${crunched.cadence.stats.avg} rpm) — try 80-85 on flats`);
    if (crunched.heart_rate?.cardiac_drift?.drift_bpm > 5) lines.push(`💡 HR drift +${crunched.heart_rate.cardiac_drift.drift_bpm}bpm — start easier`);
  }

  return lines.join("\n");
}


