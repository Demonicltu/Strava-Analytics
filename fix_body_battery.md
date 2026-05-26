# Fix: High-Resolution Body Battery + Timezone Bug

**Date:** 2026-05-25

## Root Causes

### 1. Sparse intraday data (primary)

`garmin_sync.py` was calling `api.get_body_battery(date, date)` which hits a **summary endpoint** returning only 4-8 inflection points per day (peaks, valleys, transitions). For May 21, 2026 there were 6 data points spaced ~4-8 hours apart. Activity starting at 17:00 local (14:00 UTC) had no nearby data point — the closest was 51 at 16:00 local (~1h away) or 15 at 23:36 local (~9.6h away).

### 2. Timezone mismatch (secondary, made sparse data worse)

`wellness.ts`'s `bodyBatteryAtTime()` used `new Date(activityStartIso).getTime()` to find the target UTC epoch. Strava's `start_date_local` value (`"2026-05-21T17:00:59Z"`) has a **misleading `Z` suffix** — it represents local time (17:00 EEST), but JavaScript's `new Date()` interpreted the `Z` as UTC, targeting 17:00 UTC (= 20:00 local) instead. Since Garmin intraday timestamps are true UTC epoch, this 3-hour shift caused the code to pick the end-of-day value (15) instead of the mid-afternoon value (~51).

**Net result:** Showed Body Battery = 15 instead of the actual ~40-51 at activity start.

---

## Changes Made

### `garmin_sync.py`
- **Replaced** `api.get_body_battery()` call with `api.get_stress_data()` which returns `bodyBatteryValuesArray` at **~3-minute granularity** (vs. 4-8 points previously)
- **Downsampled** to one point per 15 minutes (~96 points/day) to limit `garmin_wellness.json` growth
- **Fallback:** if `get_stress_data` doesn't return Body Battery data, falls back to the old `get_body_battery` call

### `src/wellness.ts`
- **`bodyBatteryAtTime()`** — added `utcOffsetHours` parameter. When `activityStartIso` ends with `Z`, subtracts the offset to convert Strava's "local time with Z" to true UTC before matching against Garmin's UTC epoch timestamps
- **Added 2-hour safety guard** — if the closest intraday point is >2 hours away, returns `null` instead of a misleading distant value (falls back to `body_battery_start_of_day`)
- **`loadWellnessContext()`** — added optional `utcOffsetHours` parameter and passes it through to `bodyBatteryAtTime`

### `src/analyze.ts`
- Reads `local_utc_offset_hours` from crunched JSON `summary_card` and passes it to `loadWellnessContext`

### `src/fast.ts`
- Reads `utc_offset` from `detailed_activity` (Strava field, in seconds), converts to hours, passes to `loadWellnessContext`

---

## After Deploying

Re-sync all historical days to get high-resolution body battery data:

```bash
python garmin_sync.py --force
```

This re-fetches all days. Expect `garmin_wellness.json` to grow from ~300 KB to ~2-4 MB (96 points/day × ~430 days × ~30 bytes each).

---

## Expected Improvement

| Scenario | Before | After |
|----------|--------|-------|
| May 21 activity start (17:00 local / 14:00 UTC) | 15 (end-of-day low, wrong day position) | ~40-51 (actual reading near activity start) |
| Resolution: points per day | 4-8 inflection points | ~96 points (15-min intervals) |
| Timezone: EEST (UTC+3) offset | Ignored (3h error) | Correctly subtracted |
| Safety: no nearby data | Returns distant value | Returns `null` → falls back to `body_battery_start_of_day` |

