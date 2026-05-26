# Refactoring Plan: AI Interpretation Pipeline

> **Status:** ✅ Complete  
> **Created:** 2026-05-26  
> **Goal:** Remove legacy support, add few-shot examples storage, add AI output validation layer

---

## Overview

The current pipeline (`analyze.ts` → `interpret.ts` → `ai_client.ts`) has two code paths: a "legacy" monolithic AI call and a modern slot-based micro-call pipeline. The legacy path duplicates provider logic already in `ai_client.ts` and inflates `analyze.ts` to 397 lines. This plan removes legacy, adds few-shot prompting for consistent AI outputs, and introduces a validation layer to catch malformed responses.

---

## Phase 1: Remove Legacy Support ✅

### 1.1 Clean `src/analyze.ts`

- [x] Remove `--legacy` argument check
- [x] Remove entire `if (useLegacy) { ... }` block
- [x] Remove duplicate `AnalyzeConfig` interface and `loadAllConfigs()` — use `loadAiConfigs` from `ai_client.ts`
- [x] Remove `loadAnalyzeConfig()`
- [x] Remove `sanitizeAIOutput()`
- [x] Remove `compactMarkdown()`
- [x] Remove `resolvedDeviceFile()`
- [x] Remove `PROVIDER_URLS` constant
- [x] Remove `analyzeWithOpenAICompatible()`
- [x] Remove `analyzeWithFallback()`
- [x] Remove `analyzeWithGemini()`
- [x] Remove `sleep()` helper
- [x] Remove `INSTRUCTIONS_PATH` constant
- [x] Remove unused imports: `loadComposedInstructions`, `extractActivityMeta`
- [x] Remove `callAIWithFallback` from ai_client.js imports

**Result:** `analyze.ts` reduced from 397 → ~120 lines.

### 1.2 Clean `src/ai_client.ts`

- [x] Remove `callAIWithFallback` export
- [x] Update JSDoc header to remove legacy references

### 1.3 Evaluate `src/instructions.ts`

- [x] Kept — still useful for future system prompt composition
- [x] `extractActivityMeta` marked `@deprecated` (unused after legacy removal)

### 1.4 Update tests

- [x] Removed `callAIWithFallback` tests from `src/__tests__/ai_client.test.ts`
- [x] Verified `src/__tests__/interpret.test.ts` still passes

### 1.5 Cleanup

- [x] Updated `COMMANDS.md` — removed all `--legacy` references
- [x] Verified `npm run analyze` works without `--legacy` flag

---

## Phase 2: Few-Shot Examples Storage ✅

### 2.1 Created directory structure

```
instructions/
  examples/
    verdict.md
    pacing_interpretation.md
    cardiac_drift_interpretation.md
    power_interpretation.md
    ef_interpretation.md
    decoupling_interpretation.md
    power_skills_interpretation.md
    hr_zones_insight.md
    power_zones_insight.md
    cadence_zones_insight.md
    vam_interpretation.md
    torque_interpretation.md
    tips.md
    historical_comparison.md
    readiness_verdict.md
```

### 2.2 Example file format

```markdown
### Input
```json
{ "sport": "Ride", "distance": "80 km", "avg_hr": 148, ... }
```

### Output
Averaged 220W normalized to 235W over 80km — aerobic decoupling of 4.2% indicates solid base fitness.
```

Rules:
- One example per file
- Input must be valid JSON matching what `interpret.ts` sends for that slot
- Output follows the slot's system prompt rules (sentence count, tone, format)

### 2.3 Created `src/few_shot.ts`

- [x] Resolves path: `instructions/examples/{slot}.md`
- [x] Parses `### Input` and `### Output` sections
- [x] Strips markdown code fences from input section
- [x] Module-level `Map` cache (read once per process)
- [x] Returns `null` gracefully if file missing or parse fails

### 2.4 Integrated into `src/interpret.ts`

- [x] Imports `loadFewShot` from `./few_shot.js`
- [x] Appends few-shot example to `user` field when available:
  ```
  {original user JSON}
  
  --- Example ---
  Input: {example.input}
  Output: {example.output}
  ```

### 2.5 Starter examples written

- [x] `verdict.md` — cycling ride with power/HR/pacing summary
- [x] `pacing_interpretation.md` — positive split example
- [x] `cardiac_drift_interpretation.md` — moderate drift example
- [x] `tips.md` — 4 emoji-bullet example with specific numbers
- [x] `historical_comparison.md` — bullet comparison with emojis and trend
- [x] `power_interpretation.md` — variability index example
- [x] `ef_interpretation.md` — short phrase example
- [x] `decoupling_interpretation.md` — one-sentence example
- [x] `power_skills_interpretation.md` — profile interpretation
- [x] `hr_zones_insight.md` — zone dominance example
- [x] `power_zones_insight.md` — zone stimulus example
- [x] `cadence_zones_insight.md` — cadence quality example
- [x] `vam_interpretation.md` — VAM context example
- [x] `torque_interpretation.md` — torque comparison example
- [x] `readiness_verdict.md` — readiness sentence example

