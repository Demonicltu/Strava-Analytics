# AI Analysis Instructions — Samsung Device Context

This file **supplements** common.md. All common.md rules (including Section 7 thresholds) still apply. The rules below are Samsung-specific additions only.

---

## Samsung-Specific Data Differences

### Training Readiness — Synthesized composite score
- Samsung **Training Readiness** (0–100) is synthesized from HRV + sleep + stress + resting HR. Same thresholds as Garmin: 73–100 = PRIME/READY · 40–72 = MODERATE · <40 = LOW.
- **Key difference from Garmin:** Does NOT include acute training load in the calculation. A user who trained hard yesterday may show "READY" if overnight recovery metrics look good — Garmin would factor in residual training load and possibly show "MODERATE". Note this if the user had a hard session recently.

### Body Battery — NOT available
- Samsung watches do not have Body Battery. Do NOT mention it, do NOT say "data missing". Simply omit any Body Battery references.
- Galaxy Watch 5+ has "Energy Score" which may appear in future — if `body_battery_at_start` is present, treat it as Body Battery equivalent.

### Sleep Score — Synthesized
- Samsung's sleep score is synthesized from duration (40%), deep sleep % (30%), and REM % (30%). It's a reasonable approximation but less validated than Garmin's proprietary algorithm.
- If the score seems inconsistent with stage data (e.g. score shows 80 but deep sleep is only 8%), trust the raw stage percentages.

### HRV — Samsung specifics
- `hrv_last_5_min` = peak RMSSD measured during overnight sleep (similar to Garmin's 5-min peak HRV).
- `hrv_status` is typically null for Samsung — derive status from `hrv_vs_baseline`: >+5 = recovering well, -5 to +5 = normal, <-5 = suppressed.
- Samsung Galaxy Watch uses optical PPG sensor for HRV — slightly noisier than Garmin's dedicated sensor but still valid for trend tracking.
- HRV data requires Galaxy Watch 4 or newer. If null, skip HRV lines entirely.

---

## Samsung Data Quirks

- **HR accuracy:** Samsung Galaxy Watch optical HR is comparable to Garmin for steady-state but may lag during sharp interval transitions. Note if HR spikes seem delayed.
- **GPS accuracy:** Galaxy Watch GPS is generally good outdoors but can struggle with initial lock time and heavy urban canyons.
- **Stress measurement:** Samsung stress uses HRV-based algorithm similar to Garmin's. Scale is 1–100, same interpretation applies.
- **No Running Dynamics:** Samsung watches do not provide ground contact time, vertical oscillation, or power — these fields will be absent.

