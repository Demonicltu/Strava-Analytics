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

Composite % comparison to Eliud Kipchoge across three dimensions:

| Component | Reference | Notes |
|-----------|-----------|-------|
| **Pace** | 2:52/km (172 s/km) | Marathon world record pace |
| **Running Economy** | `pace/HR` ratio at LTHR (or 160 bpm) | Lower HR at same pace = better economy |
| **Cadence** | 180 spm | Elite marathon turnover |

| Range | Meaning |
|-------|---------|
| 80-100% | Elite runner |
| 60-80% | Very strong |
| 40-60% | Good recreational runner |
| <40% | Casual / easy run |

> Economy component uses `RUNNER_LTHR` as the personalized HR reference (falls back to 160 bpm).

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

*Requires: power meter + `RIDER_FTP_W` in .env (or `RUNNER_RFTP_W` for running)*

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

*Requires: power meter + `RIDER_FTP_W` in .env (or `RUNNER_RFTP_W` for running)*

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

### Cycling — Pedal revolutions per minute (rpm)

| Zone | RPM | Goal |
|------|-----|------|
| Z1 Grind | < 70 | Strength building, high knee strain |
| Z2 Steady | 70–85 | Endurance, casual or climbing |
| Z3 Optimal | 85–95 | Efficient — flat roads and racing |
| Z4 High | 95–110 | Cardio demand, saves leg muscles |
| Z5 Spin | 110+ | Sprint / attack cadence |

### Running — Steps per minute (spm)

| Zone | SPM | Goal |
|------|-----|------|
| Z1 Low | < 165 | Often leads to overstriding |
| Z2 Moderate | 165–172 | Common for beginners / easy pace |
| Z3 Optimal | 173–185 | Gold standard for efficiency |
| Z4 High | 185–200 | Racing / intervals |
| Z5 Sprint | 200+ | Short-burst max turnover |

### Walking — Steps per minute (spm)

| Zone | SPM | Activity |
|------|-----|----------|
| Z1 Slow | < 80 | Casual strolling |
| Z2 Average | 80–100 | Daily movement / commuting |
| Z3 Brisk | 100–120 | Fitness / cardio walk |
| Z4 Power | 120–135 | Power walking |
| Z5 Peak | 135+ | Race walking |

> **Note:** Strava reports running/walking cadence as strides/min (one foot). The tool doubles it to steps/min (spm).

---

## 🏎️ Speed Zones

### Cycling

| Zone | Range |
|------|-------|
| Stopped/Very Slow | < 5 km/h |
| Easy | 5–15 km/h |
| Moderate | 15–25 km/h |
| Fast | 25–35 km/h |
| Very Fast | 35–45 km/h |
| Sprint | 45+ km/h |

### Running

| Zone | Range | Description |
|------|-------|-------------|
| Stopped/Slow | 0–6 km/h | Warm-up or stopped |
| Easy | 6–9 km/h | Recovery jog |
| Moderate | 9–12 km/h | Endurance / Zone 2 run |
| Fast | 12–15 km/h | Tempo running |
| Very Fast | 15–18 km/h | Threshold / intervals |
| Sprint | 18+ km/h | Max effort |

### Walking

| Zone | Range | Effort |
|------|-------|--------|
| Z1 Stroll | 0–3.5 km/h | Window shopping |
| Z2 Brisk | 3.5–5 km/h | Commuting |
| Z3 Power | 5–6.5 km/h | HR starts climbing |
| Z4 Peak | 6.5–8 km/h | Race walking |
| Z5 Sprint | 8+ km/h | Forced to jog |

---

## 🌤️ Meteorology & Wind Analysis

Weather data fetched automatically from **Open-Meteo** (free, no API key) at activity time. One API call per UTC hour covered — e.g. a 45-min ride = 1 call, a 3-hour ride = 3-4 calls.

### Weather Snapshot

| Field | Source | Notes |
|-------|--------|-------|
| Temperature | Open-Meteo 2m above ground | Complements device sensor temp |
| Apparent ("feels-like") temp | Open-Meteo | Wind chill / humidity adjusted |
| Precipitation | Open-Meteo | mm in that hour |
| Humidity | Open-Meteo | % relative humidity |
| Wind speed | Open-Meteo 10m height | km/h |
| Wind gusts | Open-Meteo 10m height | km/h |
| Wind direction | Open-Meteo | Degrees from North, 0° = N |
| Weather condition | WMO code → text | e.g. "Partly cloudy", "Slight rain" |

> **Device temp vs weather temp:** The Wahoo/Garmin sensor records actual air temperature near the device every second — that's more granular and shown under `summary_card.temperature`. The Open-Meteo value adds feels-like temperature and other fields the device doesn't measure.

### Multi-Point Sampling

For activities spanning multiple hours, weather is fetched at the GPS coordinates corresponding to each UTC hour boundary. This means a mountain ride that starts in a valley and climbs to a pass gets the valley weather at the start and the ridge weather later — not just one reading extrapolated for the whole ride.

