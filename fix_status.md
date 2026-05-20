# Fix Implementation Status

_Implemented: 2026-05-20_

---

## ✅ HIGH PRIORITY — All implemented

### 1. Pogačar Score — weighted composite (`crunch.ts`)
**Problem:** Naive equal-weight average penalized flat rides for missing climbing%.
**Fix:** Primary metric (power if `has_power_meter`, else speed) = 50% weight. All other available metrics (speed secondary, EF, climbing, cadence) evenly share the remaining 50%.

### 2. Cardiac drift — Friel standard method (`crunch.ts`)
**Problem:** Raw half-split flagged terrain or stop-and-go as drift.
**Fix:**
- **≥60 min activities:** Compare first 30 min (after 10 min warm-up skip) vs last 30 min. Added `method: "Friel (first 30min vs last 30min, skipping 10min warm-up)"` to output.
- **<60 min activities:** Falls back to simple halves with `method: "simple halves (activity <60 min)"` label.

### 3. VO2max + rest HR — Garmin-first (`crunch.ts`, `fast.ts`)
**Problem:** Default `restHr = 60` produced fake VO2max numbers for unconfigured users.
**Fix:** `effectiveRestHr` resolution order: **Garmin `night_before.resting_hr`** (most accurate, updates daily) → **`.env RIDER_REST_HR`** → **`null`** (disables HR-based VO2max entirely if unknown — no fake fallback).
- `crunchActivity` now accepts optional `garminRestHr` parameter.
- `fast.ts` extracts `wellnessCtx.night_before.resting_hr` and passes it before crunching.

### 4. VO2max — FTP-based primary (`crunch.ts`)
**Problem:** Best 20-min from a casual ride gives unreliable VO2max.
**Fix:** Priority chain:
1. **FTP-based** — `(FTP / 0.95)` as 20-min input (FTP is validated, not ride-specific)
2. **Activity 20-min best** — with warning in method field
3. **HR-based (Uth)** — only when `effectiveRestHr` is actually known (not null)

### 5. TSS for runs — no cycling FTP fallback (`crunch.ts`)
**Problem:** Cycling FTP fallback produced legit-looking but wrong run TSS.
**Fix:** Runs without `RUNNER_RFTP_W` set → `trainingMetrics` stays `null`. No fallback to cycling FTP. Removed the misleading `ftp_warning` field.

### 6. `hasPowerMeter` — `device_watts` flag (`crunch.ts`, `index.ts`, `fast.ts`, `bulk_fetch.ts`)
**Problem:** `powerValues.length > 100` is also true for Strava-estimated power streams.
**Fix:** `hasPowerMeter = summary.device_watts === true || (summary.device_watts == null && powerValues.length > 100)` (null-safe fallback for old files).
- Added `device_watts: enriched.activity.device_watts ?? null` to `activity_summary` in **all 3 export sites** (`index.ts`, `fast.ts`, `bulk_fetch.ts`).

---

## ✅ MEDIUM PRIORITY — All implemented

### 7. Wind — cosine headwind component (`crunch.ts`)
**Problem:** `windspeed × (hw% - tw%)` conflated direction frequency with component magnitude.
**Fix:** Per-GPS-point: `headwindComponent = windspeed × cos(relativeAngle_radians)`. Weighted average across all analyzed points.
- Field renamed `headwind_exposure_kmh` (was `net_wind_effect_kmh`).
- Label updated: `"Net headwind exposure"` / `"Net tailwind exposure"`.
- Added `note: "headwind_exposure_kmh = windspeed × cos(angle) — directional exposure index, not a speed delta"`.
- Segment breakdown: `headwind_component_kmh` replaces `net_kmh`.

### 8. Pacing — time-based halves (`crunch.ts`)
**Problem:** km-count halving is unfair on hilly rides where km durations vary hugely.
**Fix:** Split `movingRows` at array midpoint (= equal moving-time per half).
- Output: `split_method: "time-based (equal moving time each half)"` added.
- `first_half` / `second_half` now use stream-row averages (HR + speed), not split-table averages.

### 9. EPOC relabel (`crunch.ts`)
**Problem:** `kcal` field had no scientific basis — fabricated calorie number.
**Fix:** Removed `kcal` field entirely. Output is now:
- `intensity_signal: "Low" | "Moderate" | "High" | "Very High"`
- `note: "Relative intensity signal — not a calorie count. Higher = more post-exercise metabolic demand."`

