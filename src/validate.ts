/**
 * Validation layer for AI slot outputs.
 * All rules are log-only (non-blocking).
 * Add a new slot to SLOT_RULES to get slot-specific validation.
 */

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

export interface SlotRules {
  minLength?: number;
  maxLength?: number;
  requiresNumbers?: boolean;
  bannedPhrases?: string[];
  requiresBullets?: boolean;     // at least 3 lines starting with "- "
  requiresEmoji?: boolean;
  maxSentences?: number;
  noMarkdownHeaders?: boolean;
}

const BANNED_PHRASES = ["Great job", "Overall,", "In conclusion", "In summary", "Well done"];

const DEFAULT_RULES: Required<Pick<SlotRules, "minLength" | "maxLength" | "bannedPhrases">> = {
  minLength: 20,
  maxLength: 2000,
  bannedPhrases: BANNED_PHRASES,
};

const SLOT_RULES: Record<string, SlotRules> = {
  verdict: {
    requiresNumbers: true,
    noMarkdownHeaders: true,
  },
  pacing_interpretation: {
    requiresNumbers: true,
    noMarkdownHeaders: true,
  },
  cardiac_drift_interpretation: {
    requiresNumbers: true,
    maxSentences: 2,
    noMarkdownHeaders: true,
  },
  power_interpretation: {
    requiresNumbers: true,
    maxSentences: 3,
    noMarkdownHeaders: true,
  },
  ef_interpretation: {
    maxLength: 200,
    maxSentences: 2,
    noMarkdownHeaders: true,
  },
  decoupling_interpretation: {
    requiresNumbers: true,
    maxSentences: 2,
    noMarkdownHeaders: true,
  },
  power_skills_interpretation: {
    requiresNumbers: true,
    noMarkdownHeaders: true,
  },
  hr_zones_insight: {
    requiresNumbers: true,
    maxSentences: 3,
    noMarkdownHeaders: true,
  },
  power_zones_insight: {
    requiresNumbers: true,
    maxSentences: 3,
    noMarkdownHeaders: true,
  },
  cadence_zones_insight: {
    requiresNumbers: true,
    maxSentences: 2,
    noMarkdownHeaders: true,
  },
  vam_interpretation: {
    requiresNumbers: true,
    maxSentences: 3,
    noMarkdownHeaders: true,
  },
  torque_interpretation: {
    requiresNumbers: true,
    maxSentences: 3,
    noMarkdownHeaders: true,
  },
  tips: {
    requiresNumbers: true,
    requiresBullets: true,
    requiresEmoji: true,
  },
  historical_comparison: {
    requiresNumbers: true,
    requiresBullets: true,
    requiresEmoji: true,
    maxLength: 6000,
  },
  readiness_verdict: {
    requiresNumbers: true,
    maxSentences: 2,
    noMarkdownHeaders: true,
  },
};

export function validateSlotOutput(slot: string, output: string): ValidationResult {
  const warnings: string[] = [];
  const rules: SlotRules = SLOT_RULES[slot] ?? {};
  const text = output.trim();

  // ─── Default rules (always applied) ──────────────────────────────────────
  const minLen = rules.minLength ?? DEFAULT_RULES.minLength;
  const maxLen = rules.maxLength ?? DEFAULT_RULES.maxLength;
  const banned = [...DEFAULT_RULES.bannedPhrases, ...(rules.bannedPhrases ?? [])];

  if (text.length < minLen) warnings.push(`too short (${text.length} < ${minLen} chars)`);
  if (text.length > maxLen) warnings.push(`too long (${text.length} > ${maxLen} chars)`);

  for (const phrase of banned) {
    if (text.includes(phrase)) warnings.push(`contains banned phrase: "${phrase}"`);
  }

  // ─── Slot-specific rules ──────────────────────────────────────────────────
  if (rules.requiresNumbers && !/\d/.test(text)) {
    warnings.push("no numbers found (should be data-driven)");
  }

  if (rules.requiresBullets) {
    const bulletLines = text.split("\n").filter(l => l.trimStart().startsWith("- "));
    if (bulletLines.length < 3) warnings.push(`too few bullets (${bulletLines.length} < 3)`);
  }

  if (rules.requiresEmoji) {
    // Match unicode emoji ranges broadly
    if (!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}]/u.test(text)) {
      warnings.push("no emoji found");
    }
  }

  if (rules.maxSentences != null) {
    const sentenceCount = (text.match(/[.!?]/g) ?? []).length;
    if (sentenceCount > rules.maxSentences) {
      warnings.push(`too many sentences (${sentenceCount} > ${rules.maxSentences})`);
    }
  }

  if (rules.noMarkdownHeaders && /^#{2,3}\s/m.test(text)) {
    warnings.push("unexpected markdown headers");
  }

  return { valid: warnings.length === 0, warnings };
}

