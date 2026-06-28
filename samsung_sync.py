#!/usr/bin/env python3
"""
Samsung Health wellness sync — parses exported CSV files (sleep, HR, stress,
SpO2, steps, floors, HRV) into analysis/samsung_wellness.json.

The output schema matches garmin_wellness.json so the downstream wellness.ts
reader works identically regardless of watch brand.

Usage:
    python samsung_sync.py                          # parse export in default dir
    python samsung_sync.py --dir /path/to/export    # custom export location
    python samsung_sync.py --force                  # overwrite all cached days

Samsung Health export path can also be set via SAMSUNG_EXPORT_DIR in .env.

How to export:
    Samsung Health app → ⋮ menu → Settings → Download personal data → Request download
    Unzip the downloaded file and point --dir (or SAMSUNG_EXPORT_DIR) to the root folder.
"""

import os
import sys
import csv
import json
import argparse
import datetime
from pathlib import Path
from collections import defaultdict

# ─── Load .env ───────────────────────────────────────────────────────────────

def load_dotenv(path: str = ".env"):
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))

load_dotenv()

# ─── Paths ───────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent.resolve()
ANALYSIS_DIR = SCRIPT_DIR / "analysis"
OUTPUT_FILE = ANALYSIS_DIR / "samsung_wellness.json"

# ─── Args ────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="Parse Samsung Health export into wellness JSON")
parser.add_argument("--dir", type=str, default=None,
                    help="Path to Samsung Health export folder. Can also use SAMSUNG_EXPORT_DIR in .env")
parser.add_argument("--force", action="store_true",
                    help="Overwrite all cached days")
args = parser.parse_args()

EXPORT_DIR = Path(args.dir or os.environ.get("SAMSUNG_EXPORT_DIR", str(SCRIPT_DIR / "samsung_export")))

if not EXPORT_DIR.exists():
    print(f"❌ Samsung Health export directory not found: {EXPORT_DIR}")
    print(f"   Export from Samsung Health app and unzip, then set SAMSUNG_EXPORT_DIR in .env")
    print(f"   or use: python samsung_sync.py --dir /path/to/export")
    sys.exit(1)

# ─── Helpers ─────────────────────────────────────────────────────────────────

def find_csv(prefix: str) -> Path | None:
    """Find the first CSV matching a Samsung Health data type prefix."""
    # Samsung exports as: com.samsung.health.<type>.<timestamp>.csv
    # or in subdirectories. Search recursively.
    for f in sorted(EXPORT_DIR.rglob(f"{prefix}*.csv"), key=lambda p: p.name):
        return f
    # Also check for jsons or alternate naming
    for f in sorted(EXPORT_DIR.rglob(f"*{prefix}*"), key=lambda p: p.name):
        if f.suffix == ".csv":
            return f
    return None


def read_csv_rows(path: Path) -> list[dict]:
    """Read Samsung Health CSV, skipping comment lines (starting with #)."""
    rows = []
    try:
        with open(path, encoding="utf-8", errors="ignore") as f:
            # Skip comment lines at top
            lines = []
            for line in f:
                if line.startswith("#") or line.strip() == "":
                    continue
                lines.append(line)
        if not lines:
            return []
        reader = csv.DictReader(lines)
        for row in reader:
            rows.append(row)
    except Exception as e:
        print(f"   ⚠️  Error reading {path.name}: {e}")
    return rows


def parse_datetime(val: str | None) -> datetime.datetime | None:
    """Parse Samsung datetime strings (various formats)."""
    if not val:
        return None
    val = val.strip()
    for fmt in (
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M",
    ):
        try:
            return datetime.datetime.strptime(val, fmt)
        except ValueError:
            continue
    return None


def to_date(dt: datetime.datetime | None) -> str | None:
    return dt.date().isoformat() if dt else None


def safe_float(val) -> float | None:
    try:
        v = float(val)
        return v if v == v else None  # NaN check
    except (TypeError, ValueError):
        return None


