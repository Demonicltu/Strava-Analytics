import { loadAllSummaries, buildHistoricalContext, groupSport, extractSummary, checkPRs } from "./summary_utils.js";
import { buildPersonalScore } from "./format.js";
import { loadWellnessByDate, buildActivityRecommendation } from "./activity_recommendation.js";

export interface FastContextBundle {
  historicalCtx: any;
  personalScore: any;
  prCheck: any;
  recommendation: any;
}

export function buildFastContext(
  analysisDir: string,
  dateStr: string,
  crunched: any,
  crunchedFilename: string,
): FastContextBundle {
  const allSummaries = loadAllSummaries(analysisDir);
  const sport = groupSport(crunched.summary_card?.type ?? "Unknown");
  const historicalCtx = buildHistoricalContext(allSummaries, dateStr, sport);
  const personalScore = buildPersonalScore(crunched, historicalCtx);
  const summaryForPR = extractSummary(crunched, crunchedFilename);
  const prCheck = summaryForPR ? checkPRs(allSummaries, summaryForPR) : null;
  const wellnessByDate = loadWellnessByDate(analysisDir);
  const recommendation = buildActivityRecommendation(allSummaries, wellnessByDate, dateStr);

  return { historicalCtx, personalScore, prCheck, recommendation };
}
