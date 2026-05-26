# AI Analysis Instructions — Running (Run / TrailRun / VirtualRun)

Activity type context: **Running**. Never use "ride", "cycling", "pedal", "watts", "cadence". Use "run", "pace", "stride".

---

## Activity-Specific Output

### 1. 🏅 Your Runner Score (ALWAYS START WITH THIS)

Use `runner_score` as HEADLINE. Fall back to `kipchoge_score` if null.

```
## 🏅 YOUR RUNNER SCORE

  🎯 Category:         Strong Amateur — Mid tier
  📊 Tier progress:    74.2% toward next tier
  🏆 Kipchoge Factor:  38.1%  (world's best — for fun)

── Strong Amateur breakdown ──
  [metric lines verbatim from runner_score.metrics]

[1–2 sentences: interpret result, mention near_promotion if true]
```

**Rules:**
- `runner_score.category` = runner tier. Show `runner_score.tier_position` after em-dash.
- `runner_score.composite_pct` = 📊 Tier progress. Frame as "% toward next tier ceiling" — NOT a grade.
- 🏆 Kipchoge factor: from `kipchoge_score.composite_pct`. **One line only** — no breakdown table.
- Omit Personal score line (not applicable for running unless explicitly present).
- If `runner_score.near_promotion` is true → *"You're approaching the [next_category] boundary 🚀"*

---

### 2. 📊 Summary Card Labels

```
## 📊 RUN SUMMARY
━━━━━━━━━━
🏃 Type:       Trail Run
📅 Date:       Wednesday, May 25, 2026
📏 Distance:   10.5 km
⏱ Time:       58m 12s (moving) / 1h 02m (total)
💨 Avg Pace:   5:24/km
🔝 Best Pace:  3:51/km
⛰ Elevation:  280 m gained
🌡 Temp:       14C avg (10-18C range)
❤️ Avg HR:     152 bpm (max 178)
⚡ Avg Power:  280 W (NP: 295 W)   ← include only if power meter present
👟 Gear:       Asics GT-2000
📱 Device:     Garmin Fenix 7
━━━━━━━━━━
```

Use label "RUN SUMMARY" and 🏃. Show **avg pace (min:sec/km)** instead of avg speed. Include power/NP line **only if `has_power_meter: true`**. Include Date, Time (moving/total), HR, Calories, Gear, Device if data is present (skip nulls).

---

### 4.1 Pacing Strategy (Running-specific)

All other 4.1 rules from common.md apply. **Only the unit changes: use pace (min:sec/km) in all tables — not km/h.**

Start with the first-half vs second-half comparison table:

| Half | Avg Pace | Avg HR |
|------|----------|--------|
| First half | **5:10/km** | 149 bpm |
| Last half | **5:38/km** | 155 bpm |

Then state whether it was positive-split / negative-split / even-split and by how much. Add 1-2 sentences interpreting the quality of pacing.

Follow with per-km split highlights:
- **Fastest km**: which km, pace, HR, and why (downhill? final push?)
- **Slowest km**: which km, pace, HR, and why (climb? fatigue? technical terrain?)
- **Most consistent stretch**: a sequence of km with similar pace — cite specific km range

If trail run: note elevation-adjusted pace on climbs and flag any technical sections with dramatically slower pace.

---

### 4.5 Power-to-Weight & Skills (if `power_to_weight` exists — Stryd or similar power meter)

Same table format as cycling.md but with running-specific level names:

| Metric | W/kg |
|--------|------|
| Average Power | X.XX W/kg |
| Normalized Power | X.XX W/kg |
| FTP (rFTP) | X.XX W/kg |
| Estimated Level | Competitive Runner |

Level names: recreational → trained → competitive → elite runner.

If `power_skills` exists, show the same skill table as cycling.md. Interpret with running language: "sprint" = kick/surge, "sustained" = tempo effort.

**Always write 2-3 sentences interpreting the power profile** using running-specific language (pace, stride, run — never "cadence rpm").

---

### 4.7 Climbing Analysis (if elevation > 100m)

Same format as common, but note grade-adjusted pace on climbs vs flats. Trail runs: flag any technical sections with dramatically slower pace.

---

### 4.8 Gradient & VAM Analysis (if `gradient_analysis` or `vam_analysis` exists)

**Gradient Distribution:**

| Gradient | % of run |
|----------|----------|
| Steep downhill (<-5%) | X% |
| Downhill (-5 to -2%) | X% |
| Flat (-2 to 2%) | X% |
| Gentle uphill (2-5%) | X% |
| Moderate uphill (5-8%) | X% |
| Steep uphill (>8%) | X% |

Note the steepest segment name/grade if available. Comment on how gradient distribution affected pace and HR.

**⚠️ VAM Climb Table — output immediately after gradient table (if `vam_analysis.climbs` exists). Do NOT skip or summarise as prose.**

```
⛰️ VAM (Velocity Ascended in Meters per hour):

Climb   │ Start km │ Elevation │ Duration │ VAM
────────────────────────────────────────────────
Climb 1 │ km 3.2   │ +85m      │ 12:30    │ 408
Climb 2 │ km 7.1   │ +42m      │ 7:15     │ 347
```

- **Best VAM:** X m/h on the climb starting at km Y.
- **Overall VAM:** X m/h. Reference: hiking = 200–400 m/h · trail runner = 400–700 m/h · elite trail = 800–1000 m/h.

---

### 4.9 Torque Analysis (if `torque` exists)

- **Average Torque:** X Nm
- **Peak Torque:** X Nm

Context benchmarks (running): recreational = 10-18 Nm, trained = 18-28 Nm, elite = 28-40 Nm, world-class = 40+ Nm. High torque in running reflects strong ground-force application per stride.

**Always interpret with 1-2 sentences** (e.g., "Your average torque of 36.8 Nm is in the elite range for running, indicating excellent force application per stride. The peak torque of 60.8 Nm shows exceptional explosive push-off power.")

---

### 4.10 Cadence / Stride Rate (if `cadence` exists)

| Metric | Value |
|--------|-------|
| Average Cadence | X spm |
| Max Cadence | X spm |
| Median Cadence | X spm |

Compare to optimal 170–180 spm. Note if significantly below (fatigue or overstriding) or above (good running economy). Check if cadence dropped in second half (fatigue signal).

---

### Running-Specific Notes

- **Best efforts** from `best_efforts`: show 400m, 1km, 1mi, 5km, 10km, half, full marathon times if present. Present as a table after the pacing section (section 4.1) or as a subsection `#### Running Milestones`.
- **Actionable tips** must use running-specific language: "pace", "stride", "run" — never "cadence rpm", cycling jargon. Power/watts is OK if a power meter was used. Example tips:
  - **🏃 Negative split next time** — You faded from 5:10/km to 5:38/km in the second half. Try starting 10-15 sec/km slower and finishing strong.
  - **⛰️ Climb strategy** — HR spiked to 172 bpm on km 4 (the steep climb). Walk-run the steepest sections to keep HR under 165 bpm.
  - **🏆 Personal best pace!** — Your 3:51/km best-km pace is a new record. Target a 5km race to test your speed.
