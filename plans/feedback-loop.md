# Feedback Loop for Interest Refinement

## Context
The AI evaluator flags too many items (~60 out of 828 lots). Users already mark flagged items as "Good Find", "Not Interested", or "Already Knew" via buttons on the Flagged page, but this feedback is stored and never used. We need to feed it back into future evaluation runs so the AI learns what the collector actually wants.

## Approach: Prompt-Based Feedback Digest

Inject a concise summary of past feedback into the evaluator prompt. No schema changes needed — all data already exists in MongoDB.

```
Current:   getInterestsAsPrompt() → buildBatchPrompt() → LLM
Proposed:  getInterestsAsPrompt() + getFeedbackDigest() → buildBatchPrompt() → LLM
```

## Steps

### 1. Create `src/feedback.mjs` — Feedback Aggregation Module

New module with two exports:

**`getFeedbackDigest(maxWeeks = 8)`** — returns a markdown string for prompt injection:
- Query evaluations with non-null `userFeedback` and `interested: true` (only items that were flagged and got feedback)
- Group by `category` (interest name), then by feedback type
- For each category: show accept/reject counts + up to 5 example titles per type
- Add a calibration hint: if reject rate > 60%, note "be more selective"; if accept rate > 70%, note "sensitivity is good"
- Target 300-500 tokens total. Return empty string if no feedback exists yet.

Output format the LLM sees:
```markdown
# Collector Feedback on Past Evaluations

## Vintage Cast Iron Cookware
- Accepted: 8 | Rejected: 12 | Already knew: 3
- Good finds: "Griswold #8 skillet", "Wagner Ware dutch oven"
- Rejected (do NOT flag similar): "Generic cast iron pan lot", "Modern Lodge skillet"
- Note: Collector is selective here — only flag branded/marked vintage pieces.

## Board Games
- Accepted: 4 | Rejected: 2
- Rejected: "Monopoly board game", "Trivial Pursuit"
```

**`getFeedbackStats()`** — returns raw JSON stats for the API endpoint (counts per category per feedback type).

### 2. Modify `src/evaluator.mjs` — Inject Feedback

- Import `getFeedbackDigest` from `./feedback.mjs`
- In `runEvaluation()`: call `getFeedbackDigest()` alongside `getInterestsAsPrompt()` (one-time per run, not per batch)
- Update `buildBatchPrompt(lots, interestPrompt, feedbackDigest)` to append the digest between interests and lots
- Add one line to `SYSTEM_PROMPT`: "If a Collector Feedback section is provided, use it to calibrate. Items similar to rejected examples should NOT be flagged."

### 3. Add API endpoint for visibility

In `backend/routes/evaluations.mjs`, add:
- `GET /api/evaluations/feedback-stats` — returns `getFeedbackStats()` JSON

This is optional/read-only but gives transparency into how feedback is being used.

## Files

| File | Action | Changes |
|------|--------|---------|
| `src/feedback.mjs` | CREATE | `getFeedbackDigest()`, `getFeedbackStats()` |
| `src/evaluator.mjs` | MODIFY | Import feedback, update `buildBatchPrompt` signature, add SYSTEM_PROMPT line |
| `backend/routes/evaluations.mjs` | MODIFY | Add GET /api/evaluations/feedback-stats |

No changes to: Evaluation schema, Interest schema, frontend, interests.mjs, or evaluations.mjs.

## Token Cost

- Current: ~4,800 tokens/batch (system + interests + 75 lots)
- With digest: ~5,100-5,300 tokens/batch (+6-10%)
- Acceptable tradeoff for significantly better accuracy

## Edge Cases

- **No feedback yet**: digest returns empty string, prompt unchanged — zero regression
- **Few items**: skip pattern hint if < 3 feedback items per category
- **Stale data**: maxWeeks=8 ages out old feedback naturally
- **Model mismatch**: feedback reflects collector preferences regardless of which model generated the evaluation

## Verification

1. Run evaluation with no feedback — confirm output unchanged (digest is empty string)
2. Give feedback on some flagged items (mark a few "not interested")
3. Run evaluation again — check backend logs that feedback digest is included in the prompt
4. Verify rejected patterns produce fewer flags in the same categories
5. Hit `GET /api/evaluations/feedback-stats` to confirm stats endpoint works

## Future Enhancement

A "Refine Interests" button on the Interests page that uses accumulated feedback to suggest profile updates (add to avoid[], refine directMatches). This would follow the `src/expander.mjs` pattern — LLM suggests changes, user approves. Separate effort after this lands.
