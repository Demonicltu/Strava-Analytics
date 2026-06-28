# Samsung Health Wellness — AI Interpretation Guide

This document describes how to interpret wellness data from a **Samsung Galaxy Watch** (exported via Samsung Health → parsed by `samsung_sync.py`). The output schema is identical to `garmin_wellness.json`, so Section 7 (🛌 Readiness & Recovery) of `AI_ANALYSIS_INSTRUCTIONS.md` applies — with the differences noted below.

---

## Data Source

- **Device:** Samsung Galaxy Watch (4/5/6/7 series)
- **Sync method:** Manual export from Samsung Health app → CSV parsing
- **File:** `analysis/samsung_wellness.json` (same schema as `garmin_wellness.json`)

---

## Key Differences from Garmin

| Metric | Garmin | Samsung | AI Handling |
|--------|--------|---------|-------------|
| **Body Battery** | ✅ Real-time 0–100 energy score | ❌ Not available* | Skip Body Battery lines. Do NOT say "no data = bad". Just omit. |
| **Training Readiness** | ✅ Composite 0–100 score | ✅ Synthesized 0–100 (from HRV + sleep + stress + RHR) | Same thresholds apply. Note it's synthesized — slightly less holistic than Garmin's (which includes acute training load). |
| **HRV** | `hrv_last_5_min` (5-min peak during sleep) | `hrv_last_5_min` (peak RMSSD overnight) | Same interpretation: higher = better recovered. |
| **HRV Status** | "BALANCED"/"UNBALANCED"/"LOW" | Usually null | If null, derive status from `hrv_vs_baseline`: >+5 = good, -5 to +5 = normal, <-5 = suppressed. |
| **Sleep Score** | Garmin proprietary 0–100 | Synthesized 0–100 (or Samsung's own if available) | Same thresholds: 85+ excellent, 70–84 good, 55–69 fair, <55 poor. Note: synthesized scores may be less precise. |
| **Stress** | Garmin's proprietary stress (1–100, based on HRV) | Samsung stress (1–100, similar HRV-based) | Same interpretation. Thresholds apply equally. |
| **SpO2** | Continuous overnight | Spot-check or overnight (model-dependent) | Same interpretation. Fewer data points = less reliable min values. |

*Galaxy Watch 5+ has "Energy Score" which may appear in future exports — treat as Body Battery equivalent if present.

---

## Interpretation Rules (Samsung-specific)

### When Body Battery is null

The AI should **not** mention Body Battery. Instead, build the readiness picture from:

1. **Training Readiness** — synthesized composite (HRV 30% + Sleep 30% + Stress 20% + RHR 20%)
2. **HRV** — primary recovery signal
3. **Sleep quality** — duration + stages (deep/REM percentages)
4. **Resting HR** — elevated = fatigue flag
5. **Stress** — high overnight stress = poor recovery

### Synthesized Training Readiness

Samsung's Training Readiness is computed by `samsung_sync.py` using:
- **HRV vs 7-day baseline (30%)**: above baseline = high score, below = low
- **Sleep score (30%)**: composite sleep quality
- **Overnight stress (20%)**: lower average stress = better recovery
- **Resting HR vs 7-day baseline (20%)**: lower than usual = better recovered

Same thresholds as Garmin: 73–100 = PRIME/READY, 40–72 = MODERATE, <40 = LOW.

**Caveat:** Unlike Garmin, this does NOT factor in acute training load (since Samsung doesn't track training load). A user who did heavy training the day before may show "READY" if sleep/HRV/stress recovered — Garmin would likely show "MODERATE" due to residual load. Mention this if the user had a hard session recently.

### Readiness Table (adapted)

When the data source is Samsung (no Body Battery), use this table:

```
## 🛌 READINESS — How Were You Going In?

| Metric | Value | Assessment |
|--------|-------|------------|
| 😴 Sleep score | 72/100 (6.8h) | Good |
| 🧠 HRV last night | 48 ms (+4 vs 7d avg) | Above baseline ✅ |
| ❤️ Resting HR | 52 bpm | Normal |
| 🎯 Training Readiness | 71/100 (MODERATE) | Decent — go for it |
| 😓 Overnight stress | 22 | Low — good recovery |
| 😰 High stress | 8% of waking day | Low |
```

### Synthesized Sleep Score Caveat

Samsung's sleep score (when synthesized by `samsung_sync.py`) uses:
- 40% duration quality (target: 8h)
- 30% deep sleep % (target: 20%)
- 30% REM sleep % (target: 25%)

This is a reasonable approximation but less validated than Garmin's proprietary algorithm. If the score seems inconsistent with stage data, trust the raw stage percentages over the composite score.

### HRV Notes

- Samsung Galaxy Watch measures HRV using optical sensor (PPG) — slightly less accurate than Garmin's dedicated sensor but still clinically useful for trend tracking.
- If `hrv_weekly_avg` is present, use it as the baseline. If null, avoid making "above/below baseline" claims.
- Galaxy Watch 4 was the first Samsung watch with reliable sleep HRV. Earlier models may have sparse/missing HRV data.

---

## Cross-Reference Rules (same as Garmin)

- Low HRV + high activity HR → "HR was likely elevated partly due to incomplete recovery"
- Good sleep + low HR → "You were fresh — controlled effort with room in the tank"
- Poor sleep → note it may have blunted performance
- If readiness was poor but performance was strong → highlight mental resilience / fitness depth
- **Never invent data** — if a field is null, skip it entirely

---

## Detection: How AI Knows It's Samsung Data

The wellness context is identical structurally. The AI can detect Samsung source by:
- `body_battery_at_start` = null (Samsung never has Body Battery)
- `training_readiness_feedback` starts with "Synthesized from" → Samsung
- `hrv_status` = null (Garmin always provides this when HRV data exists)

When detected, apply the Samsung-specific rules above and do NOT mention "Garmin" in the output. Use "your watch" or "Samsung Health" instead.





