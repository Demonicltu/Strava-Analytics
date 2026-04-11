# Strava Analytics — Metrics Reference

Quick reference for all computed metrics, their ranges, and what they mean.

---

## 🏆 Pogačar Score (Cycling)

How your ride compares to Tadej Pogačar. Composite % from multiple metrics.

| Range | Meaning |
|-------|---------|
| 80-100% | Elite-level performance |
| 60-80% | Very strong amateur |
| 40-60% | Solid recreational — impressive vs the best ever |
| 20-40% | Casual riding |
| <20% | Easy / recovery |

**Reference used depends on ride type:**
- Solo Training: 34 km/h baseline
- Race (Flat): 41.5 km/h
- Hilly Ride: 30 km/h
- Mountain Stage: 24 km/h
- Virtual (power only): watts only

---

## 🏆 Kipchoge Score (Running)

How your pace compares to Eliud Kipchoge's marathon pace (2:52/km).

| Range | Meaning |
|-------|---------|
| 80-100% | Elite runner |
| 60-80% | Very strong |
| 40-60% | Good recreational runner |
| <40% | Casual / easy run |

---

## 🏄 Surf Metrics (Surfing)

Wave detection and session breakdown from GPS speed data.

### Wave Detection

Waves are detected as speed spikes above **8 km/h** sustained for **≥3 seconds**. GPS noise is smoothed with a 3-point rolling average before detection.

> ⚠️ Wave count is an estimate. Short whitewater rides or GPS glitches may cause under/over-counting.

### Max Wave Speed

| Speed | Level |
|-------|-------|
| 8–15 km/h | Casual / small waves |
| 15–25 km/h | Intermediate |
| 25–40 km/h | Advanced / big waves |
| 40+ km/h | Pro / tow-in |

### Paddle vs Ride Ratio

Typical recreational surfers spend **95-98% paddling** and **2-5% riding waves**. A higher ride % means either better wave selection, a fast break, or shorter paddle-outs.

### Surf Speed Zones

| Zone | Speed Range |
|------|------------|
| Stationary | <2 km/h |
| Paddling | 2–8 km/h |
| Riding Wave | 8–20 km/h |
| Fast Wave | 20+ km/h |

### Session Time

- **Moving time** = actively paddling or riding
- **Wait time** = elapsed - moving = sitting in the lineup
- Long wait time may indicate flat conditions or crowded lineup

---

## ⚙️ Intensity Factor (IF)

`IF = Normalized Power / FTP` — how hard was this ride relative to your threshold.

| IF | Interpretation |
|----|---------------|
| <0.55 | Recovery / easy spin |
| 0.55–0.75 | Endurance ride (Zone 2) |
| 0.75–0.90 | Tempo / sweetspot effort |
| 0.90–1.00 | Threshold effort |
| 1.00–1.05 | At FTP — sustainable ~1 hour max |
| >1.05 | Above FTP — short intense effort |

*Requires: power meter + `RIDER_FTP_W` in .env*

---

## ⚙️ Training Stress Score (TSS)

How much training load this ride added. Higher = more recovery needed.

| TSS | Interpretation |
|-----|---------------|
| <50 | Easy day — recovery ride |
| 50–100 | Moderate — some fatigue, recovered by next day |
| 100–150 | Hard — considerable fatigue, 2 days to recover |
| 150–250 | Very hard — 2-4 days recovery needed |
| 250+ | Epic — may take 5+ days to fully recover |

*Requires: power meter + `RIDER_FTP_W` in .env*

---

## ⚙️ Efficiency Factor (EF)

`EF = Normalized Power / Avg HR` — aerobic efficiency. Track over time: rising EF = improving fitness.

| EF | Context |
|----|---------|
| 1.0–1.3 | Lower efficiency (beginner or fatigued) |
| 1.3–1.6 | Normal range |
| 1.6–2.0 | Good aerobic efficiency |
| >2.0 | Excellent (strong power, controlled HR) |

*Requires: power meter + HR*

---

## 🫁 Estimated VO2max

Maximal oxygen consumption — the gold standard of aerobic fitness. Estimated per-activity from your best 20-min power (primary) or max/rest HR (fallback).

**Method 1 — Power (ACSM):** `VO2max ≈ (10.8 × 20min_power / weight) + 7`
**Method 2 — HR (Uth):** `VO2max ≈ 15.3 × (maxHR / restHR)`

