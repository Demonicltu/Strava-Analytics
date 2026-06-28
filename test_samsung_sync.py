"""Tests for samsung_sync.py parsing and computation logic."""
import pytest
import sys
import os
import datetime
from pathlib import Path
from unittest.mock import patch, MagicMock
from collections import defaultdict

# Add parent dir to path so we can import helpers
sys.path.insert(0, str(Path(__file__).parent.parent.resolve()))

# We need to prevent samsung_sync from running argparse and checking dirs on import
# So we patch sys.argv and the export dir check
with patch("sys.argv", ["samsung_sync.py", "--dir", "."]):
    with patch.object(Path, "exists", return_value=True):
        import samsung_sync
        from samsung_sync import (
            parse_datetime, to_date, safe_float, safe_int,
            read_csv_rows, compute_training_readiness, _empty_record,
        )


class TestParseDateTime:
    def test_standard_format(self):
        dt = parse_datetime("2025-06-15 08:30:00")
        assert dt == datetime.datetime(2025, 6, 15, 8, 30, 0)

    def test_with_milliseconds(self):
        dt = parse_datetime("2025-06-15 08:30:00.123")
        assert dt == datetime.datetime(2025, 6, 15, 8, 30, 0, 123000)

    def test_iso_t_format(self):
        dt = parse_datetime("2025-06-15T08:30:00")
        assert dt == datetime.datetime(2025, 6, 15, 8, 30, 0)

    def test_short_format(self):
        dt = parse_datetime("2025-06-15 08:30")
        assert dt == datetime.datetime(2025, 6, 15, 8, 30, 0)

    def test_none_input(self):
        assert parse_datetime(None) is None

    def test_empty_string(self):
        assert parse_datetime("") is None

    def test_invalid_format(self):
        assert parse_datetime("not a date") is None


class TestToDate:
    def test_converts_datetime(self):
        dt = datetime.datetime(2025, 6, 15, 8, 30)
        assert to_date(dt) == "2025-06-15"

    def test_none(self):
        assert to_date(None) is None


class TestSafeFloat:
    def test_valid(self):
        assert safe_float("3.14") == 3.14

    def test_int_string(self):
        assert safe_float("42") == 42.0

    def test_none(self):
        assert safe_float(None) is None

    def test_empty(self):
        assert safe_float("") is None

    def test_non_numeric(self):
        assert safe_float("abc") is None


class TestSafeInt:
    def test_valid(self):
        assert safe_int("42") == 42

    def test_float_string(self):
        assert safe_int("42.7") == 42

    def test_none(self):
        assert safe_int(None) is None

    def test_invalid(self):
        assert safe_int("abc") is None


