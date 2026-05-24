# Amateur Benchmark Score — Design Options

## The Problem

The current Pogačar Score compares every ride to grand-tour race performance:

| Metric | Reference | Z2 endurance ride result |
|--------|-----------|--------------------------|
| Power | 440 W | ~120-160 W → **30-36%** |
| Speed (solo) | 34 km/h | ~22-26 km/h → **65-76%** |
| EF | 2.3 W/bpm | ~1.2-1.4 → **52-61%** |
| VAM | 1900 m/h | ~400-600 → **21-32%** |
| Composite | — | **~40-50%** on a good day |

An easy Z2 recovery ride routinely scores 15-25%. The AI has to "frame positively" via prompt rule — which means the framing is cosmetic, not structural. **The number itself is the UX problem.**

---

## Option A — Tiered Category Score (Recommended)

### Concept
Show **two scores in parallel**: your category-relative score (motivating, honest) and the Pogačar comparison (fun fact). The category score becomes the headline.

### Category Benchmarks (Cycling, 20-min FTP / W/kg)

| Category | FTP W/kg | FTP (75 kg) | Solo Speed (flat) | EF (W/bpm) | VAM (m/h) |
|----------|----------|-------------|-------------------|------------|-----------|
| **Beginner** | 1.5–2.0 | 113–150 W | 18–22 km/h | 0.90–1.10 | 300–500 |
| **Cat 5 / Recreational** | 2.0–2.5 | 150–188 W | 22–26 km/h | 1.10–1.35 | 500–700 |
| **Cat 4 / Trained Amateur** | 2.5–3.2 | 188–240 W | 26–30 km/h | 1.35–1.55 | 700–1000 |
| **Cat 3 / Strong Amateur** | 3.2–4.0 | 240–300 W | 30–35 km/h | 1.55–1.75 | 1000–1400 |
| **Cat 2 / Elite Amateur** | 4.0–5.0 | 300–375 W | 35–40 km/h | 1.75–2.10 | 1400–1700 |
| **Cat 1 / Semi-Pro** | 5.0–6.0 | 375–450 W | 40–44 km/h | 2.10–2.30 | 1700–1900 |
| **Pro** | 6.0+ | 450+ W | 44+ km/h | 2.30+ | 1900+ |

### Display Format

```
## 🏅 YOUR CYCLING SCORE

  Category:     Cat 4 / Trained Amateur  🎯
  Your Score:   78% of category top

  Power:        220 / 240 W FTP         →  92% ✅
  Speed:        27.2 / 30 km/h          →  91% ✅
  Efficiency:   1.41 / 1.55 W/bpm       →  91% ✅
  VAM:          820 / 1000 m/h          →  82% ✅

You're riding solidly in the upper Cat 4 range — near the Cat 3 boundary on
power and efficiency! A strong base-building ride with consistent effort. 💪

── Fun fact: Pogačar reference: 23% (world's best for context) ──
```

### How the Category Is Determined (auto-detect from data)

Priority order:
1. If `power_to_weight.estimated_level` exists → use the level already computed from 20-min best
2. Else if `training_metrics.ftp_used` + `rider.weightKg` both set → compute `ftp / weight`, pick tier
3. Else if `avg_speed` available → pick tier from speed alone (less precise, note it)
4. Fall back to Pogačar-only display with no category score

### Category Score Calculation

```
category_score = weighted_avg(metrics) / category_top_reference * 100

Metrics and weights:
  - Power (50% primary if power meter + weight known, else speed 50%)
  - EF    (secondary — 50% of secondary share, ~25% total)
  - VAM   (secondary — 50% of secondary share, ~25% total, only if elev > 200m)
  - Cadence: REMOVED — technique metric, not fitness indicator
```

The "category top reference" for each metric is the **upper bound** of the rider's current category.
`near_promotion: true` fires at ≥88% composite if a higher tier exists.

### UX Result
- Cat 4 rider on an easy Z2 ride: **~65-75%** of category top instead of **~20-25%** of Pogačar
- Same Cat 4 rider on a hard threshold ride: **~85-95%** of category top
- No more "you are 18% of Pogačar" on a recovery day

---

## Option B — Context-Aware Rescaling (Simpler, No Category Change)

### Concept
Keep a single Pogačar Score but **auto-select the reference tier** based on the detected ride context, not fixed race values.

### Reference Tiers Already in the Code

The code already does partial context selection (line 130-136 of crunch.ts):
```typescript
if (isVirtual) { speedRef = 0; }
else if (elev > 1500) { speedRef = 24; refLabel = "Race (Mountain Stage)"; }
else if (elev > 500)  { speedRef = 30; refLabel = "Hilly Ride"; }
else if (avgHR > 155) { speedRef = 41.5; refLabel = "Race (Flat/Rolling)"; }
else                  { speedRef = 34;   refLabel = "Solo Training"; }
```

**The problem**: even the "Solo Training" tier (34 km/h) is Pogačar's solo training speed, not an amateur's. The logic needs a **lower IF-based tier**:

```typescript
// Proposed tiers
if (IF < 0.65)        { speedRef = 24; refLabel = "Easy / Recovery Ride"; }  // Z2
else if (IF < 0.80)   { speedRef = 28; refLabel = "Endurance Ride"; }
else if (IF < 0.90)   { speedRef = 31; refLabel = "Tempo Training"; }
else if (avgHR > 155) { speedRef = 41.5; refLabel = "Race (Flat/Rolling)"; }
else                  { speedRef = 34;   refLabel = "Solo Training"; }
```

