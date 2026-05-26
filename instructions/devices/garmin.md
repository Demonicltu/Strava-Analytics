# AI Analysis Instructions — Garmin Device Context

This file **supplements** common.md. All common.md rules (including Section 7 thresholds) still apply. The rules below are Garmin-specific additions only.

---

## Garmin-Specific Data Fields

### Training Effect (if present in `activity_data`)
- **Aerobic Training Effect (0-5):** Garmin's proprietary aerobic adaptation signal. 1.0-1.9 = Minor, 2.0-2.9 = Maintaining, 3.0-3.9 = Improving, 4.0-4.9 = Highly Improving, 5.0 = Overreaching.
- **Anaerobic Training Effect:** Same scale. High values (4+) = significant anaerobic stimulus.
- Mention these if present and notable.

### Body Battery — post-activity cost
- Post-activity battery drop indicates session cost — large drop after a short session = higher stress than expected.

### Training Readiness — Garmin composite score
- Garmin **Training Readiness** (0–100) combines HRV status, sleep quality, recovery time, and acute load. Shown in section 7 from `garmin_wellness`. Thresholds: 73–100 = PRIME/READY · 40–72 = MODERATE · <40 = LOW. If unusual (e.g. high readiness but suppressed HRV) note the discrepancy.

### HRV — additional fields
- `hrv_weekly_avg` = 7-day rolling baseline for comparison (supplements `hrv_vs_baseline` in common.md).

---

## Garmin Data Quirks

- **Running Dynamics** (cadence, ground contact time, vertical oscillation): Garmin-specific running metrics. If present, add valuable context; only available with compatible footpod or Garmin running watch.
- **Garmin HR accuracy:** Optical wrist HR can lag 15-30s vs chest strap — affects interval peak HR readings. Note if HR spikes seem unusually delayed.
- **GPS accuracy:** Garmin Fenix/Edge generally has high GPS accuracy. Indoor activities or heavy tree cover may show GPS drift.
