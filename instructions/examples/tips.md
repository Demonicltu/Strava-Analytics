### Input
```json
{"sport":"Ride","avg_hr":148,"avg_power":220,"tss":120,"intensity_factor":0.88,"aerobic_decoupling_pct":4.2,"cardiac_drift_bpm":5,"pacing_type":"positive split","variability_index":1.07,"avg_cadence":88,"cadence_is_low":false,"segment_prs":1,"climbing_total_ascent_m":1450,"best_vam":980,"torque_avg_nm":28.4,"historical_avg_decoupling":5.1}
```

### Output
- 🔄 **Pacing** — flip to a negative split by holding 30W below target for the first 30 min; your positive split cost ~4% efficiency today.
- 📉 **Decoupling** — your 4.2% is down from the 6mo avg of 5.1%; add one 90-min Z2 ride per week to push below 3% consistently.
- ⚡ **Variability Index** — VI of 1.07 signals unnecessary surges; on the next ride use ERG mode or power targets to keep VI under 1.05.
- 🦵 **Cadence** — 88 rpm is solid; on climbs >5% resist dropping below 80 rpm to protect the knees and sustain power output.
