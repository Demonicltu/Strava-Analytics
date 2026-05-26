#!/usr/bin/env python3
"""Debug: test which Garmin endpoints return high-resolution body battery."""
import json, os, sys
from garminconnect import Garmin

def load_dotenv():
    if not os.path.exists(".env"):
        return
    with open(".env", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_dotenv()
api = Garmin(os.environ["GARMIN_EMAIL"], os.environ["GARMIN_PASSWORD"])
api.login(".garmin_session.json")

date_str = "2026-05-21"

print("\n=== 1. Raw intraday: /wellness-service/wellness/bodyBattery/{date} ===")
try:
    result = api.connectapi(f"/wellness-service/wellness/bodyBattery/{date_str}")
    print("Type:", type(result))
    print(json.dumps(result, indent=2)[:2000])
except Exception as e:
    print("ERROR:", e)

print("\n=== 2. get_stress_data keys ===")
try:
    sd = api.get_stress_data(date_str)
    print("Type:", type(sd))
    if isinstance(sd, dict):
        print("Keys:", list(sd.keys()))
        for k, v in sd.items():
            if isinstance(v, list):
                print(f"  {k}: list of {len(v)} items, first few:", v[:3])
            else:
                print(f"  {k}:", str(v)[:100])
    else:
        print("Value:", str(sd)[:500])
except Exception as e:
    print("ERROR:", e)

print("\n=== 3. get_body_battery_events ===")
try:
    be = api.get_body_battery_events(date_str)
    print("Type:", type(be))
    print(json.dumps(be, indent=2)[:2000])
except Exception as e:
    print("ERROR:", e)

print("\n=== 4. get_body_battery (existing, for comparison) ===")
try:
    bb = api.get_body_battery(date_str, date_str)
    if bb and isinstance(bb, list) and len(bb) > 0:
        day = bb[0]
        arr = day.get("bodyBatteryValuesArray", [])
        print(f"Points returned: {len(arr)}")
        print("First 5:", arr[:5])
        print("Last 5:", arr[-5:])
except Exception as e:
    print("ERROR:", e)

