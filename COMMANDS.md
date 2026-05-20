# Strava Analytics — Quick Start Guide

## Prerequisites

- **Node.js** installed (v18+)
- **Python 3.10+** installed (for Garmin sync — optional)
- **Strava API app** created at [strava.com/settings/api](https://www.strava.com/settings/api)
- **`.env`** file configured with your credentials (see Setup below)

---

## Setup (one time)

### 1. Install dependencies

```bash
cd strava-extractor
npm install
```

### 2. Create `.env` file

```bash
cp .env.example .env
```

Edit `.env`:

```env
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
STRAVA_REFRESH_TOKEN=your_refresh_token

PAGE_SIZE=10              # Activities per page (default: 10)

# Rider profile (optional — unlocks advanced metrics: IF, TSS, W/kg, zones)
RIDER_WEIGHT_KG=75
RIDER_FTP_W=250
# RUNNER_RFTP_W=300        # Running FTP (optional, falls back to cycling FTP)
RIDER_MAX_HR=195
# RIDER_LTHR=165           # Lactate threshold HR (unlocks LTHR-based zones)
# RIDER_REST_HR=50

# For AI analysis (auto-fallback: Gemini → Groq → OpenRouter → OpenAI):
GEMINI_API_KEY=your_gemini_key
# GROQ_API_KEY=your_groq_key
# OPENROUTER_API_KEY=your_openrouter_key
# OPENAI_API_KEY=your_openai_key

# Garmin Connect (optional — enables readiness/recovery context in analysis)
# GARMIN_EMAIL=your@email.com
# GARMIN_PASSWORD=yourpassword
# GARMIN_SINCE=2025-11-11  # Your watch start date — skips fetching earlier empty days

# Training targets (optional — enables adherence tracking in digest + dashboard)
# WEEKLY_TARGET_KM=60
# WEEKLY_TARGET_HOURS=6
# WEEKLY_TARGET_ELEVATION_M=500
```

### 3. Get a refresh token with write access

Open this URL in your browser (replace `YOUR_CLIENT_ID`):

```
https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost&scope=read_all,activity:read_all,activity:write,profile:read_all&approval_prompt=force
```

Authorize → you'll be redirected to `http://localhost?code=XXXXX&...`

Exchange the code for tokens:

```powershell
Invoke-RestMethod -Method Post -Uri "https://www.strava.com/oauth/token" -Body @{
  client_id="YOUR_CLIENT_ID"
  client_secret="YOUR_CLIENT_SECRET"
  code="PASTE_CODE_HERE"
  grant_type="authorization_code"
}
```

Copy the `refresh_token` from the response into your `.env` file.

---

## Commands

### ⚡ Fast mode (one command does everything):

```bash
npm run fast
```

Pick an activity → automatically fetches, crunches, sends to AI (enriched with historical context + Garmin wellness if available), and updates Strava. Loops back to activity list after each update. Press `q` to quit.

**Navigation:** `n` = next page, `p` = previous page (10 activities per page).

---

### Full pipeline (run individually):

```
npm start       →  Step 1: Download activity from Strava
npm run crunch  →  Step 2: Pre-analyze all data (zero sampling) + advanced metrics
npm run analyze →  Step 3: AI writes the full analysis
npm run update  →  Step 4: Push analysis to Strava
```

---

### Step 1: `npm start` — Download activity

```bash
npm start
```

**What it does:**
- Authenticates with Strava
- Lists your activities (10 per page, `n`/`p` to navigate pages)
- You pick an activity by number
- Downloads ALL data: details, laps, zones, streams (second-by-second), segments
- **Fetches meteorological data** from Open-Meteo (free) — one API call per UTC hour the activity spans, using GPS coordinates at each hour boundary
- Saves to `output/activity_<id>_<date>_<name>.json`

**Output:** `output/*.json` (1-5 MB per activity)

---

### Step 2: `npm run crunch` — Pre-analyze data

```bash
npm run crunch
```

**What it does:**
- Lists available activity JSON files
- You pick one
- Processes ALL stream data points (zero sampling)
- Computes all metrics: Pogačar/Kipchoge score, pacing, cardiac drift, power curve, climbing, cadence zones, speed zones, segment highlights
- Advanced: IF, TSS, EF, aerobic decoupling, relative effort (TRIMP), W/kg, power skills, torque, HR/power/speed/cadence zone distributions, gradient analysis, VAM per-climb
- **Meteorology & wind:** headwind/tailwind/crosswind % per segment, net wind effect (km/h), weather conditions at start — uses weather data embedded during Step 1
- Workout: WIS, interval detection, HR recovery rate, consistency score, HR progression, EPOC estimate
- Saves a compact summary to `analysis/*_crunched.json`

**Output:** `analysis/*_crunched.json` (5-40 KB — all math pre-done)

**Note:** Set `RIDER_WEIGHT_KG`, `RIDER_FTP_W`, `RIDER_MAX_HR`, `RIDER_LTHR` in `.env` to unlock advanced metrics. For running, optionally set `RUNNER_RFTP_W`, `RUNNER_MAX_HR`, `RUNNER_LTHR`. Without FTP, IF/TSS/power zones won't be computed.

---

### Step 3: `npm run analyze` — AI analysis

```bash
npm run analyze
```

**What it does:**
- Lists available crunched files
- You pick one
- Automatically loads **historical context** (7d/30d/90d/365d baselines for the same sport) from existing crunched files — no extra API calls
- Automatically loads **Garmin wellness** for that day (HRV, sleep, Body Battery, training status, acute load, stress) if `garmin_wellness.json` exists
- Sends enriched payload to AI (Gemini → Groq → OpenRouter → OpenAI, auto-fallback)
- AI writes: activity score, summary, performance verdict, detailed analysis, **historical comparison**, **readiness context**, actionable tips
- Saves the markdown analysis

**Output:** `analysis/*_analysis.md`

**Note:** Requires one of: `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, or `OPENAI_API_KEY` in `.env`. Run `npm run bulk` first to enable historical context; run `npm run garmin` first to enable readiness context.

---

### Step 4: `npm run update` — Push to Strava

```bash
npm run update
```

**What it does:**
- Lists available crunched files
- You pick one
- Builds **description** (public): Pogačar Score + Ride Summary + Advanced Metrics (IF/TSS/W/kg) + Full AI Analysis
- Builds **private notes** (mobile-friendly): Short actionable tips + key stats
- Previews both in terminal
- You choose: both / description only / notes only / cancel
- Pushes to Strava via API

**Requires:** `activity:write` scope in your refresh token (see Setup step 3)

---

## Alternative: Manual AI analysis (no API key needed)

Instead of `npm run analyze`, you can use GitHub Copilot or any AI chat:

```bash
npm start        # download activity
npm run crunch   # pre-analyze
```

Then share the `analysis/*_crunched.json` file with the AI and ask it to analyze following the `AI_ANALYSIS_INSTRUCTIONS.md` format.

---

## File structure

```
strava-extractor/
├── .env                          # Your credentials + rider profile + Garmin credentials
├── .env.example                  # Template
├── .garmin_session.json          # Cached Garmin session token (auto-created, gitignored)
├── AI_ANALYSIS_INSTRUCTIONS.md   # Instructions for single-activity AI analysis
├── AI_COMPARE_INSTRUCTIONS.md    # Instructions for trend/comparison AI analysis
├── AI_DIGEST_INSTRUCTIONS.md     # Instructions for weekly/monthly digest AI report
├── garmin_sync.py                # Garmin Connect wellness sync script
├── requirements.txt              # Python dependencies (garminconnect)
├── dashboard.html                # Generated static dashboard (open in browser)
├── output/                       # Raw activity JSONs from Strava
│   └── activity_<id>_<date>_<name>.json
├── analysis/                     # Pre-analyzed + AI analysis files
│   ├── activity_..._crunched.json    # Pre-computed stats (Step 2 / bulk)
│   ├── activity_..._analysis.md     # AI-written single analysis (Step 3)
│   ├── comparison_<period>_<date>.md # AI-written trend report (compare)
│   ├── digest_<weeks>w_<date>.md     # AI-written weekly digest
│   ├── personal_records.json         # All-time personal records database
│   └── garmin_wellness.json          # Garmin daily wellness database
└── src/
    ├── index.ts          # npm start
    ├── pre_analyze.ts    # npm run crunch
    ├── analyze.ts        # npm run analyze
    ├── update_strava.ts  # npm run update
    ├── fast.ts           # npm run fast (all-in-one)
    ├── bulk_fetch.ts     # npm run bulk (2-year history fetch+crunch)
    ├── compare.ts        # npm run compare (AI trend analysis)
    ├── digest.ts         # npm run digest (weekly/monthly digest + overtraining check)
    ├── records.ts        # npm run records (personal records tracker)
    ├── dashboard.ts      # npm run dashboard (static HTML dashboard)
    ├── crunch.ts         # Shared: all metric computations
    ├── summary_utils.ts  # Shared: compact activity summaries + historical context + PR check
    ├── wellness.ts       # Shared: Garmin wellness context reader
    ├── activities.ts     # Paginated activity list fetching
    ├── weather.ts        # Open-Meteo weather fetch (multi-point, per hour)
    ├── format.ts         # Shared: description & notes formatting
    ├── config.ts         # .env loading (Strava + rider config)
    ├── auth.ts           # Strava OAuth
    ├── client.ts         # Strava API client
    ├── details.ts        # Activity data fetching
    └── types.ts          # TypeScript type definitions
```

---

## Advanced Metrics (computed in Step 2 / crunch)

### Cycling & Running

| Metric | Requires | Description |
|--------|----------|-------------|
| **Pogačar Score** | — (cycling) | Composite % vs Tadej Pogačar |
| **Kipchoge Score** | — (running) | Composite % vs Kipchoge (pace + economy + cadence) |
| **Normalized Power (NP)** | Power meter | Weighted avg power (30s rolling) |
| **Intensity Factor (IF)** | FTP (`RIDER_FTP_W` / `RUNNER_RFTP_W`) | NP / FTP |
| **Training Stress Score (TSS)** | FTP | Training load score |
| **Efficiency Factor (EF)** | Power + HR | NP / avg HR |
| **Relative Effort (TRIMP)** | HR + Max HR | Cardiovascular effort score |
| **Aerobic Decoupling** | Power + HR | Power:HR ratio drift |
| **Power-to-Weight (W/kg)** | Weight + Power | Watts per kilogram |
| **Power Skills** | Power + FTP | Sprint/Attack/Climbing classification |
| **Torque** | Power + Cadence | Average and peak torque in Nm |
| **HR Zones** | HR + LTHR or MaxHR | 5-zone distribution (LTHR-based preferred) |
| **Power Zones** | Power + FTP | 7-zone distribution |
| **Speed Zones** | Speed | Sport-specific time in speed bands |
| **Cadence Zones** | Cadence | Sport-specific zone distribution |
| **Gradient Analysis** | Grade stream | Distribution + steepest segment |
| **VAM Analysis** | Altitude | Per-climb vertical speed |
| **Cardiac Drift** | HR | First/second half HR delta |
| **Power Curve** | Power | Best avg power for 5s to 20min |
| **Meteorology** | GPS + weather API | Temperature, humidity, wind conditions at activity time |
| **Wind Analysis** | GPS + weather API | Headwind/tailwind/crosswind % per segment, net wind effect |

### Workout (HR-only, no GPS)

| Metric | Description |
|--------|-------------|
| **Workout Intensity Score (WIS)** | Zone-weighted 0–100 score with label |
| **Effort Intervals** | Auto-detected work/rest intervals from HR spikes |
| **HR Recovery Rate** | Avg HR drop per minute after peak efforts |
| **Consistency Score (CV)** | HR variability — classifies session type |
| **HR Progression** | Early/mid/late HR trend — session structure |
| **Time to Peak HR** | When peak HR occurred — pacing insight |
| **Recovery Ratio** | % time in true rest HR — HIIT vs steady-state |
| **EPOC Estimate** | Post-exercise afterburn calorie estimate |

---

## Garmin Connect wellness sync (optional but recommended)

Enriches every single-activity analysis with your body's readiness data — **no manual export needed**.

### One-time setup

```bash
# Install Python dependency (only once)
pip install -r requirements.txt
```

Add to your `.env`:

```env
GARMIN_EMAIL=your@email.com
GARMIN_PASSWORD=yourpassword
GARMIN_SINCE=2025-11-11   # your Garmin watch start date
```

### Usage

```bash
npm run garmin                                    # sync from 2025-11-11 to today (incremental)
npm run garmin:year                               # same — full re-sync from watch start
python garmin_sync.py --since 2025-11-11 --force # force re-fetch everything
python garmin_sync.py --days 30                  # sync last 30 days only
```

**What it fetches per day:**

| Metric | Source | Used for |
|--------|--------|----------|
| Sleep score + stages (deep/REM/light/awake) | Sleep tracking | Recovery quality |
| HRV last night + 7-day avg + status | HRV nightly | Readiness, fatigue detection |
| Resting HR | Heart rate | Overtraining signal |
| Body Battery (start/end/peak/low) | Composite | Pre-workout readiness |
| Training Readiness score (0–100) | Garmin composite | Go/no-go signal |
| Training Status (PRODUCTIVE/MAINTAINING/RECOVERY/OVERREACHING…) | Garmin | Load context |
| Acute load (7-day) + Chronic load (4-week) + Load ratio | Training load | Overreaching risk detection |
| Stress breakdown: rest / low / medium / high (% of day) | HRV-derived | Recovery quality |
| SpO2 avg/min | Pulse Ox | Altitude, sleep quality |
| VO2max estimate | Garmin algorithm | Fitness level tracking |
| Steps, intensity minutes | Accelerometer | Daily activity load |

**Output:** `analysis/garmin_wellness.json` (rolling JSON database, upserted on each run)

**How it enriches analysis:**
- `npm run fast` and `npm run analyze` automatically read `garmin_wellness.json`
- For each activity, the AI receives the **night-before** sleep/HRV/Body Battery/training status and **day-of** stress/battery
- AI section 7 (🛌 Readiness & Recovery Context) connects this to the activity's observed HR, power, and pacing
- Example: "Your HRV was 8 ms below your 7-day average and training status was OVERREACHING — this explains why HR was 6 bpm higher than your 30-day average at the same pace"

**Note:** Session token is cached in `.garmin_session.json` — re-login is automatic when it expires. On first login, Garmin will send a one-time code to your email — enter it in the terminal when prompted.

---

## Bulk history + comparison pipeline

### `npm run bulk` — Fetch & crunch last 2 years

```bash
npm run bulk
```

**What it does:**
- Authenticates with Strava
- Fetches **all activities from the last 2 years** (pages automatically, respects rate limits)
- For each activity: downloads full data (details, laps, zones, streams) and immediately runs `crunch` to save `_crunched.json`
- **Skips already-downloaded and already-crunched activities** — safe to re-run after interruptions
- Weather is **skipped** (speeds up the bulk run; run `npm run fast` for individual activities with weather)
- No AI calls — just raw data + pre-computed stats
- **Required for historical context** in `npm run analyze` / `npm run fast`

**Output:** `output/*.json` + `analysis/*_crunched.json` for each activity

**Note:** 2 years of data may be 200–500+ activities (600–1500 API requests). Strava allows 100 requests/15 min, 1000/day. A large backfill may take several sessions.

---

### `npm run compare` — AI fitness trend analysis

```bash
npm run compare
```

**What it does:**
- Reads all `_crunched.json` files in `analysis/`
- Activities are grouped by sport type (e.g. all Rides together, all Runs together)
- You pick a time window: this week / last 30 days / last 3 months / last 12 months / last 2 years / custom
- Builds a compact aggregate (volume, load, trends, bests, weekly summaries, prior period deltas) — **no extra API calls**
- Sends to AI with `AI_COMPARE_INSTRUCTIONS.md` as the system prompt
- AI writes: period score, volume & load summary, latest activity in context, per-sport performance trends, weekly breakdown, coaching recommendations, warnings
- Saves the markdown report

**Output:** `analysis/comparison_<period>_<date>.md`

**Note:** Automatically compares current period vs. the prior equal-length period to detect trends. Requires at least 3 crunched files per sport to generate meaningful baselines; works best after running `npm run bulk`.

---

### `npm run digest` — Weekly/monthly training digest

```bash
npm run digest
```

**What it does:**
- You pick a period (2 / 4 / 8 / 12 weeks or custom)
- Builds a week-by-week breakdown per sport: distance, time, elevation, load, HR zone distribution
- **Overtraining early warning**: computes acute:chronic load ratio — flags if >1.3, also checks HRV trend from Garmin wellness
- **Race predictions**: Riegel formula estimates for 5K / 10K / Half Marathon / Marathon from your recent best pace (runs only)
- **Training plan adherence**: if `WEEKLY_TARGET_KM`, `WEEKLY_TARGET_HOURS`, or `WEEKLY_TARGET_ELEVATION_M` are set in `.env`, shows compliance % per week
- Garmin wellness summary (last 7-day HRV, sleep, Body Battery, training status)
- Sends to AI with `AI_DIGEST_INSTRUCTIONS.md` — AI writes a full Sunday-review report
- Saves the markdown report

**Output:** `analysis/digest_<weeks>w_<date>.md`

**Note:** Works best after `npm run bulk`. If Garmin data is present (after `npm run garmin`), readiness trends are included. Training targets are optional — omit from `.env` to skip adherence section.

---

### `npm run records` — Personal records tracker

```bash
npm run records
```

**What it does:**
- Scans all `_crunched.json` files
- Detects all-time personal records:
  - 🏃 Fastest km pace, fastest 5K pace, fastest 10K pace, longest run
  - 🚴 Longest ride, best normalized power
  - ⛰️ Biggest single climb (elevation gain in one activity)
  - 🫁 Best VO2max estimate, highest TSS, highest TRIMP
  - 📏 Longest activity per sport
- Saves records to `analysis/personal_records.json`
- On each run, **flags newly broken records** (🔥 NEW PR!) by comparing against the previous saved file
- PRs are also auto-injected into `npm run fast` / `npm run analyze` — the AI is notified to celebrate them

**Output:** `analysis/personal_records.json` (auto-updated on each run)

**Note:** Run after `npm run bulk` for complete history. Run again after any new activity to detect new PRs. The more history you have, the more meaningful the records.

---

### `npm run dashboard` — HTML dashboard export

```bash
npm run dashboard
```

**What it does:**
- Reads all `_crunched.json` files + `garmin_wellness.json` (if present)
- Generates a fully static `dashboard.html` with interactive Chart.js graphs:
  - 📊 Weekly distance, training load, moving time, elevation
  - ❤️ HR zone distribution by week (stacked bar — Z1-Z5)
  - 📈 Avg HR per activity, VO2max trend, running pace trend, cycling power trend
  - 🏃 All activities scatter (distance by date, colored by sport)
  - 🛌 Garmin HRV, sleep score, Body Battery trends (if available)
  - 🎯 Weekly target lines (if `WEEKLY_TARGET_KM` / `WEEKLY_TARGET_HOURS` set in `.env`)
- No server needed — open `dashboard.html` directly in any browser
- Requires internet (CDN) for Chart.js on first open

**Output:** `dashboard.html` in the `strava-extractor/` root

---

## Recommended workflow

### First time setup
```bash
npm run bulk          # backfill 2 years of Strava history (enables historical context)
npm run garmin        # backfill Garmin wellness since your watch start (enables readiness context)
```

### Daily use
```bash
npm run garmin        # keep Garmin wellness fresh (run once a day or before analyzing)
npm run fast          # fetch + analyze + update Strava for any activity
npm run records       # update personal records after each new activity
```

### Periodic trend review
```bash
npm run compare       # AI trend analysis for any time window
npm run digest        # weekly digest with overtraining check + race predictions
npm run dashboard     # regenerate HTML dashboard
```

---

## Quick reference

| Command | What | Input | Output |
|---------|------|-------|--------|
| **`npm run fast`** | **All 4 steps in one** | **Pick activity** | **Everything** |
| `npm start` | Download from Strava | Pick activity | `output/*.json` |
| `npm run crunch` | Compute all stats | Pick JSON file | `analysis/*_crunched.json` |
| `npm run analyze` | AI writes analysis (+ history + Garmin + PR check) | Pick crunched file | `analysis/*_analysis.md` |
| `npm run update` | Push to Strava | Pick crunched file | Updates Strava activity |
| **`npm run bulk`** | **Fetch + crunch 2 years** | **None** | `output/*.json` + `analysis/*_crunched.json` |
| **`npm run compare`** | **AI trend analysis** | **Pick period** | `analysis/comparison_*.md` |
| **`npm run digest`** | **Weekly digest + overtraining check + race predictions** | **Pick weeks** | `analysis/digest_*w_*.md` |
| **`npm run records`** | **Personal records tracker** | **None** | `analysis/personal_records.json` |
| **`npm run dashboard`** | **Static HTML dashboard** | **None** | `dashboard.html` |
| **`npm run garmin`** | **Sync Garmin wellness** | **None** | `analysis/garmin_wellness.json` |
| `npm run garmin:year` | Force full Garmin re-sync | None | `analysis/garmin_wellness.json` |

---

## Tips

- **Rate limits:** Strava allows 100 requests per 15 min, 1000 per day. Each activity download uses ~4 requests + 1 request per UTC hour covered (weather).
- **Weather:** Fetched automatically during `npm start` / `npm run fast` from [Open-Meteo](https://open-meteo.com/) — free, no API key needed. Short activities (< 1 hour) use 1 call. Multi-hour rides use one call per hour spanned, at the GPS coordinates for that hour.
- **Large activities:** The `crunch` step handles any size — it processes all data points locally, no sampling.
- **Gemini free tier:** The enriched payload (crunched + history + Garmin) is typically 15–40 KB, well under the free tier limit.
- **Re-running:** You can re-run any step independently. `crunch` overwrites the previous crunched file. `analyze` overwrites the analysis. `update` always previews before pushing.
- **Description vs Notes:** Description (public) contains the full analysis. Private notes (only you) contain short actionable tips — optimized for mobile viewing.
- **Rider config:** Set `RIDER_WEIGHT_KG`, `RIDER_FTP_W`, `RIDER_MAX_HR`, `RIDER_LTHR` in `.env` for advanced metrics. For running, optionally set `RUNNER_RFTP_W`, `RUNNER_MAX_HR`, `RUNNER_LTHR`. Without FTP, IF/TSS/power zones won't be computed.
- **Garmin MFA:** First login sends a one-time code to your email. Enter it in the terminal. After that the session is cached and no more MFA prompts until the session expires (typically weeks).
- **Historical context:** Automatically included when `analysis/` contains ≥3 crunched files for the same sport. Shows 7d/30d/90d/365d baselines and how this activity compares.
- **Sport grouping:** `compare` and historical context group `Ride + GravelRide + MountainBikeRide` together, `Run + TrailRun` together, etc. — comparisons stay sport-appropriate.
- **Personal records:** Run `npm run records` after `npm run bulk` for complete history. Records are auto-compared against previous run — new PRs flagged with 🔥. All-time records also auto-injected into single-activity AI analysis.
- **Overtraining warning:** `npm run digest` computes acute:chronic load ratio from your TRIMP/TSS data. Load ratio >1.3 = danger zone. If Garmin data is present, HRV trend is also checked for convergent signal.
- **Race predictions:** `npm run digest` includes Riegel-formula race time estimates for running. Based on your best recent pace. Accuracy improves when your longest runs approach the target race distance.
- **Training targets:** Set `WEEKLY_TARGET_KM`, `WEEKLY_TARGET_HOURS`, and/or `WEEKLY_TARGET_ELEVATION_M` in `.env` to enable adherence tracking in `npm run digest` and target lines in `npm run dashboard`. If not set, those sections are skipped.
- **Dashboard:** `npm run dashboard` generates a static `dashboard.html` — open directly in any browser (no server needed). Requires internet for Chart.js CDN on first load. Regenerate after each `npm run bulk` or `npm run garmin` run.
