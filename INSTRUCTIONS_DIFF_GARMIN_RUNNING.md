# Diff: AI Analysis Instructions — Garmin & Running Sections
### Old: `AI_ANALYSIS_INSTRUCTIONS.md` → New: `instructions/common.md` + `instructions/running.md` + `instructions/devices/garmin.md`

---

## Summary of Changes

| Area | Old | New |
|------|-----|-----|
| File structure | Single monolithic file (665 lines) | Split into `common.md` + sport files + device files |
| Running score format | Inline in main file, mixed with cycling rules | Dedicated `running.md` |
| Garmin wellness | Inline section 7 in main file | Separate `instructions/devices/garmin.md` |
| Section 7 detail level | Full verbose rules (44 lines) | Compact thresholds block + cross-reference rules |
| Running-specific skips | Buried in Note #5 at bottom | Top of `running.md` in "Skip entirely" rule |
| Running cadence note | Not mentioned | Added: "spm if present but often not meaningful" |
| Garmin HR lag note | Not present | **NEW** in `garmin.md`: "Optical wrist HR can lag 15-30s vs chest strap" |
| Garmin Running Dynamics | Not present | **NEW** in `garmin.md`: cadence/GCT/vertical oscillation note |
| SpO2 threshold | Mentioned in section 7 | Promoted to dedicated field in `garmin.md` |
| Body Battery drop | Not discussed | **NEW** in `garmin.md`: "large drop after short session = higher stress than expected" |

---

## 🏃 Running Section

### Section 1 — Runner Score

#### OLD (`AI_ANALYSIS_INSTRUCTIONS.md` lines 33–45)
```markdown
**Running format:** Use `runner_score` (same structure as cycling). Replace Pogačar line with Kipchoge Factor
from `kipchoge_score.composite_pct`. Omit Personal score line.

## 🏅 YOUR RUNNER SCORE

  🎯 Category:         Strong Amateur — Mid tier
  📊 Tier progress:    74.2% toward next tier
  🏆 Kipchoge Factor:  38.1%  (world's best — for fun)

── Strong Amateur breakdown ──
  [metric lines verbatim from runner_score.metrics]
```

#### NEW (`instructions/running.md` lines 9–24)
```markdown
### 1. 🏅 Your Runner Score (ALWAYS START WITH THIS)

Use `runner_score` as HEADLINE. Fall back to `kipchoge_score` if null.

## 🏅 YOUR RUNNER SCORE

  🎯 Category:         Strong Amateur — Mid tier
  📊 Tier progress:    74.2% toward next tier
  🏆 Kipchoge Factor:  38.1%  (world's best — for fun)

── Strong Amateur breakdown ──
  [metric lines verbatim from runner_score.metrics]
```

**What changed:**
- `runner_score` now has a **dedicated section header** instead of being a sub-note under cycling
- Explicit fallback: "Fall back to `kipchoge_score` if null" — this was implicit before
- Removed the confusing "same structure as cycling" cross-reference
- `Tier progress` line **removed** from the new `running.md` format block (see line 48 — "Omit Tier progress / Personal score lines not applicable to running")

---

### Section 2 — Summary Card (Running)

#### OLD (`AI_ANALYSIS_INSTRUCTIONS.md` lines 63–84) — generic card shown, running mentioned only in Note #5
```
## 📊 RIDE SUMMARY   ← default was a cycling card
...
⚡ Avg Speed:  27.2 km/h
❤️ Avg HR:     155 bpm (max 181)
🦵 Avg Power:  195 W (NP: 215 W)
🔄 Cadence:    67 rpm avg
📱 Device:     Wahoo ELEMNT ROAM
```
Note #5 said: *"Running: show Avg Pace (min:sec/km), skip cadence/power/watts sections"*

#### NEW (`instructions/running.md` lines 37–48) — dedicated running card
```
## 📊 RUN SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏃 Type:       Trail Run
📏 Distance:   10.5 km
⏱️ Avg Pace:   5:24/km
🔝 Best Pace:  3:51/km
⛰️ Elevation:  280 m gained
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**What changed:**
- Running now has its **own example card** — no longer needs to look at cycling card and mentally subtract fields
- `📱 Device` field **dropped** from running card
- `🔝 Best Pace` added (was not in old running guidance)
- Explicitly: "Skip cadence/power/watts fields" — promoted from buried Note #5

---

### Section 4.1 — Pacing (Running)

#### OLD — no running-specific override, generic cycling pacing used

#### NEW (`instructions/running.md` lines 52–54)
```markdown
### 4.1 Pacing Strategy (Running-specific)

Use pace (min:sec/km) in all tables — not km/h. Note elevation-adjusted pace if trail run.
```

**What changed:**
- **NEW**: explicit override that pacing tables must use `min:sec/km` not `km/h`
- **NEW**: trail run callout — "flag any technical sections with dramatically slower pace"

---

### Section 4.7 — Climbing (Running)

#### OLD — threshold was `elevation > 200m` for all sports

#### NEW (`instructions/running.md` line 58)
```markdown
### 4.7 Climbing Analysis (if elevation > 100m)
```

**What changed:**
- Climbing threshold lowered from **200m → 100m** for running (runs are shorter, 100m is significant)
- Added: "note grade-adjusted pace on climbs vs flats"

---

### Sections Skipped for Running

#### OLD (`AI_ANALYSIS_INSTRUCTIONS.md` Note #5, line 657) — buried at the end:
```
Running: skip cadence/power/watts sections. Kipchoge score.
```

#### NEW (`instructions/running.md` lines 64–69) — explicit skip list at top:
```markdown
- **Skip entirely:** 4.3 Power Analysis, 4.5 Power-to-Weight, 4.8 Gradient/VAM,
  4.9 Torque, 4.10 Cadence (rpm-based — running cadence is spm if present but
  often not meaningful), Power Zones in 4.6.
