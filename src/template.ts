/**
 * Deterministic template engine — renders a complete _analysis.md from crunched JSON.
 * All tables, headers, numbers, zones, VAM, torque, segments are rendered here.
 * Slots {{slot_name}} are filled by interpret.ts AI micro-calls.
 * No AI calls in this file — pure data → markdown transformation.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type Sport = "ride" | "run" | "walk" | "surf" | "workout" | "other";

function getSport(type: string | undefined): Sport {
  if (!type) return "other";
  const t = type.toLowerCase();
  if (t.includes("ride") || t.includes("cycling")) return "ride";
  if (t.includes("run")) return "run";
  if (t.includes("walk") || t.includes("hike")) return "walk";
  if (t.includes("surf")) return "surf";
  if (["workout","weighttraining","crosstraining","hiit","yoga","pilates","stretch"].some(k => t.includes(k))) return "workout";
  return "other";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(v: any, decimals = 0): string {
  if (v == null) return "—";
  const num = Number(v);
  if (isNaN(num)) return String(v);
  return decimals > 0 ? num.toFixed(decimals) : String(Math.round(num));
}

function bar(pct: number): string {
  const filled = Math.round(Math.min(pct, 100) / 10);
  return "█".repeat(filled) + (filled < 10 && pct > 0 ? "░" : filled === 0 ? "░" : "");
}

function paceFromKmh(kmh: number): string {
  if (!kmh || kmh <= 0) return "—";
  const secPerKm = 3600 / kmh;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function slot(name: string): string { return `{{${name}}}`; }

function mdTable(headers: string[], rows: string[][]): string {
  const sep = headers.map(() => "------").join(" | ");
  const head = headers.join(" | ");
  const body = rows.map(r => r.join(" | ")).join("\n");
  return `| ${head} |\n| ${sep} |\n${rows.map(r => `| ${r.join(" | ")} |`).join("\n")}`;
}

// ─── Section builders ─────────────────────────────────────────────────────────

function renderScoreSection(c: any, sport: Sport): string {
  const lines: string[] = [];
  if (sport === "run" && c.runner_score) {
    const rs = c.runner_score;
    const tier = rs.tier_position ? `${rs.category} — ${rs.tier_position}` : rs.category;
    lines.push(`## 1. 🏅 Performance Score`);
    lines.push(``);
    lines.push(`### 🏃 Runner Score: ${rs.composite_pct}% — ${tier}${rs.near_promotion ? " 🔝" : ""}`);
    lines.push(``);
    if (rs.metrics) {
      const rows = Object.entries(rs.metrics).map(([k, v]) => [k, String(v)]);
      lines.push(mdTable(["Metric", "Your Performance"], rows));
      lines.push(``);
    }
    if (c.kipchoge_score?.composite_pct) {
      lines.push(`### 👑 Kipchoge Score: ${c.kipchoge_score.composite_pct}%`);
      lines.push(``);
      if (c.kipchoge_score.metrics) {
        const rows = Object.entries(c.kipchoge_score.metrics).map(([k, v]) => [k, String(v)]);
        lines.push(mdTable(["Metric", "Your Performance"], rows));
        lines.push(``);
      }
    }
    if (rs.near_promotion && rs.next_category) {
      lines.push(`> 🚀 Approaching **${rs.next_category}** boundary — one strong block away`);
      lines.push(``);
    }
  } else if (sport === "ride" && c.amateur_score) {
    const as = c.amateur_score;
    const tier = as.tier_position ? `${as.category} — ${as.tier_position}` : as.category;
    lines.push(`## 1. 🏅 Performance Score`);
    lines.push(``);
    lines.push(`### 🚴 Cycling Score: ${as.composite_pct}% — ${tier}${as.near_promotion ? " 🔝" : ""}`);
    lines.push(``);
    if (as.metrics) {
      const rows = Object.entries(as.metrics).map(([k, v]) => [k, String(v)]);
      lines.push(mdTable(["Metric", "Your Performance"], rows));
      lines.push(``);
    }
    if (c.pogacar_score?.composite_pct) {
      lines.push(`### 🏆 Pogačar Score: ${c.pogacar_score.composite_pct}%`);
      lines.push(``);
    }
    if (as.near_promotion && as.next_category) {
      lines.push(`> 🚀 Approaching **${as.next_category}** boundary — one strong block away`);
      lines.push(``);
    }
  }
  return lines.join("\n");
}

function renderSummaryCard(c: any, sport: Sport): string {
  const sc = c.summary_card;
  if (!sc) return "";
  const labels: Record<Sport, { title: string; emoji: string }> = {
    run:     { title: "RUN SUMMARY",     emoji: "🏃" },
    ride:    { title: "RIDE SUMMARY",    emoji: "🚴" },
    walk:    { title: "WALK SUMMARY",    emoji: "🚶" },
    surf:    { title: "SURF SESSION",    emoji: "🏄" },
    workout: { title: "WORKOUT SUMMARY", emoji: "🏋️" },
    other:   { title: "ACTIVITY SUMMARY",emoji: "🏅" },
  };
  const { title, emoji } = labels[sport];
  const lines: string[] = [];
  lines.push(`## 2. 📊 Quick Summary Card`);
  lines.push(``);
  lines.push(`\`\`\``);
  lines.push(`## 📊 ${title}`);
  lines.push(`━━━━━━━━━━`);
  if (sc.type) lines.push(`${emoji} Type:       ${sc.type}`);
  if (sc.date) lines.push(`📅 Date:       ${sc.date}`);
  if (sc.distance) lines.push(`📏 Distance:   ${sc.distance}`);
  if (sc.moving_time) {
    const timeStr = sc.elapsed_time && sc.elapsed_time !== sc.moving_time
      ? `${sc.moving_time} (moving) / ${sc.elapsed_time} (total)`
      : sc.moving_time;
    lines.push(`⏱️ Time:       ${timeStr}`);
  }
  if (sport === "run") {
    if (sc.avg_speed) lines.push(`💨 Avg Pace:   ${paceFromKmh(Number(sc.avg_speed))} (${sc.avg_speed})`);
    if (sc.max_speed) lines.push(`🚀 Max Speed:  ${sc.max_speed}`);
  } else {
    if (sc.avg_speed) lines.push(`⚡ Avg Speed:  ${sc.avg_speed}`);
    if (sc.max_speed) lines.push(`🚀 Max Speed:  ${sc.max_speed}`);
  }
  if (sc.elevation) lines.push(`📈 Elevation:  ${sc.elevation}`);
  if (sc.temperature) lines.push(`🌡️ Temp:       ${sc.temperature}`);
  if (sc.avg_hr) lines.push(`❤️ Avg HR:     ${sc.avg_hr}`);
  if (sport === "ride" && sc.avg_power) lines.push(`⚡ Avg Power:  ${sc.avg_power}`);
  if (sport === "run" && c.power?.has_power_meter && sc.avg_power) lines.push(`⚡ Avg Power:  ${sc.avg_power}`);
  if (sc.cadence) lines.push(sport === "run" ? `👣 Cadence:    ${sc.cadence}` : `🔄 Cadence:    ${sc.cadence}`);
  if (sc.calories) lines.push(`🔥 Calories:   ${sc.calories}`);
  if (sc.gear) lines.push(`⚙️ Gear:       ${sc.gear}`);
  if (sc.device) lines.push(`📱 Device:     ${sc.device}`);
  lines.push(`━━━━━━━━━━`);
  lines.push(`\`\`\``);
  lines.push(``);
  return lines.join("\n");
}

function renderVerdict(): string {
  return `## 3. 📈 Performance Verdict\n\n${slot("verdict")}\n\n---\n`;
}

function renderPacing(c: any, sport: Sport): string {
  const pac = c.pacing;
  if (!pac) return "";
  const lines: string[] = [];
  lines.push(`#### 4.1 Pacing Strategy`);
  lines.push(``);
  const isRun = sport === "run";

  if (pac.first_half && pac.second_half) {
    const fh = pac.first_half;
    const sh = pac.second_half;
    if (isRun) {
      lines.push(mdTable(
        ["Half", "Avg Pace", "Avg HR"],
        [
          ["First half", `**${paceFromKmh(fh.avg_speed_kmh)}**`, `${fh.avg_hr} bpm`],
          ["Last half",  `**${paceFromKmh(sh.avg_speed_kmh)}**`, `${sh.avg_hr} bpm`],
        ]
      ));
    } else {
      lines.push(mdTable(
        ["Half", "Avg Speed", "Avg HR"],
        [
          ["First half", `**${n(fh.avg_speed_kmh, 1)} km/h**`, `${fh.avg_hr} bpm`],
          ["Last half",  `**${n(sh.avg_speed_kmh, 1)} km/h**`, `${sh.avg_hr} bpm`],
        ]
      ));
    }
    lines.push(``);
  }

  lines.push(slot("pacing_interpretation"));
  lines.push(``);

  if (pac.fastest_km || pac.slowest_km) {
    lines.push(`**Per-km split highlights:**`);
    if (pac.fastest_km) {
      const fk = pac.fastest_km;
      const speedStr = isRun ? paceFromKmh(fk.speed_kmh) : `${n(fk.speed_kmh, 1)} km/h`;
      const elev = fk.elevation_diff_m != null ? ` (${fk.elevation_diff_m > 0 ? "+" : ""}${n(fk.elevation_diff_m, 1)}m elevation)` : "";
      lines.push(`- **Fastest km**: **Km ${fk.km}** at **${speedStr}** with ${fk.hr} bpm${elev}`);
    }
    if (pac.slowest_km) {
      const sk = pac.slowest_km;
      const speedStr = isRun ? paceFromKmh(sk.speed_kmh) : `${n(sk.speed_kmh, 1)} km/h`;
      const elev = sk.elevation_diff_m != null ? ` (${sk.elevation_diff_m > 0 ? "+" : ""}${n(sk.elevation_diff_m, 1)}m elevation)` : "";
      lines.push(`- **Slowest km**: **Km ${sk.km}** at **${speedStr}** with ${sk.hr} bpm${elev}`);
    }
    lines.push(``);
  }

  if (pac.fastest_5min_window || pac.slowest_5min_window) {
    lines.push(`**5-minute window highlights:**`);
    if (pac.fastest_5min_window) {
      const w = pac.fastest_5min_window;
      const speedStr = isRun ? paceFromKmh(w.avg_speed_kmh) : `${n(w.avg_speed_kmh, 1)} km/h`;
      const pwrStr = w.avg_power ? ` with ${w.avg_power} W` : "";
      lines.push(`- **Fastest 5-min window**: **${w.window}** at **${speedStr}** with ${w.avg_hr} bpm${pwrStr}`);
    }
    if (pac.slowest_5min_window) {
      const w = pac.slowest_5min_window;
      const speedStr = isRun ? paceFromKmh(w.avg_speed_kmh) : `${n(w.avg_speed_kmh, 1)} km/h`;
      const pwrStr = w.avg_power ? ` with ${w.avg_power} W` : "";
      lines.push(`- **Slowest 5-min window**: **${w.window}** at **${speedStr}** with ${w.avg_hr} bpm${pwrStr}`);
    }
    lines.push(``);
  }

  // Running best efforts
  if (sport === "run" && c.best_efforts?.efforts?.length) {
    lines.push(`**Running Milestones:**`);
    lines.push(``);
    lines.push(mdTable(
      ["Distance", "Time", "PR?"],
      c.best_efforts.efforts.map((e: any) => [e.distance, e.time, e.pr ? "🥇 PR" : "—"])
    ));
    lines.push(``);
  }

  return lines.join("\n");
}

function renderHR(c: any): string {
  const hr = c.heart_rate;
  if (!hr?.stats) return "";
  const lines: string[] = [];
  lines.push(`#### 4.2 Heart Rate Analysis`);
  lines.push(``);
  lines.push(mdTable(
    ["Metric", "Value"],
    [
      ["Average HR", `${n(hr.stats.avg)} bpm`],
      ["Max HR", `${n(hr.stats.max)} bpm`],
      ["Median HR", `${n(hr.stats.median)} bpm`],
      ...(hr.stats.p5 != null && hr.stats.p95 != null ? [["HR range (p5-p95)", `${n(hr.stats.p5)} - ${n(hr.stats.p95)} bpm`]] : []),
    ]
  ));
  lines.push(``);

  if (hr.peak_efforts) {
    lines.push(`**Peak HR efforts:**`);
    for (const [dur, val] of Object.entries(hr.peak_efforts)) {
      lines.push(`- Best ${dur} HR: ${val}`);
    }
    lines.push(``);
  }

  if (hr.cardiac_drift) {
    const cd = hr.cardiac_drift;
    const sign = cd.drift_bpm > 0 ? "+" : "";
    lines.push(`**Cardiac drift analysis:**`);
    lines.push(`- Comparing the first half to the last half, there was a drift of ${sign}${n(cd.drift_bpm)} bpm (${n(cd.drift_pct, 1)}%). ${slot("cardiac_drift_interpretation")}`);
    lines.push(``);
  }

  if (hr.uphill_avg_hr != null && hr.flat_avg_hr != null) {
    const diff = Math.round(hr.uphill_avg_hr - hr.flat_avg_hr);
    lines.push(`**HR vs terrain:**`);
    lines.push(`- Uphill avg HR: ${n(hr.uphill_avg_hr)} bpm`);
    lines.push(`- Flat avg HR: ${n(hr.flat_avg_hr)} bpm`);
    lines.push(`- Difference: ${diff > 0 ? "+" : ""}${diff} bpm`);
    lines.push(``);
  }

  return lines.join("\n");
}

function renderPower(c: any): string {
  const pw = c.power;
  if (!pw?.avg_power) return "";
  const lines: string[] = [];
  lines.push(`#### 4.3 Power Analysis`);
  lines.push(``);
  lines.push(mdTable(
    ["Metric", "Value"],
    [
      ["Average Power", `${n(pw.avg_power)} W`],
      ["Normalized Power (NP)", `${n(pw.normalized_power)} W`],
      ["Variability Index (VI)", `${n(pw.variability_index, 2)}`],
    ]
  ));
  lines.push(``);
  lines.push(slot("power_interpretation"));
  lines.push(``);

  if (pw.best_efforts && Object.keys(pw.best_efforts).length > 0) {
    lines.push(`**Power curve table:**`);
    lines.push(``);
    lines.push(mdTable(
      ["Duration", "Power"],
      Object.entries(pw.best_efforts).map(([k, v]) => [k, `${v}`])
    ));
    lines.push(``);
  }

  const src = pw.has_power_meter
    ? "Power data was recorded with a power meter, providing accurate and reliable metrics."
    : "Power is Strava-estimated — treat as approximate.";
  lines.push(`**Power source note:** ${src}`);
  lines.push(``);
  return lines.join("\n");
}

function renderTrainingLoad(c: any): string {
  const tm = c.training_metrics;
  if (!tm) return "";
  const lines: string[] = [];
  lines.push(`#### 4.4 Training Load & Intensity`);
  lines.push(``);
  lines.push(mdTable(
    ["Metric", "Value", "Interpretation"],
    [
      ["**Intensity Factor (IF)**", String(tm.intensity_factor ?? "—"), tm.intensity_factor_label ?? "—"],
      ["**Training Stress Score (TSS)**", String(tm.tss ?? "—"), tm.tss_label ?? "—"],
      ["**Efficiency Factor (EF)**", String(tm.efficiency_factor ?? "—"), "Power per heartbeat"],
      ["**FTP**", `${tm.ftp_used ?? "—"} W`, "From rider profile"],
    ]
  ));
  lines.push(``);
  lines.push(`- **IF** = NP / FTP. Values: <0.75 = endurance · 0.75–0.90 = tempo · 0.90–1.05 = threshold · >1.05 = above FTP. Your IF of ${tm.intensity_factor} indicates **${tm.intensity_factor_label ?? "—"}**.`);
  lines.push(`- **TSS** = training stress. <50 easy · 50–100 moderate · 100–150 hard · 150–250 very hard · 250+ epic. Your TSS of ${tm.tss} points to **${tm.tss_label ?? "—"}**.`);
  if (tm.efficiency_factor) lines.push(`- **EF** = NP / avg HR. Higher = more efficient. Your EF of ${tm.efficiency_factor}: ${slot("ef_interpretation")}`);
  lines.push(``);

  if (c.relative_effort) {
    const re = c.relative_effort;
    lines.push(`**Relative Effort:**`);
    lines.push(`- Score: ${re.score} (${re.interpretation} — <50 Easy · 50–100 Moderate · 100–150 Hard · 150–200 Very Hard · 200–300 Extremely Hard · 300+ Epic)`);
    lines.push(``);
  }

  if (c.aerobic_decoupling) {
    const ad = c.aerobic_decoupling;
    lines.push(`**Aerobic Decoupling:**`);
    lines.push(``);
    lines.push(mdTable(
      ["Half", "Avg Power", "Avg HR", "Power:HR Ratio"],
      [
        ["First half",  `${n(ad.first_window?.avg_power ?? ad.first_half_power)} W`, `${n(ad.first_window?.avg_hr ?? ad.first_half_hr)} bpm`, String(ad.first_window?.ratio ?? ad.first_half_ratio ?? "—")],
        ["Second half", `${n(ad.last_window?.avg_power ?? ad.second_half_power)} W`, `${n(ad.last_window?.avg_hr ?? ad.second_half_hr)} bpm`, String(ad.last_window?.ratio ?? ad.second_half_ratio ?? "—")],
      ]
    ));
    lines.push(``);
    const grade = Math.abs(ad.decoupling_pct) < 3 ? "Excellent" : Math.abs(ad.decoupling_pct) < 5 ? "Good" : Math.abs(ad.decoupling_pct) < 10 ? "Needs work" : "Focus on base";
    lines.push(`- Decoupling: **${n(ad.decoupling_pct, 1)}%** — ${grade}`);
    lines.push(`- ${slot("decoupling_interpretation")}`);
    lines.push(``);
  }

  return lines.join("\n");
}

function renderPowerToWeight(c: any): string {
  const ptw = c.power_to_weight;
  if (!ptw) return "";
  const ps = c.power_skills;
  const lines: string[] = [];
  lines.push(`#### 4.5 Power-to-Weight & Skills`);
  lines.push(``);
  lines.push(mdTable(
    ["Metric", "Value"],
    [
      ["Avg W/kg", `${n(ptw.avg_wkg, 2)} W/kg`],
      ["NP W/kg",  `${n(ptw.np_wkg, 2)} W/kg`],
      ["FTP W/kg", `${n(ptw.ftp_wkg, 2)} W/kg`],
      ["Estimated Level", c.amateur_score?.category ?? ptw.estimated_level ?? "—"],
    ]
  ));
  lines.push(``);

  const bestEffortsWkg = ptw.best_efforts_wkg ?? ptw.best_efforts;
  if (bestEffortsWkg && Object.keys(bestEffortsWkg).length > 0) {
    lines.push(`**Best Efforts (W/kg):**`);
    for (const [dur, val] of Object.entries(bestEffortsWkg)) {
      // values from best_efforts_wkg already include "W/kg" suffix; best_efforts (legacy) do not
      const display = String(val).includes("W/kg") ? String(val) : `${val} W/kg`;
      lines.push(`- ${dur}: ${display}`);
    }
    lines.push(``);
  }

  if (ps) {
    lines.push(`**Power Skills:**`);
    if (ps.sprint_5s_pct_ftp)       lines.push(`- **Sprint (5s):** ${ps.sprint_5s_pct_ftp}`);
    if (ps.attack_1min_pct_ftp)     lines.push(`- **Attack (1min):** ${ps.attack_1min_pct_ftp}`);
    if (ps.sustained_5min_pct_ftp)  lines.push(`- **Sustained (5min):** ${ps.sustained_5min_pct_ftp}`);
    if (ps.sustained_20min_pct_ftp) lines.push(`- **Sustained (20min):** ${ps.sustained_20min_pct_ftp}`);
    if (ps.primary_strength)        lines.push(`- **Primary Strength:** ${ps.primary_strength}`);
    lines.push(``);
  }

  lines.push(slot("power_skills_interpretation"));
  lines.push(``);
  return lines.join("\n");
}

function renderZones(c: any, sport: Sport): string {
  const tz = c.training_zones;
  if (!tz) return "";
  const lines: string[] = [];
  lines.push(`#### 4.6 Training Zones`);
  lines.push(``);

  const lthrLabel = tz.hr_zones?.lthr ? `(LTHR-based/${sport === "run" ? "running" : "cycling"}, ${tz.hr_zones.lthr} bpm)` : "";

  if (tz.hr_zones?.zones?.length) {
    lines.push(`**Heart Rate Zones ${lthrLabel}:**`);
    lines.push(`\`\`\``);
    lines.push(`| Zone | Range | Time | % |`);
    lines.push(`|------|-------|------|---|`);
    for (const z of tz.hr_zones.zones) {
      lines.push(`| ${z.zone} | ${z.range_bpm} bpm | ${z.time_formatted} | ${bar(z.pct)} ${z.pct}% |`);
    }
    lines.push(`\`\`\``);
    lines.push(`**Key insight:** ${slot("hr_zones_insight")}`);
    lines.push(``);
  }

  if (tz.power_zones?.zones?.length) {
    lines.push(`**Power Zones (FTP ${tz.power_zones.ftp_used} W):**`);
    lines.push(`\`\`\``);
    lines.push(`| Zone | Range | Time | % |`);
    lines.push(`|------|-------|------|---|`);
    for (const z of tz.power_zones.zones) {
      lines.push(`| ${z.zone} | ${z.range_watts} | ${z.time_formatted} | ${bar(z.pct)} ${z.pct}% |`);
    }
    lines.push(`\`\`\``);
    lines.push(`**Key insight:** ${slot("power_zones_insight")}`);
    lines.push(``);
  }

  if (tz.speed_zones?.zones?.length) {
    const speedLabel = sport === "run" ? "Speed Zones (running)" : "Speed Zones";
    lines.push(`**${speedLabel}:**`);
    lines.push(`\`\`\``);
    lines.push(`| Zone | Range | Time | % |`);
    lines.push(`|------|-------|------|---|`);
    for (const z of tz.speed_zones.zones) {
      lines.push(`| ${z.zone} | ${z.range} | ${z.time_formatted} | ${bar(z.pct)} ${z.pct}% |`);
    }
    lines.push(`\`\`\``);
    lines.push(``);
  }

  if (tz.cadence_zones?.zones?.length) {
    const cadLabel = sport === "run" ? "Cadence Zones (spm)" : "Cadence Zones";
    lines.push(`**${cadLabel}:**`);
    lines.push(`\`\`\``);
    lines.push(`| Zone | Range | Time | % |`);
    lines.push(`|------|-------|------|---|`);
    for (const z of tz.cadence_zones.zones) {
      lines.push(`| ${z.zone} | ${z.range} | ${z.time_formatted} | ${bar(z.pct)} ${z.pct}% |`);
    }
    lines.push(`\`\`\``);
    lines.push(`**Key insight:** ${slot("cadence_zones_insight")}`);
    lines.push(``);
  }

  return lines.join("\n");
}

function renderClimbing(c: any, sport: Sport): string {
  const cl = c.climbing_analysis ?? c.climbing;
  const threshold = sport === "run" ? 100 : 200;
  if (!cl || (cl.total_ascent_m ?? 0) < threshold) return "";
  const lines: string[] = [];
  lines.push(`#### 4.7 Climbing Analysis`);
  lines.push(``);
  const altRange = cl.altitude_range
    ?? (cl.altitude_min_m != null && cl.altitude_max_m != null ? `${n(cl.altitude_min_m)}m → ${n(cl.altitude_max_m)}m` : null);
  lines.push(mdTable(
    ["Metric", "Value"],
    [
      ["Total ascent", `${n(cl.total_ascent_m)} m`],
      ["Total descent", `${n(cl.total_descent_m)} m`],
      ...(altRange ? [["Altitude range", altRange]] : []),
      ...((cl.uphill_avg_speed != null || cl.uphill_avg_speed_kmh != null) ? [["Uphill avg speed", `${n(cl.uphill_avg_speed ?? cl.uphill_avg_speed_kmh, 1)} km/h`]] : []),
      ...((cl.flat_avg_speed != null || cl.flat_avg_speed_kmh != null) ? [["Flat avg speed", `${n(cl.flat_avg_speed ?? cl.flat_avg_speed_kmh, 1)} km/h`]] : []),
      ...((cl.downhill_avg_speed != null || cl.downhill_avg_speed_kmh != null) ? [["Downhill avg speed", `${n(cl.downhill_avg_speed ?? cl.downhill_avg_speed_kmh, 1)} km/h`]] : []),
    ]
  ));
  lines.push(``);
  const flatPct = cl.terrain_pct?.flat ?? cl.flat_pct;
  const uphillPct = cl.terrain_pct?.uphill ?? cl.uphill_pct;
  const downhillPct = cl.terrain_pct?.downhill ?? cl.downhill_pct;
  if (flatPct != null) {
    lines.push(`**Terrain breakdown:**`);
    lines.push(`- ${flatPct}% flat, ${uphillPct}% uphill, ${downhillPct}% downhill`);
    if (cl.uphill_avg_hr && cl.flat_avg_hr) {
      const diff = Math.round(cl.uphill_avg_hr - cl.flat_avg_hr);
      lines.push(``);
      lines.push(`**HR vs terrain:**`);
      lines.push(`- Uphill avg HR: ${n(cl.uphill_avg_hr)} bpm`);
      lines.push(`- Flat avg HR: ${n(cl.flat_avg_hr)} bpm`);
      lines.push(`- Difference: ${diff > 0 ? "+" : ""}${diff} bpm`);
    }
    lines.push(``);
  }
  const hc = cl.hardest_climb ?? cl.hardest_climb_km;
  if (hc) {
    lines.push(`**Hardest climb:** Identified at **km ${hc.km}**, with an elevation gain of ${n(hc.elevation_gain_m ?? hc.elevation_diff_m, 1)}m. Speed ${n(hc.speed_kmh, 1)} km/h with HR ${hc.hr} bpm.`);
    lines.push(``);
  }
  return lines.join("\n");
}

function renderGradientVAM(c: any): string {
  const grad = c.gradient_analysis;
  const vam = c.vam_analysis;
  if (!grad && !vam) return "";
  const lines: string[] = [];
  lines.push(`#### 4.8 Gradient & VAM Analysis`);
  lines.push(``);

  if (grad?.distribution?.length) {
    lines.push(`**Gradient distribution:**`);
    lines.push(mdTable(
      ["Gradient", "% of activity"],
      grad.distribution.map((g: any) => [g.label, `${n(g.pct, 1)}%`])
    ));
    lines.push(``);
    if (grad.steepest_segment) {
      lines.push(`**Steepest segment:** ${grad.steepest_segment}`);
      lines.push(``);
    }
  }

  if (vam?.climbs?.length) {
    lines.push(`**⛰️ VAM (Velocity Ascended in Meters per hour):**`);
    lines.push(``);
    lines.push(mdTable(
      ["Climb", "Start km", "Elevation", "Duration", "VAM"],
      vam.climbs.map((cl: any, i: number) => [
        `Climb ${i + 1}`,
        `km ${cl.start_km}`,
        `+${n(cl.elevation_gain_m)}m`,
        cl.duration_formatted,
        String(cl.vam),
      ])
    ));
    lines.push(``);
    if (vam.best_vam_climb) {
      const bv = vam.best_vam_climb;
      lines.push(`- **Best VAM:** ${bv.vam} m/h on the climb starting at km ${bv.start_km}.`);
    }
    if (vam.overall_vam != null) {
      lines.push(`- **Overall VAM:** ${n(vam.overall_vam)} m/h (total ascent / total time).`);
    }
    lines.push(`- Reference: recreational = 600–800 m/h · good amateur = 800–1200 m/h · elite = 1500+ m/h`);
    lines.push(``);
    lines.push(slot("vam_interpretation"));
    lines.push(``);
  }

  return lines.join("\n");
}

function renderTorque(c: any, sport: Sport): string {
  const t = c.torque;
  if (!t) return "";
  const lines: string[] = [];
  lines.push(`#### 4.9 Torque Analysis`);
  lines.push(``);
  lines.push(`- **Average Torque:** ${n(t.avg_torque_nm ?? t.avg_nm, 1)} Nm`);
  lines.push(`- **Peak Torque:** ${n(t.peak_torque_nm ?? t.peak_nm, 1)} Nm`);
  lines.push(``);
  if (sport === "run") {
    lines.push(`Context benchmarks (running): recreational = 10–18 Nm · trained = 18–28 Nm · elite = 28–40 Nm · world-class = 40+ Nm. High torque reflects strong ground-force application per stride.`);
  } else {
    lines.push(`Context benchmarks (cycling): recreational = 15–25 Nm · strong amateur = 25–40 Nm · pro = 40–60 Nm. High torque + low cadence = "grinding"; low torque + high cadence = "spinning".`);
  }
  lines.push(``);
  lines.push(slot("torque_interpretation"));
  lines.push(``);
  return lines.join("\n");
}

function renderCadence(c: any, sport: Sport): string {
  const cad = c.cadence;
  if (!cad?.stats) return "";
  const lines: string[] = [];
  lines.push(`#### 4.10 Cadence`);
  lines.push(``);
  const unit = sport === "run" ? "spm" : "rpm";
  lines.push(mdTable(
    ["Metric", "Value"],
    [
      ["Average Cadence", `${n(cad.stats.avg)} ${unit}`],
      ["Max Cadence",     `${n(cad.stats.max)} ${unit}`],
      ["Median Cadence",  `${n(cad.stats.median)} ${unit}`],
    ]
  ));
  lines.push(``);
  const benchmark = sport === "run"
    ? `Average cadence of ${n(cad.stats.avg)} spm vs. optimal 170–180 spm.`
    : `Average cadence of ${n(cad.stats.avg)} rpm vs. pro benchmark 85–95 rpm.`;
  lines.push(benchmark);
  lines.push(``);
  return lines.join("\n");
}

function renderTemperature(c: any): string {
  const meteo = c.meteorology;
  const startWx = meteo?.at_activity_start;
  if (!startWx?.temperature_c) return "";
  const lines: string[] = [];
  lines.push(`#### 4.11 Temperature`);
  lines.push(``);
  const feels = startWx.apparent_temperature_c != null ? ` (feels like ${n(startWx.apparent_temperature_c, 1)}°C)` : "";
  lines.push(`The temperature at the start of your activity was ${n(startWx.temperature_c, 1)}°C${feels}.`);
  lines.push(``);
  return lines.join("\n");
}

function renderWeather(c: any): string {
  const meteo = c.meteorology;
  if (!meteo) return "";
  const lines: string[] = [];
  lines.push(`#### 4.13 Weather & Wind Conditions`);
  lines.push(``);

  const ws = meteo.at_activity_start;
  if (ws) {
    lines.push(`\`\`\``);
    lines.push(`## 🌤️ WEATHER CONDITIONS`);
    lines.push(``);
    lines.push(`| Metric | At Start | Notes |`);
    lines.push(`|--------|----------|-------|`);
    if (ws.temperature_c != null) {
      const feels = ws.apparent_temperature_c != null ? ` (feels like ${n(ws.apparent_temperature_c, 1)}°C)` : "";
      lines.push(`| Temperature | ${n(ws.temperature_c, 1)}°C${feels} | |`);
    }
    if (ws.humidity_pct != null) lines.push(`| Humidity | ${ws.humidity_pct}% | |`);
    if (ws.precipitation_mm != null) lines.push(`| Precipitation | ${ws.precipitation_mm} mm | |`);
    if (ws.windspeed_kmh != null) {
      const gusts = ws.wind_gusts_kmh != null ? ` Gusts: ${ws.wind_gusts_kmh} km/h` : "";
      lines.push(`| Wind | ${ws.windspeed_kmh} km/h from ${ws.wind_direction ?? "—"} |${gusts} |`);
    }
    if (ws.weather_description) lines.push(`| Conditions | ${ws.weather_description} | |`);
    lines.push(`\`\`\``);
    lines.push(``);
  }

  const wind = meteo.wind_analysis;
  if (wind) {
    lines.push(`\`\`\``);
    lines.push(`## 💨 WIND IMPACT`);
    lines.push(``);
    if (wind.by_segment?.length) {
      lines.push(`| Phase | Wind | Headwind | Tailwind | Crosswind |`);
      lines.push(`|-------|------|----------|----------|-----------|`);
      const snapshots: any[] = meteo.snapshots ?? [];
      const offset: number = c.summary_card?.local_utc_offset_hours ?? 0;
      for (const seg of wind.by_segment) {
        const snap = snapshots.find((s: any) => s.waypoint_pct === seg.waypoint_pct);
        let timeLabel = `~${seg.waypoint_pct}%`;
        if (snap?.utc_time) {
          const h = (new Date(snap.utc_time).getUTCHours() + offset + 24) % 24;
          timeLabel = `${h}:00`;
        }
        lines.push(`| ${timeLabel} | ${seg.wind_speed_kmh} km/h ${seg.wind_direction_cardinal ?? ""} | ${seg.headwind_pct}% | ${seg.tailwind_pct}% | ${seg.crosswind_pct ?? "—"}% |`);
      }
    } else {
      lines.push(`| Phase | Wind | Headwind | Tailwind | Crosswind |`);
      lines.push(`|-------|------|----------|----------|-----------|`);
      lines.push(`| Overall | — | ${wind.headwind_pct}% | ${wind.tailwind_pct}% | ${wind.crosswind_pct ?? "—"}% |`);
    }
    lines.push(``);
    lines.push(`**Overall: ${wind.headwind_pct}% headwind · ${wind.tailwind_pct}% tailwind · ${wind.crosswind_pct ?? "—"}% crosswind**`);
    if (wind.headwind_exposure_kmh != null) {
      lines.push(`Net wind effect: headwind exposure index ${wind.headwind_exposure_kmh > 0 ? "+" : ""}${n(wind.headwind_exposure_kmh, 1)}`);
    }
    lines.push(`\`\`\``);
    lines.push(``);
  }

  return lines.join("\n");
}

function renderHeartPoints(c: any): string {
  const hp = c.heart_points;
  if (!hp) return "";
  const lines: string[] = [];
  lines.push(`#### 4.14 Heart Points`);
  lines.push(``);
  lines.push(mdTable(
    ["Metric", "Value"],
    [
      ["Heart Points", String(hp.points ?? hp.total_points ?? "—")],
      ["Moderate minutes", `${hp.moderate_minutes ?? "—"} min`],
      ["Vigorous minutes", `${hp.vigorous_minutes ?? "—"} min`],
      ["% of weekly target (150 pts)", `${hp.pct_of_weekly_target ?? "—"}`],
    ]
  ));
  lines.push(``);
  lines.push(`Vigorous = HR ≥ 77% max HR (2 pts/min). Moderate = HR ≥ 64% max HR (1 pt/min). Weekly target = 150 pts.`);
  lines.push(``);
  return lines.join("\n");
}

function renderVO2max(c: any): string {
  const v = c.vo2max;
  if (!v) return "";
  const lines: string[] = [];
  lines.push(`#### 4.15 VO2max Estimate`);
  lines.push(``);
  lines.push(`- **VO2max: ${n(v.value, 1)} ml/kg/min** — ${v.level}. Estimated via ${v.method}.`);
  lines.push(`- Context: recreational 35–45, trained amateurs 50–60, elite 65–75+, world-class 80+. Always note: estimated, not lab-measured.`);
  lines.push(``);
  return lines.join("\n");
}

function renderSegments(c: any): string {
  const ss = c.segments_summary;
  if (!ss) return "";
  const lines: string[] = [];
  lines.push(`#### 4.17 Segment Highlights`);
  lines.push(``);
  const prCount = ss.prs ?? 0;
  lines.push(`You set **${prCount} personal record${prCount !== 1 ? "s" : ""}**${prCount > 0 ? "!" : "."}`);
  lines.push(``);
  if (ss.highlight_table?.length) {
    lines.push(mdTable(
      ["Segment", "Distance", "Time", "PR?"],
      ss.highlight_table.map((s: any) => [s.name, s.distance, s.time, s.pr ?? "—"])
    ));
    lines.push(``);
  }
  // Best efforts (running)
  if (c.best_efforts?.efforts?.length) {
    lines.push(`**Running Milestones:**`);
    lines.push(``);
    lines.push(mdTable(
      ["Distance", "Time", "PR?"],
      c.best_efforts.efforts.map((e: any) => [e.distance, e.time, e.pr ? "🥇 PR" : "—"])
    ));
    lines.push(``);
  }
  return lines.join("\n");
}

function renderTips(): string {
  return `## 5. 💡 Actionable Tips\n\n${slot("tips")}\n\n---\n`;
}

function renderHistorical(historical: any): string {
  if (!historical?.baselines?.length) return "";
  const lines: string[] = [];
  lines.push(`## 6. 📈 HISTORICAL CONTEXT — How Does This Fit In?`);
  lines.push(``);
  const bases: any[] = historical.baselines;
  // Primary metrics table
  lines.push(`**Primary metrics:**`);
  lines.push(`\`\`\``);
  const pmHeaders = ["Period", "Activities", "Avg HR", "Avg Pace / Power", "Avg NP", "Avg Cadence", "Weekly km"];
  const pmRows = bases.map((b: any) => [
    b.period_label,
    String(b.activity_count ?? "—"),
    b.avg_hr ? `${n(b.avg_hr)} bpm` : b.avg_hr_bpm ? `${n(b.avg_hr_bpm)} bpm` : "—",
    b.avg_pace_sec_per_km
      ? (() => { const s = b.avg_pace_sec_per_km; return `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,"0")}/km`; })()
      : b.avg_normalized_power_w ? `${n(b.avg_normalized_power_w)} W` : "—",
    b.avg_normalized_power_w ? `${n(b.avg_normalized_power_w)} W` : "—",
    b.avg_cadence ? String(n(b.avg_cadence)) : "—",
    b.weekly_avg_distance_km ? `${n(b.weekly_avg_distance_km, 1)} km` : "—",
  ]);
  lines.push(mdTable(pmHeaders, pmRows));
  lines.push(`\`\`\``);
  lines.push(``);

  // Quality metrics table
  lines.push(`**Training quality metrics:**`);
  lines.push(`\`\`\``);
  const qmHeaders = ["Period", "Avg TSS", "Avg EF", "Avg Z2%", "Best 20min W", "Avg VI", "Avg Drift", "Avg Decoupling", "Avg VO2max"];
  const qmRows = bases.map((b: any) => [
    b.period_label,
    b.avg_tss ? `${String(n(b.avg_tss))}${b.tss_is_hr_based ? "†" : ""}` : "—",
    b.avg_efficiency_factor ? String(b.avg_efficiency_factor) : "—",
    b.avg_z2_pct ? `${n(b.avg_z2_pct)}%` : "—",
    (b.avg_best_20min_power_w ?? b.best_20min_power_w) ? `${n(b.avg_best_20min_power_w ?? b.best_20min_power_w)} W` : "—",
    (b.avg_variability_index ?? b.avg_vi) ? `${String(b.avg_variability_index ?? b.avg_vi)}${b.vi_is_pace_based ? "†" : ""}` : "—",
    b.avg_cardiac_drift_bpm != null ? `${b.avg_cardiac_drift_bpm > 0 ? "+" : ""}${n(b.avg_cardiac_drift_bpm)} bpm` : "—",
    b.avg_aerobic_decoupling_pct != null ? `${n(b.avg_aerobic_decoupling_pct, 1)}%${b.decoupling_is_drift ? "†" : ""}` : "—",
    b.avg_vo2max ? String(n(b.avg_vo2max, 1)) : "—",
  ]);
  lines.push(mdTable(qmHeaders, qmRows));
  lines.push(`\`\`\``);
  const hasHrFallback = bases.some((b: any) => b.tss_is_hr_based || b.vi_is_pace_based || b.decoupling_is_drift);
  if (hasHrFallback) lines.push(`_† estimated from HR/pace data (no power meter)_`);
  lines.push(``);
  lines.push(`**This activity vs. your baselines**`);
  lines.push(``);
  lines.push(slot("historical_comparison"));
  lines.push(``);
  return lines.join("\n");
}

function renderReadiness(wellness: any): string {
  if (!wellness) return "";
  const n2 = wellness.night_before;
  const d = wellness.day_of;
  const lines: string[] = [];
  lines.push(`## 7. 🛌 READINESS — How Were You Going In?`);
  lines.push(``);
  const rows: string[][] = [];
  if (n2?.sleep_score != null) {
    const dur = n2.sleep_duration_h != null ? ` (${n(n2.sleep_duration_h, 1)}h)` : "";
    const label = n2.sleep_score >= 70 ? (n2.sleep_score >= 85 ? "Good 🟢" : "Good") : n2.sleep_score >= 55 ? "Fair" : "Poor 🔴";
    rows.push(["😴 Sleep score", `${n2.sleep_score}/100${dur}`, label]);
  }
  if (n2?.hrv_last_5_min != null) {
    const vs = n2.hrv_vs_baseline != null ? ` (${n2.hrv_vs_baseline > 0 ? "+" : ""}${n(n2.hrv_vs_baseline)} vs 7d avg)` : "";
    const label = n2.hrv_vs_baseline > 3 ? "Above baseline ✅" : n2.hrv_vs_baseline < -5 ? "Suppressed 🔴" : "Normal";
    rows.push(["🧠 HRV last night", `${n(n2.hrv_last_5_min)} ms${vs}`, label]);
  }
  if (n2?.resting_hr != null) rows.push(["❤️ Resting HR", `${n(n2.resting_hr)} bpm`, "Normal"]);
  const bb = d?.body_battery_at_start ?? n2?.body_battery_start ?? null;
  if (bb != null) {
    const bbLabel = bb >= 80 ? "Well charged ✅" : bb >= 60 ? "Good" : bb >= 40 ? "Moderate 🟡" : "Running low 🔴";
    rows.push(["🔋 Body Battery", `${n(bb)}/100 at activity start`, bbLabel]);
  }
  if (n2?.training_readiness_score != null) {
    const trLabel = n2.training_readiness_score >= 73 ? "Go for it" : n2.training_readiness_score >= 40 ? "Moderate" : "Low 🔴";
    const trLevel = n2.training_readiness_level ? ` (${n2.training_readiness_level})` : "";
    rows.push(["🎯 Training Readiness", `${n(n2.training_readiness_score)}/100${trLevel}`, trLabel]);
  }
  const overnightStress = n2?.sleep_avg_stress ?? n2?.stress_overnight ?? null;
  if (overnightStress != null) {
    const stressLabel = overnightStress < 25 ? "Low — good recovery" : overnightStress < 50 ? "Moderate — monitor" : "High — may impact recovery 🔴";
    rows.push(["😓 Overnight stress", String(n(overnightStress)), stressLabel]);
  }
  if (n2?.stress_high_pct != null) {
    const highLabel = n2.stress_high_pct < 10 ? "Low" : n2.stress_high_pct < 20 ? "Moderate" : "High 🔴";
    rows.push(["😰 High stress", `${n(n2.stress_high_pct)}% of waking day`, highLabel]);
  }
  if (rows.length > 0) {
    lines.push(mdTable(["Metric", "Value", "Assessment"], rows));
    lines.push(``);
  }
  lines.push(`**Overall:** ${slot("readiness_verdict")}`);
  lines.push(``);
  return lines.join("\n");
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Renders a complete _analysis.md skeleton from crunched JSON.
 * Slots ({{name}}) are placeholders for AI interpretation text.
 * Returns the skeleton string with all slots unfilled.
 */
