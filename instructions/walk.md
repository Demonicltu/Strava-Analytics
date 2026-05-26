# AI Analysis Instructions — Walking & Hiking (Walk / Hike)

Activity type context: **Walking / Hiking**. Never use "ride", "cycling", "run", "pace per km". Use "walk", "hike", "stroll".

---

## Activity-Specific Output

### 1. Score (Skip entirely)

No cycling or running score. Skip section 1 entirely. Begin directly with section 2.

---

### 2. 📊 Summary Card Labels

```
## 📊 WALK SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚶 Type:       Hike
📏 Distance:   8.3 km
⏱️ Avg Pace:   12:30/km
⛰️ Elevation:  420 m gained
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Use label "WALK SUMMARY" and 🚶. Show avg pace (min:sec/km). **Skip:** cadence, power, watts.

---

### 3. Performance Verdict — Tone

For walks/hikes, tone should be casual and positive. Focus on: enjoyment, health benefit, terrain challenge, views/experience rather than performance metrics.

---

### 4. Detailed Analysis — Walking Guidelines

- **Focus on:** HR analysis, elevation/climbing, pacing, training load, weather/conditions
- Keep the analysis **simple and encouraging** — walks/hikes are about enjoyment and moderate health benefit

### 4.2 Training Load (HR-based only — if `relative_effort` or `heart_points` exists)

Skip TSS/IF (require power meter). Include only:
- **Relative Effort:** score + interpretation (e.g., "light", "moderate")
- **Heart Points:** total + % of weekly 150 target
- **1–2 sentences** interpreting effort level for the activity type (e.g., "A moderate effort hike — solid cardio benefit without heavy fatigue.")

---

### 4.7 Climbing Analysis (if elevation > 50m)

Emphasize the scenic/achievement angle for hikes. Note altitude range, total ascent, and if any notable viewpoints or passes were reached.

---

### 4.8 Gradient Analysis (if `gradient_analysis` exists)

**Gradient Distribution:**

| Gradient | % of walk |
|----------|-----------|
| Steep downhill (<-5%) | X% |
| Downhill (-5 to -2%) | X% |
| Flat (-2 to 2%) | X% |
| Gentle uphill (2-5%) | X% |
| Moderate uphill (5-8%) | X% |
| Steep uphill (>8%) | X% |

Note the steepest segment name/grade if available. Comment on terrain variety and how it contributed to the challenge or enjoyment of the walk/hike.

---

### 4.10 Cadence Analysis (if `cadence` exists — steps/min)

| Metric | Value |
|--------|-------|
| Average | X spm |
| Range (p5-p95) | X – X spm |

Walking benchmarks: leisurely = 80–100 spm · brisk walk = 100–120 spm · fast walk = 120–140 spm · race walk = 140–160 spm. Note if cadence varied on climbs vs flat terrain.