### 10. Heart Points MET fallback caveat (`crunch.ts`)
**Problem:** MET fallback gives same points to easy recovery ride and hard tempo (no HR).
**Fix:** Added `caveat: "Fixed rate per activity type — does not reflect actual effort intensity. HR-based calculation is more accurate."` to the MET-fallback path.

### 11. Pogačar EF reference 2.6 → 2.9 (`crunch.ts`, `AI_ANALYSIS_INSTRUCTIONS.md`)
**Problem:** 2.6 assumed 170 bpm avg HR; grand tour race avg is 145–155 bpm.
**Fix:** Updated to 2.9 W/bpm (440W / 150 bpm). Metrics string now includes `(rough estimate)`. Instructions table updated.

---

## ✅ LOW PRIORITY / POLISH — All implemented

### 12. Drop 1y period from historical baselines (`summary_utils.ts`)
**Fix:** Removed `{ label: "1 year", days: 365 }` from PERIODS array. Consistent with AI instructions rule "never use 1 year as comparison baseline".

### 13. Compact AI payload + null field stripping (`analyze.ts`, `fast.ts`)
**Fix:**
- `JSON.stringify(payload, (_, v) => v === null ? undefined : v)` — strips null fields (~300 tok saved per call).
- Removed `null, 2` pretty-print from API payload in `analyze.ts` (~4 000 tok saved per call on large rides).
- Disk files (`_crunched.json`) remain pretty-printed for human readability.

### 14. Strip `_instructions` field from crunch output (`crunch.ts`)
**Fix:** Removed `_instructions` field from return object. System prompt (`AI_ANALYSIS_INSTRUCTIONS.md`) already carries this directive. Saves ~38 tokens per call.

### 15. Weather midnight wrap (`weather.ts`)
**Fix:** `diff = Math.min(Math.abs(h - targetHour), 24 - Math.abs(h - targetHour))`. Correctly handles 23:00 vs 00:00 edge case for late-night activity starts.

### 16. Instructions §7 — dead Garmin fields removed (`AI_ANALYSIS_INSTRUCTIONS.md`)
**Fix:** Removed from example table and interpretation rules:
- `📈 Training Status` row (including the full interpretation bullet block)
- `Load ratio` bullet (`acute_load / chronic_load`)
These fields are never populated by `garmin_sync.py` (confirmed in code comments).

### 17. Instructions §7 — stress % denominator clarified (`AI_ANALYSIS_INSTRUCTIONS.md`)
**Fix:** `stress_high_pct >20% of waking day (16 hours)` — denominator now explicit to match `wellness.ts:159` (`WAKING_SEC = 57600`).

### 18. Instructions — 3 new sections added (`AI_ANALYSIS_INSTRUCTIONS.md`)
**Fix:** Added:
- **§4.14 Heart Points** — coverage, thresholds, weekly target, MET caveat
- **§4.15 VO2max Estimate** — value, method reliability, reference ranges
- **§4.16 Workout Analysis** — WIS, interval table, HR recovery, consistency CV, EPOC signal

### 19. Power-to-weight `estimated_level` gated on 20-min power (`crunch.ts`)
**Fix:** `estimated_level` is now `null` when `bestPowerRaw["20min"]` is absent.
- Added `level_note: "estimated_level requires a 20-min best power effort in this activity"` when null.
- Removes misclassification from NP/avg fallback (NP of a tempo ride ≠ 20-min FTP power).

---

## ⏭️ SKIPPED (commented `#` in fix.md)

- **Wave detection threshold** — left as-is per `# Wave detection...` comment
- **Cadence `is_low` threshold** — left as-is per `# Cadence "is_low"...` comment

---

## ⚠️ PARTIALLY DEFERRED

- **Historical context fallback enforcement** — The instruction "fall back to 6mo if 3mo <5 activities" is documented in `AI_ANALYSIS_INSTRUCTIONS.md` but not enforced in code. `buildHistoricalContext` already filters out periods with `< MIN_HISTORY_COUNT (3)` activities. Full enforcement would require adding a `recommended_primary_period` field to the historical context payload — deferred as low-impact.

---

## 🔄 Post-implementation steps

**To benefit from all fixes, re-crunch existing activities:**
```bash
npm run recrunch   # re-crunch all existing output/ files
# OR
npm run bulk       # fetch + re-crunch everything
```

**New activities** (via `npm start` / `npm run fast`) will automatically use all fixes.

**Token savings summary:**
| Change | Tokens saved/call |
|--------|-------------------|
| Compact payload stringify | ~4 000 |
| Null field stripping | ~300 |
| Strip `_instructions` field | ~38 |
| Drop 1y baseline period | ~150 |
| **Total** | **~4 488** |

