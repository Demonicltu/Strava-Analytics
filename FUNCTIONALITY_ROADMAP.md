# Functionality Roadmap (What / How / Why)

Generated: 2026-06-28
Scope: Practical feature expansion with low risk to current outputs.

## Goals

- Increase recommendation usefulness without adding noisy metrics.
- Keep deterministic behavior and backward-compatible output shape.
- Add explainability and trend awareness before adding new complex models.

## Priorities

### P0 (quick wins, 1-2 sessions each)

1. Recommendation change detection (today vs yesterday)
2. Cause codes + confidence breakdown
3. Data quality guardrails
4. Dashboard explainability panel

### P1 (medium impact, 2-4 sessions each)

5. Workout type suggestion engine
6. Recovery ETA
7. Goal modes
8. Sport-specific load/readiness thresholds

### P2 (higher effort, 4+ sessions)

9. Rolling 7-day adaptive plan
10. Recommendation history + backtesting

---

## 1) Recommendation Change Detection

### Why
Current recommendations can look repetitive even when underlying signals moved. A delta section makes state transitions understandable.

### What
Add a compact `changes` block in recommendation output:
- `state_changed`: boolean
- `drivers`: top 3 deltas with direction and magnitude
- `since`: comparison window (`1d` now; optional `3d` later)

Example drivers:
- `HRV_7D_DELTA: -6 ms`
- `TSB: -12`
- `SLEEP_7D_AVG: +8`

### How
- Add comparison against previous day recommendation inputs.
- Rank driver impact using normalized absolute deltas.
- Render a short bullet list in template and include in description extraction.

### Files (expected)
- `src/activity_recommendation.ts`
- `src/template.ts`
- `src/format.ts`
- `src/__tests__/activity_recommendation.test.ts`
- `src/__tests__/template.test.ts`

### Acceptance
- Output includes `what changed` when prior-day data exists.
- No regression in existing recommendation state for unchanged inputs.

---

## 2) Cause Codes + Confidence Breakdown

### Why
"HIGH confidence" is hard to trust without attribution.

### What
Attach deterministic reason tags and weighted confidence factors.

Cause codes (initial set):
- `LOAD_HIGH`
- `LOAD_SPIKE`
- `HRV_DROP`
- `SLEEP_LOW`
- `BB_LOW`
- `RECOVERY_GOOD`
- `GARMIN_COVERAGE_LOW`

Confidence factors (0-100):
- data coverage
- signal agreement
- trend stability

### How
- Map existing rules to emitted codes.
- Compute confidence from existing inputs; clamp and bucket (`LOW/MED/HIGH`).
- Render top factors and code list in markdown output.

### Files (expected)
- `src/activity_recommendation.ts`
- `src/recommendations.ts`
- `src/template.ts`
- `src/__tests__/recommendations.test.ts`

### Acceptance
- Each recommendation state emits at least one cause code.
- Confidence bucket changes when coverage/trend changes.

---

## 3) Data Quality Guardrails

### Why
Poor source quality should reduce certainty and avoid overconfident guidance.

### What
Introduce quality checks that annotate output and lower confidence:
- missing Garmin days in 7-day window
- implausible HRV jumps
- missing sleep/body battery critical fields

### How
- Build `quality_flags` from wellness snapshots.
- Apply confidence penalties per flag (bounded total penalty).
- Add a short `Data quality` line in recommendation section.

### Files (expected)
- `src/readiness_utils.ts`
- `src/activity_recommendation.ts`
- `src/template.ts`
- `src/__tests__/readiness_utils.test.ts`

### Acceptance
- Confidence is lower when quality flags are present.
- Flags are visible in output; no silent degradation.

---

## 4) Dashboard Explainability Panel

### Why
Daily decisions are faster when key drivers are visible at a glance.

### What
Add a compact panel:
- `Top 3 drivers today`
- `What would change state`
- `Confidence factors`

### How
- Reuse recommendation payload; avoid recomputing in dashboard.
- Add rendering block to dashboard HTML/TS.

### Files (expected)
- `src/dashboard.ts`
- `dashboard.html`
- optional `src/dashboard_data.ts` if extraction is needed

### Acceptance
- Dashboard shows same state/cause/confidence as CLI output.

---

## 5) Workout Type Suggestion Engine

### Why
Users need actionable next-session structure, not only REST/EASY/HARD labels.

### What
Return a `session` object:
- `type`: `recovery | endurance | tempo | threshold | vo2 | long_easy`
- `duration_min_range`
- `intensity_hint`
- `tss_target_range`

