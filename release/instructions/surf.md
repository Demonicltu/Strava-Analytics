# AI Analysis Instructions — Surfing (Surfing / Windsurf / Kitesurf)

Activity type context: **Surfing / Water Sports**. Never use "ride", "cycling", "run". Use "session", "paddle", "wave". Never say "ride" when referring to the surf session — say "session".

---

## Activity-Specific Output

### 1. Score (Skip entirely)

No cycling or running score. Skip section 1 entirely. Begin with the 🏄 WAVE REPORT.

---

### 2. 📊 Summary Card Labels + Wave Report (START HERE)

Begin with the wave report **before** the standard summary card:

```
## 🏄 WAVE REPORT

| Metric | Value |
|--------|-------|
| 🌊 Waves caught | ~12 |
| 🚀 Max wave speed | 22.3 km/h |
| ⚡ Avg wave speed | 14.5 km/h |
| ⏱️ Longest wave | 8s (18.2 km/h) |
| 🏄 Riding time | 1m 45s (3.2%) |
| 🏊 Paddling time | 52m 30s (96.8%) |
| ⏳ Wait time | 18m 20s |
```

Per-wave breakdown table (from `surf_analysis.waves`):

| Wave | Duration | Max Speed | Avg Speed |
|------|----------|-----------|-----------|
| 1 | 5s | 18.2 km/h | 14.1 km/h |
| 2 | 8s | 22.3 km/h | 16.5 km/h |

**Surf Speed Zones** (from `surf_analysis.speed_zones`):

| Zone | Time | % |
|------|------|---|
| Stationary (<2 km/h) | 8m 30s | ██ 15% |
| Paddling (2-8 km/h) | 45m 20s | ████████ 78% |
| Riding Wave (8-20 km/h) | 3m 10s | █ 6% |
| Fast Wave (20+ km/h) | 0m 30s | ░ 1% |

**Key surf insights:**
- Waves per hour (count vs session length)
- Paddle-to-ride ratio context: typical recreational = 95-98% paddling, 2-5% riding
- Max wave speed: casual = 8-15 km/h, intermediate = 15-25 km/h, advanced = 25-40 km/h, pro = 40+ km/h
- Long wait time = flat conditions or crowded lineup
- HR analysis: paddling is high-intensity upper body work

> Wave count is estimated from GPS speed spikes (>8 km/h for ≥3s). Actual count may vary. Short waves or whitewater rides may be missed.

---

```
## 📊 SURF SESSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏄 Type:       Surfing
📏 Distance:   3.2 km
⏱️ Time:       58m 20s
⚡ Avg Speed:  4.1 km/h
🔝 Max Speed:  22.3 km/h
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Use label "SURF SESSION" and 🏄. Show avg speed (km/h). **Skip:** cadence, power, watts, elevation, gear.

---

### 4. Detailed Analysis — Surfing Guidelines

- **Focus on:** Wave report (section 4.12), HR analysis (paddling effort), weather/sea conditions
- **Skip entirely:** 4.3 Power Analysis, 4.4 Training Load, 4.5 Power-to-Weight, 4.7 Climbing, 4.8 Gradient/VAM, 4.9 Torque, 4.10 Cadence, Power Zones in 4.6
- **4.11 Temperature**: note water/air temp and effect on paddle endurance

### 4.2 HR Analysis — Surfing Context

HR is especially valuable for surfing. Paddling = high-intensity upper body work. High avg HR with low "speed" = hard paddling session even if wave count was low.

