import { loadAllSummaries, buildHistoricalContext, groupSport, extractSummary, checkPRs } from "./summary_utils.js";
import { loadWellnessContext } from "./wellness.js";
import { loadWellnessByDate, buildActivityRecommendation } from "./activity_recommendation.js";

const FILE_DATE_RE = /_(\d{4}-\d{2}-\d{2})_/;

export interface AnalyzeContextBundle {
  activityDate: string | null;
  historicalCtx: object | null;
  prCheck: any;
  wellnessCtx: any;
  recommendation: any;
}

export function buildAnalyzeContext(
  analysisDir: string,
  selectedFile: string,
  crunchedParsed: any,
): AnalyzeContextBundle {
  const dateMatch = FILE_DATE_RE.exec(selectedFile);
  const activityDate = dateMatch ? dateMatch[1] : null;

  const sport = groupSport(crunchedParsed?.summary_card?.type ?? "Unknown");
  const allSummaries = loadAllSummaries(analysisDir);
  const historicalCtx = activityDate
    ? buildHistoricalContext(allSummaries, activityDate, sport)
    : null;

  const summaryForPR = extractSummary(crunchedParsed, selectedFile);
  const prCheck = summaryForPR ? checkPRs(allSummaries, summaryForPR) : null;

  const actStartIso: string | null = crunchedParsed?.summary_card?.start_date_local
    ?? crunchedParsed?.activity_meta?.start_date_local
    ?? null;
  const utcOffset: number = crunchedParsed?.summary_card?.local_utc_offset_hours ?? 0;
  const wellnessCtx = activityDate
    ? loadWellnessContext(analysisDir, activityDate, actStartIso, utcOffset)
    : null;

  const wellnessByDate = loadWellnessByDate(analysisDir);
  const recommendation = activityDate
    ? buildActivityRecommendation(allSummaries, wellnessByDate, activityDate)
    : null;

  return { activityDate, historicalCtx, prCheck, wellnessCtx, recommendation };
}

