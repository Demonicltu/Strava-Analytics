# 📋 Strava Content Policy Guide

> Control how your activity analysis is split between **public description** (followers see) and **private notes** (only you see).

---

## Overview

The `STRAVA_CONTENT_POLICY` env variable reshapes how Strava Analytics formats your activity report. Instead of just toggling sections on/off, it **reorders and restructures** content for different audiences:

| Policy | Public Focus | Private Focus | Best For |
|--------|--------------|---------------|----------|
| **`balanced`** (default) | Score + Stats + Verdict + Zones + Performance Sections + Segments | Readiness + coaching | Full detail public + personal insights private |
| **`strict`** | Score + Stats + Verdict + Segments (no zones/performance drill-down) | Compact key stats + tips + zones + full training log | Cleaner public + deep private analytics |
| **`mirror`** | Full narrative + all details | Duplicate public + concise backend | Complete record-keeping |

When AI analysis is available, PR/achievement text is expected inside the AI `SEGMENT` section. The standalone PR counter line is only emitted in no-AI fallback mode.

---

## Detailed Breakdowns

### 1. Balanced Mode (Default) ⚖️

**Philosophy**: Tell your followers what happened, keep personal recovery analysis private.

**Public Description Order:**
```
1️⃣  🏅 YOUR CYCLING SCORE (Category, Tier Progress, vs. Your Typical, Pogačar Factor)
2️⃣  📊 RIDE SUMMARY (Distance, Time, Speed, Elevation, Avg HR, Power, Cadence)
3️⃣  ⚙️ ADVANCED METRICS (IF, TSS, W/kg, Level, Relative Effort, VO2max)
4️⃣  💚 HEART POINTS (Total, Moderate/Vigorous breakdown)
5️⃣  🧭 ROUTE DIFFICULTY (Score, Ascent Density)
6️⃣  📈 PERFORMANCE VERDICT (AI text summary: "Great ride today!")
7️⃣  🎯 TRAINING ZONES (HR/Power/Cadence zone distribution)
8️⃣  ❤️ HEART RATE, 🔄 CADENCE, ⛰️ CLIMBING, 📐 GRADIENT, 📈 PACING (Performance sections)
9️⃣  🌤️ WEATHER & WIND (Temperature, humidity, wind impact)
🔟 🏅 SEGMENT (Personal records, achievements)
1️⃣1️⃣ 🏅 PR count (no-AI fallback only)
```

**Private Notes Order:**
```
1️⃣  📋 KEY STATS (IF, TSS, NP/VI, W/kg, Effort, VO2max, Drift, Pacing, Wind)
2️⃣  💡 TIPS (Actionable coaching from AI: "Watch your cadence on climbs")
3️⃣  🛌 READINESS (Sleep, HRV, Body Battery, Training Status)
4️⃣  🧭 TRAINING RECOMMENDATION (Recovery status, 7-day microcycle, TSS targets)
5️⃣  📈 HISTORICAL CONTEXT (1-week to 6-month baselines: avg power, TSS, EF)
```

**Example Scenario:**
- You did a hard 50km ride with a personal record on a local climb
- **Public**: Followers see your category tier, the ride stats, the verdict, and **that you crushed a segment**
- **Private**: You see detailed readiness analysis, whether you should do another hard session tomorrow, and which metrics trended up/down vs. your baseline

---

### 2. Strict Mode (Privacy-First) 🔒

**Philosophy**: Full public story — score, stats, verdict, weather, segments — but no raw performance drill-down. That all goes to a structured private training log.

**Public Description Order:**
```
1️⃣  🏅 YOUR CYCLING SCORE (Full: Category, Tier Progress, Pogačar Factor, breakdown)
2️⃣  📊 RIDE SUMMARY (All core stats: distance, time, speed, elevation, HR, power, cadence)
3️⃣  ⚙️ ADVANCED METRICS (IF, TSS, W/kg, Relative Effort, VO2max — whatever's available)
4️⃣  💚 HEART POINTS (Total + moderate/vigorous breakdown)
5️⃣  🧭 ROUTE DIFFICULTY (Score, Ascent Density)
6️⃣  📈 PERFORMANCE VERDICT (AI narrative summary)
7️⃣  🌤️ WEATHER & WIND (Temperature, humidity, wind impact)
8️⃣  🏅 SEGMENT (Personal records, achievements)
9️⃣  🏅 PR count (no-AI fallback only)
```
*No zones or detailed performance sections (HR analysis, Cadence, Climbing, Gradient, Pacing) in public.*

