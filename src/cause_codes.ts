export interface CauseCodeMeta {
  rank: number;
  label: string;
  description: string;
}

export const CAUSE_CODE_META: Record<string, CauseCodeMeta> = {
  LOAD_HIGH: {
    rank: 1,
    label: "High training load",
    description: "High accumulated load or deep negative form (TSB) indicates elevated fatigue risk.",
  },
  LOAD_SPIKE: {
    rank: 2,
    label: "Acute load spike",
    description: "Recent 7-day load is materially above normal baseline, suggesting a short-term spike.",
  },
  HRV_DROP: {
    rank: 3,
    label: "HRV suppression",
    description: "HRV trend or weekly delta indicates reduced autonomic recovery.",
  },
  SLEEP_LOW: {
    rank: 4,
    label: "Sleep deficit",
    description: "Sleep score or sleep trend is below target and can impair recovery quality.",
  },
  BB_LOW: {
    rank: 5,
    label: "Low Body Battery",
    description: "Body Battery is low or trending down, indicating reduced readiness reserves.",
  },
  RECOVERY_GOOD: {
    rank: 6,
    label: "Recovery signals strong",
    description: "Recovery markers are favorable for maintaining or progressing planned training.",
  },
  GARMIN_COVERAGE_LOW: {
    rank: 7,
    label: "Limited Garmin coverage",
    description: "Garmin data coverage is limited; confidence in recommendation is reduced.",
  },
};

export function causeCodeLabel(code: string): string {
  return CAUSE_CODE_META[code]?.label ?? code;
}

export function causeCodeDescription(code: string): string {
  return CAUSE_CODE_META[code]?.description ?? "No description available.";
}

export function causeCodeRank(code: string): number {
  return CAUSE_CODE_META[code]?.rank ?? 99;
}