| VO2max (ml/kg/min) | Level |
|--------------------|-------|
| <30 | Below average |
| 30–40 | Fair |
| 40–50 | Good |
| 50–60 | Very Good |
| 60–70 | Excellent |
| 70–80 | Elite |
| 80+ | World-class |

⚠️ **Note:** This is a per-activity estimate. Easy rides will show lower values. Your true VO2max is best estimated from your hardest ride (highest 20-min power). Track the highest value across activities.

*Requires: power meter + `RIDER_WEIGHT_KG` (primary) or `RIDER_MAX_HR` + `RIDER_REST_HR` (fallback)*

---

## 💪 Power-to-Weight (W/kg) — Level

Based on 20-min best power / body weight. Industry-standard cycling classification.

| W/kg (20min) | Level |
|-------------|-------|
| <2.0 | Beginner |
| 2.0–3.0 | Recreational |
| 3.0–4.0 | Cat 4 / Intermediate |
| 4.0–5.0 | Cat 2-3 / Strong Amateur |
| 5.0–6.0 | Cat 1 / Elite |
| 6.0+ | World Tour Pro |

*Requires: power meter + `RIDER_WEIGHT_KG` in .env*

---

## 🔥 Relative Effort (TRIMP)

Cardiovascular effort score based on heart rate reserve (Banister formula). Cross-activity comparable.

| Score | Interpretation |
|-------|---------------|
| <50 | Easy |
| 50–100 | Moderate |
| 100–150 | Hard |
| 150–200 | Very Hard |
| 200–300 | Extremely Hard |
| 300+ | Epic |

*Requires: HR + `RIDER_MAX_HR` in .env*

---

## 💚 Heart Points (Google Fit style)

Cross-activity fitness score. Summable across walks, runs, rides for daily/weekly tracking.

| HR Zone | Points per minute |
|---------|------------------|
| <64% of max HR | 0 (too easy) |
| 64–76% of max HR | 1 (moderate) |
| ≥77% of max HR | 2 (vigorous) |

**Weekly target: 150 points** (WHO recommendation)

| Daily Points | Meaning |
|-------------|---------|
| 0–5 | Light day |
| 5–20 | Active day |
| 20–50 | Good workout |
| 50–100 | Strong training day |
| 100+ | Heavy training day |

*Requires: HR + `RIDER_MAX_HR` in .env. Falls back to activity-type estimate without HR.*

---

## 📉 Aerobic Decoupling

Power-to-HR ratio drift between first and second half. Key aerobic fitness marker.

| Decoupling % | Interpretation |
|-------------|---------------|
| <3% | Excellent aerobic fitness |
| 3–5% | Good |
| 5–10% | Needs work — more Z2 rides |
| >10% | Poor — focus on base/endurance training |

*Requires: power meter + HR*

---

## ❤️ Cardiac Drift

Heart rate increase between first and second half at similar effort.

| Drift | Interpretation |
|-------|---------------|
| ≤3 bpm | Minimal — well paced, stable effort |
| 3–5 bpm | Slight drift — normal for longer rides |
| >5 bpm | True cardiac drift — cardiovascular fatigue |
| Negative | Eased off in second half |

*Requires: HR*

---

## 📈 Pacing

Speed comparison between first and second half of the ride/run.

| Type | Meaning |
|------|---------|
| **positive split (faded)** | First half faster by >1 km/h — slowed down |
| **even split** | Within ±1 km/h — well paced |
| **negative split (finished strong)** | Second half faster by >1 km/h — strong finish |

---

## ⚡ Normalized Power (NP)

30-second rolling average power, raised to 4th power then averaged. Accounts for variability — represents the physiological cost of the ride.

- Always ≥ average power
- Closer to avg power = steadier ride
- Much higher than avg = variable/spiky effort

---

## ⚡ Variability Index (VI)

`VI = Normalized Power / Average Power` — how "spiky" vs steady the effort was.

| VI | Interpretation |
|----|---------------|
| 1.00–1.05 | Very steady (time trial, indoor trainer) |
| 1.05–1.15 | Normal outdoor ride |
| 1.15–1.25 | Moderately variable (group ride, rolling terrain) |
| >1.25 | Very spiky (crits, interval training, stop-and-go) |