def safe_int(val) -> int | None:
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return None

# ─── Parsers ─────────────────────────────────────────────────────────────────

def parse_sleep(data: dict[str, dict]):
    """Parse sleep CSV. Samsung uses stage-level rows or summary rows."""
    csv_path = find_csv("com.samsung.health.sleep")
    if not csv_path:
        print("   ℹ️  No sleep CSV found")
        return

    # Try to find sleep stage detail file
    stage_path = find_csv("com.samsung.health.sleep_stage")

    # Parse main sleep file (has start_time, end_time, etc.)
    rows = read_csv_rows(csv_path)
    print(f"   📄 Sleep: {len(rows)} records from {csv_path.name}")

    for row in rows:
        start = parse_datetime(row.get("start_time"))
        end = parse_datetime(row.get("end_time"))
        if not start or not end:
            continue
        # Sleep is attributed to the wake-up date
        date_str = to_date(end)
        if not date_str:
            continue

        rec = data.setdefault(date_str, _empty_record(date_str))
        duration_sec = int((end - start).total_seconds())
        rec["sleep_duration_sec"] = duration_sec
        rec["sleep_start_local"] = start.isoformat()
        rec["sleep_end_local"] = end.isoformat()

        # Some exports have mental/physical recovery or quality score
        quality = safe_int(row.get("quality"))
        if quality is not None:
            rec["sleep_score"] = quality

    # Parse sleep stages if available
    if stage_path:
        stage_rows = read_csv_rows(stage_path)
        print(f"   📄 Sleep stages: {len(stage_rows)} records from {stage_path.name}")
        # Group stages by sleep session (by date of end_time)
        stages_by_date: dict[str, dict[str, int]] = defaultdict(lambda: {"deep": 0, "light": 0, "rem": 0, "awake": 0})
        for row in stage_rows:
            start = parse_datetime(row.get("start_time"))
            end = parse_datetime(row.get("end_time"))
            if not start or not end:
                continue
            date_str = to_date(end)
            if not date_str:
                continue
            duration = int((end - start).total_seconds())
            stage = safe_int(row.get("stage"))
            # Samsung stage codes: 40001=Awake, 40002=Light, 40003=Deep, 40004=REM
            # Alternative codes: 1=Awake, 2=Light, 3=Deep, 4=REM
            if stage in (40001, 1):
                stages_by_date[date_str]["awake"] += duration
            elif stage in (40002, 2):
                stages_by_date[date_str]["light"] += duration
            elif stage in (40003, 3):
                stages_by_date[date_str]["deep"] += duration
            elif stage in (40004, 4):
                stages_by_date[date_str]["rem"] += duration

        for date_str, stages in stages_by_date.items():
            rec = data.setdefault(date_str, _empty_record(date_str))
            rec["sleep_deep_sec"] = stages["deep"] or None
            rec["sleep_light_sec"] = stages["light"] or None
            rec["sleep_rem_sec"] = stages["rem"] or None
            rec["sleep_awake_sec"] = stages["awake"] or None

            # Synthesize sleep score if not already set
            if rec.get("sleep_score") is None and rec.get("sleep_duration_sec"):
                total = rec["sleep_duration_sec"]
                if total > 0:
                    # Simple score: duration (target 8h) + deep% (target 20%) + REM% (target 25%)
                    dur_score = min(100, (total / 28800) * 100)
                    deep_pct = (stages["deep"] / total * 100) if total else 0
                    rem_pct = (stages["rem"] / total * 100) if total else 0
                    deep_score = min(100, deep_pct / 20 * 100)
                    rem_score = min(100, rem_pct / 25 * 100)
                    rec["sleep_score"] = round(dur_score * 0.4 + deep_score * 0.3 + rem_score * 0.3)