**Private Notes Order:**
```
1️⃣  ---
2️⃣  📋 KEY STATS (Compact one-liners: IF, TSS, NP, W/kg, Effort, VO2max, Drift, Pacing, Wind)
3️⃣  ---
4️⃣  💡 TIPS (AI coaching: cadence, pacing, recovery — no segment/PR noise)
5️⃣  ---
6️⃣  🎯 TRAINING ZONES (HR/Power/Cadence zone distribution with key insight)
7️⃣  ❤️ HEART RATE, 🔄 CADENCE, ⛰️ CLIMBING, 📐 GRADIENT & VAM, 📈 PACING
8️⃣  🛌 READINESS (Sleep, HRV, Body Battery, Training Status tables)
9️⃣  🧭 TRAINING RECOMMENDATION (Recovery plan, 7-day microcycle, TSS targets)
🔟 ---
1️⃣1️⃣ 📈 HISTORICAL CONTEXT (1-week to 6-month baselines + vs. this activity)
```

**Example Scenario:**
- You did a hard 50km ride with a personal record on a local climb
- **Public**: Followers see the full picture — category, ride stats, verdict, weather, segment — but not the raw HR drift table or per-km pacing splits
- **Private**: You open it and see: compact key stats, two coaching tips, then the full training log: zones, drift analysis, climbing breakdown, pacing splits, readiness tables, 7-day plan, and 6-month baselines

---

### 3. Mirror Mode (Full Archive) 📦

**Philosophy**: Complete record-keeping. Public tells the full story; private keeps a duplicate + backend metrics.

**Public Description Order:**
```
1️⃣  🏅 YOUR CYCLING SCORE (Full: Category, Tier Progress, vs. Your Typical, Pogačar Factor)
2️⃣  📊 RIDE SUMMARY (All core stats)
3️⃣  ⚙️ ADVANCED METRICS / EFFORT (IF, TSS, W/kg, Relative Effort, etc.)
4️⃣  💚 HEART POINTS (If present)
5️⃣  🧭 ROUTE DIFFICULTY (If present)
6️⃣  📈 PERFORMANCE VERDICT (AI analysis)
7️⃣  🎯 TRAINING ZONES (Zone distribution)
8️⃣  ❤️ HEART RATE, 🔄 CADENCE, ⛰️ CLIMBING, 📐 GRADIENT, 📈 PACING (All performance sections)
9️⃣  🌤️ WEATHER & WIND
🔟 🏅 SEGMENT
```

**Private Notes Order:**
```
1️⃣  [FULL DUPLICATE OF PUBLIC DESCRIPTION]
     └─ Backup copy of everything followers see
2️⃣  ──────────────────────────────────────
3️⃣  📋 BACKEND SUMMARY
     1. Key Stats (IF, TSS, NP, W/kg, Effort, VO2max, Drift, etc.)
     2. 🛌 READINESS DETAILS (Tables: sleep, HRV, Body Battery, status)
     3. 🧭 TRAINING RECOMMENDATION (Recovery, 7-day plan)
      4. 📈 HISTORICAL CONTEXT (Baselines)
```

**Example Scenario:**
- You did that 50km ride
- **Public**: Complete story — followers see everything: score, summary, verdict, all performance details, weather, segment
- **Private**: Same full story + a concise backend section (key stats, readiness, recommendation, history) for quick lookup

---

## Setup

### In `.env` file:

```bash
# Strava content policy (optional — defaults to "balanced")
STRAVA_CONTENT_POLICY=balanced   # balanced | strict | mirror
```

### Test Which Mode You Prefer:

1. **Try `balanced` first** (default):
   ```bash
   # In .env
   STRAVA_CONTENT_POLICY=balanced
   npm run fast
   # Review the public description and private notes on Strava
   ```

2. **Switch to `strict`** if you want a clean public presence (no HR tables in public) with a full training log in private:
   ```bash
   STRAVA_CONTENT_POLICY=strict
   npm run fast
   ```

3. **Use `mirror`** if you want maximum record-keeping:
   ```bash
   STRAVA_CONTENT_POLICY=mirror
   npm run fast
   ```

---

## Decision Tree

**Ask yourself:**

```
├─ Do you want followers to see performance details (HR, Cadence, Gradient)?
│  ├─ YES → balanced (default) or mirror
│  │  └─ Do you want to keep a duplicate in private notes for your records?
│  │     ├─ YES → mirror
│  │     └─ NO → balanced ⭐
│  │
│  └─ NO → strict
│     └─ Public shows full score + summary + verdict + segments; private gets the full training log (zones, HR analysis, readiness, history)
│
└─ Do you care about privacy?
   ├─ High privacy concern → strict 🔒
   ├─ Balance privacy + sharing → balanced ⭐ (recommended)
   └─ Complete transparency → mirror 📦
```