### How
- Rule-map by recommendation state + sport + recent hard-day density.
- Keep deterministic and bounded.

### Files (expected)
- `src/activity_recommendation.ts`
- `src/template.ts`
- `src/__tests__/activity_recommendation.test.ts`

### Acceptance
- Every non-rest state includes a concrete session archetype.

---

## 6) Recovery ETA

### Why
Time-to-readiness is more useful than static state labels.

### What
Estimate hours to target readiness zone:
- `eta_hours_to_balanced`
- `eta_hours_to_fresh` (optional)

### How
- Simple model from TSB + readiness trend + sleep deficit.
- Cap output range and mark low-confidence ETAs.

### Files (expected)
- `src/activity_recommendation.ts`
- `src/readiness_utils.ts`
- tests in recommendation/readiness suites

### Acceptance
- ETA present when enough input data exists; omitted otherwise.

---

## 7) Goal Modes

### Why
Different goals need different aggressiveness and recovery tolerance.

### What
Configurable mode:
- `build_fitness`
- `maintain`
- `fat_loss`
- `race_prep`

### How
- Add mode to config/env; default `maintain`.
- Adjust thresholds and session mappings by mode.

### Files (expected)
- `src/config.ts`
- `src/activity_recommendation.ts`
- `src/recommendations.ts`
- tests for threshold behavior per mode

### Acceptance
- Same inputs can produce different suggestions by selected goal mode.

---

## 8) Sport-Specific Thresholds

### Why
Running and cycling stress are not directly equivalent.

### What
Use sport-specific rule profiles:
- load ratio bounds
- hard-day density bounds
- readiness penalty multipliers

### How
- Select profile by current activity sport and trailing sport mix.
- Fallback to generic profile when unknown.

### Files (expected)
- `src/activity_recommendation.ts`
- `src/recommendations.ts`
- tests with run/cycle fixtures

### Acceptance
- Identical load values can yield different states by sport profile.

---

## 9) Rolling 7-Day Adaptive Plan

### Why
One-step recommendations do not guarantee weekly load coherence.

### What
Generate per-day plan skeleton with auto-adjust rules:
- session type
- intensity cap
- daily TSS guidance

### How
- Initialize with current state and weekly target.
- Recompute each day using new wellness/load inputs.

### Files (expected)
- `src/digest.ts`
- new `src/planning.ts`
- digest tests

### Acceptance
- Plan updates when readiness falls/rises; no stale weekly guidance.

---

## 10) Recommendation History + Backtesting

### Why
Need evidence that recommendations predict better next-day outcomes.

### What
Persist daily snapshot and score outcomes:
- recommendation state, causes, confidence
- next-day readiness delta, subjective success proxy
- hit-rate metrics by state

### How
- Append JSONL or compact JSON in `output/`.
- Add report command in digest summary.

### Files (expected)
- new `src/recommendation_history.ts`
- `src/digest.ts`
- tests for persistence and scoring

### Acceptance
- Backtest report shows hit rate and drift by state.

---

## Data Contract Additions (proposed)

`Recommendation` payload additions:
- `cause_codes: string[]`
- `confidence_factors: { coverage: number; agreement: number; stability: number }`
- `changes?: { state_changed: boolean; drivers: Array<{ key: string; delta: number; unit?: string }> }`
- `quality_flags?: string[]`
- `session?: { type: string; duration_min_range: [number, number]; tss_target_range?: [number, number] }`
- `eta_hours_to_balanced?: number`

All new fields optional at first to avoid template/runtime breakage.

---

## Test Strategy

- Keep deterministic unit tests for state machine and cause codes.
- Add fixture-based tests for trend deltas and quality penalties.
- Add snapshot tests for recommendation markdown section.
- Add output parity tests for `fast` and `analyze` when new fields are absent.

---

## Suggested Implementation Order

1. P0 items 1-4 (explainability first)
2. P1 items 5-8 (actionability and personalization)
3. P2 items 9-10 (planning and validation loop)

---

## Risks and Controls

- Risk: output churn -> Control: optional fields + fallback rendering.
- Risk: overfitting thresholds -> Control: small profile diffs + backtesting.
- Risk: noisy wellness data -> Control: quality flags and confidence penalties.

---

## Definition of Done (overall)

- Recommendation output explains state, cause, confidence, and deltas.
- Suggestions are actionable (session type + range), not just labels.
- Dashboard mirrors CLI recommendation context.
- New logic is covered by tests and does not regress existing deterministic behavior.

