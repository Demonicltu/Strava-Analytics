# Strava Analytics — User Guide

Complete guide to setting up and using the Strava Analytics tool to extract, analyze, and enrich your Strava activities with AI-powered insights.

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [Developer Setup (Node.js)](#developer-setup-nodejs)
  - [Release / Portable Setup (no Node.js required)](#release--portable-setup)
- [Strava API Setup](#strava-api-setup)
  - [1. Create a Strava API Application](#1-create-a-strava-api-application)
  - [2. Get a Refresh Token](#2-get-a-refresh-token)
- [.env Configuration](#env-configuration)
  - [Required: Strava Credentials](#required-strava-credentials)
  - [Optional: Activity Fetching](#optional-activity-fetching)
  - [Optional: Rider Profile](#optional-rider-profile-unlocks-advanced-metrics)
  - [Optional: AI Provider](#optional-ai-provider-for-automated-analysis)
- [Usage](#usage)
  - [Fast Mode (Recommended)](#-fast-mode-recommended)
  - [Step-by-Step Pipeline](#step-by-step-pipeline)
  - [Manual AI Analysis (No API Key)](#manual-ai-analysis-no-api-key)
- [Output Files](#output-files)
- [Understanding Your Metrics](#understanding-your-metrics)
- [Rate Limits](#rate-limits)
- [Troubleshooting](#troubleshooting)

---

## Overview

Strava Analytics downloads your activity data from Strava, computes advanced performance metrics locally (Normalized Power, TSS, IF, W/kg, VO2max, and more), then optionally sends the data to an AI for a written performance analysis. The result can be pushed back to your Strava activity description.

**Pipeline:**

```
Download → Crunch (metrics) → AI Analysis → Push to Strava
```

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **Strava account** | Free or Premium |
| **Strava API app** | Free — see [Strava API Setup](#strava-api-setup) |
| **Node.js v18+** | Only for developer setup. Download: [nodejs.org](https://nodejs.org/) |
| **Windows** | The `.bat` launcher is Windows-only; `npm` commands work on any OS |

---

## Installation

### Developer Setup (Node.js)

```powershell
cd strava-extractor
npm install
```

Then configure your `.env` file (see [.env Configuration](#env-configuration)).

### Release / Portable Setup

If you received a `release/` folder (pre-built bundle), no Node.js install needed:

1. Open the `release/` folder
2. Edit `.env` with your credentials (see below)
3. Double-click **`strava.bat`** to run Fast Mode

---

## Strava API Setup

### 1. Create a Strava API Application

1. Go to **[https://www.strava.com/settings/api](https://www.strava.com/settings/api)**
2. Fill in the form:
   - **Application Name:** anything (e.g. "My Analytics")
   - **Category:** anything
   - **Authorization Callback Domain:** `localhost`
3. Click **Create**
4. Note your **Client ID** and **Client Secret** — you'll need them for `.env`

### 2. Get a Refresh Token

You need to authorize the app once. This grants it permission to read (and optionally write) your activities.

**Step A:** Open this URL in your browser (replace `YOUR_CLIENT_ID` with your actual Client ID):

```
https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost&scope=read_all,activity:read_all,activity:write,profile:read_all&approval_prompt=force
```

> **Tip:** The `activity:write` scope is needed for pushing analysis back to Strava. If you only want to read data, remove it.

**Step B:** Click **Authorize**. Your browser will redirect to something like:

```
http://localhost?code=abc123def456&scope=read_all,activity:read_all,activity:write,profile:read_all
```

Copy the `code` value (everything after `code=` and before `&`).

**Step C:** Exchange the code for a refresh token.

**PowerShell (Windows):**

```powershell
Invoke-RestMethod -Method Post -Uri "https://www.strava.com/oauth/token" -Body @{
  client_id     = "YOUR_CLIENT_ID"
  client_secret = "YOUR_CLIENT_SECRET"
  code          = "PASTE_CODE_HERE"
  grant_type    = "authorization_code"
}
```

**Bash / curl (Mac/Linux):**

```bash
curl -X POST https://www.strava.com/oauth/token \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=YOUR_CLIENT_SECRET \
  -d code=PASTE_CODE_HERE \
  -d grant_type=authorization_code
```

The response JSON will contain a `refresh_token` field. Copy it.

> ⚠️ The authorization `code` expires in minutes. If it fails, repeat Steps A-C.

---

## .env Configuration

Copy the example file and edit it:

```powershell
cp .env.example .env
```

Below is every variable explained.

### Required: Strava Credentials

| Variable | Description | Example |
|----------|-------------|---------|
| `STRAVA_CLIENT_ID` | Your app's Client ID from [strava.com/settings/api](https://www.strava.com/settings/api) | `12345` |
| `STRAVA_CLIENT_SECRET` | Your app's Client Secret | `abcdef1234567890abcdef` |
| `STRAVA_REFRESH_TOKEN` | Obtained via the OAuth flow above | `a1b2c3d4e5f6...` |

```env
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=abcdef1234567890abcdef
STRAVA_REFRESH_TOKEN=a1b2c3d4e5f6g7h8i9
```

### Optional: Activity Fetching

| Variable | Default | Description |
|----------|---------|-------------|
| `PAGE_SIZE` | `50` | Number of activities fetched per page (max `200`) |
| `MAX_PAGES` | `10` | Maximum pages to fetch. `PAGE_SIZE × MAX_PAGES` = max activities listed |
| `AFTER_DATE` | *(none)* | Only fetch activities after this date (ISO 8601). Useful for large histories |

```env
PAGE_SIZE=50
MAX_PAGES=10
# AFTER_DATE=2025-01-01
```

### Optional: Rider Profile (unlocks advanced metrics)

These values enable the most useful metrics. **Without them, IF/TSS/W/kg/power zones/relative effort won't be computed.**

| Variable | Description | How to find it |
|----------|-------------|----------------|
| `RIDER_WEIGHT_KG` | Your body weight in kilograms | Weigh yourself |
| `RIDER_FTP_W` | Functional Threshold Power in watts | Do an FTP test, or use Strava's estimate under your power curve |
| `RIDER_MAX_HR` | Maximum heart rate | From a max effort, or estimate: `220 - age` |
| `RIDER_REST_HR` | Resting heart rate (optional, default `60`) | Measure first thing in the morning |

```env
RIDER_WEIGHT_KG=75
RIDER_FTP_W=250
RIDER_MAX_HR=195
RIDER_REST_HR=50
```

**What each value unlocks:**

| You set... | You unlock... |
|-----------|--------------|
| `RIDER_WEIGHT_KG` | Power-to-Weight (W/kg), VO2max estimate |
| `RIDER_FTP_W` | Intensity Factor (IF), Training Stress Score (TSS), Power Zones (7-zone), Power Skills |
| `RIDER_MAX_HR` | Heart Rate Zones (5-zone), Relative Effort (TRIMP), Heart Points |
| `RIDER_REST_HR` | More accurate TRIMP calculation |
| Weight + FTP | W/kg level classification (Beginner → World Tour Pro) |
| All four | Full metrics suite |

> **Tip:** Don't know your FTP? Start without it. You'll still get Pogačar Score, pacing, cardiac drift, power curve, and climbing stats. Add FTP later when you test it.

### Optional: AI Provider (for automated analysis)

The tool auto-detects which key is available and falls back in order: **Gemini → Groq → OpenRouter → OpenAI**.

| Variable | Provider | Free tier? | Get key at |
|----------|----------|-----------|------------|
| `GEMINI_API_KEY` | Google Gemini | ✅ Yes | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `GROQ_API_KEY` | Groq | ✅ Yes | [console.groq.com/keys](https://console.groq.com/keys) |
| `OPENROUTER_API_KEY` | OpenRouter | 💰 Pay-per-use | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `OPENAI_API_KEY` | OpenAI | 💰 Pay-per-use | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

Each provider also supports a `*_MODEL` override:

```env
# Example: Use Gemini with a specific model
GEMINI_API_KEY=AI...
GEMINI_MODEL=gemini-2.5-flash

# Example: Use Groq
# GROQ_API_KEY=gsk_...
# GROQ_MODEL=llama-3.3-70b-versatile

# Example: Use OpenRouter
# OPENROUTER_API_KEY=sk-or-...
# OPENROUTER_MODEL=deepseek/deepseek-chat-v3-0324

# Example: Use OpenAI
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o
```

> **No API key?** You can still use the tool — just skip the AI step and analyze the crunched JSON manually (see [Manual AI Analysis](#manual-ai-analysis-no-api-key)).

### Complete .env Example

```env
# ─── Required ───
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=abcdef1234567890abcdef
STRAVA_REFRESH_TOKEN=a1b2c3d4e5f6g7h8i9

# ─── Activity Fetching (optional) ───
PAGE_SIZE=50
MAX_PAGES=10
# AFTER_DATE=2025-01-01

# ─── Rider Profile (optional — unlocks advanced metrics) ───
RIDER_WEIGHT_KG=75
RIDER_FTP_W=250
RIDER_MAX_HR=195
RIDER_REST_HR=50

# ─── AI Provider (optional — pick one) ───
GEMINI_API_KEY=AIza...
# GROQ_API_KEY=gsk_...
# OPENROUTER_API_KEY=sk-or-...
# OPENAI_API_KEY=sk-...
```

---

## Usage

### ⚡ Fast Mode (Recommended)

One command that runs the full pipeline: download → crunch → AI analysis → push to Strava.

```bash
npm run fast
```

Or double-click **`strava.bat`** if using the release build.

You'll be prompted to pick an activity, then everything runs automatically.

### Step-by-Step Pipeline

Run each step individually for more control:

| # | Command | What it does | Output |
|---|---------|-------------|--------|
| 1 | `npm start` | Downloads activity data from Strava | `output/activity_*.json` |
| 2 | `npm run crunch` | Computes all metrics locally (zero sampling) | `analysis/*_crunched.json` |
| 3 | `npm run analyze` | Sends data to AI for written analysis | `analysis/*_analysis.md` |
| 4 | `npm run update` | Pushes analysis to your Strava activity | Updates Strava |

**Step 1: Download**

```bash
npm start
```

- Lists your recent activities (type `more` to see more)
- Pick one by number
- Downloads all data: details, laps, zones, streams, segments

**Step 2: Crunch**

```bash
npm run crunch
```

- Pick a downloaded activity JSON
- Computes all metrics locally: Pogačar Score, NP, IF, TSS, W/kg, power curve, climbing, zones, etc.
- Saves compact results (~10-40 KB)

**Step 3: AI Analysis**

```bash
npm run analyze
```

- Pick a crunched file
- AI writes a full performance report: summary, verdict, detailed breakdowns, tips
- Requires an AI API key in `.env`

**Step 4: Push to Strava**

```bash
npm run update
```

- Pick a crunched file (must have matching analysis)
- Preview the description + private notes in terminal
- Choose what to push: both / description only / notes only / cancel
- Requires `activity:write` scope in your refresh token

### Manual AI Analysis (No API Key)

If you don't want to use an AI API, you can analyze the data yourself:

1. Run `npm start` then `npm run crunch`
2. Open the `analysis/*_crunched.json` file
3. Paste it into any AI chat (ChatGPT, Copilot, Gemini, Claude) and ask for analysis

---

## Output Files

```
strava-extractor/
├── output/                              # Raw data from Strava
│   └── activity_<id>_<date>_<name>.json     # 1-5 MB per activity
├── analysis/                            # Processed results
│   ├── *_crunched.json                      # Pre-computed metrics (10-40 KB)
│   ├── *_analysis.md                        # AI-written analysis
│   └── pre_analysis.json                    # Shared pre-analysis data
```

---

## Understanding Your Metrics

See **[METRICS.md](../METRICS.md)** for a full reference of all computed metrics including:

- 🏆 **Pogačar Score** — how your ride compares to Tadej Pogačar
- 🏆 **Kipchoge Score** — pace vs Eliud Kipchoge's marathon
- ⚙️ **IF / TSS** — intensity and training load
- 🫁 **VO2max** — aerobic fitness estimate
- 💪 **W/kg** — power-to-weight classification
- 🔥 **Relative Effort (TRIMP)** — cardiovascular load
- 💚 **Heart Points** — daily/weekly fitness tracking
- 📉 **Aerobic Decoupling** — fitness indicator
- ❤️ **Cardiac Drift** — fatigue marker
- ⛰️ **VAM** — climbing speed
- And many more...

---

## Rate Limits

Strava API limits: **100 requests per 15 minutes**, **1,000 per day**.

Each activity download uses ~4 API calls, so:
- ~25 activities per 15-minute window
- ~250 activities per day

The tool handles rate limiting automatically (delays + retry on HTTP 429).

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `❌ Missing required environment variable` | Copy `.env.example` to `.env` and fill in your Strava credentials |
| `401 Unauthorized` | Your refresh token is invalid or expired. Re-do the [OAuth flow](#2-get-a-refresh-token) |
| `403 Forbidden` on update | Your token lacks `activity:write` scope. Re-authorize with the full scope URL |
| Authorization code doesn't work | Codes expire in minutes — complete the exchange immediately after authorizing |
| No IF/TSS/W/kg metrics | Set `RIDER_FTP_W` and `RIDER_WEIGHT_KG` in `.env` |
| No HR zones or Relative Effort | Set `RIDER_MAX_HR` in `.env` |
| AI analysis fails | Check that your API key is valid and the provider is reachable |
| `429 Too Many Requests` | Rate limited — wait 15 minutes and try again |
| Activity not found in list | Increase `MAX_PAGES` or set `AFTER_DATE` to narrow the date range |
| `.bat` file doesn't work | Ensure `dist/strava.cjs` exists. Run `npm run build:bundle` to create it |

---

## Tips

- **Start simple:** You only need the 3 Strava credentials to get started. Add rider profile and AI keys later.
- **Free AI:** Gemini and Groq both offer free tiers — more than enough for activity analysis.
- **Re-run any step:** Each step is independent. Re-crunch after updating your FTP to recalculate metrics. Re-analyze to get a fresh AI take.
- **Crunched data is tiny:** The crunched JSON is 10-40 KB — well within any AI's context window.
- **Description vs Notes:** The Strava description (public) gets the full analysis. Private notes (visible only to you, great on mobile) get short actionable tips.