### 2.6 Tests

- [x] Created `src/__tests__/few_shot.test.ts`
- [x] Test: returns `null` for non-existent slot file
- [x] Test: correctly parses Input/Output sections
- [x] Test: handles malformed files gracefully
- [x] Test: caching works (second call doesn't re-read filesystem)
- [x] Test: integration with `buildInterpretationRequests`

---

## Phase 3: Validation Layer ✅

### 3.1 Created `src/validate.ts`

```typescript
export interface ValidationResult { valid: boolean; warnings: string[]; }
export interface SlotRules { ... }
export function validateSlotOutput(slot: string, output: string): ValidationResult
```

### 3.2 Validation rules

| Rule | Applies to | Logic |
|------|-----------|-------|
| Min length (20 chars) | All slots | `output.trim().length >= 20` |
| Max length (2000 chars) | All slots | `output.trim().length <= 2000` |
| Contains number | All except `readiness_verdict` | `/\d/.test(output)` |
| No banned phrases | All slots | Not contain: "Great job", "Overall,", "In conclusion", "In summary" |
| Bullet format | `tips` | At least 3 lines starting with `- ` |
| Emoji present | `tips`, `historical_comparison` | `/\p{Emoji}/u.test(output)` |
| Max sentences | `cardiac_drift_interpretation`, `ef_interpretation`, `cadence_zones_insight` | Count of `.` ≤ 2 |
| No markdown headers | All except `tips`, `historical_comparison` | No `## ` or `### ` |

### 3.3 Slot rules registry

- [x] `SLOT_RULES: Record<string, SlotRules>` defined for all 15 slots
- [x] Unknown slots get default rules only (min/max length, banned phrases)

### 3.4 Integrated into `src/ai_client.ts`

- [x] Imports `validateSlotOutput` from `./validate.js`
- [x] In `callAIBatch` worker: validates each response, logs warnings
- [x] Non-blocking — pipeline continues regardless
- [x] Comment: `// TODO: --strict mode could retry on validation failure`

### 3.5 Tests

- [x] Created `src/__tests__/validate.test.ts`
- [x] Tests each rule individually
- [x] Tests combined validation for known good/bad outputs
- [x] Tests unknown slots get only generic rules

---

## Phase 4: Final Verification ✅

- [x] `npm run build` — zero TypeScript errors
- [x] `npm test` — all existing + new tests pass
- [x] `npm run analyze` — end-to-end pipeline verified
- [x] Token usage logs show few-shot examples included
- [x] Validation warnings appear in console for edge cases
- [x] `--legacy` flag removed from all docs

---

## File Change Summary

| File | Action | Status |
|------|--------|--------|
| `src/analyze.ts` | **TRIM** — removed ~270 lines of legacy code | ✅ |
| `src/ai_client.ts` | **TRIM** — removed `callAIWithFallback`; added validation call | ✅ |
| `src/interpret.ts` | **MODIFY** — added few-shot integration | ✅ |
| `src/few_shot.ts` | **NEW** — few-shot example loader | ✅ |
| `src/validate.ts` | **NEW** — output validation layer | ✅ |
| `src/__tests__/few_shot.test.ts` | **NEW** | ✅ |
| `src/__tests__/validate.test.ts` | **NEW** | ✅ |
| `instructions/examples/*.md` | **NEW** — 15 files (all slots) | ✅ |
| `COMMANDS.md` | **MODIFY** — removed `--legacy` references | ✅ |
| `src/__tests__/ai_client.test.ts` | **MODIFY** — removed `callAIWithFallback` tests | ✅ |

---

## Execution Order

```
Phase 1 (legacy removal) → Phase 2 (few-shot) → Phase 3 (validation) → Phase 4 (verify)
```

Each phase is independently testable. Phases 2 and 3 have no dependency on each other but both depend on Phase 1 completion.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Breaking `npm run analyze` | Phase 1 only removes unused code paths; active pipeline is untouched |
| Few-shot examples increasing token cost | ~150 tokens × 15 slots = ~2.25K extra (< 5% increase) |
| Validation false positives | Log-only approach; easy to tune thresholds |
| Missing edge cases in validation | Start with generous rules, tighten based on real outputs |
| `instructions.ts` becoming dead code | Kept — useful for potential future system prompt work |


