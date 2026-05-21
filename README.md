# 🏃🚴🏄 Strava Analytics

> Extract your Strava activities, compute 30+ advanced metrics locally, get AI-powered analysis, and push it all back to Strava — in one command.

![Pipeline](https://img.shields.io/badge/Pipeline-Download_%E2%86%92_Crunch_%E2%86%92_AI_%E2%86%92_Strava-blue)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## What It Does

```
Strava API  →  Download  →  Crunch (30+ metrics)  →  AI Analysis  →  Push to Strava
                                                           ↓
                                               Historical baselines (7d/30d/90d/365d)
                                               Garmin wellness (HRV/sleep/Body Battery)
                                               Personal records check
                                                           ↓
                                                   Description (public)
                                                   Private Notes (mobile)
```

Pick an activity, and the tool will:
1. **Download** all data from Strava (details, laps, zones, second-by-second streams, segments)
2. **Crunch** every data point locally — zero sampling, zero cloud processing
3. **Analyze** via AI — enriched with historical baselines, Garmin readiness data, and PR detection
4. **Push** the analysis back to your Strava activity description + private notes

Beyond single-activity analysis, the tool also provides:
- 📅 **Weekly digest** — multi-week Sunday review with overtraining warning + race predictions
- 📊 **Trend comparison** — AI-written fitness trend report across any time window
- 🏅 **Personal records tracker** — all-time PRs auto-detected, flagged when broken
- 📈 **HTML dashboard** — static Chart.js dashboard covering all activities (no server needed)
- 🛌 **Garmin Connect sync** — HRV, sleep, Body Battery, training status pulled automatically

---

## ⚡ Quick Start

```bash
cd strava-extractor
npm install
cp .env.example .env   # fill in your Strava credentials + at least one AI key
npm run fast            # that's it — pick an activity and go
```

**For historical context + trend analysis (recommended):**
```bash
npm run bulk    # backfill 2 years of Strava history
npm run records # compute all-time personal records
```

**For Garmin readiness data (optional, requires Garmin account):**
```bash
pip install -r requirements.txt
# Add GARMIN_EMAIL, GARMIN_PASSWORD, GARMIN_SINCE to .env
npm run garmin
```

> See **[COMMANDS.md](COMMANDS.md)** for full setup instructions including Strava API setup, OAuth flow, and `.env` configuration.

---

## Supported Activities

| Activity | Score | Metrics |
|----------|-------|---------|
| 🚴 **Cycling** (Road, Gravel, MTB, E-Bike, Virtual) | 🏆 Pogačar Score | NP, IF, TSS, W/kg, Power Zones, Cadence Zones, Torque, VAM, Gradient |
| 🏃 **Running** (Road, Trail, Virtual) | 🏆 Kipchoge Score | Pace, Best Efforts, Power (if available), IF, TSS, HR Zones (LTHR), Cadence Zones |
| 🏋️ **Workout** (HIIT, Strength, CrossFit, Yoga…) | 🏋️ Workout Score (WIS) | HR Zones, Interval Detection, HR Recovery Rate, Consistency, EPOC |
| 🚶 **Walking / Hiking** | — | HR analysis (maxHR%), Heart Points, Elevation, Speed Zones, Cadence Zones |
| 🏄 **Surfing** | — | Wave count, Max wave speed, Paddle/Ride ratio, Speed zones |

All activities get: **Heart Rate analysis**, **Cardiac Drift**, **Relative Effort (TRIMP)**, **Heart Points**, **VO2max estimate**, **Sport-specific Training Zones**.

All **outdoor** activities (GPS present) additionally get: **Meteorology** (temperature, wind, precipitation) and **Wind Analysis** (headwind/tailwind/crosswind split).

---

## Commands

| Command | What it does |
|---------|-------------|
| **`npm run fast`** | ⚡ **All-in-one** — download → crunch → AI → push to Strava |
| `npm start` | Download activity data from Strava |
| `npm run crunch` | Compute all metrics locally |
| `npm run analyze` | Send to AI for written analysis (+ history + Garmin + PR check) |
| `npm run update` | Push analysis to Strava description + notes |
| **`npm run bulk`** | ⏳ Fetch & crunch last 2 years of Strava history (no AI — enables historical context) |
| **`npm run recrunch`** | 🔬 Re-crunch all existing downloads to pick up new metrics (no API calls) |
| **`npm run compare`** | 📊 AI fitness trend analysis across any time window |
| **`npm run digest`** | 📅 Weekly/monthly digest — overtraining warning, race predictions, training adherence |
| **`npm run records`** | 🏅 Detect all-time personal records, flag newly broken ones |
| **`npm run dashboard`** | 📈 Generate static `dashboard.html` with Chart.js graphs |
| **`npm run garmin`** | 🛌 Sync Garmin Connect wellness data (HRV, sleep, Body Battery, training status) |

> `npm run fast` loops — after updating one activity, it returns to the activity list. Press `q` to quit.

---

## Metrics Computed

All metrics are computed locally from raw stream data. No sampling — every data point is used.

### Core Metrics (all activities)
- 📈 **Pacing** — positive/negative/even split, per-km breakdown, 5-min windows
- ❤️ **Heart Rate** — stats, peak efforts (1min/5min/20min), cardiac drift
- 🔥 **Relative Effort (TRIMP)** — cardiovascular effort score
- 💚 **Heart Points** — Google Fit-style daily/weekly fitness tracking
- 🫁 **VO2max** — estimated from power (ACSM) or HR (Uth formula)
- 🎯 **HR Zones** — LTHR-based (Coggan/Friel) when available, else % of max HR; sport-specific boundaries
- 🏎️ **Speed Zones** — sport-specific (cycling / running / walking)
- 🔄 **Cadence Zones** — sport-specific (rpm for cycling, spm for running/walking)
- 🌤️ **Meteorology** — temperature, feels-like, humidity, precipitation, wind speed/direction/gusts per hour
- 💨 **Wind Analysis** — headwind / tailwind / crosswind % per segment, net wind effect (km/h); one weather API call per UTC hour spanned

### Cycling Metrics (power meter recommended)
- 🏆 **Pogačar Score** — composite % vs Tadej Pogačar (speed, power, efficiency, VAM, cadence)
- ⚡ **Normalized Power (NP)** — physiological cost of the ride
- ⚙️ **IF / TSS** — Intensity Factor & Training Stress Score (uses `RIDER_FTP_W`)
- 💪 **W/kg** — power-to-weight with level classification
- 📉 **Aerobic Decoupling** — aerobic fitness indicator
- 🔧 **Torque** — average & peak pedal force
- ⛰️ **VAM** — per-climb vertical ascent speed
- 📐 **Gradient** — grade distribution across the ride
- 🎯 **Power Zones** — 7-zone FTP-based distribution
- 🔄 **Power Skills** — sprint/attack/climbing strength profile

### Running Metrics
- 🏆 **Kipchoge Score** — composite % vs Kipchoge (pace, running economy, cadence)
- 🏅 **Best Efforts** — PRs at standard distances (400m → 10K)
- ⚙️ **IF / TSS / Power Zones** — when running power meter present (uses `RUNNER_RFTP_W`)

### Workout Metrics (gym, HIIT, CrossFit, yoga — HR only, no GPS)
- 🏋️ **Workout Intensity Score (WIS)** — zone-weighted 0–100 with label
- ⚡ **Effort Intervals** — auto-detected work/rest intervals from HR spikes
- 🔁 **HR Recovery Rate** — avg HR drop/min after peaks (fitness indicator)
- 📊 **Consistency Score** — HR coefficient of variation (classifies session type)
- 📈 **HR Progression** — early/mid/late HR trend (session structure)
- ⏱️ **Time to Peak HR** — when peak effort occurred
- 🛌 **Recovery Ratio** — % time in true rest HR
- 💓 **EPOC Estimate** — post-exercise afterburn calorie estimate

### Surfing Metrics
- 🌊 **Wave Count** — estimated from GPS speed spikes
- 🚀 **Max Wave Speed** — fastest detected wave ride
- 🏄 **Paddle vs Ride** — time & distance breakdown
- 🏄 **Surf Speed Zones** — stationary / paddling / riding / fast wave

> See **[METRICS.md](METRICS.md)** for full metric reference with interpretation tables.

---

## Output Files

```
strava-extractor/
├── dashboard.html                           # Static HTML dashboard (open in browser)
├── output/                                  # Raw Strava data
│   └── activity_<id>_<date>_<name>.json        (1-5 MB per activity)
├── analysis/                                # Processed results
│   ├── *_crunched.json                         (10-40 KB — all metrics, zero sampling)
│   ├── *_analysis.md                           (AI-written single-activity report)
│   ├── comparison_<period>_<date>.md           (AI trend report — npm run compare)
│   ├── digest_<weeks>w_<date>.md               (AI weekly digest — npm run digest)
│   ├── personal_records.json                   (All-time PRs — npm run records)
│   └── garmin_wellness.json                    (Garmin daily wellness database)
```

---

## AI Providers

The tool auto-detects available API keys and falls back in order:

| Priority | Provider | Free? | Model |
|----------|----------|-------|-------|
| 1 | **Gemini** | ✅ Free tier | `gemini-2.5-flash` |
| 2 | **Groq** | ✅ Free tier | `llama-3.3-70b-versatile` |
| 3 | **OpenRouter** | 💰 Pay-per-use | `deepseek/deepseek-chat-v3-0324` |
| 4 | **OpenAI** | 💰 Pay-per-use | `gpt-4o` |

> **No API key?** Run `npm start` + `npm run crunch`, then paste the crunched JSON into any AI chat manually.

---

## Rider Profile (`.env`)

Optional but recommended — unlocks the most useful metrics:

```env
# Cycling
RIDER_WEIGHT_KG=82     # → W/kg, VO2max
RIDER_FTP_W=264        # → Cycling IF, TSS, Power Zones, Power Skills
RIDER_MAX_HR=188       # → Cycling HR Zones, TRIMP, Heart Points
RIDER_LTHR=173         # → LTHR-based cycling HR zones (more accurate than maxHR%)
RIDER_REST_HR=56       # → More accurate TRIMP (optional, default 60)

# Running-specific overrides (optional, fall back to cycling values)
RUNNER_RFTP_W=300      # → Running IF, TSS, Power Zones
RUNNER_MAX_HR=193      # → Running HR Zones, TRIMP
RUNNER_LTHR=181        # → LTHR-based running HR zones
```

---

## Portable / Release Build

For users without Node.js:

```bash
npm run build:bundle   # creates dist/strava.cjs
```

Copy `release/` folder → edit `.env` → double-click `strava.bat`. No Node.js required.

---

## Rate Limits

Strava API: **100 requests / 15 min**, **1,000 / day**. Each activity ≈ 4 API calls. The tool handles rate limiting automatically.

---

## Documentation

| Doc | Contents |
|-----|----------|
| **[COMMANDS.md](COMMANDS.md)** | Full user guide — setup, all commands with examples, workflow, tips |
| **[METRICS.md](METRICS.md)** | Every metric explained with interpretation tables |
| **[AI_ANALYSIS_INSTRUCTIONS.md](AI_ANALYSIS_INSTRUCTIONS.md)** | Format instructions for single-activity AI report |
| **[AI_COMPARE_INSTRUCTIONS.md](AI_COMPARE_INSTRUCTIONS.md)** | Format instructions for trend comparison report |
| **[AI_DIGEST_INSTRUCTIONS.md](AI_DIGEST_INSTRUCTIONS.md)** | Format instructions for weekly digest report |

---

## Tech Stack

- **TypeScript** — full type safety
- **Zero dependencies** beyond `axios` (HTTP) and `dotenv` (config)
- **Zero sampling** — processes every stream data point
- **Bundleable** — single-file portable build via esbuild
- **Open-Meteo** — free weather API, no key required; 1 call per UTC hour spanned
- **garminconnect** (Python, optional) — unofficial Garmin Connect API for wellness sync