export function renderTemplate(
  crunched: any,
  historical: any | null,
  wellness: any | null,
): string {
  const sport = getSport(crunched.summary_card?.type);
  const sections: string[] = [];

  sections.push(renderScoreSection(crunched, sport));
  sections.push(renderSummaryCard(crunched, sport));
  sections.push(`---\n`);
  sections.push(renderVerdict());
  sections.push(`## 4. 🔍 Detailed Analysis\n`);
  sections.push(renderPacing(crunched, sport));
  sections.push(renderHR(crunched));
  sections.push(renderPower(crunched));
  sections.push(renderTrainingLoad(crunched));
  sections.push(renderPowerToWeight(crunched));
  sections.push(renderZones(crunched, sport));
  sections.push(renderClimbing(crunched, sport));
  sections.push(renderGradientVAM(crunched));
  sections.push(renderTorque(crunched, sport));
  sections.push(renderCadence(crunched, sport));
  sections.push(renderTemperature(crunched));
  sections.push(renderWeather(crunched));
  sections.push(renderHeartPoints(crunched));
  sections.push(renderVO2max(crunched));
  sections.push(renderSegments(crunched));
  sections.push(`---\n`);
  sections.push(renderTips());
  sections.push(renderHistorical(historical));
  sections.push(renderReadiness(wellness));

  return sections.filter(Boolean).join("\n");
}

/** Fill all {{slot_name}} placeholders in a rendered skeleton */
export function fillSlots(skeleton: string, interpretations: Record<string, string>): string {
  let result = skeleton;
  for (const [key, value] of Object.entries(interpretations)) {
    result = result.replaceAll(`{{${key}}}`, value.trim());
  }
  // Remove any unfilled slots (replace with empty string)
  result = result.replace(/\{\{[a-z_]+\}\}/g, "");
  return result;
}

/** Return all slot names present in a skeleton */
export function getSlotNames(skeleton: string): string[] {
  const matches = skeleton.match(/\{\{([a-z_]+)\}\}/g) ?? [];
  return [...new Set(matches.map(m => m.slice(2, -2)))];
}

