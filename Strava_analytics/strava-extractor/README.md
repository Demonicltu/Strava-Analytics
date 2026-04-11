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
                                                              Description (public)
                                                              Private Notes (mobile)
```

Pick an activity, and the tool will:
1. **Download** all data from Strava (details, laps, zones, second-by-second streams, segments)
2. **Crunch** every data point locally — zero sampling, zero cloud processing
3. **Analyze** via AI (Gemini, Groq, OpenRouter, or OpenAI) for a written performance report
4. **Push** the analysis back to your Strava activity description + private notes

---

## ⚡ Quick Start

```bash
cd strava-extractor
npm install
cp .env.example .env   # fill in your Strava credentials
npm run fast            # that's it — pick an activity and go
```

> See the **[User Guide](USER_GUIDE.md)** for full setup instructions including Strava API setup, OAuth flow, and `.env` configuration.

---

## Supported Activities

| Activity | Score | Metrics |
|----------|-------|---------|
| 🚴 **Cycling** (Road, Gravel, MTB, E-Bike, Virtual) | 🏆 Pogačar Score | NP, IF, TSS, W/kg, Power Zones, Torque, VAM, Gradient |
| 🏃 **Running** (Road, Trail, Virtual) | 🏆 Kipchoge Score | Pace analysis, Best Efforts, HR Zones |
| 🚶 **Walking / Hiking** | — | HR analysis, Heart Points, Elevation |
| 🏄 **Surfing** | — | Wave count, Max wave speed, Paddle/Ride ratio, Speed zones |

All activities get: **Heart Rate analysis**, **Cardiac Drift**, **Relative Effort (TRIMP)**, **Heart Points**, **VO2max estimate**, **Pacing analysis**, **Training Zones**.

---

## Commands

| Command | What it does |
|---------|-------------|
| **`npm run fast`** | ⚡ **All-in-one** — download → crunch → AI → push to Strava |
| `npm start` | Download activity data from Strava |
| `npm run crunch` | Compute all metrics locally |
| `npm run analyze` | Send to AI for written analysis |
| `npm run update` | Push analysis to Strava description + notes |

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
- 🎯 **HR Zones** — 5-zone time distribution

### Cycling Metrics (power meter recommended)
- 🏆 **Pogačar Score** — % comparison to Tadej Pogačar
- ⚡ **Normalized Power (NP)** — physiological cost of the ride
- ⚙️ **IF / TSS** — Intensity Factor & Training Stress Score
- 💪 **W/kg** — power-to-weight with level classification
- 📉 **Aerobic Decoupling** — aerobic fitness indicator
- 🔧 **Torque** — average & peak pedal force
- ⛰️ **VAM** — per-climb vertical ascent speed
- 📐 **Gradient** — grade distribution across the ride
- 🎯 **Power Zones** — 7-zone FTP-based distribution
- 🔄 **Power Skills** — sprint/attack/climbing strength profile

### Running Metrics
- 🏆 **Kipchoge Score** — pace vs Eliud Kipchoge's marathon
- 🏅 **Best Efforts** — PRs at standard distances

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
├── output/                              # Raw Strava data
│   └── activity_<id>_<date>_<name>.json    (1-5 MB per activity)
├── analysis/                            # Processed results
│   ├── *_crunched.json                     (10-40 KB — all metrics)
│   └── *_analysis.md                       (AI-written report)
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
RIDER_WEIGHT_KG=82     # → W/kg, VO2max
RIDER_FTP_W=264        # → IF, TSS, Power Zones, Power Skills
RIDER_MAX_HR=188       # → HR Zones, Relative Effort, Heart Points
RIDER_REST_HR=56       # → More accurate TRIMP (optional, default 60)
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
| **[USER_GUIDE.md](USER_GUIDE.md)** | Full setup guide — Strava API, OAuth, `.env`, usage |
| **[COMMANDS.md](COMMANDS.md)** | Quick reference — all commands with examples |
| **[METRICS.md](METRICS.md)** | Every metric explained with interpretation tables |

---

## Tech Stack

- **TypeScript** — full type safety
- **Zero dependencies** beyond `axios` (HTTP) and `dotenv` (config)
- **Zero sampling** — processes every stream data point
- **Bundleable** — single-file portable build via esbuild