This means: when IF < 0.65 (classic Z2), the speed reference drops to 24 km/h — a value a strong amateur would hit at easy Z2. A 22-24 km/h Z2 ride now scores 90-100% on the rescaled reference.

### Display
Same format as today — just the `reference` label and base value change. No structural change needed to the AI instructions.

### UX Result
- Z2 ride with IF 0.60: "Recovery Ride (24 km/h ref)" → **88%** instead of **65%**
- Threshold ride with IF 0.92: "Race (Flat/Rolling, 41.5 km/h)" → same as today
- No new data structure needed; single number still

### Drawbacks
- Still comparing to *some* external reference, not personal category
- "Recovery Ride (24 km/h)" sounds odd if Pogačar is still named
- The boundary IF values are arbitrary — needs tuning

---

## Option C — Personal Best Score (No External Reference)

### Concept
Score relative to **the rider's own personal bests** over the last 90 days. "How good was this ride for *you*?"

```
personal_score = (metric / your_90d_best_metric) * 100
```

For each metric (power, EF, speed, VAM), find the 95th percentile value over the last 90 days from `historical_context` baselines.

### Display

```
## 🏅 PERSONAL PERFORMANCE SCORE: 74%

  Power:    220 W NP (vs. 268 W your 90d best)  →  82% of your best
  Speed:    27.2 km/h (vs. 33.1 km/h best)       →  82% of your best
  EF:       1.41 (vs. 1.62 your 90d best)         →  87% of your best

A solid base ride — 74% of your recent ceiling. This is exactly the controlled
effort you want for an endurance day. Your EF of 1.41 is close to your best,
showing good aerobic efficiency even at lower intensity. 💪
```

### Data Requirements
- Needs `historical_context` with 90-day baselines to be present
- Requires `avg_best_20min_power_w` and `avg_normalized_power_w` from the baselines
- Falls back to Pogačar Score when no historical data exists (new riders)

### UX Result
- Extremely motivating — "this was 87% of my best EF"
- Completely personal; not invalidated by external benchmarks
- A recovery ride scoring 60-70% is accurate and not discouraging
- A PR day scores 100%+ (new best!) — automatic celebration trigger

### Drawbacks
- Requires history (min ~5 activities) to work
- No external reference — harder to know objectively "how good am I overall"
- Best metrics in historical window may be from very different ride types

---

## Option D — Dual Score (Best of Both) ✅ IMPLEMENTED

**Current production implementation:**

1. **Category Score** (`amateur_score`) as the headline — motivating, contextual, honest
2. **Personal Score** (`personal_score`) as a secondary line — purely relative to yourself, cardiac-drift-aware
3. **Pogačar Score** retained as a single "fun fact" line at the bottom

```
## 🏅 YOUR RIDE SCORE

  🎯 Category:         Cat 4 / Trained Amateur — Mid–Upper tier
  📊 Tier progress:    76% toward next tier 🔝
  👤 vs. Your Typical: 112% (vs. your 90d avg — above average ⬆️)
  🏆 Pogačar Factor:   27%  (for fun — world's best)
```

**Personal Score long-ride fix:** when `moving_time_seconds > 9000` (2.5h), TSS carries 60% weight and EF drops to 10%. This prevents cardiac drift on hot or long rides from misclassifying a hard endurance day as "easy effort."

| Ride duration | NP weight | EF weight | TSS weight |
|--------------|-----------|-----------|-----------|
| < 2.5 hours | 40% | 35% | 25% |
| ≥ 2.5 hours | 30% | 10% | 60% |

This satisfies:
- The "how good am I for my level" question → Category Score
- The "how hard did I push today" question → Personal Score (vs own 90d average)
- The "fun bragging rights" need → Pogačar Factor

---

## Implementation Complexity

| Option | Code changes | Data changes | AI prompt changes |
|--------|-------------|--------------|------------------|
| A — Tiered Category | Medium (`crunch.ts`: add category lookup + new score block) | New `amateur_score` JSON field | Add new section 1b template |
| B — Rescaling | Low (modify 6 lines in `crunch.ts`) | None (modifies existing `pogacar_score`) | Update reference table only |
| C — Personal Best | Medium (needs history from `summary_utils.ts` passed into `crunch`) | Uses existing `historical_context` | New section replacing Pogačar |
| D — Dual | High (A + C combined) | New fields | New section 1 template |

---

## Recommendation

**Option D is implemented and in production.** Options B (IF-based Pogačar rescaling) and A (Category Score) are both live as part of Option D.

---

## Running Equivalent (Kipchoge Score)

The same problem applies to running. Current reference: Kipchoge marathon pace 2:52/km. An amateur running 6:00/km scores 48% — discouraging for an easy jog.

Proposed running tiers:

| Level | Easy pace | Threshold pace |
|-------|-----------|---------------|
| Beginner | >7:30/km | >6:30/km |
| Recreational | 6:00–7:30/km | 5:30–6:30/km |
| Trained amateur | 5:00–6:00/km | 4:30–5:30/km |
| Strong amateur | 4:00–5:00/km | 3:45–4:30/km |
| Elite amateur | 3:20–4:00/km | 3:10–3:45/km |
| Sub-elite | 2:52–3:20/km | 2:45–3:10/km |

Score formula (same IF-based rescaling as Option B):
```
if   pace > 6:00/km  → reference = 5:30/km  ("Recreational Easy Run")
elif pace > 4:30/km  → reference = 4:00/km  ("Amateur Endurance Run")
elif pace > 3:30/km  → reference = 3:10/km  ("Trained Amateur Race Effort")
else                 → reference = 2:52/km  ("Elite / Kipchoge reference")
```