---

## 🔧 Torque

Force per pedal revolution. `Torque = Power / (2π × cadence/60)` in Newton-meters.

| Avg Torque | Level |
|-----------|-------|
| 10–15 Nm | Beginner |
| 15–25 Nm | Recreational |
| 25–40 Nm | Strong amateur |
| 40–60 Nm | Pro |

**Style indicator:**
- High torque + low cadence = "grinding" (more knee strain)
- Low torque + high cadence = "spinning" (easier on joints)

---

## 🔄 Cadence

Pedal revolutions per minute.

| Avg Cadence | Interpretation |
|------------|---------------|
| <65 rpm | Very low — heavy grinding |
| 65–75 rpm | Low — consider spinning more |
| 75–85 rpm | Normal recreational |
| 85–95 rpm | Optimal / pro benchmark |
| >95 rpm | High — spinning style |

---

## 🎯 Training Zones — Heart Rate (5-zone model)

Based on % of max HR.

| Zone | % of Max HR | Purpose |
|------|------------|---------|
| Z1 Recovery | <60% | Active recovery, warm-up |
| Z2 Endurance | 60–70% | Fat burning, base fitness |
| Z3 Tempo | 70–80% | Aerobic capacity, steady effort |
| Z4 Threshold | 80–90% | Lactate threshold, race pace |
| Z5 VO2max+ | 90–100% | Max effort, sprints, intervals |

---

## 🎯 Training Zones — Power (7-zone model)

Based on % of FTP.

| Zone | % of FTP | Purpose |
|------|---------|---------|
| Z1 Active Recovery | <55% | Easy spinning |
| Z2 Endurance | 55–75% | Long rides, base building |
| Z3 Tempo | 75–90% | Sustained effort, sweetspot |
| Z4 Threshold | 90–105% | FTP intervals, race pace |
| Z5 VO2max | 105–120% | 3-8 min intervals |
| Z6 Anaerobic | 120–150% | 30s-3min hard efforts |
| Z7 Neuromuscular | >150% | Sprints, <30s max efforts |

---

## 💪 Power Skills

Best efforts as % of FTP. Identifies your strength profile.

| Skill | Duration | Strong if |
|-------|----------|----------|
| Sprint | 5s best | >250% of FTP |
| Attack | 1min best | >150% of FTP |
| Sustained / TT | 5min best | >105% of FTP |
| Climbing / Endurance | 20min best | >95% of FTP |

**Primary Strength** = whichever skill exceeds its benchmark by the most.

---

## ⛰️ VAM (Velocità Ascensionale Media)

Vertical meters gained per hour of climbing.

| VAM (m/h) | Level |
|-----------|-------|
| 600–800 | Recreational |
| 800–1200 | Good amateur |
| 1200–1500 | Strong amateur |
| 1500+ | Elite |
| 1800–2000 | Pogačar on HC climbs |

---

## 📐 Gradient Bands

| Band | Grade |
|------|-------|
| Steep downhill | < -5% |
| Downhill | -5% to -2% |
| Flat | -2% to 2% |
| Gentle uphill | 2% to 5% |
| Moderate uphill | 5% to 8% |
| Steep uphill | > 8% |

---

## 🏅 Segment PR Ranks

| Icon | Meaning |
|------|---------|
| 🥇 PR #1 | New personal record — your all-time best |
| 🥈 #2 | Second best effort ever |
| 🥉 #3 | Third best effort ever |
| — | Not a top-3 effort |

---

## Speed Zones

| Zone | Range |
|------|-------|
| Stopped/Very Slow | <5 km/h |
| Easy | 5–15 km/h |
| Moderate | 15–25 km/h |
| Fast | 25–35 km/h |
| Very Fast | 35–45 km/h |
| Sprint | 45+ km/h |

---

## .env Configuration

| Variable | Required for | Example |
|----------|-------------|---------|
| `RIDER_WEIGHT_KG` | W/kg, power-to-weight level | `82` |
| `RIDER_FTP_W` | IF, TSS, power zones, power skills | `262` |
| `RIDER_MAX_HR` | HR zones, heart points, relative effort | `188` |
| `RIDER_REST_HR` | More accurate TRIMP (optional, default 60) | `54` |

