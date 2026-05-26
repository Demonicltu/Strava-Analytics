# AI Analysis Instructions — Workout / Gym / HIIT (Workout / WeightTraining / CrossTraining)

Activity type context: **Indoor Workout / Gym / HIIT**. Never use "ride", "cycling", "km", "pace". Use "session", "set", "exercise".

---

## Activity-Specific Output

### 1. Score (Skip entirely)

No cycling or running score. Skip section 1 entirely. Begin with section 2.

---

### 2. 📊 Summary Card Labels

```
## 📊 WORKOUT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💪 Type:       Workout
⏱️ Time:       42m 30s
🔥 Calories:   380 kcal
❤️ Avg HR:     142 bpm (max 178)
📱 Device:     Garmin Fenix 7
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Use label "WORKOUT SUMMARY" and 💪. Skip distance, speed, cadence, power, gear. Focus on time, HR, calories.

---

### 4. Detailed Analysis — Workout Guidelines

- **Lead with:** section 4.16 Workout Analysis (WIS score, intervals, HR recovery)
- **Include:** 4.2 HR Analysis, 4.6 HR Zones, 4.14 Heart Points
- **Skip entirely:** 4.1 Pacing (no meaningful pace), 4.3 Power Analysis, 4.4 Training Load (TSS/IF), 4.5 Power-to-Weight, 4.7 Climbing, 4.8 Gradient/VAM, 4.9 Torque, 4.10 Cadence, Power Zones in 4.6, Segment Highlights (4.17)

---

### 4.16 Workout Analysis (LEAD with this for workouts — if `workout_analysis` exists)

**Workout Intensity Score:**
- `WIS: X/100 — [Light/Moderate/Hard/Very Hard/Max]` — zone-weighted HR intensity index.

**Interval Detection** (if `intervals_detected > 0`):

| Interval | Work | Rest | Peak HR | Avg Work HR |
|----------|------|------|---------|-------------|
| 1 | 45s | 30s | 178 bpm | 171 bpm |

Show `work_rest_ratio` and `interval_threshold_bpm`.

**HR Recovery Rate** (if present):
- Drop 30s / 60s after peak HR → [Excellent/Good/Fair/Needs work]
- Context: >30 bpm drop in 60s = excellent cardiac recovery.

**Consistency Score:** CV: X% → [Very steady / Moderate variation / Variable / Highly variable]

**EPOC Intensity:** `intensity_signal` — [Low/Moderate/High/Very High]. Note: relative signal only, not calories.

Include HR progression pattern and time-to-peak if notable.

---

### 3. Performance Verdict — Tone

Focus on: session quality, effort level, interval execution quality, recovery between sets, overall fitness signal. Skip pacing/terrain language.

