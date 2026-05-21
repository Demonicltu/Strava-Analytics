#!/usr/bin/env python3
"""
Garmin Connect wellness sync — fetches sleep, HRV, Body Battery, stress
breakdown (rest/low/medium/high), resting HR, training readiness and daily
summaries into analysis/garmin_wellness.json.

Note: training_status/acute_load/chronic_load/load_ratio/total_calories/
hrv_last_night/vo2max_garmin/training_effect_* are not returned by this
Garmin API and are intentionally omitted.

The latest cached date is ALWAYS re-fetched because Garmin populates it
incrementally and the previous sync may have captured incomplete data.
Use --force to re-fetch the entire history.

Usage:
    python garmin_sync.py                        # sync last 90 days
    python garmin_sync.py --days 365             # sync last 365 days
    python garmin_sync.py --since 2025-11-11     # sync from watch start date to today
    python garmin_sync.py --force                # re-fetch all days (ignore cache)
    python garmin_sync.py --since 2025-11-11 --force

Set GARMIN_SINCE=2025-11-11 in .env to always use that as the earliest date.

Requirements:
    pip install -r requirements.txt
"""

import os
import sys
import json
import argparse
import datetime
import time
from pathlib import Path

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
OUTPUT_FILE = ANALYSIS_DIR / "garmin_wellness.json"
SESSION_FILE = SCRIPT_DIR / ".garmin_session.json"

# ─── Args ────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="Sync Garmin Connect wellness data")
parser.add_argument("--days", type=int, default=90,
                    help="Days to fetch backwards from today (default: 90). Ignored if --since used.")
parser.add_argument("--since", type=str, default=None,
                    help="Fetch from this date to today (YYYY-MM-DD). Overrides --days. "
                         "Can also be set via GARMIN_SINCE in .env")
parser.add_argument("--force", action="store_true",
                    help="Re-fetch all days even if already cached")
args = parser.parse_args()

# --since from CLI > .env > ignored
since_override: str = args.since or os.environ.get("GARMIN_SINCE", "")

# ─── Credentials ─────────────────────────────────────────────────────────────

EMAIL = os.environ.get("GARMIN_EMAIL", "")
PASSWORD = os.environ.get("GARMIN_PASSWORD", "")

if not EMAIL or not PASSWORD:
    print("❌ GARMIN_EMAIL and GARMIN_PASSWORD must be set in your .env file.")
    sys.exit(1)

# ─── Import garminconnect ─────────────────────────────────────────────────────

try:
    from garminconnect import Garmin, GarminConnectAuthenticationError, GarminConnectTooManyRequestsError
except ImportError:
    print("❌ garminconnect not installed. Run: pip install -r requirements.txt")
    sys.exit(1)

# ─── Helpers ─────────────────────────────────────────────────────────────────

def build_date_range() -> list[str]:
    """Return sorted list of ISO date strings (ascending) to fetch."""
    today = datetime.date.today()
    if since_override:
        try:
            start = datetime.date.fromisoformat(since_override)
        except ValueError:
            print(f"❌ Invalid --since date '{since_override}'. Use YYYY-MM-DD format.")
            sys.exit(1)
        if start > today:
            print(f"❌ --since date {since_override} is in the future.")
            sys.exit(1)
        delta = (today - start).days + 1
        return [(start + datetime.timedelta(days=i)).isoformat() for i in range(delta)]
    return [(today - datetime.timedelta(days=i)).isoformat() for i in range(args.days)][::-1]

def safe_get(fn, *fn_args, default=None, label=""):
    try:
        return fn(*fn_args)
    except Exception as e:
        msg = str(e)
        if any(x in msg for x in ["404", "No data", "not found", "no data"]):
            return default
        print(f"   ⚠️  {label}: {msg[:100]}")
        return default

def load_existing() -> dict:
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}

def save(data: dict):
    ANALYSIS_DIR.mkdir(exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)

# ─── Authentication ───────────────────────────────────────────────────────────

def prompt_mfa() -> str:
    print("\n📧 Garmin sent a one-time verification code to your email.")
    return input("   Enter the code: ").strip()


