import type { ActivitySummary } from "./summary_utils.js";

export interface DailyLoadPoint {
  date: string;
  tss_raw: number;
  trimp_raw: number;
  load: number;
}

export interface LoadModelPoint {
  date: string;
  load: number;
  ctl: number;
  atl: number;
  tsb: number;
  acwr: number | null;
}

export interface LoadModelLatest {
  ctl: number;
  atl: number;
  tsb: number;
  acwr: number | null;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildDailyLoadSeries(
  activities: ActivitySummary[],
  endDate: string = toIsoDate(new Date()),
): DailyLoadPoint[] {
  if (activities.length === 0) return [];

  const dayMap = new Map<string, { tss: number; trimp: number }>();
  for (const a of activities) {
    const d = a.date;
    if (d > endDate) continue;
    const prev = dayMap.get(d) ?? { tss: 0, trimp: 0 };
    dayMap.set(d, {
      tss: prev.tss + (a.tss ?? 0),
      trimp: prev.trimp + (a.trimp ?? 0),
    });
  }

  const sortedDates = [...dayMap.keys()].sort((a, b) => a.localeCompare(b));
  if (sortedDates.length === 0) return [];

  const out: DailyLoadPoint[] = [];
  const start = new Date(sortedDates[0]);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = toIsoDate(d);
    const row = dayMap.get(day) ?? { tss: 0, trimp: 0 };
    const load = row.tss > 0 ? row.tss : row.trimp;
    out.push({
      date: day,
      tss_raw: Math.round(row.tss * 10) / 10,
      trimp_raw: Math.round(row.trimp * 10) / 10,
      load: Math.round(load * 10) / 10,
    });
  }

  return out;
}

export function computeLoadModel(
  daily: DailyLoadPoint[],
  ctlDays = 42,
  atlDays = 7,
): LoadModelPoint[] {
  if (daily.length === 0) return [];

  const alphaCtl = 2 / (ctlDays + 1);
  const alphaAtl = 2 / (atlDays + 1);

  let ctl = 0;
  let atl = 0;
  const out: LoadModelPoint[] = [];

  for (const d of daily) {
    ctl = ctl + alphaCtl * (d.load - ctl);
    atl = atl + alphaAtl * (d.load - atl);
    const tsb = ctl - atl;
    const acwr = ctl > 0 ? atl / ctl : null;
    out.push({
      date: d.date,
      load: d.load,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
      acwr: acwr == null ? null : Math.round(acwr * 100) / 100,
    });
  }

  return out;
}

export function computeLatestLoadMetrics(
  activities: ActivitySummary[],
  endDate: string = toIsoDate(new Date()),
  ctlDays = 42,
  atlDays = 7,
): LoadModelLatest {
  const daily = buildDailyLoadSeries(activities, endDate);
  const model = computeLoadModel(daily, ctlDays, atlDays);
  if (model.length === 0) return { ctl: 0, atl: 0, tsb: 0, acwr: null };
  const latest = model.at(-1)!;
  return { ctl: latest.ctl, atl: latest.atl, tsb: latest.tsb, acwr: latest.acwr };
}


