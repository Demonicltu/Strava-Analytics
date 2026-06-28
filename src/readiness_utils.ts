function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

export function hrvNorm(h: any): number | null {
  const vs = h?.hrv_vs_baseline;
  if (typeof vs === "number") return clamp(50 + (vs * 5));
  const last = h?.hrv_last_5_min ?? h?.hrv_last_night ?? null;
  const base = h?.hrv_weekly_avg ?? null;
  if (typeof last === "number" && typeof base === "number" && base > 0) {
    const ratio = (last - base) / base;
    return clamp(50 + ratio * 150);
  }
  return null;
}

export function bodyBatteryNorm(h: any): number | null {
  const v = h?.body_battery_at_start ?? h?.body_battery_start ?? h?.body_battery_start_of_day ?? null;
  return typeof v === "number" ? clamp(v) : null;
}

export function computeReadiness(h: any): {
  score: number | null;
  components: Record<string, number | null>;
  label: string | null;
} {
  const sleep = typeof h?.sleep_score === "number" ? clamp(h.sleep_score) : null;
  const hrv = hrvNorm(h);
  const bb = bodyBatteryNorm(h);

  const weights = [
    { key: "sleep", value: sleep, w: 0.4 },
    { key: "hrv", value: hrv, w: 0.35 },
    { key: "body_battery", value: bb, w: 0.25 },
  ];
  const valid = weights.filter(x => x.value != null) as { key: string; value: number; w: number }[];
  if (valid.length === 0) return { score: null, components: { sleep, hrv, body_battery: bb }, label: null };

  const totalW = valid.reduce((s, x) => s + x.w, 0);
  const score = Math.round(valid.reduce((s, x) => s + (x.value * x.w), 0) / totalW);
  const label = score >= 75 ? "Ready" : score >= 60 ? "Moderate" : "Low";
  return { score, components: { sleep, hrv, body_battery: bb }, label };
}

export function hrvValue(h: any): number | null {
  const v = h?.hrv_last_5_min ?? h?.hrv_last_night ?? null;
  return typeof v === "number" ? v : null;
}

export function meanHalfDelta(values: number[]): number | null {
  if (values.length < 3) return null;
  const half = Math.ceil(values.length / 2);
  const first = values.slice(0, half);
  const last = values.slice(values.length - half);
  const a = first.reduce((s, v) => s + v, 0) / first.length;
  const b = last.reduce((s, v) => s + v, 0) / last.length;
  return b - a;
}

