/**
 * Dashboard HTML export.
 * Generates a static dashboard.html with Chart.js graphs from all crunched data.
 * No server needed — open in any browser.
 *
 * Usage: npm run dashboard
 */
import { writeFileSync, existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import "dotenv/config";
import { loadAllSummaries, round2, sum, ActivitySummary } from "./summary_utils.js";
import { buildDailyLoadSeries, computeLoadModel } from "./training_intelligence.js";
import { resolveBaseDir } from "./paths.js";
import { buildActivityRecommendation, loadWellnessByDate } from "./activity_recommendation.js";
import type { RecommendationBlock } from "./recommendations.js";
import { loadRecommendationHistory, computeTrend } from "./recommendation_history.js";
import { CAUSE_CODE_META } from "./cause_codes.js";

const BASE_DIR = resolveBaseDir(import.meta.url);
const ANALYSIS_DIR = join(BASE_DIR, "analysis");
const OUTPUT_PATH = join(BASE_DIR, "dashboard.html");

function fmtPace(sec: number | null): string {
  if (!sec) return "—";
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
}

function toJs(v: any): string {
  return JSON.stringify(v);
}

function buildHtml(summaries: ActivitySummary[]): string {
  if (summaries.length === 0) return `<!DOCTYPE html><html lang="en"><body>No data found.</body></html>`;

  const sorted = [...summaries].sort((a, b) => a.date.localeCompare(b.date));
  const modelSeries = computeLoadModel(buildDailyLoadSeries(sorted));
  const wellnessByDate = loadWellnessByDate(ANALYSIS_DIR);
  const recommendationByDate = new Map<string, RecommendationBlock>();
  const recHistory = loadRecommendationHistory(ANALYSIS_DIR);
  for (const d of [...new Set(sorted.map(a => a.date))].sort()) {
    const rec = buildActivityRecommendation(sorted, wellnessByDate, d);
    if (rec) recommendationByDate.set(d, rec);
  }
  const recTrend = recHistory.length > 0 ? computeTrend(recHistory, 28) : null;

  // ── Load per-activity detail from crunched files ─────────────────
  const detailMap: Record<string, any> = {};
  try {
    const files = readdirSync(ANALYSIS_DIR).filter(f => f.endsWith("_crunched.json"));
    for (const f of files) {
      try {
        const raw = JSON.parse(readFileSync(join(ANALYSIS_DIR, f), "utf-8"));
        const idMatch = f.match(/activity_(\d+)_/);
        if (!idMatch) continue;
        const id = idMatch[1];
        const sc = raw.summary_card ?? {};
        const hr = raw.heart_rate?.stats ?? {};
        const tm = raw.training_metrics ?? null;
        const re = raw.relative_effort ?? null;
        const po = raw.pogacar_score ?? raw.kipchoge_score ?? null;
        const cl = raw.climbing ?? null;
        const pa = raw.pacing ?? null;
        const tz = raw.training_zones ?? null;
        const seg = raw.segments_summary ?? null;
        const vm = raw.vo2max ?? null;
        const pw = raw.power ?? null;
        const met = raw.meteorology?.at_start ?? null;
        detailMap[id] = {
          name: sc.name ?? f,
          type: sc.type ?? "Unknown",
          date: sc.date ?? "",
          moving_time: sc.moving_time ?? "",
          distance: sc.distance ?? "",
          avg_speed: sc.avg_speed ?? null,
          avg_pace: sc.avg_pace ?? null,
          elevation: sc.elevation ?? null,
          avg_hr: sc.avg_hr ?? null,
          avg_power: sc.avg_power ?? null,
          cadence: sc.cadence ?? null,
          calories: sc.calories ?? null,
          gear: sc.gear ?? null,
          device: sc.device ?? null,
          hr_avg: hr.avg ?? null,
          hr_max: hr.max ?? null,
          hr_median: hr.median ?? null,
          pacing_type: pa?.type ?? null,
          pacing_first_half_speed: pa?.first_half?.avg_speed_kmh ?? null,
          pacing_second_half_speed: pa?.second_half?.avg_speed_kmh ?? null,
          tss: tm?.tss ?? null,
          tss_label: tm?.tss_label ?? null,
          if_val: tm?.intensity_factor ?? null,
          if_label: tm?.intensity_factor_label ?? null,
          ef: tm?.efficiency_factor ?? null,
          trimp: re?.score ?? null,
          trimp_label: re?.interpretation ?? null,
          score_pct: po?.composite_pct ?? null,
          score_ref: po?.reference ?? null,
          score_type: raw.pogacar_score ? "Pogačar" : (raw.kipchoge_score ? "Kipchoge" : null),
          ascent_m: cl?.total_ascent_m ?? null,
          descent_m: cl?.total_descent_m ?? null,
          hr_zones: tz?.hr_zones?.zones ?? null,
          pr_count: seg?.pr_count ?? null,
          vo2max: vm?.value ?? null,
          np: pw?.normalized_power ?? null,
          temp_c: met?.temperature_c ?? null,
          wind_kmh: met?.windspeed_kmh ?? null,
        };
      } catch { /* skip corrupt */ }
    }
  } catch { /* ignore */ }

  const tgtKm    = process.env["WEEKLY_TARGET_KM"]    ? parseFloat(process.env["WEEKLY_TARGET_KM"])    : null;
  const tgtHours = process.env["WEEKLY_TARGET_HOURS"] ? parseFloat(process.env["WEEKLY_TARGET_HOURS"]) : null;

  // Wellness data (Garmin or Samsung)
  const garminPath = join(ANALYSIS_DIR, "garmin_wellness.json");
  const samsungPath = join(ANALYSIS_DIR, "samsung_wellness.json");
  const wellnessPath = existsSync(garminPath) ? garminPath : existsSync(samsungPath) ? samsungPath : null;
  let wellnessRaw: Record<string, any> = {};
  if (wellnessPath) {
    try { wellnessRaw = JSON.parse(readFileSync(wellnessPath, "utf-8")); } catch { /* ignore */ }
  }
  const hasWellness = Object.keys(wellnessRaw).length > 0;

  const COLORS: Record<string, string> = {
    Run: "#e74c3c", Ride: "#3498db", Walk: "#2ecc71", Swim: "#1abc9c",
    Surf: "#9b59b6", Strength: "#f39c12", InlineSkate: "#1dd0d0",
  };

  const wellnessSection = hasWellness ? `
    <div class="section" id="wellnessSection">
      <h2>🛌 Garmin Wellness</h2>
      <div class="charts-col">
        <div class="chart-box-wide"><canvas id="sleepChart"></canvas></div>
        <div class="chart-box-wide"><canvas id="sleepStagesChart"></canvas></div>
        <div class="chart-box-wide"><canvas id="bbChart"></canvas></div>
        <div class="chart-box-wide"><canvas id="bbFlowChart"></canvas></div>
        <div class="chart-box-wide"><canvas id="hrvChart"></canvas></div>
        <div class="chart-box-wide"><canvas id="readinessChart"></canvas></div>
        <div class="chart-box-wide"><canvas id="restingHrChart"></canvas></div>
        <div class="chart-box-wide"><canvas id="stressChart"></canvas></div>
        <div class="chart-box-wide"><canvas id="stepsChart"></canvas></div>
        <div class="chart-box-wide"><canvas id="spo2Chart"></canvas></div>
      </div>
    </div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Strava Analytics Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3/dist/chartjs-adapter-date-fns.bundle.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e0e0e0; padding: 24px; }
  h1 { font-size: 1.8rem; margin-bottom: 4px; }
  .subtitle { color: #888; margin-bottom: 20px; }
  .period-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 28px; align-items: center; }
  .period-bar span { color: #666; font-size: 0.85rem; margin-right: 4px; }
  .period-btn { background: #1c1f2e; border: 1px solid #2a2e3f; color: #aaa; border-radius: 8px; padding: 6px 16px; cursor: pointer; font-size: 0.85rem; transition: all 0.15s; }
  .period-btn:hover { border-color: #3498db; color: #fff; }
  .period-btn.active { background: #3498db; border-color: #3498db; color: #fff; font-weight: 600; }
  .stats-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 32px; }
  .stat-card { background: #1c1f2e; border-radius: 12px; padding: 20px 24px; flex: 1; min-width: 140px; }
  .stat-card .val { font-size: 2rem; font-weight: bold; color: #fff; transition: opacity 0.2s; }
  .stat-card .lbl { color: #888; font-size: 0.85rem; margin-top: 4px; }
  .section { margin-bottom: 48px; }
  .section h2 { font-size: 1.2rem; margin-bottom: 16px; color: #aaa; }
  .charts-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; }
  .chart-box { background: #1c1f2e; border-radius: 12px; padding: 20px; }
  .chart-box canvas { max-height: 260px; }
  .chart-box-wide { background: #1c1f2e; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .chart-box-wide canvas { max-height: 200px; width: 100% !important; }
  .charts-col { display: flex; flex-direction: column; gap: 0; }
  .explain-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; margin-top: 10px; }
  .explain-card { background: #161925; border: 1px solid #2a2e3f; border-radius: 10px; padding: 10px 12px; }
  .explain-card .k { color: #777; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
  .explain-card .v { color: #e0e0e0; font-size: 0.95rem; font-weight: 600; }
  .explain-list { margin-top: 10px; color: #bbb; font-size: 0.9rem; }
  .explain-list li { margin: 4px 0; }
  @media (max-width: 600px) { .charts-row { grid-template-columns: 1fr; } .stat-card .val { font-size: 1.5rem; } }

  /* ── Activity detail modal ── */
  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 1000; align-items: center; justify-content: center; }
  .modal-overlay.open { display: flex; }
  .modal { background: #161925; border: 1px solid #2a2e3f; border-radius: 16px; width: min(720px, 96vw); max-height: 90vh; overflow-y: auto; padding: 28px 32px; position: relative; animation: slideUp 0.2s ease; }
  @keyframes slideUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .modal-close { position: absolute; top: 16px; right: 20px; background: none; border: none; color: #888; font-size: 1.4rem; cursor: pointer; line-height: 1; }
  .modal-close:hover { color: #fff; }
  .modal-title { font-size: 1.35rem; font-weight: 700; margin-bottom: 4px; padding-right: 32px; }
  .modal-meta { color: #666; font-size: 0.85rem; margin-bottom: 20px; }
  .modal-score { background: linear-gradient(135deg, #1c1f2e, #252a40); border-radius: 12px; padding: 16px 20px; margin-bottom: 20px; display: flex; align-items: center; gap: 20px; }
  .modal-score .big { font-size: 2.8rem; font-weight: 900; color: #3498db; line-height: 1; }
  .modal-score .score-lbl { color: #aaa; font-size: 0.85rem; margin-top: 2px; }
  .modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  @media (max-width: 520px) { .modal-grid { grid-template-columns: 1fr; } }
  .modal-kv { background: #1c1f2e; border-radius: 8px; padding: 10px 14px; }
  .modal-kv .k { color: #666; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
  .modal-kv .v { font-size: 1.05rem; font-weight: 600; color: #e0e0e0; }
  .modal-section-title { color: #555; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; margin: 16px 0 8px; }
  .zone-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; font-size: 0.85rem; }
  .zone-row .zlbl { width: 80px; color: #aaa; flex-shrink: 0; }
  .zone-bar-wrap { flex: 1; background: #1c1f2e; border-radius: 4px; height: 10px; overflow: hidden; }
  .zone-bar { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .zone-row .zpct { width: 36px; text-align: right; color: #888; }
  .pacing-row { display: flex; gap: 10px; }
  .pacing-half { flex: 1; background: #1c1f2e; border-radius: 8px; padding: 10px 14px; text-align: center; }
  .pacing-half .ph-lbl { color: #666; font-size: 0.75rem; text-transform: uppercase; }
  .pacing-half .ph-val { font-size: 1.1rem; font-weight: 700; margin-top: 4px; }
</style>
</head>
<body>

<!-- Activity Detail Modal -->
<div class="modal-overlay" id="activityModal">
  <div class="modal" id="modalContent">
    <button class="modal-close" id="modalClose">✕</button>
    <div id="modalBody"></div>
  </div>
</div>

<h1>🚴 Strava Analytics Dashboard</h1>
<p class="subtitle">Generated ${new Date().toLocaleString()} · ${sorted.length} activities · ${sorted[0].date} → ${sorted[sorted.length - 1].date}</p>

<div class="period-bar">
  <span>Period:</span>
  <button class="period-btn" data-days="7">Last week</button>
  <button class="period-btn" data-days="14">2 weeks</button>
  <button class="period-btn" data-days="28">4 weeks</button>
  <button class="period-btn" data-days="56">8 weeks</button>
  <button class="period-btn" data-days="90">3 months</button>
  <button class="period-btn" data-days="180">6 months</button>
  <button class="period-btn" data-days="365">1 year</button>
  <button class="period-btn active" data-days="0">All time</button>
</div>

<div class="stats-row">
  <div class="stat-card"><div class="val" id="statActs">—</div><div class="lbl">Activities</div></div>
  <div class="stat-card"><div class="val" id="statDist">—</div><div class="lbl">Distance (km)</div></div>
  <div class="stat-card"><div class="val" id="statTime">—</div><div class="lbl">Moving Time (h)</div></div>
  <div class="stat-card"><div class="val" id="statElev">—</div><div class="lbl">Elevation (m)</div></div>
  <div class="stat-card"><div class="val" id="statLoad">—</div><div class="lbl">Total Load (TRIMP)</div></div>
  <div class="stat-card"><div class="val" id="statWeeks">—</div><div class="lbl">Weeks</div></div>
</div>

<div class="section">
  <h2>🧠 Recommendation Explainability</h2>
  <div class="chart-box"><div id="recExplain" style="color:#888;">No recommendation data for this period.</div></div>
</div>
${recTrend ? `
<div class="section">
  <h2>📊 Recommendation Trend (28d)</h2>
  <div class="chart-box"><div id="recTrend" style="color:#888;">Loading trend...</div></div>
</div>
` : ''}

<div class="section">
  <h2>📏 Weekly Volume & Load</h2>
  <div class="charts-row">
    <div class="chart-box"><canvas id="weekDistChart"></canvas></div>
    <div class="chart-box"><canvas id="weekLoadChart"></canvas></div>
    <div class="chart-box"><canvas id="weekTimeChart"></canvas></div>
    <div class="chart-box"><canvas id="weekElevChart"></canvas></div>
  </div>
</div>

<div class="section">
  <h2>⚖️ Fitness / Fatigue / Form (CTL/ATL/TSB)</h2>
  <div class="charts-row">
    <div class="chart-box" style="grid-column: 1 / -1;"><canvas id="loadModelChart" style="max-height:300px;"></canvas></div>
  </div>
</div>

<div class="section">
  <h2>❤️ Heart Rate Zone Distribution (weekly avg)</h2>
  <div class="charts-row">
    <div class="chart-box" style="grid-column: 1 / -1;"><canvas id="zoneChart" style="max-height:300px;"></canvas></div>
  </div>
</div>

<div class="section">
  <h2>🧭 Training Zones Progression (monthly)</h2>
  <div class="charts-row">
    <div class="chart-box" style="grid-column: 1 / -1;"><canvas id="zoneProgressChart" style="max-height:300px;"></canvas></div>
  </div>
</div>

<div class="section">
  <h2>📈 Performance Trends</h2>
  <div class="charts-row">
    <div class="chart-box"><canvas id="hrTrendChart"></canvas></div>
    <div class="chart-box"><canvas id="vo2Chart"></canvas></div>
    <div class="chart-box"><canvas id="paceChart"></canvas></div>
    <div class="chart-box"><canvas id="powerChart"></canvas></div>
  </div>
</div>

<div class="section">
  <h2>🏃 Activity Log — <small style="color:#666;font-weight:400;">click any dot to view details</small></h2>
  <div class="chart-box" style="max-width:100%;"><canvas id="scatterChart" style="max-height:320px; cursor:pointer;"></canvas></div>
</div>

${wellnessSection}

<script>
// ── Embedded data ─────────────────────────────────────────────────
const ALL_ACTS = ${toJs(sorted.map(a => ({
  id: (() => { const m = a.id; return m; })(),
  date: a.date, week: a.week, sport: a.sport, name: a.name,
  dist: a.distance_km, timeSec: a.moving_time_sec, elev: a.elevation_m,
  avgHr: a.avg_hr, trimp: a.trimp, tss: a.tss, vo2: a.vo2max,
  pace: a.pace_sec_per_km, power: a.normalized_power ?? a.avg_power_w,
  zones: a.hr_zone_pct,
  zoneSec: a.hr_zone_sec,
  rec: recommendationByDate.get(a.date) ?? null,
}))
)};

const DETAIL = ${toJs(detailMap)};
const MODEL_SERIES = ${toJs(modelSeries)};
const WELLNESS = ${toJs(wellnessRaw)};
const TGT_KM    = ${tgtKm ?? 'null'};
const TGT_HOURS = ${tgtHours ?? 'null'};
const COLORS = ${toJs(COLORS)};
const CAUSE_META = ${toJs(CAUSE_CODE_META)};
const sportColor = s => COLORS[s] || '#95a5a6';

// ── Helpers ───────────────────────────────────────────────────────
function r2(v) { return v != null ? Math.round(v * 100) / 100 : null; }
function fmtPace(s) { return Math.floor(s/60)+':'+(String(Math.round(s%60)).padStart(2,'0')); }
function fmtTime(s) { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60; return h>0?h+'h '+m+'m':m+'m '+sec+'s'; }
function esc(v){return String(v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));}

/** Rolling average dataset — takes array of {x,y} points, returns smoothed dataset config */
function rollingAvg(data, window, color, label) {
  const smoothed = data.map((p, i) => {
    const slice = data.slice(Math.max(0, i - window + 1), i + 1).filter(d => d.y != null);
    if (slice.length === 0) return { x: p.x, y: null };
    return { x: p.x, y: Math.round(slice.reduce((s, d) => s + d.y, 0) / slice.length * 10) / 10 };
  });
  return { label: label || (window+'d avg'), data: smoothed, borderColor: color, borderWidth: 2,
    borderDash: [5,3], pointRadius: 0, fill: false, tension: 0.4, order: -1 };
}

// ── Activity Detail Modal ─────────────────────────────────────────
const ZONE_COLORS = ['#2ecc71','#3498db','#f39c12','#e67e22','#e74c3c'];
const ZONE_NAMES  = ['Z1 Recovery','Z2 Endurance','Z3 Tempo','Z4 Threshold','Z5 VO2max'];

function openModal(actId) {
  const d = DETAIL[actId];
  if (!d) return;

  const kv = (label, val) => val != null && val !== '' ?
    \`<div class="modal-kv"><div class="k">\${label}</div><div class="v">\${val}</div></div>\` : '';

  const sportEmoji = { Run:'🏃', Ride:'🚴', Walk:'🚶', Swim:'🏊', Surf:'🏄', Strength:'🏋️', VirtualRide:'🚴', TrailRun:'🏃', GravelRide:'🚴', InlineSkate:'⛸️' };
  const emoji = sportEmoji[d.type] || '🏃';

  // Score block
  let scoreHtml = '';
  if (d.score_pct != null) {
    scoreHtml = \`<div class="modal-score">
      <div><div class="big">\${Math.round(d.score_pct)}%</div><div class="score-lbl">of \${d.score_type || ''} · \${d.score_ref || ''}</div></div>
    </div>\`;
  }

  // HR zone bars
  let zonesHtml = '';
  if (d.hr_zones && d.hr_zones.length > 0) {
    zonesHtml = '<div class="modal-section-title">❤️ HR Zones</div>';
    d.hr_zones.forEach((z, i) => {
      const pct = z.pct ?? 0;
      zonesHtml += \`<div class="zone-row">
        <div class="zlbl">\${ZONE_NAMES[i]||'Z'+(i+1)}</div>
        <div class="zone-bar-wrap"><div class="zone-bar" style="width:\${pct}%;background:\${ZONE_COLORS[i]}"></div></div>
        <div class="zpct">\${pct}%</div>
      </div>\`;
    });
  }

  // Pacing split
  let pacingHtml = '';
  if (d.pacing_type) {
    pacingHtml = \`<div class="modal-section-title">📉 Pacing — \${d.pacing_type}</div>\`;
    if (d.pacing_first_half_speed != null || d.pacing_second_half_speed != null) {
      pacingHtml += \`<div class="pacing-row">
        <div class="pacing-half"><div class="ph-lbl">First half</div><div class="ph-val">\${d.pacing_first_half_speed ? d.pacing_first_half_speed+' km/h' : '—'}</div></div>
        <div class="pacing-half"><div class="ph-lbl">Second half</div><div class="ph-val">\${d.pacing_second_half_speed ? d.pacing_second_half_speed+' km/h' : '—'}</div></div>
      </div>\`;
    }
  }

  const html = \`
    <div class="modal-title">\${emoji} \${d.name}</div>
    <div class="modal-meta">\${d.type} · \${d.date}\${d.device ? ' · '+d.device : ''}\${d.gear ? ' · '+d.gear : ''}</div>
    \${scoreHtml}
    <div class="modal-section-title">📊 Summary</div>
    <div class="modal-grid">
      \${kv('Distance', d.distance)}
      \${kv('Moving Time', d.moving_time)}
      \${kv('Elevation', d.elevation)}
      \${kv(d.avg_speed ? 'Avg Speed' : 'Avg Pace', d.avg_speed || d.avg_pace)}
      \${kv('Avg HR', d.avg_hr)}
      \${kv('Max HR', d.hr_max != null ? d.hr_max+' bpm' : null)}
      \${kv('Avg Power', d.avg_power)}
      \${kv('Norm Power', d.np != null ? d.np+' W' : null)}
      \${kv('Cadence', d.cadence)}
      \${kv('Calories', d.calories)}
      \${kv('Ascent', d.ascent_m != null ? d.ascent_m+' m' : null)}
      \${kv('Descent', d.descent_m != null ? d.descent_m+' m' : null)}
      \${kv('VO2max est.', d.vo2max != null ? d.vo2max+' mL/kg/min' : null)}
      \${kv('Segment PRs', d.pr_count != null ? '🏅 '+d.pr_count+' PRs' : null)}
      \${kv('Temperature', d.temp_c != null ? d.temp_c+'°C' : null)}
      \${kv('Wind', d.wind_kmh != null ? d.wind_kmh+' km/h' : null)}
    </div>
    \${d.tss != null || d.trimp != null ? \`
    <div class="modal-section-title">⚙️ Training Load</div>
    <div class="modal-grid">
      \${kv('TSS', d.tss != null ? d.tss+' — '+(d.tss_label||'') : null)}
      \${kv('IF', d.if_val != null ? d.if_val+' — '+(d.if_label||'') : null)}
      \${kv('TRIMP', d.trimp != null ? d.trimp+' ('+d.trimp_label+')' : null)}
      \${kv('Efficiency Factor', d.ef != null ? d.ef : null)}
    </div>\` : ''}
    \${pacingHtml}
    \${zonesHtml}
  \`;

  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('activityModal').classList.add('open');
}

document.getElementById('modalClose').addEventListener('click', () => {
  document.getElementById('activityModal').classList.remove('open');
});
document.getElementById('activityModal').addEventListener('click', e => {
  if (e.target === document.getElementById('activityModal'))
    document.getElementById('activityModal').classList.remove('open');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('activityModal').classList.remove('open');
});

// ── Helpers ───────────────────────────────────────────────────────
function filterActs(days) {
  if (!days) return ALL_ACTS;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  const from = cutoff.toISOString().slice(0,10);
  return ALL_ACTS.filter(a => a.date >= from);
}

function buildWeekMap(acts) {
  const m = {};
  for (const a of acts) {
    if (!m[a.week]) m[a.week] = { dist:0, timeSec:0, trimp:0, tss:0, acts:0, elev:0, zoneSec:{} };
    const w = m[a.week];
    w.dist += a.dist; w.timeSec += a.timeSec; w.trimp += a.trimp||0;
    w.tss += a.tss||0; w.acts++; w.elev += a.elev;
    // Accumulate actual zone seconds (time-weighted, not averaged percentages)
    if (a.zoneSec) {
      for (const z of ['z1','z2','z3','z4','z5']) {
        w.zoneSec[z] = (w.zoneSec[z]||0) + (a.zoneSec[z]||0);
      }
    }
  }
  return Object.entries(m).sort(([a],[b]) => a.localeCompare(b));
}

function buildMonthMap(acts) {
  const m = {};
  for (const a of acts) {
    const month = String(a.date).slice(0, 7);
    if (!m[month]) m[month] = { zoneSec: {}, acts: 0 };
    m[month].acts++;
    if (a.zoneSec) {
      for (const z of ['z1','z2','z3','z4','z5']) {
        m[month].zoneSec[z] = (m[month].zoneSec[z] || 0) + (a.zoneSec[z] || 0);
      }
    }
  }
  return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
}

function explainHint(rec) {
  if (!rec) return 'No recommendation available.';
  if (rec.state === 'fatigued') return 'To move up: raise readiness/sleep and reduce short-term load spike.';
  if (rec.state === 'cautious') return 'To move up: improve recovery signals and keep next 24-48h easy.';
  if (rec.state === 'balanced') return 'To move up: maintain stable recovery and nudge freshness slightly positive.';
  return 'To stay fresh: protect sleep/HRV and avoid stacking hard days.';
}

function renderExplainability(acts) {
  const el = document.getElementById('recExplain');
  if (!el) return;
  if (!acts.length) { el.innerHTML = '<span style="color:#888;">No activities in selected period.</span>'; return; }
  const latest = acts.slice().sort((a,b)=>a.date.localeCompare(b.date))[acts.length - 1];
  const rec = latest?.rec;
  if (!rec) { el.innerHTML = '<span style="color:#888;">No recommendation data for latest activity in this period.</span>'; return; }

  const causes = (rec.cause_codes || []).slice(0, 8)
    .map(function (code) {
      const meta = CAUSE_META[code] || { rank: 99, label: code, description: 'No description available' };
      return { code: code, rank: meta.rank, label: meta.label, text: meta.description };
    })
    .sort(function (a, b) { return a.rank - b.rank; });
  const drivers = (rec.changes?.drivers || []).slice(0, 3).map(function (d) {
    const sign = d.delta > 0 ? '+' : '';
    return esc(d.key) + ': ' + sign + d.delta + (d.unit ? ' ' + esc(d.unit) : '');
  });
  const quality = rec.quality_flags || [];
  const f = rec.confidence_factors || {};
  const eta = rec.recovery_eta_hours != null ? (function() {
    const d = Math.floor(rec.recovery_eta_hours / 24);
    const h = Math.round((rec.recovery_eta_hours % 24) * 10) / 10;
    return d > 0 ? d + 'd ' + h + 'h' : h + 'h';
  })() : null;

  const cards =
    '<div class="explain-grid">'
    + '<div class="explain-card"><div class="k">State</div><div class="v">' + esc(rec.state.toUpperCase()) + '</div></div>'
    + '<div class="explain-card"><div class="k">Session</div><div class="v">' + esc(rec.session_type.toUpperCase()) + '</div></div>'
    + '<div class="explain-card"><div class="k">Confidence</div><div class="v">' + esc(rec.confidence.toUpperCase()) + '</div></div>'
    + '<div class="explain-card"><div class="k">Coverage / Agreement / Stability</div><div class="v">'
    + (f.coverage ?? '—') + ' / ' + (f.agreement ?? '—') + ' / ' + (f.stability ?? '—')
    + '</div></div>'
    + (eta ? '<div class="explain-card"><div class="k">Recovery ETA</div><div class="v">~' + eta + '</div></div>' : '')
    + '</div>';
  const causesHtml = causes.length
    ? '<ul class="explain-list"><li><b>Driver ranking (strongest to weakest):</b></li>'
      + causes.map(function (c, idx) {
        return '<li>#' + (idx + 1) + ' ' + esc(c.label) + ' - ' + esc(c.text) + ' <span style="color:#666;">(' + esc(c.code) + ')</span></li>';
      }).join('')
      + '</ul>'
    : '';
  const driversHtml = drivers.length
    ? '<ul class="explain-list">' + drivers.map(function (d) { return '<li>' + d + '</li>'; }).join('') + '</ul>'
    : '<div class="explain-list">No major day-over-day drivers.</div>';
  const qualityHtml = quality.length
    ? '<ul class="explain-list"><li><b>Data quality flags:</b> ' + quality.map(esc).join(', ') + '</li></ul>'
    : '';
  const hintHtml = '<div class="explain-list"><b>What would change state:</b> ' + esc(explainHint(rec)) + '</div>';
  el.innerHTML = cards + causesHtml + driversHtml + qualityHtml + hintHtml;
}

// ── Chart registry ────────────────────────────────────────────────
const charts = {};
function upsert(id, type, data, options) {
  if (charts[id]) { charts[id].data = data; charts[id].options = options; charts[id].update('none'); }
  else { const el = document.getElementById(id); if (!el) return; charts[id] = new Chart(el, { type, data, options }); }
}

const gridColor = '#2a2e3f', tickColor = '#888';
const base = { responsive:true, maintainAspectRatio:true, plugins:{ legend:{ labels:{ color:'#ccc' } }, title:{ color:'#ccc', display:true } } };
const timeX   = { type:'time', time:{ unit:'week' }, ticks:{ color:tickColor }, grid:{ color:gridColor } };
const catX    = { ticks:{ color:tickColor, maxRotation:45 }, grid:{ color:gridColor } };
const yAxis   = { ticks:{ color:tickColor }, grid:{ color:gridColor } };
const yStacked= { stacked:true, ticks:{ color:tickColor }, grid:{ color:gridColor } };

// ── Main render ───────────────────────────────────────────────────
function render(days) {
  const acts = filterActs(days);
  if (!acts.length) return;

  const totalDist = r2(acts.reduce((s,a)=>s+a.dist,0));
  const totalTime = r2(acts.reduce((s,a)=>s+a.timeSec,0)/3600);
  const totalElev = Math.round(acts.reduce((s,a)=>s+a.elev,0));
  const totalLoad = Math.round(acts.reduce((s,a)=>s+(a.trimp||a.tss||0),0));
  const weekMap   = buildWeekMap(acts);
  const monthMap  = buildMonthMap(acts);
  const cutoffDate = days ? (()=>{ const d=new Date(); d.setDate(d.getDate()-days); return d.toISOString().slice(0,10); })() : null;
  const modelPts = cutoffDate ? MODEL_SERIES.filter(p => p.date >= cutoffDate) : MODEL_SERIES;
  document.getElementById('statActs').textContent  = acts.length;
  document.getElementById('statDist').textContent  = totalDist?.toLocaleString();
  document.getElementById('statTime').textContent  = totalTime?.toLocaleString();
  document.getElementById('statElev').textContent  = totalElev?.toLocaleString();
  document.getElementById('statLoad').textContent  = totalLoad?.toLocaleString();
  document.getElementById('statWeeks').textContent = weekMap.length;
  renderExplainability(acts);

  const wLabels = weekMap.map(([w])=>w);
  const wDist   = weekMap.map(([,d])=>r2(d.dist));
  const wLoad   = weekMap.map(([,d])=>Math.round(d.trimp>0?d.trimp:d.tss));
  const wTime   = weekMap.map(([,d])=>r2(d.timeSec/3600));
  const wElev   = weekMap.map(([,d])=>Math.round(d.elev));
  const tgtKmDs  = TGT_KM    ? [{ label:'Target (km)', data:wLabels.map(w=>({x:w,y:TGT_KM})),    type:'line', borderColor:'#e74c3c', borderDash:[6,3], pointRadius:0, fill:false }] : [];
  const tgtHrDs  = TGT_HOURS ? [{ label:'Target (h)',  data:wLabels.map(w=>({x:w,y:TGT_HOURS})), type:'line', borderColor:'#e74c3c', borderDash:[6,3], pointRadius:0, fill:false }] : [];

  upsert('weekDistChart','bar',{ labels:wLabels, datasets:[{ label:'Distance (km)', data:wDist, backgroundColor:'#3498db' }, ...tgtKmDs] },{ ...base, plugins:{...base.plugins,title:{display:true,text:'Weekly Distance (km)',color:'#ccc'}}, scales:{x:catX,y:yAxis} });
  upsert('weekLoadChart','bar',{ labels:wLabels, datasets:[{ label:'Load (TRIMP/TSS)', data:wLoad, backgroundColor:'#e74c3c' }] },{ ...base, plugins:{...base.plugins,title:{display:true,text:'Weekly Training Load',color:'#ccc'}}, scales:{x:catX,y:yAxis} });
  upsert('weekTimeChart','bar',{ labels:wLabels, datasets:[{ label:'Time (h)', data:wTime, backgroundColor:'#2ecc71' }, ...tgtHrDs] },{ ...base, plugins:{...base.plugins,title:{display:true,text:'Weekly Moving Time (h)',color:'#ccc'}}, scales:{x:catX,y:yAxis} });
  upsert('weekElevChart','bar',{ labels:wLabels, datasets:[{ label:'Elevation (m)', data:wElev, backgroundColor:'#f39c12' }] },{ ...base, plugins:{...base.plugins,title:{display:true,text:'Weekly Elevation (m)',color:'#ccc'}}, scales:{x:catX,y:yAxis} });

  upsert('loadModelChart','line',{
    datasets:[
      { label:'CTL (Fitness)', data:modelPts.map(p=>({x:p.date,y:p.ctl})), borderColor:'#3498db', backgroundColor:'rgba(52,152,219,0.1)', pointRadius:0, tension:0.25, fill:false },
      { label:'ATL (Fatigue)', data:modelPts.map(p=>({x:p.date,y:p.atl})), borderColor:'#e74c3c', backgroundColor:'rgba(231,76,60,0.1)', pointRadius:0, tension:0.25, fill:false },
      { label:'TSB (Form)', data:modelPts.map(p=>({x:p.date,y:p.tsb})), borderColor:'#2ecc71', backgroundColor:'rgba(46,204,113,0.08)', pointRadius:0, tension:0.25, fill:false },
    ]
  },{
    ...base,
    plugins:{...base.plugins,title:{display:true,text:'Banister model (EWMA): CTL 42d, ATL 7d, TSB = CTL - ATL',color:'#ccc'}},
    scales:{x:timeX,y:yAxis}
  });

  const zoneColors= ['#2ecc71','#3498db','#f39c12','#e67e22','#e74c3c'];
  // Time-weighted zone %: sum zone seconds per week, divide by total zone seconds → each week = 100%
  const zoneWeeks = weekMap.filter(([,d]) => Object.values(d.zoneSec).some(v => v > 0));
  const zoneLabels = zoneWeeks.map(([w])=>w);
  const zonePctData = [1,2,3,4,5].map((n,i) => ({
    label: ['Z1 Recovery','Z2 Endurance','Z3 Tempo','Z4 Threshold','Z5 VO2max'][i],
    data: zoneWeeks.map(([,d]) => {
      const total = ['z1','z2','z3','z4','z5'].reduce((s,z) => s+(d.zoneSec[z]||0), 0);
      return total > 0 ? Math.round((d.zoneSec['z'+n]||0) / total * 1000) / 10 : 0;
    }),
    backgroundColor: zoneColors[i],
  }));
  upsert('zoneChart','bar',{ labels:zoneLabels, datasets:zonePctData },{
    ...base,
    plugins:{...base.plugins,
      title:{display:true,text:'HR Zone Distribution % — time-weighted, each week = 100%',color:'#ccc'},
      tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+ctx.parsed.y+'%'}}
    },
    scales:{x:{...catX,stacked:true},y:{...yStacked,max:100,ticks:{...yAxis.ticks,callback:v=>v+'%'}}}
  });

  const monthLabels = monthMap.map(([m]) => m);
  const monthZones = [1,2,3,4,5].map((n, i) => ({
    label: ['Z1 Recovery','Z2 Endurance','Z3 Tempo','Z4 Threshold','Z5 VO2max'][i],
    data: monthMap.map(([, d]) => {
      const total = ['z1','z2','z3','z4','z5'].reduce((s, z) => s + (d.zoneSec[z] || 0), 0);
      return total > 0 ? Math.round((d.zoneSec['z' + n] || 0) / total * 1000) / 10 : 0;
    }),
    backgroundColor: zoneColors[i],
  }));

  upsert('zoneProgressChart', 'bar', { labels: monthLabels, datasets: monthZones }, {
    ...base,
    plugins: {
      ...base.plugins,
      title: { display: true, text: 'Monthly HR Zone progression (% of in-zone time)', color: '#ccc' },
      tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y + '%' } },
    },
    scales: { x: { ...catX, stacked: true }, y: { ...yStacked, max: 100, ticks: { ...yAxis.ticks, callback: v => v + '%' } } },
  });

  const hrData = acts.filter(a=>a.avgHr).map(a=>({ x:a.date, y:a.avgHr, name:a.name, id:a.id }));
  upsert('hrTrendChart','scatter',{ datasets:[{ label:'Avg HR (bpm)', data:hrData, backgroundColor:'#e74c3c', pointRadius:4 }] },{ ...base, plugins:{...base.plugins,title:{display:true,text:'Average HR per Activity',color:'#ccc'}}, scales:{x:timeX,y:yAxis} });

  const vo2Data = acts.filter(a=>a.vo2).map(a=>({ x:a.date, y:a.vo2, id:a.id }));
  upsert('vo2Chart','line',{ datasets:vo2Data.length>1?[{ label:'VO2max', data:vo2Data, borderColor:'#9b59b6', backgroundColor:'rgba(155,89,182,0.1)', fill:true, tension:0.4, pointRadius:3 }]:[] },{ ...base, plugins:{...base.plugins,title:{display:true,text:'VO2max Estimate',color:'#ccc'}}, scales:{x:timeX,y:yAxis} });

  const paceData = acts.filter(a=>a.sport==='Run'&&a.pace).map(a=>({ x:a.date, y:a.pace, name:a.name, id:a.id }));
  upsert('paceChart','scatter',{ datasets:paceData.length>1?[{ label:'Pace (sec/km)', data:paceData, backgroundColor:'#e74c3c', pointRadius:4 }]:[] },{ ...base, plugins:{...base.plugins,title:{display:true,text:'Running Pace (lower = faster)',color:'#ccc'}, tooltip:{callbacks:{label:ctx=>ctx.raw.name+': '+fmtPace(ctx.raw.y)+'/km'}}}, scales:{x:timeX,y:{reverse:true,ticks:{color:tickColor,callback:v=>fmtPace(v)},grid:{color:gridColor}}} });

  const powerData = acts.filter(a=>a.sport==='Ride'&&a.power).map(a=>({ x:a.date, y:a.power, name:a.name, id:a.id }));
  upsert('powerChart','scatter',{ datasets:powerData.length>1?[{ label:'NP/Power (W)', data:powerData, backgroundColor:'#3498db', pointRadius:4 }]:[] },{ ...base, plugins:{...base.plugins,title:{display:true,text:'Cycling Power (W)',color:'#ccc'}}, scales:{x:timeX,y:yAxis} });

  // Activity scatter — clickable dots
  const sports = [...new Set(acts.map(a=>a.sport))];
  const scatterDs = sports.map(sp => ({
    label: sp,
    data: acts.filter(a=>a.sport===sp).map(a=>({ x:a.date, y:a.dist, name:a.name, id:a.id })),
    backgroundColor: sportColor(sp), pointRadius:6, pointHoverRadius:9,
  }));
  upsert('scatterChart','scatter',{ datasets:scatterDs },{
    ...base,
    plugins:{...base.plugins,
      title:{display:true,text:'All Activities — click a dot to view details',color:'#ccc'},
      tooltip:{callbacks:{label:ctx=>(ctx.raw.name||ctx.dataset.label)+': '+ctx.raw.y+' km'}}
    },
    scales:{x:timeX,y:yAxis},
    onClick: (evt, elements) => {
      if (!elements.length) return;
      const pt = elements[0];
      const actId = charts['scatterChart'].data.datasets[pt.datasetIndex].data[pt.index].id;
      if (actId) openModal(String(actId));
    },
    onHover: (evt) => { const el = charts['scatterChart']?.getElementsAtEventForMode(evt,'nearest',{intersect:true},false); evt.native.target.style.cursor = el.length ? 'pointer' : 'default'; },
  });

  // Wellness charts
  if (Object.keys(WELLNESS).length) {
    const wDates = Object.keys(WELLNESS).sort();
    const wellnessCutoff = cutoffDate ?? wDates[0];
    const filtW  = wDates.filter(d=>d>=wellnessCutoff);
    const W = 7; // rolling window
    const wOpts = (title, extraScales) => ({ ...base, plugins:{...base.plugins,title:{display:true,text:title,color:'#ccc'}}, scales:{x:timeX,y:yAxis,...(extraScales||{})} });

    if (document.getElementById('sleepChart')) {
      // Sleep score + 7d rolling avg
      const sleepPts = filtW.map(d=>({x:d,y:WELLNESS[d].sleep_score})).filter(p=>p.y!=null);
      upsert('sleepChart','line',{ datasets:[
        { label:'Sleep Score', data:sleepPts, borderColor:'#3498db', backgroundColor:'rgba(52,152,219,0.15)', fill:true, tension:0.3, pointRadius:3 },
        rollingAvg(sleepPts, W, '#85c1e9', '7d avg'),
      ]}, wOpts('😴 Sleep Score /100'));

      // Sleep stages stacked bars
      const toH = s => s ? Math.round(s/360)/10 : 0;
      upsert('sleepStagesChart','bar',{
        datasets:[
          { label:'Deep',   data:filtW.map(d=>({x:d,y:toH(WELLNESS[d].sleep_deep_sec)})),  backgroundColor:'#1a6fa0', stack:'s' },
          { label:'REM',    data:filtW.map(d=>({x:d,y:toH(WELLNESS[d].sleep_rem_sec)})),   backgroundColor:'#9b59b6', stack:'s' },
          { label:'Light',  data:filtW.map(d=>({x:d,y:toH(WELLNESS[d].sleep_light_sec)})), backgroundColor:'#5dade2', stack:'s' },
          { label:'Awake',  data:filtW.map(d=>({x:d,y:toH(WELLNESS[d].sleep_awake_sec)})), backgroundColor:'#566573', stack:'s' },
        ]
      },{ ...base, plugins:{...base.plugins,title:{display:true,text:'😴 Sleep Stages (h)',color:'#ccc'}}, scales:{x:{...catX,stacked:true},y:{...yAxis,stacked:true}} });

      // Body Battery — floating range bar + start/end scatter + rolling avg lines
      const bbData = filtW.map(d => {
        const v = WELLNESS[d];
        return { x:d, s:v.body_battery_start_of_day, e:v.body_battery_end_of_day,
                 hi:v.body_battery_highest, lo:v.body_battery_lowest };
      }).filter(p=>p.s!=null && p.e!=null);
      const bbStartPts = bbData.map(p=>({x:p.x,y:p.s}));
      const bbEndPts   = bbData.map(p=>({x:p.x,y:p.e}));
      upsert('bbChart','bar',{
        labels: bbData.map(p=>p.x),
        datasets:[
          { label:'Range (low→high)', data:bbData.map(p=>[p.lo??p.s, p.hi??p.e]), backgroundColor:'rgba(46,204,113,0.2)', borderColor:'rgba(46,204,113,0.45)', borderWidth:1 },
          { label:'Start', data:bbData.map(p=>p.s), type:'scatter', backgroundColor:'#f39c12', pointRadius:5 },
          { label:'End',   data:bbData.map(p=>p.e), type:'scatter', backgroundColor:'#2ecc71', pointRadius:5, pointStyle:'rectRot' },
          rollingAvg(bbStartPts, W, '#f0b429', '7d avg start'),
          rollingAvg(bbEndPts,   W, '#58d68d', '7d avg end'),
        ]
      },{ ...base, plugins:{...base.plugins,title:{display:true,text:'🔋 Body Battery — Start ◉ / End ◆ / Range',color:'#ccc'},
        tooltip:{callbacks:{label:ctx=>{const p=bbData[ctx.dataIndex]||{}; if(ctx.datasetIndex===0)return \`Range: \${p.lo}–\${p.hi}\`; if(ctx.datasetIndex===1)return 'Start: '+p.s; if(ctx.datasetIndex===2)return 'End: '+p.e; return ctx.dataset.label+': '+ctx.parsed.y;}}}
      }, scales:{x:{...catX},y:{...yAxis,min:0,max:100}} });

      // Charged vs drained
      upsert('bbFlowChart','bar',{
        labels: filtW,
        datasets:[
          { label:'Charged', data:filtW.map(d=>WELLNESS[d].body_battery_charged),  backgroundColor:'rgba(46,204,113,0.7)' },
          { label:'Drained', data:filtW.map(d=>WELLNESS[d].body_battery_drained ? -WELLNESS[d].body_battery_drained : null), backgroundColor:'rgba(231,76,60,0.7)' },
        ]
      },{ ...base, plugins:{...base.plugins,title:{display:true,text:'🔋 Body Battery Charged vs Drained',color:'#ccc'}}, scales:{x:{...catX},y:{...yAxis}} });

      // HRV: 7d avg + last-5-min + rolling trend
      const hrvAvgPts = filtW.map(d=>({x:d,y:WELLNESS[d].hrv_weekly_avg})).filter(p=>p.y!=null);
      const hrv5mPts  = filtW.map(d=>({x:d,y:WELLNESS[d].hrv_last_5_min})).filter(p=>p.y!=null);
      upsert('hrvChart','line',{ datasets:[
        { label:'HRV 7d avg (ms)',     data:hrvAvgPts, borderColor:'#9b59b6', backgroundColor:'rgba(155,89,182,0.1)', fill:true, tension:0.3, pointRadius:2 },
        { label:'HRV last 5 min (ms)', data:hrv5mPts,  borderColor:'#d7bde2', borderDash:[4,3], tension:0.3, pointRadius:2, fill:false },
        rollingAvg(hrvAvgPts, W, '#e8daef', 'trend'),
      ]}, wOpts('🧠 HRV (ms)'));

      // Training Readiness + trendline
      const readPts = filtW.map(d=>({x:d,y:WELLNESS[d].training_readiness_score})).filter(p=>p.y!=null);
      upsert('readinessChart','line',{ datasets:[
        { label:'Readiness /100', data:readPts, borderColor:'#1abc9c', backgroundColor:'rgba(26,188,156,0.1)', fill:true, tension:0.3, pointRadius:4,
          pointBackgroundColor: filtW.filter(d=>WELLNESS[d].training_readiness_score!=null).map(d=>{
            const l=WELLNESS[d].training_readiness_level;
            return l==='HIGH'||l==='PRIME'?'#1abc9c':l==='MODERATE'?'#f39c12':'#e74c3c';
          })
        },
        rollingAvg(readPts, W, '#76d7c4', 'trend'),
      ]}, wOpts('🎯 Training Readiness /100'));

      // Resting HR + trendline
      const rhrPts = filtW.map(d=>({x:d,y:WELLNESS[d].resting_hr})).filter(p=>p.y!=null);
      upsert('restingHrChart','line',{ datasets:[
        { label:'Resting HR (bpm)', data:rhrPts, borderColor:'#e74c3c', backgroundColor:'rgba(231,76,60,0.1)', fill:true, tension:0.3, pointRadius:2 },
        rollingAvg(rhrPts, W, '#f1948a', 'trend'),
      ]}, wOpts('❤️ Resting HR (bpm)'));

      // Stress stacked
      const stressToH = s => s ? Math.round(s/360)/10 : 0;
      upsert('stressChart','bar',{
        labels: filtW,
        datasets:[
          { label:'Rest',    data:filtW.map(d=>stressToH(WELLNESS[d].stress_rest_sec)),     backgroundColor:'#2ecc71', stack:'st' },
          { label:'Low',     data:filtW.map(d=>stressToH(WELLNESS[d].stress_low_sec)),      backgroundColor:'#f1c40f', stack:'st' },
          { label:'Medium',  data:filtW.map(d=>stressToH(WELLNESS[d].stress_medium_sec)),   backgroundColor:'#e67e22', stack:'st' },
          { label:'High',    data:filtW.map(d=>stressToH(WELLNESS[d].stress_high_sec)),     backgroundColor:'#e74c3c', stack:'st' },
          { label:'Activity',data:filtW.map(d=>stressToH(WELLNESS[d].stress_activity_sec)), backgroundColor:'#3498db', stack:'st' },
        ]
      },{ ...base, plugins:{...base.plugins,title:{display:true,text:'😓 Daily Stress Breakdown (h)',color:'#ccc'}}, scales:{x:{...catX,stacked:true},y:{...yAxis,stacked:true}} });

      // Steps + 7d rolling avg
      const stepsPts = filtW.map(d=>({x:d,y:WELLNESS[d].steps})).filter(p=>p.y!=null);
      upsert('stepsChart','bar',{ datasets:[
        { label:'Steps', data:stepsPts, backgroundColor:'rgba(52,152,219,0.5)', order:1 },
        rollingAvg(stepsPts, W, '#5dade2', '7d avg'),
      ]}, wOpts('👟 Daily Steps'));

      // SpO2 + trend
      const spo2Pts    = filtW.map(d=>({x:d,y:WELLNESS[d].spo2_avg})).filter(p=>p.y!=null);
      const spo2MinPts = filtW.map(d=>({x:d,y:WELLNESS[d].spo2_min})).filter(p=>p.y!=null);
      upsert('spo2Chart','line',{ datasets:[
        { label:'SpO2 avg %', data:spo2Pts,    borderColor:'#1abc9c', backgroundColor:'rgba(26,188,156,0.1)', fill:true, tension:0.3, pointRadius:2 },
        { label:'SpO2 min %', data:spo2MinPts, borderColor:'#e74c3c', borderDash:[3,3], tension:0.3, pointRadius:2, fill:false },
        rollingAvg(spo2Pts, W, '#76d7c4', 'avg trend'),
      ]},{ ...base, plugins:{...base.plugins,title:{display:true,text:'🫁 SpO2 %',color:'#ccc'}}, scales:{x:timeX,y:{...yAxis,min:85,max:100}} });
    }
  }
}

// ── Period buttons ────────────────────────────────────────────────
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    render(Number(btn.dataset.days));
  });
});

render(0);
</script>
</body>
</html>`;
}

async function main() {
  console.log("\n📊 Dashboard HTML Generator\n");

  if (!existsSync(ANALYSIS_DIR)) { console.error("❌ No analysis/ directory."); process.exit(1); }

  const summaries = loadAllSummaries(ANALYSIS_DIR);
  if (summaries.length === 0) { console.error("❌ No crunched files. Run 'npm run bulk' first."); process.exit(1); }

  console.log(`✅ Loaded ${summaries.length} activities`);

  const trainingDaily = buildDailyLoadSeries(summaries);
  const loadModel = computeLoadModel(trainingDaily);
  writeFileSync(join(ANALYSIS_DIR, "training_daily.json"), JSON.stringify({ updated_at: new Date().toISOString(), days: trainingDaily }, null, 2), "utf-8");
  writeFileSync(join(ANALYSIS_DIR, "training_load_model.json"), JSON.stringify({ updated_at: new Date().toISOString(), model: loadModel }, null, 2), "utf-8");
  console.log(`✅ Training intelligence cache saved: training_daily.json, training_load_model.json`);

  const html = buildHtml(summaries);
  writeFileSync(OUTPUT_PATH, html, "utf-8");
  console.log(`\n✅ Dashboard saved: ${OUTPUT_PATH}`);
  console.log(`   Open in browser: file://${OUTPUT_PATH.replace(/\\/g, "/")}`);
}

main().catch(err => { console.error("\n❌ Fatal:", err.message); process.exit(1); });