def parse_heart_rate(data: dict[str, dict]):
    """Parse heart rate CSV to extract resting HR per day."""
    csv_path = find_csv("com.samsung.health.heart_rate")
    if not csv_path:
        print("   ℹ️  No heart rate CSV found")
        return

    rows = read_csv_rows(csv_path)
    print(f"   📄 Heart rate: {len(rows)} records from {csv_path.name}")

    # Group by date, find minimum resting HR
    hr_by_date: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        dt = parse_datetime(row.get("start_time") or row.get("create_time"))
        hr = safe_int(row.get("heart_rate") or row.get("com.samsung.health.heart_rate.heart_rate"))
        if not dt or not hr or hr < 30 or hr > 220:
            continue
        date_str = to_date(dt)
        # Only consider likely resting readings (< 100 bpm or tagged)
        status = (row.get("heart_rate_status") or row.get("comment") or "").lower()
        if "rest" in status or hr < 90:
            hr_by_date[date_str].append(hr)

    for date_str, hrs in hr_by_date.items():
        if not hrs:
            continue
        rec = data.setdefault(date_str, _empty_record(date_str))
        # Resting HR = average of lowest 10% of readings (or minimum if few readings)
        sorted_hrs = sorted(hrs)
        n = max(1, len(sorted_hrs) // 10)
        rec["resting_hr"] = round(sum(sorted_hrs[:n]) / n)


def parse_stress(data: dict[str, dict]):
    """Parse stress CSV."""
    csv_path = find_csv("com.samsung.health.stress")
    if not csv_path:
        print("   ℹ️  No stress CSV found")
        return

    rows = read_csv_rows(csv_path)
    print(f"   📄 Stress: {len(rows)} records from {csv_path.name}")

    stress_by_date: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        dt = parse_datetime(row.get("start_time") or row.get("create_time"))
        score = safe_int(row.get("score") or row.get("stress_score") or row.get("max"))
        if not dt or score is None or score < 0 or score > 100:
            continue
        stress_by_date[to_date(dt)].append(score)

    for date_str, scores in stress_by_date.items():
        if not scores or not date_str:
            continue
        rec = data.setdefault(date_str, _empty_record(date_str))
        avg = round(sum(scores) / len(scores))
        rec["avg_daily_stress"] = avg
        rec["max_stress"] = max(scores)

        # Breakdown into low/medium/high (thresholds: 0-25 rest, 26-50 low, 51-75 med, 76-100 high)
        rest = sum(1 for s in scores if s <= 25)
        low = sum(1 for s in scores if 26 <= s <= 50)
        med = sum(1 for s in scores if 51 <= s <= 75)
        high = sum(1 for s in scores if s > 75)
        total = len(scores)
        # Convert to approximate seconds (assume 5-min intervals between readings)
        interval = 300
        rec["stress_rest_sec"] = rest * interval
        rec["stress_low_sec"] = low * interval
        rec["stress_medium_sec"] = med * interval
        rec["stress_high_sec"] = high * interval


def parse_spo2(data: dict[str, dict]):
    """Parse SpO2 CSV."""
    csv_path = find_csv("com.samsung.health.oxygen_saturation")
    if not csv_path:
        print("   ℹ️  No SpO2 CSV found")
        return

    rows = read_csv_rows(csv_path)
    print(f"   📄 SpO2: {len(rows)} records from {csv_path.name}")

    spo2_by_date: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        dt = parse_datetime(row.get("start_time") or row.get("create_time"))
        val = safe_float(row.get("spo2") or row.get("oxygen_saturation"))
        if not dt or val is None or val < 70 or val > 100:
            continue
        spo2_by_date[to_date(dt)].append(val)

    for date_str, vals in spo2_by_date.items():
        if not vals or not date_str:
            continue
        rec = data.setdefault(date_str, _empty_record(date_str))
        rec["spo2_avg"] = round(sum(vals) / len(vals), 1)
        rec["spo2_min"] = round(min(vals), 1)
        rec["sleep_average_spo2"] = rec["spo2_avg"]


def parse_steps(data: dict[str, dict]):
    """Parse steps CSV."""
    csv_path = find_csv("com.samsung.health.step_count")
    if not csv_path:
        # Try alternate name
        csv_path = find_csv("com.samsung.health.step_daily_trend")
    if not csv_path:
        print("   ℹ️  No steps CSV found")
        return

    rows = read_csv_rows(csv_path)
    print(f"   📄 Steps: {len(rows)} records from {csv_path.name}")

    steps_by_date: dict[str, int] = defaultdict(int)
    for row in rows:
        dt = parse_datetime(row.get("start_time") or row.get("create_time") or row.get("day_time"))
        count = safe_int(row.get("count") or row.get("step_count"))
        if not dt or not count or count < 0:
            continue
        steps_by_date[to_date(dt)] += count

    for date_str, total in steps_by_date.items():
        if not date_str:
            continue
        rec = data.setdefault(date_str, _empty_record(date_str))
        rec["steps"] = total


def parse_floors(data: dict[str, dict]):
    """Parse floors climbed CSV."""
    csv_path = find_csv("com.samsung.health.floors_climbed")
    if not csv_path:
        print("   ℹ️  No floors CSV found")
        return

    rows = read_csv_rows(csv_path)
    print(f"   📄 Floors: {len(rows)} records from {csv_path.name}")

    floors_by_date: dict[str, int] = defaultdict(int)
    for row in rows:
        dt = parse_datetime(row.get("start_time") or row.get("create_time"))
        count = safe_int(row.get("floor") or row.get("count"))
        if not dt or not count or count < 0:
            continue
        floors_by_date[to_date(dt)] += count

    for date_str, total in floors_by_date.items():
        if not date_str:
            continue
        rec = data.setdefault(date_str, _empty_record(date_str))
        rec["floors_climbed"] = total


def parse_hrv(data: dict[str, dict]):
    """Parse HRV CSV (Galaxy Watch 4+ only)."""
    csv_path = find_csv("com.samsung.health.heart_rate_variability")
    if not csv_path:
        # Try alternate naming
        csv_path = find_csv("com.samsung.shealth.tracker.heart_rate_variability")
    if not csv_path:
        print("   ℹ️  No HRV CSV found (Galaxy Watch 4+ required)")
        return

    rows = read_csv_rows(csv_path)
    print(f"   📄 HRV: {len(rows)} records from {csv_path.name}")

    hrv_by_date: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        dt = parse_datetime(row.get("start_time") or row.get("create_time"))
        # Samsung may use rmssd, sdnn, or just "heart_rate_variability"
        val = safe_float(row.get("rmssd") or row.get("heart_rate_variability") or row.get("sdnn"))
        if not dt or val is None or val < 1 or val > 300:
            continue
        hrv_by_date[to_date(dt)].append(val)

    for date_str, vals in hrv_by_date.items():
        if not vals or not date_str:
            continue
        rec = data.setdefault(date_str, _empty_record(date_str))
        # Use max nightly reading as equivalent to Garmin's hrv_last_5_min
        rec["hrv_last_5_min"] = round(max(vals))
        rec["hrv_last_night"] = round(sum(vals) / len(vals))

    # Compute weekly averages
    all_dates = sorted(d for d in hrv_by_date if d)
    for i, date_str in enumerate(all_dates):
        rec = data.get(date_str)
        if not rec:
            continue
        # 7-day rolling average
        window = [hrv_by_date[d] for d in all_dates[max(0, i-6):i+1] if d in hrv_by_date]
        all_vals = [v for day_vals in window for v in day_vals]
        if all_vals:
            rec["hrv_weekly_avg"] = round(sum(all_vals) / len(all_vals))


# ─── Training Readiness (synthesized) ─────────────────────────────────────────

def compute_training_readiness(data: dict[str, dict]):
    """
    Synthesize a Training Readiness score (0–100) from available Samsung metrics.

    Garmin's Training Readiness is a composite of: HRV status, sleep quality,
    recovery time, stress, and acute training load. We approximate using:

    Components (weighted):
      - HRV vs baseline (30%): how today's HRV compares to 7-day avg
      - Sleep quality (30%): sleep score (duration + stages)
      - Overnight stress (20%): lower avg stress = better recovery
      - Resting HR vs baseline (20%): lower RHR = better recovered

    Score: 0–100 where 73+ = PRIME/READY, 40–72 = MODERATE, <40 = LOW
    """
    sorted_dates = sorted(d for d in data.keys() if d)
    if not sorted_dates:
        return

    print(f"   🧮 Computing Training Readiness scores...")
    computed = 0

    for i, date_str in enumerate(sorted_dates):
        rec = data[date_str]

        # Gather components
        hrv_today = rec.get("hrv_last_5_min")
        hrv_weekly = rec.get("hrv_weekly_avg")
        sleep_score = rec.get("sleep_score")
        avg_stress = rec.get("avg_daily_stress")
        resting_hr = rec.get("resting_hr")

        # Need at least 2 components to produce a meaningful score
        available = sum(1 for v in [hrv_today, sleep_score, avg_stress, resting_hr] if v is not None)
        if available < 2:
            continue

        # Compute RHR baseline (7-day rolling average)
        rhr_baseline = None
        if resting_hr is not None:
            window_dates = sorted_dates[max(0, i-6):i+1]
            rhr_vals = [data[d].get("resting_hr") for d in window_dates if data[d].get("resting_hr") is not None]
            if rhr_vals:
                rhr_baseline = sum(rhr_vals) / len(rhr_vals)

        # ── Component scores (each 0–100) ──

        # 1. HRV component: above baseline = good, below = bad
        hrv_score = None
        if hrv_today is not None and hrv_weekly is not None and hrv_weekly > 0:
            # +20% above avg → 100, at avg → 70, -20% below → 30, -40% → 0
            ratio = hrv_today / hrv_weekly
            hrv_score = max(0, min(100, 70 + (ratio - 1.0) * 150))
        elif hrv_today is not None:
            # No baseline — use absolute (40ms=50, 60ms=75, 80ms=100)
            hrv_score = max(0, min(100, (hrv_today - 20) * 1.25))

        # 2. Sleep component: directly use sleep score (already 0–100)
        sleep_component = sleep_score  # already 0–100 or None

        # 3. Stress component: lower stress = higher readiness
        # Garmin stress 1–100; avg 25=excellent recovery, 50=moderate, 75=poor
        stress_score = None
        if avg_stress is not None:
            stress_score = max(0, min(100, 100 - (avg_stress - 15) * 1.4))

        # 4. RHR component: lower than baseline = good
        rhr_score = None
        if resting_hr is not None and rhr_baseline is not None and rhr_baseline > 0:
            # At baseline → 70, 3bpm below → 90, 3bpm above → 50, 8bpm above → 20
            delta = resting_hr - rhr_baseline
            rhr_score = max(0, min(100, 70 - delta * 7))
        elif resting_hr is not None:
            # No baseline — absolute (50bpm=85, 60bpm=65, 70bpm=45)
            rhr_score = max(0, min(100, 135 - resting_hr))

        # ── Weighted composite ──
        components = []
        weights = []
        if hrv_score is not None:
            components.append(hrv_score); weights.append(0.30)
        if sleep_component is not None:
            components.append(sleep_component); weights.append(0.30)
        if stress_score is not None:
            components.append(stress_score); weights.append(0.20)
        if rhr_score is not None:
            components.append(rhr_score); weights.append(0.20)

        if not components:
            continue

        # Normalize weights to sum to 1.0
        total_weight = sum(weights)
        score = sum(c * w for c, w in zip(components, weights)) / total_weight
        score = round(max(0, min(100, score)))

        # Assign level
        if score >= 73:
            level = "PRIME" if score >= 85 else "READY"
        elif score >= 40:
            level = "MODERATE"
        else:
            level = "LOW"

        rec["training_readiness_score"] = score
        rec["training_readiness_level"] = level
        rec["training_readiness_feedback"] = f"Synthesized from {'HRV+' if hrv_score is not None else ''}{'Sleep+' if sleep_component is not None else ''}{'Stress+' if stress_score is not None else ''}{'RHR' if rhr_score is not None else ''}"
        computed += 1

    print(f"   ✅ Training Readiness: {computed} days computed")


# ─── Record template ─────────────────────────────────────────────────────────

def _empty_record(date_str: str) -> dict:
    return {
        "date": date_str,
        "fetched_at": datetime.datetime.now().isoformat(),
        "steps": None,
        "floors_climbed": None,
        "intensity_minutes_moderate": None,
        "intensity_minutes_vigorous": None,
        "active_calories": None,
        "resting_hr": None,
        "avg_daily_stress": None,
        "max_stress": None,
        "stress_rest_sec": None,
        "stress_low_sec": None,
        "stress_medium_sec": None,
        "stress_high_sec": None,
        "stress_activity_sec": None,
        "body_battery_charged": None,
        "body_battery_drained": None,
        "body_battery_highest": None,
        "body_battery_lowest": None,
        "sleep_score": None,
        "sleep_start_local": None,
        "sleep_end_local": None,
        "sleep_duration_sec": None,
        "sleep_deep_sec": None,
        "sleep_light_sec": None,
        "sleep_rem_sec": None,
        "sleep_awake_sec": None,
        "sleep_average_spo2": None,
        "sleep_average_respiration": None,
        "sleep_avg_stress": None,
        "hrv_last_night": None,
        "hrv_weekly_avg": None,
        "hrv_last_5_min": None,
        "hrv_status": None,
        "hrv_feedback": None,
        "training_readiness_score": None,
        "training_readiness_level": None,
        "training_readiness_feedback": None,
        "spo2_avg": None,
        "spo2_min": None,
        "body_battery_start_of_day": None,
        "body_battery_end_of_day": None,
        "body_battery_intraday": None,
    }

# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    print(f"\n📱 Samsung Health Wellness Sync")
    print(f"   Export dir: {EXPORT_DIR}")

    # Load existing or start fresh
    existing: dict[str, dict] = {}
    if OUTPUT_FILE.exists() and not args.force:
        with open(OUTPUT_FILE, encoding="utf-8") as f:
            existing = json.load(f)
        print(f"   Existing cache: {len(existing)} days")

    data: dict[str, dict] = existing if not args.force else {}

    print(f"\n📥 Parsing Samsung Health CSVs...\n")

    parse_sleep(data)
    parse_heart_rate(data)
    parse_stress(data)
    parse_spo2(data)
    parse_steps(data)
    parse_floors(data)
    parse_hrv(data)
    compute_training_readiness(data)

    # Save
    ANALYSIS_DIR.mkdir(exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)

    total = len(data)
    dates = sorted(data.keys())
    print(f"\n✅ Done: {total} days parsed")
    if dates:
        print(f"   Date range: {dates[0]} → {dates[-1]}")
    print(f"   Saved: {OUTPUT_FILE}")

    # Summary stats
    if data:
        all_rec = list(data.values())
        def stat(key):
            v = [d[key] for d in all_rec if d.get(key) is not None]
            return (sum(v)/len(v), min(v), max(v)) if v else None

        print(f"\n📊 Database averages ({total} days):")
        for key, label in [
            ("hrv_last_5_min",   "HRV (peak)     "),
            ("resting_hr",       "Resting HR     "),
            ("sleep_score",      "Sleep score    "),
            ("avg_daily_stress", "Daily stress   "),
            ("spo2_avg",         "SpO2 avg       "),
        ]:
            s = stat(key)
            if s:
                unit = " bpm" if "hr" in key else (" ms" if "hrv" in key else ("%" if "spo2" in key else ""))
                print(f"   {label}: {s[0]:.1f}{unit} avg  (range {s[1]}–{s[2]})")


if __name__ == "__main__":
    main()