- **Best efforts** from `best_efforts`: show 400m, 1km, 1mi, 5km, 10km, half,
  full marathon times if present.
- **Stride rate** (if `cadence` present as steps/min): compare to optimal 170-180 spm.
```

**What changed:**
- Skip list is now **explicit and numbered** — not buried in a footnote
- **NEW**: `best_efforts` field guidance (400m, 1km, 5km, 10km, half/full marathon)
- **NEW**: Stride rate (spm) guidance with 170–180 spm benchmark
- Cadence distinction: rpm (cycling) vs spm (running) now explicit

---

## 🏔️ Garmin Section (Section 7 / devices/garmin.md)

### Section 7 — Readiness & Recovery

#### OLD (`AI_ANALYSIS_INSTRUCTIONS.md` lines 601–645) — 44 lines inline
Key content:
```markdown
**Interpretation rules:**
- HRV: `hrv_vs_baseline` > +3 = above baseline 🟢, -3 to +3 = normal, < -5 = suppressed 🔴
- HRV status: "BALANCED" = good, "UNBALANCED" / "LOW" = recovery flag
- Sleep score: 85+ = excellent, 70–84 = good, 55–69 = fair, <55 = poor
- Body Battery at start: 80–100 = prime, 60–79 = good, 40–59 = moderate, <40 = running low
- Training Readiness: 73–100 = PRIME/READY, 40–72 = MODERATE, <40 = LOW
- `stress_high_pct` >20% of waking day before activity = recovery likely impaired
- **SpO2 during sleep** (<95% average is notable; <90% = flag for altitude or apnea)

**Connect to the activity data — always cross-reference:**
- Low HRV + high activity HR → "HR was likely elevated partly due to..."
- High Body Battery + low HR → "You were fresh..."
- Poor sleep score → note it may have blunted performance
- Excellent readiness + PR → "Conditions were clearly aligned"
- **If readiness was poor but performance was still strong** → highlight mental resilience
```

#### NEW — split across two files:

**`instructions/common.md` lines 283–314** (section 7 — thresholds only):
```markdown
- HRV `hrv_vs_baseline` > +3 = above baseline 🟢, -3 to +3 = normal, < -5 = suppressed 🔴
- Sleep: 85+ excellent, 70-84 good, 55-69 fair, <55 poor
- Body Battery at start: 80-100 prime, 60-79 good, 40-59 moderate, <40 running low
- Training Readiness: 73-100 PRIME/READY, 40-72 MODERATE, <40 LOW
- `stress_high_pct` >20% before activity = recovery likely impaired
```

**`instructions/devices/garmin.md`** (Garmin-specific additions):
```markdown
### Training Effect (NEW — not in old file)
- Aerobic Training Effect (0-5): 1.0-1.9 Minor, 2.0-2.9 Maintaining, 3.0-3.9 Improving,
  4.0-4.9 Highly Improving, 5.0 Overreaching.
- Anaerobic Training Effect: same scale.

### Body Battery
- Post-activity battery drop indicates session cost.
- **NEW**: "large drop after short session = higher stress than expected"

### HRV Status
- `hrv_last_5_min` = peak 5-min HRV during sleep (not full-night avg) — clarified
- `hrv_weekly_avg` = 7-day rolling baseline — now explicitly named

### Garmin Data Quirks (ALL NEW — not in old file)
- Garmin Edge estimated power: if `has_power_meter: false`, note prominently
- Running Dynamics (cadence, GCT, vertical oscillation): Garmin-specific, footpod/watch only
- Garmin HR accuracy: optical wrist HR lags 15-30s vs chest strap — affects interval peaks
- GPS accuracy: Fenix/Edge high accuracy; indoor/tree cover may cause drift
```

**What changed:**
- **Training Effect** field (aerobic + anaerobic 0–5 scale) — **entirely new**, not in old file
- **Body Battery drop** post-activity cost discussion — **entirely new**
- **HR lag warning** (15–30s optical vs chest strap) — **entirely new**
- **Running Dynamics** note (GCT, vertical oscillation) — **entirely new**
- **GPS accuracy** note for indoor/tree cover — **entirely new**
- `hrv_last_5_min` clarification now explicit in `garmin.md` (was buried in old section 7)
- Device note ("removed during cycling") moved from section 7 inline note → `garmin.md` header

---

## No-Change Areas (Garmin/Running)

These were identical between old and new:

| Section | Notes |
|---------|-------|
| Readiness table format (section 7) | Same 7-row format with same emojis |
| HRV delta thresholds (+3/-5) | Identical |
| Sleep score thresholds | Identical |
| "night_before null → use day_of" rule | Identical |
| Don't recalculate rule | Identical |
| Section 7 skip-if-absent rule | Identical |
| Running Kipchoge Factor one-line rule | Identical |
| Running pace format (min:sec/km) | Same intent, now more explicit |

