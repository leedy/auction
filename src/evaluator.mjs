// AI Lot Evaluator — batch-evaluates auction lots against collector interest profiles
import { jsonCompletion, getLLMConfig } from './llm.mjs';
import { getInterestsAsPrompt } from './interests.mjs';
import { getUnevaluatedLots, saveBulkEvaluations } from './evaluations.mjs';

const BATCH_SIZE = 75;

const SYSTEM_PROMPT = `You are an auction lot evaluator for a collector. You will receive a list of auction lots and a collector interest profile. For each lot, determine whether it matches any of the collector's interests.

Respond with a JSON object containing an "evaluations" array. Each element must have these fields:
- lotId (number) — the lot's ID, copied exactly from input
- interested (boolean) — true only if this lot genuinely matches a collector interest
- confidence ("high" | "medium" | "low") — how certain you are
- category (string | null) — which interest profile matched (use the exact interest name), null if not interested
- reasoning (string) — 1-2 sentence explanation the collector will read
- matchType ("direct" | "semantic" | "none") — "direct" if a keyword from directMatches appears in the title/description, "semantic" if the match requires understanding context, "none" if not interested

Guidelines:
- Most lots will NOT match. Be selective — only flag items the collector would genuinely want to know about.
- Use "high" confidence only for unambiguous matches (e.g., a lot explicitly names a collected brand or item).
- Use "semantic" matchType when the lot doesn't contain exact keywords but context strongly suggests a match.
- Keep reasoning concise and specific — the collector sees this in the UI.
- Every lot in the input MUST appear in your output array.`;

// In-memory evaluation state
let _state = {
  status: 'idle',
  weekOf: null,
  totalLots: 0,
  totalBatches: 0,
  batchesCompleted: 0,
  lotsProcessed: 0,
  flaggedCount: 0,
  errors: [],
  startedAt: null,
  completedAt: null,
  model: null,
};

function resetState(weekOf) {
  _state = {
    status: 'running',
    weekOf,
    totalLots: 0,
    totalBatches: 0,
    batchesCompleted: 0,
    lotsProcessed: 0,
    flaggedCount: 0,
    errors: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
    model: null,
  };
}

/**
 * Get current evaluation status.
 */
export function getEvaluationStatus() {
  return { ..._state };
}

/**
 * Build the user message for a batch of lots.
 */
function buildBatchPrompt(lots, interestPrompt) {
  const lotEntries = lots.map((lot, i) =>
    `## Lot ${i + 1}\n- lotId: ${lot.lotId}\n- auctionId: ${lot.auctionId}\n- title: ${lot.title}\n- description: ${lot.description || '(none)'}\n- currentBid: $${lot.highBid || 0}\n- bidCount: ${lot.bidCount || 0}`
  ).join('\n\n');

  return `${interestPrompt}\n\n---\n\n# Auction Lots to Evaluate\n\n${lotEntries}\n\nEvaluate all ${lots.length} lots. Return JSON with an "evaluations" array.`;
}

/**
 * Evaluate a single batch of lots.
 */
async function evaluateBatch(lots, interestPrompt, modelOverride) {
  const userMessage = buildBatchPrompt(lots, interestPrompt);

  const result = await jsonCompletion([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ], {
    temperature: 0.2,
    maxTokens: 8192,
    timeout: 180_000,
    model: modelOverride || undefined,
  });

  const evaluations = result.data?.evaluations || result.data;
  if (!Array.isArray(evaluations)) {
    throw new Error('LLM response missing evaluations array');
  }

  // Build a lookup for lot data to enrich evaluations
  const lotMap = new Map(lots.map((l) => [l.lotId, l]));

  const enriched = evaluations
    .filter((e) => e && typeof e.lotId === 'number')
    .map((e) => {
      const lot = lotMap.get(e.lotId);
      if (!lot) return null;
      return {
        lotId: e.lotId,
        auctionId: lot.auctionId,
        auctionHouseId: lot.auctionHouseId,
        weekOf: lot.weekOf,
        title: lot.title,
        description: lot.description || '',
        url: lot.url || '',
        image: lot.image || '',
        highBid: lot.highBid || 0,
        bidCount: lot.bidCount || 0,
        interested: !!e.interested,
        confidence: ['high', 'medium', 'low'].includes(e.confidence) ? e.confidence : 'medium',
        category: e.category || null,
        reasoning: e.reasoning || '',
        matchType: ['direct', 'semantic', 'none'].includes(e.matchType) ? e.matchType : 'none',
        model: result.model,
      };
    })
    .filter(Boolean);

  if (enriched.length < lots.length) {
    console.error(`[evaluator] Warning: LLM returned ${enriched.length}/${lots.length} valid evaluations`);
  }

  return { evaluations: enriched, model: result.model };
}

/**
 * Run AI evaluation for a week. Gets unevaluated lots for the current model
 * and processes them in batches.
 */
export async function runEvaluation(weekOf, modelOverride, auctionHouseId) {
  if (_state.status === 'running') {
    throw new Error('Evaluation already running');
  }

  resetState(weekOf);

  try {
    // Resolve which model we'll be using
    const llmConfig = await getLLMConfig();
    const modelName = modelOverride || llmConfig?.model || 'unknown';
    _state.model = modelName;

    // Load interest prompt
    const interestPrompt = await getInterestsAsPrompt();
    if (interestPrompt.includes('No collector interests')) {
      throw new Error('No active interests defined. Add interests before running evaluation.');
    }

    // Get lots not yet evaluated by THIS model
    const lots = await getUnevaluatedLots(weekOf, modelName, auctionHouseId);
    if (lots.length === 0) {
      _state.status = 'completed';
      _state.completedAt = new Date().toISOString();
      console.error(`[evaluator] No unevaluated lots for model "${modelName}" in week ${weekOf}`);
      return;
    }

    // Chunk into batches
    const batches = [];
    for (let i = 0; i < lots.length; i += BATCH_SIZE) {
      batches.push(lots.slice(i, i + BATCH_SIZE));
    }

    _state.totalLots = lots.length;
    _state.totalBatches = batches.length;

    console.error(`[evaluator] Starting evaluation: ${lots.length} lots in ${batches.length} batches for week ${weekOf} using ${modelName}`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        console.error(`[evaluator] Batch ${i + 1}/${batches.length} (${batch.length} lots)...`);
        const result = await evaluateBatch(batch, interestPrompt, modelOverride);

        // Update model from actual LLM response (may differ from config name)
        if (result.model) {
          _state.model = result.model;
        }

        // Save to DB
        const saveResult = await saveBulkEvaluations(result.evaluations);
        const batchFlagged = result.evaluations.filter((e) => e.interested).length;

        _state.batchesCompleted = i + 1;
        _state.lotsProcessed += result.evaluations.length;
        _state.flaggedCount += batchFlagged;

        console.error(`[evaluator] Batch ${i + 1} done: ${saveResult.saved} saved, ${batchFlagged} flagged`);
      } catch (err) {
        console.error(`[evaluator] Batch ${i + 1} failed:`, err.message);
        _state.errors.push(`Batch ${i + 1}: ${err.message}`);
        _state.batchesCompleted = i + 1;
      }
    }

    _state.status = 'completed';
    _state.completedAt = new Date().toISOString();
    console.error(`[evaluator] Done: ${_state.lotsProcessed} lots, ${_state.flaggedCount} flagged, ${_state.errors.length} errors`);
  } catch (err) {
    _state.status = 'error';
    _state.errors.push(err.message);
    _state.completedAt = new Date().toISOString();
    console.error(`[evaluator] Failed:`, err.message);
  }
}
