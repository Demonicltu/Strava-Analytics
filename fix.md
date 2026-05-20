High priority
Pogačar Score weight is naive — total / count averages speed%, EF%, climbing%, cadence%, power% equally. A flat ride with no climbing gets penalized only by cadence + speed; a climbing ride gets dragged down by a single 9% climbing score. Recommendation: speed should be 50% weight (or power if available), other metrics fill the rest.
Cardiac drift uses raw halves, not Friel's standard method. Real aerobic decoupling/drift uses first 30min vs last 30min of steady aerobic effort, excluding warm-up and surges. Current implementation will flag terrain or stop-and-go as "drift". The aerobicDecoupling section has the same issue. → Can you fix this with Friel's standard method?
VO2max HR formula (Uth) is wildly inaccurate unless restHr and maxHr are both lab-measured. Default restHr=60 (in crunch.ts line 115) means anyone without a configured restHR gets a fake number. → RIDER_REST_HR is provided in the .env file, it should be enough, however I guess that each week, day this rest hr changes. Maybe it would be possible to extract it from garmin data? If it is null/empty then use from .env?
TSS for runs uses cycling FTP fallback with just a warning — this gives wrong TSS values that look legit. Better: omit TSS for runs without rFTP rather than computing with cycling FTP.
Best 20min power for VO2max (line 956) — uses whole-activity best 20min, which on a casual ride may be far below true 20min capacity. → The simplest and most honest fix: when rider.ftpW is set, compute VO2max from FTP instead of from the activity's best 20-min — because FTP is your validated threshold power, not a value that varies ride to ride. The formula stays the same, the input becomes reliable:
hasPowerMeter = powerValues.length > 100 — this is fragile. Strava-estimated power streams are also long. The flag is actually device_watts on the activity. Check summary.device_watts === true instead.

Medium priority
Wind impact "net_wind_effect_kmh" is computed as windspeed × (hw% - tw%), which conflates wind direction frequency with wind component magnitude. Real headwind component is windspeed × cos(angle). → For an amateur it's directionally correct, but don't claim it as "+3.2 km/h drag" — call it a "headwind exposure index". Can you change the calculation to use windspeed × cos(angle) or is it to complex?
Pacing first/second-half is by km count, not time. For hilly rides km 1–32 vs 33–64 may not be a fair split. Time-based halving (already done in cardiacDrift) is better. → Inconsistent between sections.
# Wave detection threshold is fixed at 8 km/h — fine for most surfers but won't catch slow longboard rides or whitewater. Mentioned in the instructions.
EPOC estimate in workout_analysis is fabricated (no published basis for those [0.005, 0.010, 0.018, 0.030, 0.050] factors). → Relabel the existing output as "epoc_estimate_relative" with a note like "relative intensity signal — not a calorie count", drop the kcal field name entirely, and use it purely as a qualitative indicator (Low / Moderate / High) without attaching a number.
Heart Points MET fallback when no HR available uses fixed pts/min by activity type — fine, but a 1h slow recovery ride gets the same points as 1h hard tempo without HR. Note this caveat.
Pogačar EF reference of 2.6 W/bpm assumes Pogačar's avg HR is 170 in a race. Race avg HR for grand tour pros is usually 145-155. So 440/150 ≈ 2.9. Either way, the reference is a rough estimate; document it as such in the instructions.

Low priority / polish
Garmin garmin_sync.py skips Training Status / VO2max / acute & chronic load with a "not returned by this API" note — but the instructions section 7 still mentions them. → remove those rows from the instructions template.
instructions.md section 7 stress says stress_high_pct >20% of day before = recovery impaired, but wellness.ts computes it as % of waking 16h day (not full day). Threshold is fine but the doc should clarify what % is of.
weather.ts bestDiff hour matching — uses absolute hour difference but doesn't handle midnight wrap (23 vs 0). Edge case for late-night activities.
# Cadence "is_low" thresholds — 75 rpm for cycling is reasonable for racing but harsh for an enthusiast on hills. Could be relative to terrain.
Historical context comparison rule in instructions: "3 months primary, 6 months secondary" is well-thought-out. ✅ But you also say if < 5 activities fall back to 6mo — make sure the consumer (analyze.ts/AI prompt) actually enforces this, otherwise it's just documentation.
Power-to-weight "estimated_level" uses 20min W/kg with a fallback to NP or avg. NP of a tempo ride ≠ 20min FTP. This will misclassify riders. → Only set estimated_level if bestPowerRaw["20min"] exists, otherwise leave null. Maybe just add warning then if no bestPowerRaw["20min"] exists? 

📋 Instruction file (AI_ANALYSIS_INSTRUCTIONS.md) review
Weak spots:
Section 7 references fields that never come from the API (training_status, acute_load, chronic_load, ratio, total_calories, hrv_last_night, vo2max_garmin). Per garmin_sync.py comments these are explicitly skipped. → Delete those bullets from the table & interpretation rules.
Section 6 historical_context table lists avg_vo2max — but VO2max is recalculated per activity in crunch.ts, and the baseline computation needs to actually populate it. Verify in records.ts / digest pipeline that vo2max survives baseline aggregation.
No section for workout_analysis in the instructions despite it being the richest output for indoor sessions. Add a section 4.X for gym/HIIT analysis (Workout Intensity Score, intervals detected, HR recovery rate, consistency, EPOC).
No instruction for heart_points — present in crunch output but instructions don't mention it.
No instruction for vo2max — same.

🎯 For an amateur/enthusiast cyclist, verdict
Top 3 things I'd add eventually:
Week-over-week training load chart (CTL/ATL/TSB) — you already compute TSS, so rolling 7d/42d averages would unlock periodization insights.
Fatigue/freshness flag based on TSB (TSS balance) cross-referenced with Garmin HRV trend.
Power duration curve across last 90 days (best 5s, 1min, 5min, 20min) — most valuable single chart for a cyclist to see fitness trajectory.