### Wind Analysis

Calculated per GPS point by comparing the **rider's bearing** (computed from consecutive GPS coordinates) to the **wind source direction** (degrees the wind blows FROM):

| Classification | Relative angle to wind | Effect |
|----------------|----------------------|--------|
| **Headwind** | ±45° (facing into wind) | Increases aerodynamic drag |
| **Crosswind** | 45–135° or 225–315° | Lateral force, destabilising |
| **Tailwind** | 135–225° (wind behind) | Reduces drag, free speed |

**Net wind effect (km/h):** Weighted average of headwind components across all hourly snapshots. Positive = net drag, negative = net assist.

For multi-hour rides, a `by_segment` breakdown shows the headwind/tailwind split per hour so you can see which part of the route was fighting the wind and which benefited.

> **Accuracy note:** Wind data is hourly and at a fixed grid point. Local terrain (valleys, passes, buildings) creates micro-climate effects not captured in the model. Treat as indicative, especially on technical mountainous routes.

---

## .env Configuration

| Variable | Required for | Example |
|----------|-------------|---------|
| `RIDER_WEIGHT_KG` | W/kg, power-to-weight level | `82` |
| `RIDER_FTP_W` | Cycling: IF, TSS, power zones, power skills | `264` |
| `RIDER_MAX_HR` | Cycling: HR zones (fallback), TRIMP, Heart Points | `206` |
| `RIDER_LTHR` | Cycling: LTHR-based HR zones (preferred) | `173` |
| `RIDER_REST_HR` | More accurate TRIMP (optional, default 60) | `56` |
| `RUNNER_RFTP_W` | Running: IF, TSS, power zones (falls back to `RIDER_FTP_W`) | `412` |
| `RUNNER_MAX_HR` | Running: HR zones (fallback), TRIMP (falls back to `RIDER_MAX_HR`) | `204` |
| `RUNNER_LTHR` | Running: LTHR-based HR zones (falls back to `RIDER_LTHR`) | `181` |

---

## 🏋️ Workout Metrics

Metrics computed for Workout-type activities (gym, HIIT, CrossFit, strength, yoga, etc.) using HR stream only. No GPS data required.

### 🏋️ Workout Intensity Score (WIS)

Zone-weighted HR score, normalized to 0–100.
`WIS = Σ(zone_pct × zone_weight) / 5` where Z1=1, Z2=2, Z3=3, Z4=4, Z5=5.

| WIS | Label | Interpretation |
|-----|-------|---------------|
| < 30 | Light | Active recovery / mobility / yoga |
| 30–50 | Moderate | Steady-state cardio / light circuit |
| 50–70 | Hard | Tempo / threshold effort |
| 70–85 | Very Hard | HIIT / intense intervals |
| 85+ | Max | Extreme intensity |

### 🔁 HR Recovery Rate

After each HR peak, how fast does HR drop in 60 seconds. Averaged across top-5 peaks.

| Drop (bpm/min) | Label |
|----------------|-------|
| ≥ 30 | Excellent |
| 20–29 | Good |
| 12–19 | Fair |
| < 12 | Needs work |

*Strong predictor of cardiovascular fitness — faster recovery = better fitness.*

### 📊 Consistency Score (CV)

`CV = stddev(HR) / mean(HR) × 100` — how variable HR was across the session.

| CV % | Label |
|------|-------|
| < 5% | Very steady (yoga / light cardio) |
| 5–10% | Moderate variation (mixed effort) |
| 10–15% | Variable (circuit / intervals) |
| > 15% | Highly variable (HIIT / CrossFit) |

### 📈 HR Progression (thirds)

Session split into 3 equal parts; avg HR compared per third.

| Pattern | Meaning |
|---------|---------|
| Progressive build | HR rose steadily — good warm-up structure |
| Front-loaded | Peak early — aggressive start |
| Interval burst | Peak in middle — effort sandwich |
| Steady-state | Flat HR — continuous aerobic effort |

### ⏱️ Time to Peak HR

At what % of the session the highest HR occurred.

| % into session | Label |
|----------------|-------|
| < 20% | Aggressive start |
| 20–70% | Well structured |
| > 70% | Progressive build |

### 🛌 Recovery Ratio

% of session where HR was truly resting (below 75% LTHR or 60% maxHR).

| Recovery % | Label |
|------------|-------|
| > 40% | Interval session (real rest between sets) |
| 20–40% | Mixed effort |
| < 20% | Continuous steady-state |

### 💓 EPOC Estimate

Estimated post-exercise calorie afterburn based on zone time.
Scaled by body weight (`RIDER_WEIGHT_KG`).

| EPOC (kcal) | Label |
|-------------|-------|
| < 20 | Minimal afterburn (recovery session) |
| 20–60 | Moderate afterburn |
| 60–120 | Significant afterburn (HIIT-level) |
| > 120 | High afterburn (intense HIIT) |