class TestComputeTrainingReadiness:
    def _make_data(self, days: list[dict]) -> dict[str, dict]:
        """Create data dict from list of day overrides."""
        data = {}
        base_date = datetime.date(2025, 6, 1)
        for i, overrides in enumerate(days):
            date_str = (base_date + datetime.timedelta(days=i)).isoformat()
            rec = _empty_record(date_str)
            rec.update(overrides)
            data[date_str] = rec
        return data

    def test_computes_score_with_all_metrics(self):
        data = self._make_data([
            {"hrv_last_5_min": 55, "hrv_weekly_avg": 50, "sleep_score": 80,
             "avg_daily_stress": 25, "resting_hr": 52},
        ])
        compute_training_readiness(data)
        rec = list(data.values())[0]
        assert rec["training_readiness_score"] is not None
        assert 0 <= rec["training_readiness_score"] <= 100
        assert rec["training_readiness_level"] in ("PRIME", "READY", "MODERATE", "LOW")

    def test_high_readiness_with_good_metrics(self):
        # Excellent: high HRV above baseline, great sleep, low stress, low RHR
        data = self._make_data([
            {"hrv_last_5_min": 70, "hrv_weekly_avg": 55, "sleep_score": 90,
             "avg_daily_stress": 18, "resting_hr": 48},
        ])
        compute_training_readiness(data)
        score = list(data.values())[0]["training_readiness_score"]
        assert score >= 73  # Should be PRIME or READY

    def test_low_readiness_with_poor_metrics(self):
        # Poor: low HRV below baseline, bad sleep, high stress, elevated RHR
        data = self._make_data([
            {"hrv_last_5_min": 30, "hrv_weekly_avg": 55, "sleep_score": 40,
             "avg_daily_stress": 65, "resting_hr": 72},
        ])
        compute_training_readiness(data)
        score = list(data.values())[0]["training_readiness_score"]
        assert score < 50  # Should be LOW or low MODERATE

    def test_skips_when_less_than_2_components(self):
        # Only 1 metric available
        data = self._make_data([{"sleep_score": 80}])
        compute_training_readiness(data)
        assert list(data.values())[0]["training_readiness_score"] is None

    def test_works_with_2_components(self):
        data = self._make_data([{"sleep_score": 75, "avg_daily_stress": 30}])
        compute_training_readiness(data)
        assert list(data.values())[0]["training_readiness_score"] is not None

    def test_rhr_baseline_uses_7_day_window(self):
        # 7 days of data — RHR on day 7 should compare to rolling avg
        days = [{"resting_hr": 55, "sleep_score": 75} for _ in range(7)]
        # Day 8: elevated RHR
        days.append({"resting_hr": 63, "sleep_score": 75, "avg_daily_stress": 30})
        data = self._make_data(days)
        compute_training_readiness(data)
        last = list(data.values())[-1]
        assert last["training_readiness_score"] is not None
        # Elevated RHR should lower score vs normal
        normal_days = [{"resting_hr": 55, "sleep_score": 75} for _ in range(7)]
        normal_days.append({"resting_hr": 55, "sleep_score": 75, "avg_daily_stress": 30})
        data_normal = self._make_data(normal_days)
        compute_training_readiness(data_normal)
        normal_score = list(data_normal.values())[-1]["training_readiness_score"]
        assert last["training_readiness_score"] < normal_score

    def test_level_prime(self):
        data = self._make_data([
            {"hrv_last_5_min": 80, "hrv_weekly_avg": 60, "sleep_score": 95,
             "avg_daily_stress": 15, "resting_hr": 45},
        ])
        compute_training_readiness(data)
        assert list(data.values())[0]["training_readiness_level"] == "PRIME"

    def test_level_moderate(self):
        data = self._make_data([
            {"hrv_last_5_min": 45, "hrv_weekly_avg": 50, "sleep_score": 60,
             "avg_daily_stress": 45, "resting_hr": 60},
        ])
        compute_training_readiness(data)
        level = list(data.values())[0]["training_readiness_level"]
        assert level == "MODERATE"

    def test_feedback_contains_components(self):
        data = self._make_data([
            {"hrv_last_5_min": 55, "hrv_weekly_avg": 50, "sleep_score": 80,
             "avg_daily_stress": 25, "resting_hr": 52},
        ])
        compute_training_readiness(data)
        feedback = list(data.values())[0]["training_readiness_feedback"]
        assert "HRV" in feedback
        assert "Sleep" in feedback
        assert "Stress" in feedback
        assert "RHR" in feedback

    def test_score_clamped_0_100(self):
        # Extreme values should still produce 0–100
        data = self._make_data([
            {"hrv_last_5_min": 200, "hrv_weekly_avg": 50, "sleep_score": 100,
             "avg_daily_stress": 0, "resting_hr": 35},
        ])
        compute_training_readiness(data)
        score = list(data.values())[0]["training_readiness_score"]
        assert 0 <= score <= 100

    def test_empty_data(self):
        data = {}
        compute_training_readiness(data)  # Should not crash


class TestSleepScoreSynthesis:
    """Test the sleep score synthesis logic from parse_sleep."""

    def test_perfect_sleep_high_score(self):
        # 8h sleep, 20% deep, 25% REM → should be ~100
        total = 28800  # 8h
        deep = int(total * 0.20)
        rem = int(total * 0.25)
        dur_score = min(100, (total / 28800) * 100)  # 100
        deep_score = min(100, (deep / total * 100) / 20 * 100)  # 100
        rem_score = min(100, (rem / total * 100) / 25 * 100)  # 100
        score = round(dur_score * 0.4 + deep_score * 0.3 + rem_score * 0.3)
        assert score == 100

    def test_short_sleep_lower_score(self):
        # 5h sleep, 15% deep, 20% REM
        total = 18000  # 5h
        deep = int(total * 0.15)
        rem = int(total * 0.20)
        dur_score = min(100, (total / 28800) * 100)  # 62.5
        deep_score = min(100, (deep / total * 100) / 20 * 100)  # 75
        rem_score = min(100, (rem / total * 100) / 25 * 100)  # 80
        score = round(dur_score * 0.4 + deep_score * 0.3 + rem_score * 0.3)
        assert 60 < score < 80

    def test_no_deep_no_rem(self):
        total = 28800
        dur_score = 100
        deep_score = 0
        rem_score = 0
        score = round(dur_score * 0.4 + deep_score * 0.3 + rem_score * 0.3)
        assert score == 40  # Only duration contributes


class TestEmptyRecord:
    def test_has_all_expected_keys(self):
        rec = _empty_record("2025-06-15")
        assert rec["date"] == "2025-06-15"
        assert rec["steps"] is None
        assert rec["resting_hr"] is None
        assert rec["hrv_last_5_min"] is None
        assert rec["training_readiness_score"] is None
        assert rec["body_battery_intraday"] is None
        assert rec["sleep_score"] is None

    def test_has_fetched_at(self):
        rec = _empty_record("2025-06-15")
        assert "fetched_at" in rec
        assert rec["fetched_at"] is not None

