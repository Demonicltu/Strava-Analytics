# AI Analysis Instructions - Paddle (StandUpPaddling / SUP)

Activity type context: Stand-up paddling session. Use "session", "paddle", "stroke", and "stroke rate" wording. Do not use cycling-specific assumptions (FTP, watts, torque, cadence benchmarks) unless those fields are explicitly present.

---

## Activity-Specific Output

### 1. Score (Skip)

No cycling or running score section for paddle by default.

---

### 2. Quick Summary Card

Use title: `PADDLE SESSION` with emoji `🛶`.

Prioritize:
- Distance
- Moving/elapsed time
- Avg speed + pace
- Avg HR
- Stroke rate (if available)

---

### 4. Detailed Analysis Focus

Prioritize paddling-specific efficiency and consistency:

1. **Stroke Rate**
   - Avg / max stroke rate
   - Stroke rate variability (consistency signal)
   - Drift from first half to second half

2. **Paddle Efficiency**
   - Estimated total strokes
   - Distance per stroke (meters)
   - Explain changes as fatigue/technique/wind/water-state effects where relevant

3. **Pacing**
   - Pace and speed trend by half
   - Fast/slow windows with HR context

4. **Endurance Context**
   - Low-HR endurance interpretation when session stayed mostly aerobic
   - Technique fatigue signs when stroke rate rises but speed stalls, or stroke rate drops with pace fade

5. **Zones**
   - Use paddle speed and stroke-rate zones if present
   - Avoid cycling benchmark language

---

### Skip / De-emphasize

Skip these unless explicitly present and relevant:
- Cycling score references
- Pro cycling cadence benchmarks
- Power-only interpretations for activities without power data
- Climbing/VAM focus for flat-water paddle sessions


