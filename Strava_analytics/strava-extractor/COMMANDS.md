# Strava Analytics — Quick Start Guide

## Prerequisites

- **Node.js** installed (v18+)
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

PAGE_SIZE=50
MAX_PAGES=10
# AFTER_DATE=2025-01-01

# Rider profile (optional — unlocks advanced metrics: IF, TSS, W/kg, zones)
RIDER_WEIGHT_KG=75
RIDER_FTP_W=250
RIDER_MAX_HR=195
# RIDER_REST_HR=50

# For AI analysis (pick one):
GEMINI_API_KEY=your_gemini_key
# OPENAI_API_KEY=your_openai_key
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

Pick an activity → automatically fetches, crunches, sends to AI, and updates Strava. Done.

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
- Lists your last 5 activities (type `more` for 20)
- You pick an activity by number
- Downloads ALL data: details, laps, zones, streams (second-by-second), segments
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
- Computes: Pogačar score, pacing analysis, cardiac drift, power curve, climbing breakdown, cadence stats, segment highlights
- **NEW:** IF, TSS, EF, aerobic decoupling, relative effort (TRIMP), W/kg, power skills, torque, HR/power/speed zone distributions, gradient analysis, VAM per-climb
- Saves a compact summary to `analysis/*_crunched.json`

**Output:** `analysis/*_crunched.json` (5-40 KB — all math pre-done)

**Note:** Set `RIDER_WEIGHT_KG`, `RIDER_FTP_W`, `RIDER_MAX_HR` in `.env` to unlock all advanced metrics.

---

### Step 3: `npm run analyze` — AI analysis

```bash
npm run analyze
```

**What it does:**
- Lists available crunched files
- You pick one
- Sends the compact data to Gemini or OpenAI (based on `.env`)
- AI writes: Pogačar Score, Ride Summary, Performance Verdict, Detailed Analysis (pacing, HR, power, training load, zones, climbing, gradient/VAM, torque, cadence, segments), Actionable Tips
- Saves the markdown analysis

**Output:** `analysis/*_analysis.md`

**Note:** Requires `GEMINI_API_KEY` or `OPENAI_API_KEY` in `.env`

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
├── .env                          # Your credentials + rider profile
├── AI_ANALYSIS_INSTRUCTIONS.md   # Instructions for AI analysis format
├── output/                       # Raw activity JSONs from Strava
│   └── activity_<id>_<date>_<name>.json
├── analysis/                     # Pre-analyzed + AI analysis files
│   ├── activity_..._crunched.json    # Pre-computed stats (Step 2)
│   └── activity_..._analysis.md     # AI-written analysis (Step 3)
└── src/
    ├── index.ts          # npm start
    ├── pre_analyze.ts    # npm run crunch
    ├── analyze.ts        # npm run analyze
    ├── update_strava.ts  # npm run update
    ├── fast.ts           # npm run fast (all-in-one)
    ├── crunch.ts         # Shared: all metric computations
    ├── format.ts         # Shared: description & notes formatting
    ├── config.ts         # .env loading (Strava + rider config)
    ├── auth.ts           # Strava OAuth
    ├── client.ts         # Strava API client
    ├── details.ts        # Activity data fetching
    └── types.ts          # TypeScript type definitions
```

---

## Advanced Metrics (computed in Step 2 / crunch)

| Metric | Requires | Description |
|--------|----------|-------------|
| **Pogačar Score** | — | % comparison to Tadej Pogačar |
| **Normalized Power (NP)** | Power meter | Weighted avg power (30s rolling) |
| **Intensity Factor (IF)** | FTP in .env | NP / FTP |
| **Training Stress Score (TSS)** | FTP in .env | Training load score |
| **Efficiency Factor (EF)** | Power + HR | NP / avg HR |
| **Relative Effort** | HR + Max HR | TRIMP-based cardiovascular effort score |
| **Aerobic Decoupling** | Power + HR | Power:HR ratio drift (aerobic fitness indicator) |
| **Power-to-Weight (W/kg)** | Weight in .env | Watts per kilogram for avg, NP, FTP, best efforts |
| **Power Skills** | Power meter | Sprint/Attack/Climbing strength classification |
| **Torque** | Power + Cadence | Average and peak torque in Nm |
| **HR Zones** | HR + Max HR | 5-zone time distribution |
| **Power Zones** | Power + FTP | 7-zone time distribution |
| **Speed Zones** | Speed | Time in speed bands |
| **Gradient Analysis** | Grade stream | Gradient distribution + steepest segment |
| **VAM Analysis** | Altitude | Per-climb vertical speed + best VAM |
| **Cardiac Drift** | HR | First/second half HR comparison |
| **Power Curve** | Power meter | Best average power for 5s to 20min |

---

## Quick reference

| Command | What | Input | Output |
|---------|------|-------|--------|
| **`npm run fast`** | **All 4 steps in one** | **Pick activity** | **Everything** |
| `npm start` | Download from Strava | Pick activity | `output/*.json` |
| `npm run crunch` | Compute all stats | Pick JSON file | `analysis/*_crunched.json` |
| `npm run analyze` | AI writes analysis | Pick crunched file | `analysis/*_analysis.md` |
| `npm run update` | Push to Strava | Pick crunched file | Updates Strava activity |

---

## Tips

- **Rate limits:** Strava allows 100 requests per 15 min, 1000 per day. Each activity download uses ~4 requests.
- **Large activities:** The `crunch` step handles any size — it processes all data points locally, no sampling.
- **Gemini free tier:** The crunched data is only ~10-30KB, well under the 250K token free limit.
- **Re-running:** You can re-run any step independently. `crunch` overwrites the previous crunched file. `analyze` overwrites the analysis. `update` always previews before pushing.
- **Description vs Notes:** Description (public) contains the full analysis. Private notes (only you) contain short actionable tips — optimized for mobile viewing.
- **Rider config:** Set `RIDER_WEIGHT_KG`, `RIDER_FTP_W`, `RIDER_MAX_HR` in `.env` for advanced metrics. Without them, IF/TSS/W/kg/power zones won't be computed.