def authenticate() -> Garmin:
    api = Garmin(EMAIL, PASSWORD, prompt_mfa=prompt_mfa)

    if SESSION_FILE.exists():
        try:
            result = api.login(str(SESSION_FILE))
            if result is None or (isinstance(result, tuple) and result[0] is None):
                print("✅ Garmin: reused cached session")
                return api
        except Exception:
            pass

    print("🔐 Garmin: logging in (first run or session expired)...")
    try:
        api.login()
        api.client.dump(str(SESSION_FILE))
        print("✅ Garmin: logged in, session cached for future runs")
        return api
    except GarminConnectAuthenticationError as e:
        print(f"❌ Garmin authentication failed: {e}")
        print("   Check GARMIN_EMAIL and GARMIN_PASSWORD in your .env")
        sys.exit(1)
    except GarminConnectTooManyRequestsError:
        print("❌ Garmin rate-limited (429). Wait 15–30 minutes and try again.")
        sys.exit(1)
    except Exception as e:
        if "429" in str(e):
            print("❌ Garmin rate-limited (429). Wait 15–30 minutes and try again.")
            sys.exit(1)
        raise

# ─── Per-day fetch ────────────────────────────────────────────────────────────

def fetch_day(api: Garmin, date_str: str) -> dict:
    record: dict = {"date": date_str, "fetched_at": datetime.datetime.now().isoformat()}

    # ── Daily summary ──
    summary = safe_get(api.get_stats, date_str, label="daily summary")
    if summary:
        record["steps"] = summary.get("totalSteps")
        record["floors_climbed"] = summary.get("floorsAscended")
        record["intensity_minutes_moderate"] = summary.get("moderateIntensityMinutes")
        record["intensity_minutes_vigorous"] = summary.get("vigorousIntensityMinutes")
        record["active_calories"] = summary.get("activeKilocalories")
        record["resting_hr"] = summary.get("restingHeartRate")
        # Stress — overall + full breakdown
        record["avg_daily_stress"] = summary.get("averageStressLevel")
        record["max_stress"] = summary.get("maxStressLevel")
        record["stress_rest_sec"] = summary.get("restStressDuration")
        record["stress_low_sec"] = summary.get("lowStressDuration")
        record["stress_medium_sec"] = summary.get("mediumStressDuration")
        record["stress_high_sec"] = summary.get("highStressDuration")
        record["stress_activity_sec"] = summary.get("activityStressDuration")
        # Body Battery
        record["body_battery_charged"] = summary.get("bodyBatteryChargedValue")
        record["body_battery_drained"] = summary.get("bodyBatteryDrainedValue")
        record["body_battery_highest"] = summary.get("bodyBatteryHighestValue")
        record["body_battery_lowest"] = summary.get("bodyBatteryLowestValue")

    # ── Sleep ──
    sleep = safe_get(api.get_sleep_data, date_str, label="sleep")
    if sleep and isinstance(sleep, dict):
        daily = sleep.get("dailySleepDTO") or {}
        scores = daily.get("sleepScores") or {}
        record["sleep_score"] = scores.get("overall", {}).get("value") if scores else None
        record["sleep_start_local"] = daily.get("sleepStartTimestampLocal")
        record["sleep_end_local"] = daily.get("sleepEndTimestampLocal")
        record["sleep_duration_sec"] = daily.get("sleepTimeSeconds")
        record["sleep_deep_sec"] = daily.get("deepSleepSeconds")
        record["sleep_light_sec"] = daily.get("lightSleepSeconds")
        record["sleep_rem_sec"] = daily.get("remSleepSeconds")
        record["sleep_awake_sec"] = daily.get("awakeSleepSeconds")
        record["sleep_average_spo2"] = daily.get("averageSpO2Value")
        record["sleep_average_respiration"] = daily.get("averageRespirationValue")
        record["sleep_avg_stress"] = daily.get("avgSleepStress")

    # ── HRV ──
    hrv = safe_get(api.get_hrv_data, date_str, label="HRV")
    if hrv and isinstance(hrv, dict):
        h = hrv.get("hrvSummary") or {}
        record["hrv_last_night"] = h.get("lastNight")
        record["hrv_weekly_avg"] = h.get("weeklyAvg")
        record["hrv_last_5_min"] = h.get("lastNight5MinHigh")
        record["hrv_status"] = h.get("status")
        record["hrv_feedback"] = h.get("feedbackPhrase")

    # ── Training readiness (0–100 composite) ──
    readiness = safe_get(api.get_training_readiness, date_str, label="training readiness")
    if readiness and isinstance(readiness, list) and len(readiness) > 0:
        r = readiness[0] if isinstance(readiness[0], dict) else {}
        record["training_readiness_score"] = r.get("score")
        record["training_readiness_level"] = r.get("level")
        record["training_readiness_feedback"] = r.get("feedbackShort")

    # ── Training status: acute/chronic load, load ratio, status label ──
    # NOTE: get_training_status does not return usable data for this account — skipped.

    # ── SpO2 ──
    spo2 = safe_get(api.get_spo2_data, date_str, label="SpO2")
    if spo2 and isinstance(spo2, dict):
        record["spo2_avg"] = spo2.get("averageSpO2")
        record["spo2_min"] = spo2.get("lowestSpO2")

    # ── VO2max — not returned by this API, skipped ──

    # ── Body Battery intraday (start/end of day) ──
    battery = safe_get(api.get_body_battery, date_str, date_str, label="body battery intraday")
    if battery and isinstance(battery, list) and len(battery) > 0:
        day_data = battery[0] if isinstance(battery[0], dict) else {}
        try:
            vals = [v[1] for v in day_data.get("bodyBatteryValuesArray", [])
                    if isinstance(v, list) and len(v) > 1 and v[1] is not None]
            if vals:
                record["body_battery_start_of_day"] = vals[0]
                record["body_battery_end_of_day"] = vals[-1]
        except Exception:
            pass

    return record

# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    all_dates = build_date_range()
    existing = load_existing() if not args.force else {}

    # Always re-fetch the latest cached date — it was the "last day" at the
    # time of the previous sync, so Garmin may have incomplete data for it.
    latest_cached = max(existing.keys()) if existing else None

    if not args.force:
        to_fetch = [d for d in all_dates if d not in existing or d == latest_cached]
    else:
        to_fetch = list(all_dates)

    already_cached = len(all_dates) - len(to_fetch)

    period_label = f"since {since_override}" if since_override else f"last {args.days} days"
    refetch_note = f" (incl. re-fetch of latest cached: {latest_cached})" if latest_cached else ""
    print(f"\n🏃 Garmin Connect Wellness Sync")
    print(f"   Period: {period_label} ({min(all_dates)} → {max(all_dates)})")
    print(f"   Total: {len(all_dates)} days | Cached: {already_cached} | To fetch: {len(to_fetch)}{refetch_note}\n")

    if not to_fetch:
        print("✅ All days already cached. Use --force to re-fetch.")
        print(f"   Data file: {OUTPUT_FILE}")
        return

    api = authenticate()
    print(f"\n📥 Fetching {len(to_fetch)} days...\n")

    fetched = 0
    failed = 0

    for i, date_str in enumerate(sorted(to_fetch)):
        try:
            print(f"   [{i+1}/{len(to_fetch)}] {date_str}...", end=" ", flush=True)
            record = fetch_day(api, date_str)
            existing[date_str] = record
            fetched += 1

            parts = []
            if record.get("resting_hr"):
                parts.append(f"RHR {record['resting_hr']} bpm")
            hrv = record.get("hrv_last_5_min")
            if hrv:
                parts.append(f"HRV5min {hrv}")
            if record.get("sleep_score"):
                parts.append(f"Sleep {record['sleep_score']}")
            bb_lo = record.get("body_battery_lowest")
            bb_hi = record.get("body_battery_highest")
            if bb_hi is not None:
                parts.append(f"BB {bb_lo}→{bb_hi}")
            if record.get("training_readiness_score") is not None:
                parts.append(f"TR {record['training_readiness_score']}")
            print(" | ".join(parts) if parts else "ok (no data for this day)")

            if i < len(to_fetch) - 1:
                time.sleep(0.8)

        except KeyboardInterrupt:
            print("\n⚠️  Interrupted. Saving progress...")
            break
        except Exception as e:
            print(f"❌ {e}")
            failed += 1
            time.sleep(2)

    save(existing)

    total = len(existing)
    print(f"\n✅ Done: {fetched} fetched, {failed} failed, {already_cached} cached")
    print(f"   Total days in database: {total}")
    print(f"   Saved: {OUTPUT_FILE}")

    all_rec = list(existing.values())
    def stat(key):
        v = [d[key] for d in all_rec if d.get(key)]
        return (sum(v)/len(v), min(v), max(v)) if v else None

    print(f"\n📊 Database averages ({total} days):")
    for key, label in [
        ("hrv_last_5_min",      "HRV (5min peak)"),
        ("resting_hr",          "Resting HR     "),
        ("sleep_score",         "Sleep score    "),
        ("body_battery_highest","BB peak        "),
        ("training_readiness_score", "Readiness  "),
        ("avg_daily_stress",    "Daily stress   "),
    ]:
        s = stat(key)
        if s:
            unit = " bpm" if "hr" in key else (" ms" if "hrv" in key else "")
            print(f"   {label}: {s[0]:.1f}{unit} avg  (range {s[1]}–{s[2]})")

if __name__ == "__main__":
    main()
