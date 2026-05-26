# AI Analysis Instructions — Cycling (Ride / VirtualRide / GravelRide / MountainBikeRide)

Activity type context: **Cycling**. All language uses "ride", "cyclist", "pedal". Never use "run", "pace", "steps".

---

## Activity-Specific Output

### 1. 🏅 Your Cycling Score (ALWAYS START WITH THIS)

Use `amateur_score` as HEADLINE. Fall back to `pogacar_score` if null.

```
## 🏅 YOUR CYCLING SCORE

  🎯 Category:         Cat 4 / Trained Amateur — Mid–Upper tier
  📊 Tier progress:    76% toward next tier
  👤 vs. Your Typical: 112%  (vs. your 90d avg — above average ⬆️)
  🏆 Pogačar Factor:   27%   (world's best — for fun)

── Cat 4 breakdown (ceiling: 3.2 W/kg · 30 km/h · 1.55 W/bpm · 1000 VAM) ──
  [metric lines from amateur_score.metrics — do not recalculate]

[1-2 sentences: interpret result, call out near_promotion and long_ride_weighting if true]
```

**Rules:**
- `amateur_score.category` = rider tier. Show `amateur_score.tier_position` after em-dash.
- `amateur_score.composite_pct` = 📊 Tier progress. Frame as "% toward next tier ceiling" — NOT a grade.
- If `personal_score` is present: show 👤 line with `personal_score.composite_pct` and `personal_score.interpretation`. If null: omit 👤 line.
- 🏆 Pogačar factor: **one line only** — no breakdown table.
- If `amateur_score.near_promotion` is true → *"You're approaching the [next_category] boundary — one strong block away 🚀"*
- If `personal_score.long_ride_weighting` is true → *"Personal score uses TSS-dominant weighting (>2.5h ride) — EF downweighted for cardiac drift."*
- Personal score interpretation: <70% recovery · 70-90% controlled · 90-110% typical · 110-130% hard · >130% peak.

---

### 2. 📊 Summary Card

```
## 📊 RIDE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚴 Type:       Road Ride
📅 Date:       Wednesday, March 19, 2026
📏 Distance:   64.23 km
⏱️ Time:       2h 21m (moving) / 2h 35m (total)
⚡ Avg Speed:  27.2 km/h
🔝 Max Speed:  48.3 km/h
⛰️ Elevation:  400 m gained
🌡️ Temp:       7°C avg (4-19°C range)
❤️ Avg HR:     155 bpm (max 181)
🦵 Avg Power:  195 W (NP: 215 W)
🔄 Cadence:    67 rpm avg
🔥 Calories:   2,179 kcal
👟 Gear:       Maverick
📱 Device:     Wahoo ELEMNT ROAM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Use label "RIDE SUMMARY" and 🚴. Show avg speed (km/h), cadence, power. Include all available fields (Date, Time moving/total, HR, Calories, Gear, Device). Skip nulls.

---

### 4.5 Power-to-Weight & Power Skills (if `power_to_weight` exists)

| Metric | W/kg |
|--------|------|
| Average Power | X.XX W/kg |
| Normalized Power | X.XX W/kg |
| FTP | X.XX W/kg |
| Estimated Level | Cat 2-3 / Strong Amateur |

If `power_skills` exists:

| Skill | % of FTP | Assessment |
|-------|----------|------------|
| Sprint (5s) | 230% | Strong |
| Attack (1min) | 140% | Average |
| Sustained (5min) | 108% | Good |
| Endurance (20min) | 95% | Good |

**Primary Strength:** [Sprinting/Attacking/Climbing]

**Always write 2-3 sentences interpreting the power profile** (e.g., "Your power profile shows a clear strength in Sprinting, with 5-second power at 283% of your FTP. Your attacking power (1min) is also very strong, and your sustained efforts (5min and 20min) are good, indicating a well-rounded cyclist with a punch.")

---

### 4.6 Power Zones (if `training_zones` exists — add after HR zones)

| Zone | Range | Time | % |
|------|-------|------|---|
| Z1 Recovery | <138 W | 5m | █ 6% |
| Z2 Endurance | 138-188 W | 12m | █ 14% |
| Z3 Tempo | 188-225 W | 20m | ██ 24% |
| Z4 Threshold | 225-263 W | 25m | ███ 30% |
| Z5 VO2max | 263-300 W | 12m | █ 14% |
| Z6 Anaerobic | 300-375 W | 8m | █ 10% |
| Z7 Neuromusc | >375 W | 2m | ░ 2% |

**Speed Zones** (if available) — same format, same 10-char max rule.

**Key insight (MANDATORY after EVERY zone table):** Comment on which zone dominated and what it means (e.g., "64% in Z3-Z4 power zones = solid tempo/threshold workout." or "65% of ride in Fast speed zone highlights consistently high speed.")

---

### 4.8a Gradient & VAM Analysis (if `gradient_analysis` or `vam_analysis` exists)

**Gradient Distribution:**

| Gradient | % of ride |
|----------|-----------|
| Steep downhill (<-5%) | X% |
| Downhill (-5 to -2%) | X% |
| Flat (-2 to 2%) | X% |
| Gentle uphill (2-5%) | X% |
| Moderate uphill (5-8%) | X% |
| Steep uphill (>8%) | X% |

Note the steepest segment name/grade if available.

**VAM (Velocity Ascended in Meters per hour):**

If individual climbs were detected, show a table:

| Climb | Start km | Elevation | Duration | VAM |
|-------|----------|-----------|----------|-----|
| Climb 1 | km 5.2 | +58m | 3:18 | 1054 |
| Climb 2 | km 12.1 | +23m | 2:14 | 617 |

- **Best VAM:** X m/h on the climb starting at km Y.
- **Overall VAM:** X m/h (total ascent / total time). **Always interpret context:** if the overall VAM is low due to a predominantly flat ride, state this explicitly (e.g., "This overall VAM is low due to the predominantly flat nature of the ride. The individual climb VAMs are more indicative of your climbing ability.")
- Reference: recreational = 600-800 m/h, good amateur = 800-1200 m/h, elite = 1500+ m/h, Pogačar = 1800-2000 m/h

---

### 4.9 Torque Analysis (if `torque` exists)

- **Average Torque:** X Nm
- **Peak Torque:** X Nm

Context benchmarks: recreational = 15-25 Nm, strong amateur = 25-40 Nm, pro = 40-60 Nm. High torque + low cadence = "grinding" style; low torque + high cadence = "spinning" style.

**Always interpret with 1-2 sentences** (e.g., "Your average torque of 27.8 Nm is in the range of a strong amateur, indicating good force application. The peak torque of 393.4 Nm shows excellent explosive power.")

---

### 4.10 Cadence Analysis

| Metric | Value |
|--------|-------|
| Average | X rpm |
| Median | X rpm |
| Range (p5-p95) | X - X rpm |

Compare to pro benchmark (85-95 rpm). Low = grinding. Check if cadence dropped in second half (fatigue). Compare first-half vs second-half using 5-minute windows.
