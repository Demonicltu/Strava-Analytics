/**
 * Shared crunch module — compute ALL stats from full activity data (zero sampling).
 * Used by both pre_analyze.ts and fast.ts.
 */
import type { RiderConfig } from "./config.js";

// ─── Helpers ───

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

export function formatPace(speedKmh: number): string {
  if (speedKmh <= 0) return "-";
  const paceMin = 60 / speedKmh;
  const m = Math.floor(paceMin);
  const s = Math.round((paceMin - m) * 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function round(v: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

export function degToCardinal(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

export function computeStats(arr: number[]) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = arr.reduce((a, b) => a + b, 0);
  const avg = sum / arr.length;
  return {
    count: arr.length,
    avg: round(avg, 2),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: sorted[Math.floor(sorted.length / 2)],
    p5: sorted[Math.floor(sorted.length * 0.05)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    stddev: round(Math.sqrt(arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length), 2),
  };
}

export function bestRollingAvg(values: number[], windowSec: number): number | null {
  if (values.length < windowSec) return null;
  let best = -Infinity;
  let windowSum = 0;
  for (let i = 0; i < windowSec; i++) windowSum += values[i];
  best = windowSum / windowSec;
  for (let i = windowSec; i < values.length; i++) {
    windowSum += values[i] - values[i - windowSec];
    const avg = windowSum / windowSec;
    if (avg > best) best = avg;
  }
  return round(best, 1);
}

// ─── Main crunch function ───

export function crunchActivity(raw: any, rider: RiderConfig): any {
  const summary = raw.activity_summary;
  const splits = raw.splits_metric || [];
  const segments = raw.segment_efforts || [];
  const bestEfforts = raw.best_efforts || [];
  const laps = raw.laps || [];
  const stream = raw.stream_data || [];
  const rows = stream as any[];
  const totalPoints = rows.length;
  const movingRows = rows.filter((r: any) => r.is_moving !== false);

  // ─── Extract arrays ───
  const hrValues = movingRows.map((r: any) => r.heartrate_bpm).filter((v: any): v is number => v != null);
  const speedValues = movingRows.map((r: any) => r.speed_kmh).filter((v: any): v is number => v != null);
  const powerValues = movingRows.map((r: any) => r.power_watts).filter((v: any): v is number => v != null);
  const cadenceValues = movingRows.filter((r: any) => r.cadence_rpm != null && r.cadence_rpm > 0).map((r: any) => r.cadence_rpm!);
  const altitudeValues = rows.map((r: any) => r.altitude_meters).filter((v: any): v is number => v != null);
  const gradeValues = movingRows.map((r: any) => r.grade_percent).filter((v: any): v is number => v != null);
  const tempValues = rows.map((r: any) => r.temperature_c).filter((v: any): v is number => v != null);

  const isRide = ["Ride", "VirtualRide", "EBikeRide", "GravelRide", "MountainBikeRide"].includes(summary.sport_type);
  const isRun = ["Run", "TrailRun", "VirtualRun"].includes(summary.sport_type);
  const isWalk = ["Walk", "Hike"].includes(summary.sport_type);
  const isSurf = summary.sport_type === "Surfing";
  const isWorkout = ["Workout", "WeightTraining", "CrossFit", "Crossfit", "HIIT", "Yoga", "Pilates", "Rowing", "Elliptical", "StairStepper"].includes(summary.sport_type);
  const isVirtual = summary.sport_type === "VirtualRide";
  const hasPowerMeter = powerValues.length > 100;
  const elev = summary.total_elevation_gain_m || 0;
  const avgHR = summary.average_heartrate || 0;

  // Sport-specific max HR: running/walking uses RUNNER_MAX_HR → RIDER_MAX_HR → activity data
  const effectiveMaxHr = (isRun || isWalk)
    ? (rider.runnerMaxHr || rider.maxHr || summary.max_heartrate || null)
    : (rider.maxHr || summary.max_heartrate || null);

  // Sport-specific LTHR: running/walking uses RUNNER_LTHR → RIDER_LTHR; cycling/workout uses RIDER_LTHR
  const effectiveLthr = (isRun || isWalk)
    ? (rider.runnerLthr || rider.lthr || null)
    : (rider.lthr || null);

  // Rest HR: from env, or default 60 bpm
  const effectiveRestHr = rider.restHr || 60;

  // ═══ Normalized Power (computed early — needed for Pogačar EF metric) ═══
  let normalizedPower: number | null = null;
  if (powerValues.length > 30) {
    const pArr = movingRows.map((r: any) => r.power_watts || 0);
    const rolling: number[] = [];
    let wSum = 0;
    for (let i = 0; i < pArr.length; i++) { wSum += pArr[i]; if (i >= 30) wSum -= pArr[i - 30]; if (i >= 29) rolling.push(wSum / 30); }
    normalizedPower = Math.round(Math.pow(rolling.reduce((s, v) => s + v ** 4, 0) / rolling.length, 0.25));
  }

  // ═══ Pogačar / Kipchoge Score ═══
  let pogacarScore: any = null;
  if (isRide) {
    let speedRef: number, refLabel: string;
    if (isVirtual) { speedRef = 0; refLabel = "Virtual Ride (power only)"; }
    else if (elev > 1500) { speedRef = 24; refLabel = "Race (Mountain Stage)"; }
    else if (elev > 500) { speedRef = 30; refLabel = "Hilly Ride"; }
    else if (avgHR > 155) { speedRef = 41.5; refLabel = "Race (Flat/Rolling)"; }
    else { speedRef = 34; refLabel = "Solo Training"; }

    const metrics: any = {};
    let total = 0, count = 0;
    if (!isVirtual && summary.average_speed_kmh > 0) {
      const pct = round(summary.average_speed_kmh / speedRef * 100);
      metrics.speed = `${summary.average_speed_kmh} / ${speedRef} km/h → ${pct}%`;
      total += pct; count++;
    }
    if (hasPowerMeter && summary.average_watts) {
      const pct = round(summary.average_watts / 440 * 100);
      metrics.power = `${Math.round(summary.average_watts)} / 440 W → ${pct}%`;
      total += pct; count++;
    }
    // Efficiency Factor: NP/avgHR — how much power per heartbeat (output metric, not effort)
    // Pogačar reference: ~440W NP / ~170 avg HR ≈ 2.6 W/bpm
    if (normalizedPower && avgHR > 0) {
      const ef = round(normalizedPower / avgHR, 2);
      const pogacarEf = 2.6;
      const pct = round(ef / pogacarEf * 100);
      metrics.efficiency = `${ef} / ${pogacarEf} W/bpm → ${pct}%`;
      total += pct; count++;
    }
    if (elev > 200 && summary.moving_time_seconds > 0) {
      const vam = round(elev / (summary.moving_time_seconds / 3600));
      const pogacarVam = 1900;
      const pct = round(vam / pogacarVam * 100);
      metrics.climbing = `${vam} / ${pogacarVam} VAM → ${pct}%`;
      total += pct; count++;
    }
    if (summary.average_cadence) {
      const pct = round(summary.average_cadence / 90 * 100);
      metrics.cadence = `${round(summary.average_cadence)} / 90 rpm → ${pct}%`;
      total += pct; count++;
    }
    pogacarScore = { composite_pct: count > 0 ? round(total / count) : null, reference: refLabel, metrics, has_power_meter: hasPowerMeter };
  }

  let kipchogeScore: any = null;
  if (isRun && summary.average_speed_kmh > 0) {
    const paceSecPerKm = 3600 / summary.average_speed_kmh;
    // Pace component: Kipchoge marathon pace = 172 sec/km (2:52/km)
    const pacePct = round(172 / paceSecPerKm * 100);
    const metrics: any = {};
    let total = pacePct, count = 1;
    metrics.pace = `${formatPace(summary.average_speed_kmh)} / 2:52/km → ${pacePct}%`;

    // Running economy (pace/HR): lower HR for same pace = better.
    // Kipchoge ref ≈ 172s/km at ~160 bpm → 1.075 s/km/bpm
    // If LTHR is set, use it as a personalized anchor instead of fixed 160
    const kipHrRef = effectiveLthr || 160;
    const kipEconomy = round(172 / kipHrRef, 3);
    if (avgHR > 0) {
      const yourEconomy = round(paceSecPerKm / avgHR, 3);
      const econPct = round(kipEconomy / yourEconomy * 100);
      metrics.economy = `${yourEconomy} s/km/bpm (ref ${kipEconomy}) → ${econPct}%`;
      total += econPct; count++;
    }

    // Cadence: Kipchoge runs ~180 spm. Only include if cadence data available.
    if (summary.average_cadence) {
      const avgSpm = round(summary.average_cadence * 2); // Strava = strides/min, double for spm
      const cadPct = round(avgSpm / 180 * 100);
      metrics.cadence = `${avgSpm} / 180 spm → ${cadPct}%`;
      total += cadPct; count++;
    }

    kipchogeScore = {
      composite_pct: round(total / count),
      your_pace: formatPace(summary.average_speed_kmh),
      kipchoge_pace: "2:52/km",
      metrics,
    };
  }

  // Derive local UTC offset from start_date (UTC) vs start_date_local
  const startUtc = raw.detailed_activity?.start_date ?? raw.activity_summary?.date;
  const startLocal = raw.activity_summary?.date;
  let localUtcOffsetHours = 0;
  if (startUtc && startLocal) {
    const utcMs = new Date(startUtc).getTime();
    const localMs = new Date(startLocal).getTime();
    localUtcOffsetHours = Math.round((localMs - utcMs) / 3_600_000);
  }

  // ═══ Summary card ═══
  const summaryCard: any = {
    type: summary.sport_type,
    date: new Date(summary.date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    moving_time: formatDuration(summary.moving_time_seconds),
    moving_time_seconds: summary.moving_time_seconds,
    elapsed_time: formatDuration(summary.elapsed_time_seconds),
    local_utc_offset_hours: localUtcOffsetHours,
  };
  // GPS-dependent fields — suppress for Workout
  if (!isWorkout) {
    summaryCard.distance = `${summary.distance_km} km`;
    summaryCard.avg_speed = (isRun || isWalk) && summary.average_speed_kmh > 0
      ? `${formatPace(summary.average_speed_kmh)} (${summary.average_speed_kmh} km/h)`
      : isSurf ? `${summary.average_speed_kmh} km/h (includes paddling)`
      : `${summary.average_speed_kmh} km/h`;
    summaryCard.max_speed = `${summary.max_speed_kmh} km/h`;
    summaryCard.elevation = `${elev} m gained`;
  }
  if (tempValues.length > 0) summaryCard.temperature = `${round(tempValues.reduce((a, b) => a + b, 0) / tempValues.length)}°C avg (${Math.min(...tempValues)}-${Math.max(...tempValues)}°C)`;
  if (summary.average_heartrate) summaryCard.avg_hr = `${summary.average_heartrate} bpm (max ${summary.max_heartrate})`;
  if (summary.average_watts) summaryCard.avg_power = hasPowerMeter ? `${Math.round(summary.average_watts)} W` : `~${Math.round(summary.average_watts)} W (estimated)`;
  if (summary.average_cadence) {
    // Running cadence from Strava is in strides/min (one foot); display as spm (steps/min = 2x)
    if (isRun || isWalk) {
      summaryCard.cadence = `${round(summary.average_cadence * 2)} spm`;
    } else {
      summaryCard.cadence = `${round(summary.average_cadence)} rpm`;
    }
  }
  if (summary.calories) summaryCard.calories = `${summary.calories} kcal`;
  if (summary.gear) summaryCard.gear = summary.gear;
  if (summary.device) summaryCard.device = summary.device;

  // ═══ Surf Analysis ═══
  let surfAnalysis: any = null;
  if (isSurf && speedValues.length > 0) {
    const WAVE_SPEED_THRESHOLD = 8; // km/h — above this likely riding a wave
    const WAVE_MIN_DURATION = 3;    // seconds minimum for a wave ride

    // Smooth speed (3-point rolling avg) to reduce GPS noise
    const smoothed: number[] = [];
    for (let i = 0; i < speedValues.length; i++) {
      const start = Math.max(0, i - 1), end = Math.min(speedValues.length - 1, i + 1);
      let s = 0; for (let j = start; j <= end; j++) s += speedValues[j];
      smoothed.push(s / (end - start + 1));
    }

    // Detect wave rides: consecutive points above threshold
    const waves: { startIdx: number; endIdx: number; maxSpeed: number; avgSpeed: number; duration: number }[] = [];
    let inWave = false, waveStart = 0, waveMaxSpd = 0, waveSpdSum = 0, wavePts = 0;
    for (let i = 0; i < smoothed.length; i++) {
      if (smoothed[i] >= WAVE_SPEED_THRESHOLD) {
        if (!inWave) { inWave = true; waveStart = i; waveMaxSpd = 0; waveSpdSum = 0; wavePts = 0; }
        waveMaxSpd = Math.max(waveMaxSpd, smoothed[i]);
        waveSpdSum += smoothed[i];
        wavePts++;
      } else if (inWave) {
        inWave = false;
        if (wavePts >= WAVE_MIN_DURATION) {
          waves.push({ startIdx: waveStart, endIdx: i - 1, maxSpeed: round(waveMaxSpd), avgSpeed: round(waveSpdSum / wavePts), duration: wavePts });
        }
      }
    }
    // Close any open wave at end
    if (inWave && wavePts >= WAVE_MIN_DURATION) {
      waves.push({ startIdx: waveStart, endIdx: smoothed.length - 1, maxSpeed: round(waveMaxSpd), avgSpeed: round(waveSpdSum / wavePts), duration: wavePts });
    }

    const ridingSeconds = waves.reduce((s, w) => s + w.duration, 0);
    const totalMovingSeconds = movingRows.length;
    const paddlingSeconds = totalMovingSeconds - ridingSeconds;
    const maxWaveSpeed = waves.length > 0 ? Math.max(...waves.map(w => w.maxSpeed)) : (speedValues.length > 0 ? round(Math.max(...speedValues)) : 0);
    const avgWaveSpeed = waves.length > 0 ? round(waves.reduce((s, w) => s + w.avgSpeed, 0) / waves.length) : null;
    const longestWave = waves.length > 0 ? waves.reduce((b, w) => w.duration > b.duration ? w : b) : null;

    // Surf speed zones
    const surfZoneBands = [
      { zone: "Stationary (<2 km/h)", min: 0, max: 2 },
      { zone: "Paddling (2-8 km/h)", min: 2, max: 8 },
      { zone: "Riding Wave (8-20 km/h)", min: 8, max: 20 },
      { zone: "Fast Wave (20+ km/h)", min: 20, max: 999 },
    ];
    const surfSpeedZones = surfZoneBands.map(z => {
      const seconds = speedValues.filter(s => s >= z.min && s < z.max).length;
      return {
        zone: z.zone,
        time_seconds: seconds,
        time_formatted: formatDuration(seconds),
        pct: round(seconds / speedValues.length * 100, 1),
      };
    });

    surfAnalysis = {
      wave_count: waves.length,
      max_wave_speed_kmh: maxWaveSpeed,
      avg_wave_speed_kmh: avgWaveSpeed,
      longest_wave_seconds: longestWave ? longestWave.duration : null,
      longest_wave_speed_kmh: longestWave ? longestWave.maxSpeed : null,
      riding_time_seconds: ridingSeconds,
      riding_time_formatted: formatDuration(ridingSeconds),
      paddling_time_seconds: paddlingSeconds,
      paddling_time_formatted: formatDuration(paddlingSeconds),
      ride_pct: totalMovingSeconds > 0 ? round(ridingSeconds / totalMovingSeconds * 100, 1) : 0,
      paddle_pct: totalMovingSeconds > 0 ? round(paddlingSeconds / totalMovingSeconds * 100, 1) : 0,
      session_elapsed: formatDuration(summary.elapsed_time_seconds),
      session_moving: formatDuration(summary.moving_time_seconds),
      wait_time: formatDuration(Math.max(0, summary.elapsed_time_seconds - summary.moving_time_seconds)),
      speed_zones: surfSpeedZones,
      waves: waves.slice(0, 20).map((w, i) => ({
        wave: i + 1,
        duration_s: w.duration,
        max_speed_kmh: w.maxSpeed,
        avg_speed_kmh: w.avgSpeed,
      })),
    };
  }

  // ═══ Pacing ═══
  const splitsFormatted = splits.map((s: any) => ({
    km: s.split, speed_kmh: round(s.average_speed * 3.6),
    hr: s.average_heartrate ? Math.round(s.average_heartrate) : null,
    elevation_diff_m: s.elevation_difference, moving_time: formatTime(s.moving_time),
  }));
  const sortedBySpeed = [...splitsFormatted].filter((s: any) => s.speed_kmh > 0).sort((a: any, b: any) => b.speed_kmh - a.speed_kmh);
  const fastestKm = sortedBySpeed[0] || null;
  const slowestKm = sortedBySpeed[sortedBySpeed.length - 1] || null;
  const half = Math.floor(splitsFormatted.length / 2);
  const h1 = splitsFormatted.slice(0, half), h2 = splitsFormatted.slice(half);
  const avgS = (arr: any[]) => arr.length > 0 ? round(arr.reduce((s: number, x: any) => s + x.speed_kmh, 0) / arr.length) : null;
  const avgH = (arr: any[]) => { const v = arr.filter((x: any) => x.hr); return v.length > 0 ? Math.round(v.reduce((s: number, x: any) => s + x.hr, 0) / v.length) : null; };
  let pacingType = "even split";
  const spdDiff = (avgS(h1) || 0) - (avgS(h2) || 0);
  if (spdDiff > 1) pacingType = "positive split (faded)";
  else if (spdDiff < -1) pacingType = "negative split (finished strong)";

  // ═══ 5-min windows ═══
  const maxTime = rows.length > 0 ? rows[rows.length - 1].time_seconds : 0;
  const timeWindows: any[] = [];
  for (let t = 0; t < maxTime; t += 300) {
    const wr = rows.filter((r: any) => r.time_seconds >= t && r.time_seconds < t + 300 && r.is_moving !== false);
    if (wr.length === 0) continue;
    const a = (f: string) => { const v = wr.map((r: any) => r[f]).filter((x: any) => x != null && typeof x === "number"); return v.length > 0 ? round(v.reduce((a: number, b: number) => a + b, 0) / v.length) : null; };
    timeWindows.push({
      window: `${Math.floor(t / 60)}-${Math.floor((t + 300) / 60)}min`,
      avg_speed_kmh: a("speed_kmh"),
      avg_hr: a("heartrate_bpm") ? Math.round(a("heartrate_bpm")!) : null,
      avg_power: a("power_watts") ? Math.round(a("power_watts")!) : null,
      avg_cadence: a("cadence_rpm") ? Math.round(a("cadence_rpm")!) : null,
    });
  }
  const fastW = timeWindows.length > 0 ? timeWindows.reduce((b: any, w: any) => (w.avg_speed_kmh || 0) > (b.avg_speed_kmh || 0) ? w : b, timeWindows[0]) : null;
  const slowW = timeWindows.length > 0 ? timeWindows.reduce((b: any, w: any) => (w.avg_speed_kmh || Infinity) < (b.avg_speed_kmh || Infinity) ? w : b, timeWindows[0]) : null;

  // ═══ Cardiac drift ═══
  let cardiacDrift: any = null;
  if (hrValues.length > 100) {
    const hi = Math.floor(movingRows.length / 2);
    const f = (arr: any[], field: string) => { const v = arr.map((r: any) => r[field]).filter((x: any) => x != null); return v.length > 0 ? v.reduce((a: number, b: number) => a + b, 0) / v.length : 0; };
    const ah1 = f(movingRows.slice(0, hi), "heartrate_bpm"), ah2 = f(movingRows.slice(hi), "heartrate_bpm");
    const as1 = f(movingRows.slice(0, hi), "speed_kmh"), as2 = f(movingRows.slice(hi), "speed_kmh");
    const dBpm = Math.round(ah2 - ah1), dPct = round((ah2 - ah1) / ah1 * 100);
    let interp = "Mixed pattern.";
    if (dBpm > 5 && (as2 - as1) > -1) interp = "True cardiac drift — HR rising at similar speed. Sign of fatigue.";
    else if (dBpm > 3 && (as2 - as1) < -2) interp = "HR rose but speed dropped more — terrain-driven.";
    else if (dBpm < -2 && (as2 - as1) < -2) interp = "Both HR and speed dropped — eased off in second half.";
    else if (Math.abs(dBpm) <= 3) interp = "Minimal drift — well-paced, stable cardiovascular effort.";
    cardiacDrift = { first_half: { avg_hr: Math.round(ah1), avg_speed: round(as1) }, second_half: { avg_hr: Math.round(ah2), avg_speed: round(as2) }, drift_bpm: dBpm, drift_pct: dPct, interpretation: interp };
  }

  // ═══ Climbing ═══
  let climbing: any = null;
  if (altitudeValues.length > 0) {
    let asc = 0, desc = 0;
    for (let i = 1; i < altitudeValues.length; i++) { const d = altitudeValues[i] - altitudeValues[i - 1]; if (d > 0) asc += d; else desc += Math.abs(d); }
    const up = movingRows.filter((r: any) => r.grade_percent != null && r.grade_percent > 2);
    const dn = movingRows.filter((r: any) => r.grade_percent != null && r.grade_percent < -2);
    const fl = movingRows.filter((r: any) => r.grade_percent != null && Math.abs(r.grade_percent) <= 2);
    const tot = up.length + dn.length + fl.length;
    const av = (arr: any[], f: string) => { const v = arr.map((r: any) => r[f]).filter((x: any) => x != null); return v.length > 0 ? round(v.reduce((a: number, b: number) => a + b, 0) / v.length) : null; };
    const hardest = splitsFormatted.filter((s: any) => s.elevation_diff_m > 10).sort((a: any, b: any) => b.elevation_diff_m - a.elevation_diff_m)[0] || null;
    climbing = {
      total_ascent_m: Math.round(asc), total_descent_m: Math.round(desc),
      altitude_range: `${round(Math.min(...altitudeValues))}m → ${round(Math.max(...altitudeValues))}m`,
      terrain_pct: { flat: tot > 0 ? round(fl.length / tot * 100, 0) : null, uphill: tot > 0 ? round(up.length / tot * 100, 0) : null, downhill: tot > 0 ? round(dn.length / tot * 100, 0) : null },
      uphill_avg_speed: av(up, "speed_kmh"), flat_avg_speed: av(fl, "speed_kmh"), downhill_avg_speed: av(dn, "speed_kmh"),
      uphill_avg_hr: av(up, "heartrate_bpm") ? Math.round(av(up, "heartrate_bpm")!) : null, flat_avg_hr: av(fl, "heartrate_bpm") ? Math.round(av(fl, "heartrate_bpm")!) : null,
      hardest_climb_km: hardest,
    };
  }


  // ═══ Best efforts ═══
  const bestPower: any = {};
  const bestPowerRaw: Record<string, number> = {};
  if (powerValues.length > 0) {
    const pArr = movingRows.map((r: any) => r.power_watts || 0);
    for (const [d, l] of [[5, "5s"], [10, "10s"], [30, "30s"], [60, "1min"], [300, "5min"], [600, "10min"], [1200, "20min"]] as [number, string][]) {
      const v = bestRollingAvg(pArr, d);
      if (v) { bestPower[l] = `${v} W`; bestPowerRaw[l] = v; }
    }
  }
  const peakHR: any = {};
  if (hrValues.length > 0) {
    const hArr = movingRows.map((r: any) => r.heartrate_bpm || 0);
    for (const [d, l] of [[60, "1min"], [300, "5min"], [600, "10min"], [1200, "20min"]] as [number, string][]) {
      const v = bestRollingAvg(hArr, d);
      if (v) peakHR[l] = `${v} bpm`;
    }
  }

  // ═══ Segments ═══
  const prSegs = segments.filter((s: any) => s.pr_rank === 1);
  const allSorted = [...segments].sort((a: any, b: any) => (a.pr_rank || 99) - (b.pr_rank || 99) || b.distance - a.distance).slice(0, 15);
  const segTable = allSorted.map((s: any) => ({
    name: s.name, distance: `${round(s.distance / 1000, 2)} km`, time: formatTime(s.elapsed_time),
    avg_hr: s.average_heartrate ? Math.round(s.average_heartrate) : null,
    avg_grade: s.segment?.average_grade != null ? `${s.segment.average_grade}%` : null,
    pr: s.pr_rank === 1 ? "🥇 PR #1" : s.pr_rank === 2 ? "🥈 #2" : s.pr_rank === 3 ? "🥉 #3" : "—",
  }));

  // ═══════════════════════════════════════════
  // NEW ADVANCED METRICS
  // ═══════════════════════════════════════════

  // ═══ Training Metrics (IF, TSS, EF) ═══
  let trainingMetrics: any = null;
  if (hasPowerMeter && normalizedPower) {
    // For running, prefer rFTP; fall back to cycling FTP with warning
    let effectiveFtp: number | null = null;
    let ftpSource: string | null = null;
    let ftpWarning: string | null = null;
    if (isRun) {
      if (rider.rFtpW && rider.rFtpW > 0) {
        effectiveFtp = rider.rFtpW;
        ftpSource = "running FTP (rFTP)";
      } else if (rider.ftpW && rider.ftpW > 0) {
        effectiveFtp = rider.ftpW;
        ftpSource = "cycling FTP (no RUNNER_RFTP_W set)";
        ftpWarning = "⚠️ Using cycling FTP for running metrics. Set RUNNER_RFTP_W in .env for accurate running IF/TSS.";
      }
    } else if (rider.ftpW && rider.ftpW > 0) {
      effectiveFtp = rider.ftpW;
      ftpSource = "cycling FTP";
    }

    if (effectiveFtp && effectiveFtp > 0) {
      const IF = round(normalizedPower / effectiveFtp, 2);
      const durationSec = summary.moving_time_seconds;
      const TSS = round((durationSec * normalizedPower * IF) / (effectiveFtp * 3600) * 100, 1);
      const EF = avgHR > 0 ? round(normalizedPower / avgHR, 2) : null;

      let tssInterpretation = "";
      if (TSS < 50) tssInterpretation = "Easy day — recovery ride";
      else if (TSS < 100) tssInterpretation = "Moderate — some fatigue, recovered by next day";
      else if (TSS < 150) tssInterpretation = "Hard — considerable fatigue, 2 days to recover";
      else if (TSS < 250) tssInterpretation = "Very hard — 2-4 days recovery needed";
      else tssInterpretation = "Epic — may take 5+ days to fully recover";

      let ifInterpretation = "";
      if (IF < 0.55) ifInterpretation = "Recovery / easy spin";
      else if (IF < 0.75) ifInterpretation = "Endurance ride (Zone 2)";
      else if (IF < 0.90) ifInterpretation = "Tempo / sweetspot effort";
      else if (IF < 1.0) ifInterpretation = "Threshold effort";
      else if (IF < 1.05) ifInterpretation = "At or slightly above FTP — max sustainable ~1h";
      else ifInterpretation = "Above FTP — short intense effort";

      trainingMetrics = {
        ftp_used: effectiveFtp,
        ftp_source: ftpSource,
        ftp_warning: ftpWarning,
        intensity_factor: IF,
        intensity_factor_label: ifInterpretation,
        tss: TSS,
        tss_label: tssInterpretation,
        efficiency_factor: EF,
      };
    }
  }

  // ═══ Relative Effort (TRIMP) ═══
  let relativeEffort: any = null;
  if (hrValues.length > 100 && effectiveMaxHr && effectiveRestHr) {
    const hrReserve = effectiveMaxHr - effectiveRestHr;
    if (hrReserve > 0) {
      let trimp = 0;
      // Use all HR data points; each point ≈ 1 second
      for (const hr of hrValues) {
        const hrr = Math.max(0, Math.min(1, (hr - effectiveRestHr) / hrReserve));
        // Banister TRIMP formula (gender-neutral)
        trimp += (1 / 60) * hrr * 0.64 * Math.exp(1.92 * hrr);
      }
      const score = Math.round(trimp);
      let interpretation = "";
      if (score < 50) interpretation = "Easy";
      else if (score < 100) interpretation = "Moderate";
      else if (score < 150) interpretation = "Hard";
      else if (score < 200) interpretation = "Very Hard";
      else if (score < 300) interpretation = "Extremely Hard";
      else interpretation = "Epic";

      relativeEffort = { score, interpretation, max_hr_used: effectiveMaxHr, rest_hr_used: effectiveRestHr };
    }
  }

  // ═══ Heart Points (Google Fit style — cross-activity, summable) ═══
  let heartPoints: any = null;
  if (effectiveMaxHr && hrValues.length > 60) {
    const moderateThreshold = Math.round(effectiveMaxHr * 0.64);
    const vigorousThreshold = Math.round(effectiveMaxHr * 0.77);
    let moderateSec = 0, vigorousSec = 0;
    for (const hr of hrValues) {
      if (hr >= vigorousThreshold) vigorousSec++;
      else if (hr >= moderateThreshold) moderateSec++;
    }
    const modMin = round(moderateSec / 60, 1);
    const vigMin = round(vigorousSec / 60, 1);
    const pts = round(modMin * 1 + vigMin * 2, 1);
    heartPoints = {
      points: pts,
      moderate_minutes: modMin,
      vigorous_minutes: vigMin,
      weekly_target: 150,
      pct_of_weekly_target: `${round(pts / 150 * 100, 1)}%`,
      thresholds: { moderate_bpm: moderateThreshold, vigorous_bpm: vigorousThreshold, max_hr_used: effectiveMaxHr },
    };
  } else if (!effectiveMaxHr || hrValues.length <= 60) {
    // MET fallback: estimate from activity type and moving time
    const movingMin = round(summary.moving_time_seconds / 60, 1);
    let ptsPerMin = 0;
    if (isWalk) ptsPerMin = 1;       // ~3-4 METs
    else if (isRun) ptsPerMin = 2;    // ~6-10 METs
    else if (isRide) ptsPerMin = 1.5; // ~4-8 METs
    else if (isSurf) ptsPerMin = 1.5; // ~4-7 METs (paddling + waves)
    if (ptsPerMin > 0) {
      const pts = round(movingMin * ptsPerMin, 1);
      heartPoints = {
        points: pts,
        moderate_minutes: ptsPerMin === 1 ? movingMin : null,
        vigorous_minutes: ptsPerMin === 2 ? movingMin : null,
        weekly_target: 150,
        pct_of_weekly_target: `${round(pts / 150 * 100, 1)}%`,
        estimated_from: "activity type (no HR data)",
      };
    }
  }

  // ═══ Aerobic Decoupling ═══
  let aerobicDecoupling: any = null;
  if (hasPowerMeter && hrValues.length > 100) {
    const halfIdx = Math.floor(movingRows.length / 2);
    const half1 = movingRows.slice(0, halfIdx);
    const half2 = movingRows.slice(halfIdx);
    const avgField = (arr: any[], field: string) => {
      const vals = arr.map((r: any) => r[field]).filter((v: any) => v != null && typeof v === "number");
      return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0;
    };
    const pw1 = avgField(half1, "power_watts"), hr1 = avgField(half1, "heartrate_bpm");
    const pw2 = avgField(half2, "power_watts"), hr2 = avgField(half2, "heartrate_bpm");
    if (hr1 > 0 && hr2 > 0 && pw1 > 0 && pw2 > 0) {
      const ratio1 = pw1 / hr1;
      const ratio2 = pw2 / hr2;
      const decouplingPct = round(((ratio1 - ratio2) / ratio1) * 100, 1);
      let interpretation = "";
      if (Math.abs(decouplingPct) < 3) interpretation = "Excellent aerobic fitness — minimal decoupling";
      else if (Math.abs(decouplingPct) < 5) interpretation = "Good aerobic fitness — acceptable decoupling";
      else if (Math.abs(decouplingPct) < 10) interpretation = "Moderate — aerobic base needs work";
      else interpretation = "Significant decoupling — focus on base/endurance training";

      aerobicDecoupling = {
        first_half: { avg_power: Math.round(pw1), avg_hr: Math.round(hr1), ratio: round(ratio1, 3) },
        second_half: { avg_power: Math.round(pw2), avg_hr: Math.round(hr2), ratio: round(ratio2, 3) },
        decoupling_pct: decouplingPct,
        interpretation,
      };
    }
  }

  // ═══ Power-to-Weight Ratio ═══
  let powerToWeight: any = null;
  if (hasPowerMeter && rider.weightKg && rider.weightKg > 0) {
    const avgWkg = round(summary.average_watts / rider.weightKg, 2);
    const npWkg = normalizedPower ? round(normalizedPower / rider.weightKg, 2) : null;
    // Use rFTP for running, cycling FTP otherwise
    const effectiveFtpForWkg = isRun ? (rider.rFtpW || rider.ftpW) : rider.ftpW;
    const ftpWkg = effectiveFtpForWkg ? round(effectiveFtpForWkg / rider.weightKg, 2) : null;

    const bestEffortsWkg: Record<string, string> = {};
    for (const [label, watts] of Object.entries(bestPowerRaw)) {
      bestEffortsWkg[label] = `${round(watts / rider.weightKg, 2)} W/kg`;
    }

    // Classify level based on 20min W/kg (rough categories)
    let level = "";
    const twentyMinWkg = bestPowerRaw["20min"] ? bestPowerRaw["20min"] / rider.weightKg : (npWkg || avgWkg);
    if (twentyMinWkg >= 6.0) level = "World Tour Pro";
    else if (twentyMinWkg >= 5.0) level = "Cat 1 / Elite";
    else if (twentyMinWkg >= 4.0) level = "Cat 2-3 / Strong Amateur";
    else if (twentyMinWkg >= 3.0) level = "Cat 4 / Intermediate";
    else if (twentyMinWkg >= 2.0) level = "Recreational";
    else level = "Beginner";

    powerToWeight = {
      weight_kg: rider.weightKg,
      avg_wkg: avgWkg,
      np_wkg: npWkg,
      ftp_wkg: ftpWkg,
      best_efforts_wkg: Object.keys(bestEffortsWkg).length > 0 ? bestEffortsWkg : null,
      estimated_level: level,
    };
  }

  // ═══ Power Skills ═══
  let powerSkills: any = null;
  if (hasPowerMeter && Object.keys(bestPowerRaw).length >= 3) {
    const ftp = (isRun ? (rider.rFtpW || rider.ftpW) : rider.ftpW) || normalizedPower || summary.average_watts || 1;
    const sprint5s = bestPowerRaw["5s"] || 0;
    const attack1m = bestPowerRaw["1min"] || 0;
    const sustained5m = bestPowerRaw["5min"] || 0;
    const sustained20m = bestPowerRaw["20min"] || 0;

    // Score each as ratio to FTP
    const sprintScore = round(sprint5s / ftp * 100, 0);  // Sprinters: >250%
    const attackScore = round(attack1m / ftp * 100, 0);   // Attackers: >150%
    const climberScore = round(sustained20m / ftp * 100, 0);  // Climbers: >95%
    const ttScore = round(sustained5m / ftp * 100, 0); // TT: >105%

    // Determine primary strength
    const scores = [
      { skill: "Sprinting", score: sprintScore, threshold: 250 },
      { skill: "Attacking", score: attackScore, threshold: 150 },
      { skill: "Climbing / TT", score: climberScore, threshold: 95 },
    ];
    // Normalize by dividing by threshold (how much above the benchmark)
    const normalized = scores.map(s => ({ ...s, normalized: s.score / s.threshold }));
    normalized.sort((a, b) => b.normalized - a.normalized);
    const primary = normalized[0].skill;

    powerSkills = {
      sprint_5s_pct_ftp: `${sprintScore}% of FTP (${sprint5s}W / ${Math.round(ftp)}W)`,
      attack_1min_pct_ftp: `${attackScore}% of FTP (${attack1m}W / ${Math.round(ftp)}W)`,
      sustained_5min_pct_ftp: `${ttScore}% of FTP (${sustained5m}W / ${Math.round(ftp)}W)`,
      sustained_20min_pct_ftp: `${climberScore}% of FTP (${sustained20m}W / ${Math.round(ftp)}W)`,
      primary_strength: primary,
    };
  }

  // ═══ Torque ═══
  let torque: any = null;
  if (hasPowerMeter && cadenceValues.length > 0) {
    const avgCadence = summary.average_cadence || computeStats(cadenceValues)!.avg;
    const avgPower = summary.average_watts;
    if (avgCadence > 0) {
      const avgTorque = round(avgPower / (2 * Math.PI * avgCadence / 60), 1);

      // Peak torque from per-second data
      let peakTorque = 0;
      for (const r of movingRows) {
        if (r.power_watts > 0 && r.cadence_rpm > 0) {
          const t = r.power_watts / (2 * Math.PI * r.cadence_rpm / 60);
          if (t > peakTorque) peakTorque = t;
        }
      }

      torque = {
        avg_torque_nm: avgTorque,
        peak_torque_nm: round(peakTorque, 1),
      };
    }
  }

  // ═══ Training Zones ═══
  let trainingZones: any = null;

  // HR Zones — LTHR-based (Coggan/Friel) when available, else % of maxHR
  let hrZones: any = null;
  if (hrValues.length > 100 && (effectiveLthr || effectiveMaxHr)) {
    let zoneData: any[];
    let zoneModel: string;

    if (isWalk && effectiveMaxHr) {
      // Walking: always % of max HR with walking-specific zones (LTHR not meaningful for walking)
      const maxHr = effectiveMaxHr;
      const zones = [
        { zone: "Z1 Very Light (50-60%)", min: 0.50, max: 0.60 },
        { zone: "Z2 Light (60-70%)",      min: 0.60, max: 0.70 },
        { zone: "Z3 Moderate (70-80%)",   min: 0.70, max: 0.80 },
        { zone: "Z4 Hard (80-90%)",       min: 0.80, max: 0.90 },
        { zone: "Z5 Maximum (90%+)",      min: 0.90, max: 2.0  },
      ];
      zoneModel = `% of max HR/walking (${maxHr} bpm)`;
      zoneData = zones.map(z => {
        const lower = Math.round(z.min * maxHr);
        const upper = z.max < 2.0 ? Math.round(z.max * maxHr) : 999;
        const seconds = hrValues.filter(hr => hr >= lower && (z.max >= 2.0 ? true : hr < upper)).length;
        return {
          zone: z.zone,
          range_bpm: `${lower}-${upper >= 999 ? lower + "+" : upper}`,
          time_seconds: seconds,
          time_formatted: formatDuration(seconds),
          pct: round(seconds / hrValues.length * 100, 1),
        };
      });
    } else if (effectiveLthr) {
      // LTHR-based 5-zone model — boundaries differ between running and cycling (Coggan/Friel)
      const lthr = effectiveLthr;
      const zones = isRun ? [
        { zone: "Z1 (Recovery)",  min: 0,    max: 0.85  },
        { zone: "Z2 (Endurance)", min: 0.85, max: 0.89  },
        { zone: "Z3 (Tempo)",     min: 0.89, max: 0.94  },
        { zone: "Z4 (Threshold)", min: 0.94, max: 1.0   },
        { zone: "Z5 (VO2max+)",   min: 1.0,  max: 99    },
      ] : [
        { zone: "Z1 (Recovery)",  min: 0,    max: 0.81  },
        { zone: "Z2 (Endurance)", min: 0.81, max: 0.89  },
        { zone: "Z3 (Tempo)",     min: 0.89, max: 0.93  },
        { zone: "Z4 (Threshold)", min: 0.93, max: 1.0   },
        { zone: "Z5 (VO2max+)",   min: 1.0,  max: 99    },
      ];
      const sport = isRun ? "running" : "cycling";
      zoneModel = `LTHR-based/${sport} (${lthr} bpm)`;
      zoneData = zones.map(z => {
        const lower = Math.round(z.min * lthr);
        const upper = z.max < 99 ? Math.round(z.max * lthr) : 999;
        const seconds = hrValues.filter(hr => hr >= lower && (z.max >= 99 ? true : hr < upper)).length;
        return {
          zone: z.zone,
          range_bpm: `${lower}-${upper >= 999 ? lower + "+" : upper}`,
          time_seconds: seconds,
          time_formatted: formatDuration(seconds),
          pct: round(seconds / hrValues.length * 100, 1),
        };
      });
    } else {
      // Fallback: % of max HR (running/cycling without LTHR)
      const maxHr = effectiveMaxHr!;
      const zones = [
        { zone: "Z1 (Recovery)",    min: 0,    max: 0.60 },
        { zone: "Z2 (Endurance)",   min: 0.60, max: 0.70 },
        { zone: "Z3 (Tempo)",       min: 0.70, max: 0.80 },
        { zone: "Z4 (Threshold)",   min: 0.80, max: 0.90 },
        { zone: "Z5 (VO2max+)",     min: 0.90, max: 2.0  },
      ];
      zoneModel = `% of max HR (${maxHr} bpm)`;
      zoneData = zones.map(z => {
        const lower = Math.round(z.min * maxHr);
        const upper = z.max < 2.0 ? Math.round(z.max * maxHr) : 999;
        const seconds = hrValues.filter(hr => hr >= lower && (z.max >= 2.0 ? true : hr < upper)).length;
        return {
          zone: z.zone,
          range_bpm: `${lower}-${upper >= 999 ? lower + "+" : upper}`,
          time_seconds: seconds,
          time_formatted: formatDuration(seconds),
          pct: round(seconds / hrValues.length * 100, 1),
        };
      });
    }

    hrZones = {
      zone_model: zoneModel,
      section_header: isWalk
        ? `Heart Rate Zones (% of max HR/walking, ${effectiveMaxHr} bpm)`
        : effectiveLthr
          ? `Heart Rate Zones (LTHR-based/${isRun ? "running" : "cycling"}, ${effectiveLthr} bpm)`
          : `Heart Rate Zones (% of max HR, ${effectiveMaxHr} bpm)`,
      lthr_used: effectiveLthr ?? null,
      max_hr_used: effectiveMaxHr ?? null,
      zones: zoneData,
    };
  }

  // Power Zones (7-zone model based on FTP)
  let powerZones: any = null;
  if (hasPowerMeter) {
    const effectiveFtp = isRun ? (rider.rFtpW || rider.ftpW) : rider.ftpW;
    if (effectiveFtp && effectiveFtp > 0) {
      const ftp = effectiveFtp;
      const zones = [
      { zone: "Z1 (Active Recovery)", min: 0, max: 0.55 },
      { zone: "Z2 (Endurance)", min: 0.55, max: 0.75 },
      { zone: "Z3 (Tempo)", min: 0.75, max: 0.90 },
      { zone: "Z4 (Threshold)", min: 0.90, max: 1.05 },
      { zone: "Z5 (VO2max)", min: 1.05, max: 1.20 },
      { zone: "Z6 (Anaerobic)", min: 1.20, max: 1.50 },
      { zone: "Z7 (Neuromuscular)", min: 1.50, max: 100 },
    ];
    const zoneData = zones.map(z => {
      const lower = Math.round(z.min * ftp);
      const upper = z.max < 100 ? Math.round(z.max * ftp) : 9999;
      const seconds = powerValues.filter(p => p >= lower && (z.max >= 100 ? true : p < upper)).length;
      return {
        zone: z.zone,
        range_watts: `${lower}-${upper >= 9999 ? lower + "+" : upper} W`,
        time_seconds: seconds,
        time_formatted: formatDuration(seconds),
        pct: round(seconds / powerValues.length * 100, 1),
      };
    });
    powerZones = { ftp_used: ftp, zones: zoneData };
    }
  }

  // Speed Zones — sport-specific bands
  let speedZones: any = null;
  if (speedValues.length > 100) {
    let bands: { zone: string; min: number; max: number }[];
    let speedZoneModel: string;

    if (isWalk) {
      bands = [
        { zone: "Z1 Stroll (0-3.5 km/h)",    min: 0,   max: 3.5  },
        { zone: "Z2 Brisk (3.5-5 km/h)",      min: 3.5, max: 5    },
        { zone: "Z3 Power (5-6.5 km/h)",      min: 5,   max: 6.5  },
        { zone: "Z4 Peak (6.5-8 km/h)",       min: 6.5, max: 8    },
        { zone: "Z5 Sprint (8+ km/h)",         min: 8,   max: 999  },
      ];
      speedZoneModel = "walking";
    } else if (isRun) {
      bands = [
        { zone: "Stopped/Slow (0-6 km/h)",    min: 0,  max: 6   },
        { zone: "Easy (6-9 km/h)",            min: 6,  max: 9   },
        { zone: "Moderate (9-12 km/h)",       min: 9,  max: 12  },
        { zone: "Fast (12-15 km/h)",          min: 12, max: 15  },
        { zone: "Very Fast (15-18 km/h)",     min: 15, max: 18  },
        { zone: "Sprint (18+ km/h)",          min: 18, max: 999 },
      ];
      speedZoneModel = "running";
    } else {
      bands = [
        { zone: "Stopped/Very Slow", min: 0,  max: 5  },
        { zone: "Easy (5-15 km/h)",  min: 5,  max: 15 },
        { zone: "Moderate (15-25 km/h)", min: 15, max: 25 },
        { zone: "Fast (25-35 km/h)", min: 25, max: 35 },
        { zone: "Very Fast (35-45 km/h)", min: 35, max: 45 },
        { zone: "Sprint (45+ km/h)", min: 45, max: 999 },
      ];
      speedZoneModel = "cycling";
    }

    const zoneData = bands.map(z => {
      const seconds = speedValues.filter(s => s >= z.min && s < z.max).length;
      return {
        zone: z.zone,
        range_kmh: z.max >= 999 ? `${z.min}+` : `${z.min}-${z.max}`,
        time_seconds: seconds,
        time_formatted: formatDuration(seconds),
        pct: round(seconds / speedValues.length * 100, 1),
      };
    });
    speedZones = { zone_model: speedZoneModel, zones: zoneData };
  }

  if (hrZones || powerZones || speedZones) {
    trainingZones = { hr_zones: hrZones, power_zones: powerZones, speed_zones: speedZones, cadence_zones: null };
  }

  // ═══ Gradient Analysis ═══
  let gradientAnalysis: any = null;
  if (gradeValues.length > 100) {
    // Distribution across gradient bands
    const bands = [
      { label: "Steep downhill (<-5%)", min: -100, max: -5 },
      { label: "Downhill (-5 to -2%)", min: -5, max: -2 },
      { label: "Flat (-2 to 2%)", min: -2, max: 2 },
      { label: "Gentle uphill (2 to 5%)", min: 2, max: 5 },
      { label: "Moderate uphill (5 to 8%)", min: 5, max: 8 },
      { label: "Steep uphill (>8%)", min: 8, max: 100 },
    ];
    const distribution = bands.map(b => {
      const count = gradeValues.filter(g => g >= b.min && g < b.max).length;
      return { label: b.label, pct: round(count / gradeValues.length * 100, 1) };
    });

    // Steepest segment effort
    let steepestSegment: any = null;
    if (segments.length > 0) {
      const withGrade = segments.filter((s: any) => s.segment?.average_grade != null);
      if (withGrade.length > 0) {
        const steepest = withGrade.sort((a: any, b: any) => Math.abs(b.segment.average_grade) - Math.abs(a.segment.average_grade))[0];
        steepestSegment = { name: steepest.name, grade: `${steepest.segment.average_grade}%`, distance: `${round(steepest.distance / 1000, 2)} km` };
      }
    }

    gradientAnalysis = { distribution, steepest_segment: steepestSegment };
  }

  // ═══ VAM Analysis (enhanced) ═══
  let vamAnalysis: any = null;
  if (altitudeValues.length > 100 && elev > 50 && summary.moving_time_seconds > 0) {
    const overallVam = round(elev / (summary.moving_time_seconds / 3600), 0);

    // Detect individual climbs: sustained uphill (grade > 2%) for > 60 seconds
    const climbs: any[] = [];
    let inClimb = false;
    let climbStart = 0;
    let climbAltStart = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.grade_percent > 2 && !inClimb) {
        inClimb = true;
        climbStart = r.time_seconds;
        climbAltStart = r.altitude_meters || 0;
      }
      if (inClimb && (r.grade_percent <= 0 || i === rows.length - 1)) {
        const duration = r.time_seconds - climbStart;
        const altGain = (r.altitude_meters || 0) - climbAltStart;
        if (duration >= 60 && altGain > 10) {
          const climbVam = round(altGain / (duration / 3600), 0);
          // Estimate km from distance
          const startDist = rows[Math.max(0, rows.findIndex((x: any) => x.time_seconds >= climbStart))]?.distance_meters || 0;
          climbs.push({
            start_km: round(startDist / 1000, 1),
            elevation_gain_m: Math.round(altGain),
            duration_formatted: formatDuration(duration),
            vam: climbVam,
          });
        }
        inClimb = false;
      }
    }

    const bestClimb = climbs.length > 0 ? climbs.sort((a, b) => b.vam - a.vam)[0] : null;

    vamAnalysis = {
      overall_vam: overallVam,
      total_climbs_detected: climbs.length,
      climbs: climbs.slice(0, 10),
      best_vam_climb: bestClimb,
    };
  }

  // ═══ Estimated VO2max ═══
  let vo2max: any = null;
  // Method 1: Power-based (ACSM cycling metabolic equation) — most accurate
  // VO2max ≈ (10.8 × 20min_power / weight) + 7
  if (hasPowerMeter && rider.weightKg && rider.weightKg > 0 && bestPowerRaw["20min"]) {
    const p20 = bestPowerRaw["20min"];
    const est = round((10.8 * p20 / rider.weightKg) + 7, 1);
    let level = "";
    if (est >= 80) level = "World-class";
    else if (est >= 70) level = "Elite";
    else if (est >= 60) level = "Excellent";
    else if (est >= 50) level = "Very Good";
    else if (est >= 40) level = "Good";
    else if (est >= 30) level = "Fair";
    else level = "Below average";
    vo2max = { value: est, unit: "ml/kg/min", method: "power (ACSM)", level, source: `20min best: ${p20}W / ${rider.weightKg}kg` };
  }
  // Method 2: HR-based fallback (Uth formula) — less accurate but works without power
  else if (effectiveMaxHr && effectiveRestHr && effectiveRestHr < effectiveMaxHr) {
    const est = round(15.3 * (effectiveMaxHr / effectiveRestHr), 1);
    let level = "";
    if (est >= 80) level = "World-class";
    else if (est >= 70) level = "Elite";
    else if (est >= 60) level = "Excellent";
    else if (est >= 50) level = "Very Good";
    else if (est >= 40) level = "Good";
    else if (est >= 30) level = "Fair";
    else level = "Below average";
    vo2max = { value: est, unit: "ml/kg/min", method: "HR (Uth formula)", level, source: `maxHR ${effectiveMaxHr} / restHR ${effectiveRestHr}` };
  }

  // ═══ Workout Analysis (HR-only, no GPS) ═══
  let workoutAnalysis: any = null;
  if (isWorkout && hrValues.length > 60) {
    // Effort interval detection: scan for consecutive HR spikes above threshold
    const intervalThreshold = effectiveLthr
      ? Math.round(effectiveLthr * 0.90)  // 90% LTHR
      : effectiveMaxHr
        ? Math.round(effectiveMaxHr * 0.75) // 75% maxHR fallback
        : null;

    const intervals: { work_seconds: number; rest_seconds: number; peak_hr: number; avg_work_hr: number }[] = [];
    if (intervalThreshold) {
      let inWork = false, workStart = 0, workPeak = 0, workHrSum = 0, workPts = 0;
      let restStart = 0;
      const MIN_WORK = 30, MIN_REST = 10; // seconds min to count
      for (let i = 0; i < hrValues.length; i++) {
        const hr = hrValues[i];
        if (!inWork && hr >= intervalThreshold) {
          if (restStart > 0 && intervals.length > 0) {
            intervals[intervals.length - 1].rest_seconds = i - restStart;
          }
          inWork = true; workStart = i; workPeak = hr; workHrSum = hr; workPts = 1;
        } else if (inWork && hr >= intervalThreshold) {
          if (hr > workPeak) workPeak = hr;
          workHrSum += hr; workPts++;
        } else if (inWork && hr < intervalThreshold) {
          const dur = i - workStart;
          if (dur >= MIN_WORK) {
            intervals.push({ work_seconds: dur, rest_seconds: 0, peak_hr: workPeak, avg_work_hr: Math.round(workHrSum / workPts) });
          }
          inWork = false; restStart = i;
        }
      }
      if (inWork && hrValues.length - workStart >= MIN_WORK) {
        intervals.push({ work_seconds: hrValues.length - workStart, rest_seconds: 0, peak_hr: workPeak, avg_work_hr: Math.round(workHrSum / workPts) });
      }
    }

    // Workout Intensity Score: zone-weighted (Z1=1…Z5=5), normalized 0-100
    let wis: number | null = null;
    let wisLabel = "";
    if (trainingZones?.hr_zones?.zones) {
      const weights = [1, 2, 3, 4, 5];
      const weighted = trainingZones.hr_zones.zones.reduce((sum: number, z: any, i: number) => sum + z.pct * weights[i], 0);
      // max possible = 100 * 5 = 500; normalize to 100
      wis = round(weighted / 5);
      if (wis < 30) wisLabel = "Light";
      else if (wis < 50) wisLabel = "Moderate";
      else if (wis < 70) wisLabel = "Hard";
      else if (wis < 85) wisLabel = "Very Hard";
      else wisLabel = "Max";
    }

    // Time above/below LTHR
    let timeAboveLthr: any = null;
    if (effectiveLthr && hrValues.length > 0) {
      const aboveSec = hrValues.filter(h => h >= effectiveLthr!).length;
      const belowSec = hrValues.length - aboveSec;
      timeAboveLthr = {
        above_seconds: aboveSec,
        above_pct: round(aboveSec / hrValues.length * 100, 1),
        below_seconds: belowSec,
        below_pct: round(belowSec / hrValues.length * 100, 1),
        lthr_used: effectiveLthr,
      };
    }

    const avgWorkSec = intervals.length > 0 ? Math.round(intervals.reduce((s, i) => s + i.work_seconds, 0) / intervals.length) : null;
    const avgRestSec = intervals.length > 1 ? Math.round(intervals.slice(0, -1).reduce((s, i) => s + i.rest_seconds, 0) / (intervals.length - 1)) : null;

    // ─── 1. HR Recovery Rate ───
    // Find top-5 HR peaks, measure drop 30s and 60s after each, average
    let hrRecoveryRate: any = null;
    if (hrValues.length > 120) {
      const WINDOW = 60;
      const peaks: { idx: number; hr: number }[] = [];
      for (let i = 30; i < hrValues.length - WINDOW; i++) {
        if (hrValues[i] > hrValues[i - 1] && hrValues[i] > hrValues[i + 1]) {
          peaks.push({ idx: i, hr: hrValues[i] });
        }
      }
      peaks.sort((a, b) => b.hr - a.hr);
      const top = peaks.slice(0, 5);
      if (top.length > 0) {
        const drops60 = top.map(p => p.hr - hrValues[p.idx + 60]).filter(d => d > 0);
        const drops30 = top.map(p => p.hr - hrValues[p.idx + 30]).filter(d => d > 0);
        const avg60 = drops60.length ? Math.round(drops60.reduce((a, b) => a + b, 0) / drops60.length) : null;
        const avg30 = drops30.length ? Math.round(drops30.reduce((a, b) => a + b, 0) / drops30.length) : null;
        let label = "";
        if (avg60 !== null) {
          if (avg60 >= 30) label = "Excellent";
          else if (avg60 >= 20) label = "Good";
          else if (avg60 >= 12) label = "Fair";
          else label = "Needs work";
        }
        hrRecoveryRate = { drop_30s_bpm: avg30, drop_60s_bpm: avg60, label, note: ">30 bpm/min = excellent" };
      }
    }

    // ─── 2. Consistency Score (CV) ───
    const hrMean = hrValues.reduce((a, b) => a + b, 0) / hrValues.length;
    const hrStddev = round(Math.sqrt(hrValues.reduce((s, v) => s + (v - hrMean) ** 2, 0) / hrValues.length), 1);
    const cv = round(hrStddev / hrMean * 100, 1);
    let cvLabel = "";
    if (cv < 5) cvLabel = "Very steady (yoga/light cardio)";
    else if (cv < 10) cvLabel = "Moderate variation (mixed effort)";
    else if (cv < 15) cvLabel = "Variable (circuit/intervals)";
    else cvLabel = "Highly variable (HIIT/CrossFit)";
    const consistencyScore = { cv_pct: cv, label: cvLabel, stddev_bpm: hrStddev };

    // ─── 3. HR Progression (thirds) ───
    const third = Math.floor(hrValues.length / 3);
    const avgThird = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    const t1 = avgThird(hrValues.slice(0, third));
    const t2 = avgThird(hrValues.slice(third, third * 2));
    const t3 = avgThird(hrValues.slice(third * 2));
    let progressionLabel = "";
    if (t3 > t2 && t2 > t1) progressionLabel = "Progressive build";
    else if (t1 > t2 && t1 > t3) progressionLabel = "Front-loaded";
    else if (t2 > t1 && t2 > t3) progressionLabel = "Interval burst (peak middle)";
    else progressionLabel = "Steady-state";
    const hrProgression = { early_avg: t1, mid_avg: t2, late_avg: t3, pattern: progressionLabel };

    // ─── 4. Time to Peak HR ───
    const peakIdx = hrValues.indexOf(Math.max(...hrValues));
    const timeToPeakPct = round(peakIdx / hrValues.length * 100, 1);
    let timeToPeakLabel = "";
    if (timeToPeakPct < 20) timeToPeakLabel = "Aggressive start";
    else if (timeToPeakPct < 70) timeToPeakLabel = "Well structured";
    else timeToPeakLabel = "Progressive build";
    const timeToPeak = {
      at_pct: timeToPeakPct,
      at_seconds: peakIdx,
      at_formatted: formatDuration(peakIdx),
      label: timeToPeakLabel,
    };

    // ─── 5. Recovery Ratio ───
    const recoveryThreshold = effectiveLthr
      ? Math.round(effectiveLthr * 0.75)
      : effectiveMaxHr
        ? Math.round(effectiveMaxHr * 0.60)
        : null;
    let recoveryRatio: any = null;
    if (recoveryThreshold) {
      const recoverySec = hrValues.filter(h => h < recoveryThreshold).length;
      const recoveryPct = round(recoverySec / hrValues.length * 100, 1);
      let recoveryLabel = "";
      if (recoveryPct > 40) recoveryLabel = "Interval session (real rest between sets)";
      else if (recoveryPct > 20) recoveryLabel = "Mixed effort";
      else recoveryLabel = "Continuous steady-state";
      recoveryRatio = { threshold_bpm: recoveryThreshold, recovery_seconds: recoverySec, recovery_pct: recoveryPct, label: recoveryLabel };
    }

    // ─── 6. EPOC Estimate ───
    let epocEstimate: any = null;
    if (trainingZones?.hr_zones?.zones) {
      // kcal/sec multipliers per zone (approximate, based on excess O2 consumption research)
      const epocFactors = [0.005, 0.010, 0.018, 0.030, 0.050];
      const epocKcal = trainingZones.hr_zones.zones.reduce((sum: number, z: any, i: number) => {
        return sum + z.time_seconds * epocFactors[i];
      }, 0);
      const weight = rider.weightKg || 75;
      const scaled = round(epocKcal * (weight / 75), 1); // scale by weight
      let epocLabel = "";
      if (scaled < 20) epocLabel = "Minimal afterburn (recovery session)";
      else if (scaled < 60) epocLabel = "Moderate afterburn";
      else if (scaled < 120) epocLabel = "Significant afterburn (HIIT-level)";
      else epocLabel = "High afterburn (intense HIIT)";
      epocEstimate = { kcal: scaled, label: epocLabel, note: "Estimated post-exercise calorie burn (EPOC)" };
    }

    workoutAnalysis = {
      wis: wis !== null ? { score: wis, label: wisLabel } : null,
      intervals_detected: intervals.length,
      interval_threshold_bpm: intervalThreshold,
      avg_work_duration: avgWorkSec ? formatDuration(avgWorkSec) : null,
      avg_rest_duration: avgRestSec ? formatDuration(avgRestSec) : null,
      work_rest_ratio: avgWorkSec && avgRestSec ? round(avgWorkSec / avgRestSec, 1) : null,
      interval_table: intervals.map((iv, idx) => ({
        interval: idx + 1,
        work: formatDuration(iv.work_seconds),
        rest: iv.rest_seconds > 0 ? formatDuration(iv.rest_seconds) : "—",
        peak_hr: iv.peak_hr,
        avg_work_hr: iv.avg_work_hr,
      })),
      time_above_below_lthr: timeAboveLthr,
      hr_recovery_rate: hrRecoveryRate,
      consistency_score: consistencyScore,
      hr_progression: hrProgression,
      time_to_peak_hr: timeToPeak,
      recovery_ratio: recoveryRatio,
      epoc_estimate: epocEstimate,
    };
  }

  // ═══ Cadence Zones → inject into training_zones ═══
  let cadenceZones: any = null;
  if (cadenceValues.length > 0) {
    const mkCadZone = (
      bands: { zone: string; min: number; max: number }[],
      values: number[],
      scale: number,
      unit: string
    ) => ({
      unit,
      zones: bands.map(z => {
        const lo = z.min / scale, hi = z.max / scale;
        const seconds = values.filter(v => v >= lo && (z.max >= 9999 ? true : v < hi)).length;
        return { zone: z.zone, range: z.max >= 9999 ? `${z.min}+` : `${z.min}–${z.max}`, time_seconds: seconds, time_formatted: formatDuration(seconds), pct: round(seconds / values.length * 100, 1) };
      }),
    });

    if (isRun) {
      cadenceZones = mkCadZone([
        { zone: "Z1 Low (<165 spm)",         min: 0,   max: 165  },
        { zone: "Z2 Moderate (165-172 spm)",  min: 165, max: 173  },
        { zone: "Z3 Optimal (173-185 spm)",   min: 173, max: 185  },
        { zone: "Z4 High (185-200 spm)",      min: 185, max: 200  },
        { zone: "Z5 Sprint (200+ spm)",       min: 200, max: 9999 },
      ], cadenceValues, 2, "spm");
    } else if (isWalk) {
      cadenceZones = mkCadZone([
        { zone: "Z1 Slow (<80 spm)",      min: 0,   max: 80   },
        { zone: "Z2 Average (80-100 spm)", min: 80,  max: 100  },
        { zone: "Z3 Brisk (100-120 spm)",  min: 100, max: 120  },
        { zone: "Z4 Power (120-135 spm)",  min: 120, max: 135  },
        { zone: "Z5 Peak (135+ spm)",      min: 135, max: 9999 },
      ], cadenceValues, 2, "spm");
    } else {
      cadenceZones = mkCadZone([
        { zone: "Z1 Grind (<70 rpm)",     min: 0,   max: 70   },
        { zone: "Z2 Steady (70-85 rpm)",  min: 70,  max: 85   },
        { zone: "Z3 Optimal (85-95 rpm)", min: 85,  max: 95   },
        { zone: "Z4 High (95-110 rpm)",   min: 95,  max: 110  },
        { zone: "Z5 Spin (110+ rpm)",     min: 110, max: 9999 },
      ], cadenceValues, 1, "rpm");
    }
    if (trainingZones) trainingZones.cadence_zones = cadenceZones;
    else trainingZones = { hr_zones: null, power_zones: null, speed_zones: null, cadence_zones: cadenceZones };
  }

  // ═══ Wind / Meteorological Analysis ═══
  let windAnalysis: any = null;
  const weather = raw.weather;

  if (weather && rows.some((r: any) => r.latitude != null)) {
    // Normalize to array of snapshots — handle both new multi-point and legacy single-point format
    type Snap = { waypoint_pct: number; windspeed_kmh: number | null; wind_direction_deg: number | null; wind_gusts_kmh?: number | null };
    let snapshots: Snap[] = [];
    if (weather.snapshots && Array.isArray(weather.snapshots) && weather.snapshots.length > 0) {
      snapshots = weather.snapshots;
    } else if (weather.at_start) {
      // Legacy single-point
      snapshots = [{ waypoint_pct: 0, ...weather.at_start }];
    }

    if (snapshots.length > 0 && snapshots.some(s => s.wind_direction_deg != null)) {
      // Bearing between two GPS points (degrees, 0=N, 90=E)
      const bearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const toRad = (d: number) => d * Math.PI / 180;
        const dLon = toRad(lon2 - lon1);
        const y = Math.sin(dLon) * Math.cos(toRad(lat2));
        const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
        return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
      };

      // For each GPS row, find the nearest waypoint snapshot by position percentage
      const getSnapshot = (rowIdx: number, totalRows: number): Snap => {
        const rowPct = rowIdx / Math.max(totalRows - 1, 1) * 100;
        return snapshots.reduce((best, s) =>
          Math.abs(s.waypoint_pct - rowPct) < Math.abs(best.waypoint_pct - rowPct) ? s : best
        );
      };

      const movingGps = rows.filter((r: any) => r.is_moving !== false && r.latitude != null);
      let headwindSec = 0, tailwindSec = 0, crosswindSec = 0, analyzedSec = 0;

      // Per-waypoint segment stats for detailed breakdown
      const segStats: Record<number, { hw: number; tw: number; cw: number; total: number; windSpeed: number | null; windDir: number | null }> = {};
      for (const s of snapshots) {
        segStats[s.waypoint_pct] = { hw: 0, tw: 0, cw: 0, total: 0, windSpeed: s.windspeed_kmh, windDir: s.wind_direction_deg };
      }

      for (let i = 1; i < movingGps.length; i++) {
        const prev = movingGps[i - 1], cur = movingGps[i];
        const snap = getSnapshot(i, movingGps.length);
        if (snap.wind_direction_deg == null) continue;

        const hdg = bearing(prev.latitude, prev.longitude, cur.latitude, cur.longitude);
        const rel = ((hdg - snap.wind_direction_deg) + 360) % 360;

        analyzedSec++;
        const seg = segStats[snap.waypoint_pct];
        seg.total++;

        if (rel <= 45 || rel >= 315) { headwindSec++; seg.hw++; }
        else if (rel >= 135 && rel <= 225) { tailwindSec++; seg.tw++; }
        else { crosswindSec++; seg.cw++; }
      }

      if (analyzedSec > 0) {
        // Net wind effect: weighted average of headwind components across all snapshots
        const avgHeadwindComponent = round(
          snapshots.reduce((sum, s) => {
            if (s.windspeed_kmh == null || s.wind_direction_deg == null) return sum;
            const seg = segStats[s.waypoint_pct];
            if (seg.total === 0) return sum;
            const segHwPct = seg.hw / seg.total;
            const segTwPct = seg.tw / seg.total;
            return sum + s.windspeed_kmh * (segHwPct - segTwPct) * (seg.total / analyzedSec);
          }, 0), 1
        );

        const segBreakdown = Object.entries(segStats)
          .filter(([, v]) => v.total > 0)
          .map(([pct, v]) => {
            const hwPct = v.hw / v.total;
            const twPct = v.tw / v.total;
            const segNet = v.windSpeed != null ? round(v.windSpeed * (hwPct - twPct), 1) : null;
            return {
              waypoint_pct: Number(pct),
              wind_speed_kmh: v.windSpeed,
              wind_direction_deg: v.windDir,
              wind_direction_cardinal: v.windDir != null ? degToCardinal(v.windDir) : null,
              headwind_pct: round(hwPct * 100, 1),
              tailwind_pct: round(twPct * 100, 1),
              crosswind_pct: round(v.cw / v.total * 100, 1),
              net_kmh: segNet,
            };
          });

        windAnalysis = {
          data_points: analyzedSec,
          waypoints_used: snapshots.length,
          headwind_pct: round(headwindSec / analyzedSec * 100, 1),
          tailwind_pct: round(tailwindSec / analyzedSec * 100, 1),
          crosswind_pct: round(crosswindSec / analyzedSec * 100, 1),
          net_wind_effect_kmh: avgHeadwindComponent,
          net_wind_label: avgHeadwindComponent > 1 ? "Net headwind (drag)" : avgHeadwindComponent < -1 ? "Net tailwind (assist)" : "Roughly neutral",
          by_segment: segBreakdown.length > 1 ? segBreakdown : null,
        };
      }
    }
  }

  // ═══ Full meteorological summary ═══
  let meteo: any = null;
  if (weather) {
    const ws = weather.at_start;
    meteo = {
      source: weather.source,
      condition: weather.condition_summary,
      waypoints_sampled: weather.waypoints_fetched ?? 1,
      at_activity_start: ws ? {
        temperature_c: ws.temperature_c,
        apparent_temperature_c: ws.apparent_temperature_c,
        humidity_pct: ws.relative_humidity_pct,
        precipitation_mm: ws.precipitation_mm,
        windspeed_kmh: ws.windspeed_kmh,
        wind_gusts_kmh: ws.wind_gusts_kmh,
        wind_direction: ws.wind_direction_deg != null ? `${ws.wind_direction_deg}° (${degToCardinal(ws.wind_direction_deg)})` : null,
        weather_description: ws.weather_description,
      } : null,
      snapshots: weather.snapshots?.map((s: any) => ({
        waypoint_pct: s.waypoint_pct,
        utc_time: s.utc_time,
        temperature_c: s.temperature_c,
        windspeed_kmh: s.windspeed_kmh,
        wind_direction: s.wind_direction_deg != null ? `${s.wind_direction_deg}° (${degToCardinal(s.wind_direction_deg)})` : null,
        weather_description: s.weather_description,
      })) ?? null,
      wind_analysis: windAnalysis,
    };
  }

  // ═══ Build output ═══
  return {
    _instructions: "All math is pre-computed from every data point. DO NOT recalculate. Just interpret the numbers and write the analysis per AI_ANALYSIS_INSTRUCTIONS.md.",
    data_points_analyzed: totalPoints,
    pogacar_score: isSurf ? null : pogacarScore,
    kipchoge_score: kipchogeScore,
    summary_card: summaryCard,
    surf_analysis: surfAnalysis,
    pacing: {
      type: pacingType,
      first_half: { avg_speed_kmh: avgS(h1), avg_hr: avgH(h1) },
      second_half: { avg_speed_kmh: avgS(h2), avg_hr: avgH(h2) },
      fastest_km: fastestKm,
      slowest_km: slowestKm,
      fastest_5min_window: fastW,
      slowest_5min_window: slowW,
      all_splits: splitsFormatted,
    },
    heart_rate: hrValues.length > 0 ? {
      stats: computeStats(hrValues),
      peak_efforts: peakHR,
      cardiac_drift: cardiacDrift,
      uphill_vs_flat: climbing ? { uphill_avg_hr: climbing.uphill_avg_hr, flat_avg_hr: climbing.flat_avg_hr, diff: climbing.uphill_avg_hr && climbing.flat_avg_hr ? climbing.uphill_avg_hr - climbing.flat_avg_hr : null } : null,
    } : null,
    power: hasPowerMeter ? {
      avg_power: Math.round(summary.average_watts),
      normalized_power: normalizedPower,
      weighted_avg_power: normalizedPower, // alias
      variability_index: normalizedPower && summary.average_watts ? round(normalizedPower / summary.average_watts, 2) : null,
      best_efforts: bestPower,
      has_power_meter: true,
    } : summary.average_watts ? {
      estimated_avg_power: Math.round(summary.average_watts),
      has_power_meter: false,
      note: "Strava-estimated power (no power meter). Treat as approximate.",
    } : null,
    climbing,
    cadence: cadenceValues.length > 0 ? (() => {
      const stats = computeStats(cadenceValues)!;

      if (isRun) {
        const spmStats = {
          count: stats.count,
          avg: round(stats.avg * 2, 0), min: round(stats.min * 2, 0), max: round(stats.max * 2, 0),
          median: round(stats.median * 2, 0), p5: round(stats.p5 * 2, 0), p95: round(stats.p95 * 2, 0),
          stddev: round(stats.stddev * 2, 1),
        };
        return { stats: spmStats, unit: "spm", pro_benchmark: "170-180 spm", is_low: spmStats.avg < 160 };
      }

      if (isWalk) {
        const spmStats = {
          count: stats.count,
          avg: round(stats.avg * 2, 0), min: round(stats.min * 2, 0), max: round(stats.max * 2, 0),
          median: round(stats.median * 2, 0), p5: round(stats.p5 * 2, 0), p95: round(stats.p95 * 2, 0),
          stddev: round(stats.stddev * 2, 1),
        };
        return { stats: spmStats, unit: "spm", pro_benchmark: "100-120 spm", is_low: spmStats.avg < 100 };
      }

      return { stats, unit: "rpm", pro_benchmark: "85-95 rpm", is_low: stats.avg < 75 };
    })() : null,
    segments_summary: { total: segments.length, prs: prSegs.length, highlight_table: segTable },
    best_efforts_running: bestEfforts.length > 0 ? bestEfforts.map((e: any) => ({ name: e.name, time: formatTime(e.elapsed_time), pr: e.pr_rank === 1 ? "🥇 PR" : e.pr_rank ? `#${e.pr_rank}` : "—" })) : null,
    laps: laps.length > 1 ? laps.map((l: any) => ({ lap: l.lap_index, distance_km: round(l.distance / 1000, 2), time: formatDuration(l.moving_time), speed_kmh: round(l.average_speed * 3.6), avg_hr: l.average_heartrate ? Math.round(l.average_heartrate) : null })) : null,
    five_minute_windows: timeWindows,
    // NEW ADVANCED METRICS
    training_metrics: (isSurf || isWorkout) ? null : trainingMetrics,
    relative_effort: relativeEffort,
    aerobic_decoupling: (isSurf || isWorkout) ? null : aerobicDecoupling,
    power_to_weight: (isSurf || isWorkout) ? null : powerToWeight,
    power_skills: (isSurf || isWorkout) ? null : powerSkills,
    torque: (isSurf || isWorkout) ? null : torque,
    training_zones: isSurf
      ? (trainingZones ? { hr_zones: trainingZones.hr_zones, power_zones: null, speed_zones: null } : null)
      : isWorkout
        ? (trainingZones ? { hr_zones: trainingZones.hr_zones, power_zones: null, speed_zones: null, cadence_zones: trainingZones.cadence_zones ?? null } : null)
        : trainingZones,
    gradient_analysis: (isSurf || isWorkout) ? null : gradientAnalysis,
    vam_analysis: (isSurf || isWorkout) ? null : vamAnalysis,
    workout_analysis: isWorkout ? workoutAnalysis : null,
    heart_points: heartPoints,
    vo2max,
    meteorology: meteo,
  };
}