---

## Examples by Activity Type

### Cycling (Road Bike, 50km, Hard Effort)

#### Balanced:
- **Public**: "Amateur - Cat 2, 50.0 km, 2h 00m, 25.0 km/h, 500m elevation, +5% TSS vs baseline, segment achievements"
- **Private**: "Sleep 7h, HRV +2ms, Ready for intensity. Next 7 days: keep volume low. HR drift was +8 bpm—watch pacing on climbs."

#### Strict:
- **Public**: "Amateur - Cat 2, 50km, 2h, Verdict: strong ride. Weather 22C, segment achievements"
- **Private**: "📋 IF 0.86 | TSS 82 | Drift +4bpm | Positive split → (Tips) → (Zones) → (HR/Cadence/Climbing/Pacing) → (Readiness tables) → (7-day plan) → (Historical baselines)"

#### Mirror:
- **Public**: (Everything from balanced) + detailed performance sections + weather
- **Private**: (Same as public) + [BACKEND SUMMARY] with key stats and tables

---

### Running (10km, Easy Pace)

#### Balanced:
- **Public**: "Runner – Advanced, 10.0 km, 50 min, 5:00/km, 52 HR Points"
- **Private**: "Sleep 8h, HRV great, recovered well. Good for moderate workout tomorrow."

#### Strict:
- **Public**: "Runner – Advanced"
- **Private**: "📊 IF 0.62 | Effort Easy | [readiness tables] | [zones]"

---

### Workout (45 min, Strength)

#### Balanced:
- **Public**: "🏋️ WORKOUT SCORE 75/100 (Hard), 15 intervals, Consistency CV 8%"
- **Private**: "HR recovery good. Keep strength work 2x/week. Recovery ratio 88% below threshold."

#### Strict:
- **Public**: "45 min Strength"
- **Private**: "Intensity 75/100, 15 intervals, HR recovery -12 bpm/min, [full metrics]"

---

## Performance Impact

All three modes use the same **underlying analysis**. Only **ordering and formatting** change:

| Mode | File Size | Generation Time | Strava Char Limit |
|------|-----------|-----------------|-------------------|
| Balanced | ~1-2 KB | Same | ✅ Always under 5,000 |
| Strict | ~0.5-1 KB | Same | ✅ Always under 5,000 |
| Mirror | ~2-3 KB | Same | ✅ Usually under 5,000* |

*Mirror mode can exceed 5,000 chars for very detailed activities. If so, the tool warns you and trims the backend summary.

---

## Frequently Asked Questions

**Q: Can I change the policy per activity?**
A: No — `STRAVA_CONTENT_POLICY` is global. But you can re-run with different policies to generate different versions and pick which to push to Strava.

**Q: Does this affect AI analysis?**
A: No. The AI analysis is identical. Only the **ordering and inclusion** of sections changes. The underlying metrics and interpretations stay the same.

**Q: How are markdown separators handled in AI section content?**
A: Leading/trailing markdown horizontal rules (for example `---`, `***`, `___`) are stripped from all extracted AI sections before rendering, so generated output does not show duplicate separators.

**Q: What if I want to customize further?**
A: Edit `src/format.ts` — the three pipelines are clearly marked in `buildDescription()` and `buildPrivateNotes()`. Each branch shows exactly which sections to include and in what order.

**Q: Can I use `balanced` for one activity and `strict` for another?**
A: Not in one run. But you can:
1. Run with `STRAVA_CONTENT_POLICY=balanced`, push some activities
2. Change to `STRAVA_CONTENT_POLICY=strict`, run again, push others

**Q: Which mode is best for sharing on social media?**
A: **`balanced`** or **`strict`** — both show the full score, stats and verdict publicly. `strict` is cleaner for followers (no HR drift tables in public), `balanced` adds those too. **`mirror`** shows everything.

**Q: Which mode is best for personal training log?**
A: **`strict`**. Public gets the narrative; private gets structured, clean log: stats → tips → zones → performance sections → readiness → recommendation → history.

**Q: Does `mirror` duplicate the exact same text?**
A: Yes — the private notes include a full copy of the public description, then add a backend summary section below. Useful if you want an archive copy you control.

---

## See Also

- **[COMMANDS.md](COMMANDS.md)** — Usage examples, all commands
- **[README.md](README.md)** — Overview of tool capabilities
- **[METRICS.md](METRICS.md)** — Detailed metric explanations









