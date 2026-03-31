// AI Lot Evaluator — batch-evaluates auction lots against collector interest profiles
import { jsonCompletion, getLLMConfig, getConfigForModel } from './llm.mjs';
import { getInterestsAsPrompt } from './interests.mjs';
import { getUnevaluatedLots, saveBulkEvaluations } from './evaluations.mjs';
import { getEnabledModels } from './settings.mjs';

const BATCH_SIZE_CLOUD = 75;
const BATCH_SIZE_LOCAL = 15;
const TIMEOUT_CLOUD = 180_000;   // 3 min
const TIMEOUT_LOCAL = 600_000;   // 10 min

function isLocalModel(modelConfig) {
  if (!modelConfig) return false;
  const url = modelConfig.baseUrl || '';
  return url.includes('localhost') || url.includes('11434') || url.includes('192.168.') || url.includes('10.0.');
}

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
  auctionId: null,
  totalLots: 0,
  totalBatches: 0,
  batchesCompleted: 0,
  lotsProcessed: 0,
  flaggedCount: 0,
  errors: [],
  startedAt: null,
  completedAt: null,
  model: null,
  currentBatchSize: 0,
  currentBatchStartedAt: null,
  batchSize: 0,
  lotsPerMinute: null,
};

function resetState(weekOf, auctionId) {
  _state = {
    status: 'running',
    weekOf,
    auctionId: auctionId || null,
    totalLots: 0,
    totalBatches: 0,
    batchesCompleted: 0,
    lotsProcessed: 0,
    flaggedCount: 0,
    errors: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
    model: null,
    currentBatchSize: 0,
    currentBatchStartedAt: null,
    batchSize: 0,
    lotsPerMinute: null,
  };
}

let _cancelled = false;

/**
 * Get current evaluation status.
 */
export function getEvaluationStatus() {
  return { ..._state };
}

/**
 * Cancel the running evaluation. It will stop after the current batch finishes.
 */
export function cancelEvaluation() {
  if (_state.status !== 'running') return false;
  _cancelled = true;
  _state.status = 'cancelling';
  console.error('[evaluator] Cancellation requested — will stop after current batch');
  return true;
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
 * @param {object} [modelConfig] — per-model config { baseUrl, apiKey, model }
 */
async function evaluateBatch(lots, interestPrompt, modelOverride, modelConfig) {
  const userMessage = buildBatchPrompt(lots, interestPrompt);
  const local = isLocalModel(modelConfig);

  const options = {
    temperature: 0.2,
    maxTokens: 8192,
    timeout: local ? TIMEOUT_LOCAL : TIMEOUT_CLOUD,
  };

  if (modelConfig) {
    options.config = modelConfig;
    options.model = modelConfig.model;
  } else if (modelOverride) {
    options.model = modelOverride;
  }

  const result = await jsonCompletion([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ], options);

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
 * Run a single model's evaluation. Internal helper.
 */
async function runSingleModel(weekOf, modelName, auctionHouseId, interestPrompt, auctionId, modelConfig) {
  _state.model = modelName;

  const lots = await getUnevaluatedLots(weekOf, modelName, auctionHouseId, auctionId);
  if (lots.length === 0) {
    console.error(`[evaluator] No unevaluated lots for model "${modelName}"`);
    return;
  }

  const local = isLocalModel(modelConfig);
  const batchSize = local ? BATCH_SIZE_LOCAL : BATCH_SIZE_CLOUD;
  const batches = [];
  for (let i = 0; i < lots.length; i += batchSize) {
    batches.push(lots.slice(i, i + batchSize));
  }

  _state.totalBatches += batches.length;
  _state.totalLots += lots.length;
  _state.batchSize = batchSize;

  console.error(`[evaluator] Starting ${modelName}: ${lots.length} lots in ${batches.length} batches of ${batchSize}`);

  for (let i = 0; i < batches.length; i++) {
    if (_cancelled) {
      console.error(`[evaluator] ${modelName} cancelled at batch ${i + 1}/${batches.length}`);
      return;
    }

    const batch = batches[i];
    const batchStart = Date.now();
    _state.currentBatchSize = batch.length;
    _state.currentBatchStartedAt = new Date(batchStart).toISOString();

    try {
      console.error(`[evaluator] ${modelName} batch ${i + 1}/${batches.length} (${batch.length} lots)...`);
      const result = await evaluateBatch(batch, interestPrompt, modelName, modelConfig);

      if (result.model) {
        _state.model = result.model;
      }

      const saveResult = await saveBulkEvaluations(result.evaluations);
      const batchFlagged = result.evaluations.filter((e) => e.interested).length;
      const batchElapsed = (Date.now() - batchStart) / 1000;

      _state.batchesCompleted += 1;
      _state.lotsProcessed += result.evaluations.length;
      _state.flaggedCount += batchFlagged;

      // Calculate lots/minute from total elapsed
      const totalElapsed = (Date.now() - new Date(_state.startedAt).getTime()) / 60000;
      _state.lotsPerMinute = totalElapsed > 0 ? Math.round((_state.lotsProcessed / totalElapsed) * 10) / 10 : null;

      console.error(`[evaluator] ${modelName} batch ${i + 1} done: ${saveResult.saved} saved, ${batchFlagged} flagged (${batchElapsed.toFixed(1)}s, ${_state.lotsPerMinute} lots/min)`);
    } catch (err) {
      console.error(`[evaluator] ${modelName} batch ${i + 1} failed:`, err.message);
      _state.errors.push(`${modelName} batch ${i + 1}: ${err.message}`);
      _state.batchesCompleted += 1;
    }
  }
  _state.currentBatchSize = 0;
  _state.currentBatchStartedAt = null;
}

/**
 * Run AI evaluation for a week. Accepts a single model or array of models.
 * When given multiple models, runs them sequentially.
 * Now uses per-model config from the models array in settings.
 */
export async function runEvaluation(weekOf, modelOverride, auctionHouseId, auctionId) {
  if (_state.status === 'running') {
    throw new Error('Evaluation already running');
  }

  resetState(weekOf, auctionId);
  _cancelled = false;

  try {
    const interestPrompt = await getInterestsAsPrompt();
    if (interestPrompt.includes('No collector interests')) {
      throw new Error('No active interests defined. Add interests before running evaluation.');
    }

    // Build model list: use per-model configs from settings when available
    const enabledModels = await getEnabledModels();

    if (modelOverride) {
      // Explicit model override — match against configured models for config, or use default
      const overrideList = Array.isArray(modelOverride) ? modelOverride : [modelOverride];

      console.error(`[evaluator] Running evaluation for ${overrideList.length} model(s): ${overrideList.join(', ')}`);

      for (const modelName of overrideList) {
        const configured = enabledModels.find((m) => m.modelId === modelName);
        const config = configured ? getConfigForModel(configured) : null;
        await runSingleModel(weekOf, modelName, auctionHouseId, interestPrompt, auctionId, config);
      }
    } else if (enabledModels.length > 0) {
      // Use all enabled models from settings
      console.error(`[evaluator] Running evaluation for ${enabledModels.length} enabled model(s): ${enabledModels.map((m) => m.modelId).join(', ')}`);

      for (const modelEntry of enabledModels) {
        const config = getConfigForModel(modelEntry);
        await runSingleModel(weekOf, modelEntry.modelId, auctionHouseId, interestPrompt, auctionId, config);
      }
    } else {
      // Fallback to legacy config
      const llmConfig = await getLLMConfig();
      const modelName = llmConfig?.model || 'unknown';
      console.error(`[evaluator] Running evaluation with legacy config: ${modelName}`);
      await runSingleModel(weekOf, modelName, auctionHouseId, interestPrompt, auctionId, null);
    }

    if (_cancelled) {
      _state.status = 'cancelled';
      _state.completedAt = new Date().toISOString();
      _cancelled = false;
      console.error(`[evaluator] Cancelled: ${_state.lotsProcessed} lots processed, ${_state.flaggedCount} flagged before cancellation`);
    } else {
      _state.status = 'completed';
      _state.completedAt = new Date().toISOString();
      console.error(`[evaluator] Done: ${_state.lotsProcessed} lots, ${_state.flaggedCount} flagged, ${_state.errors.length} errors`);
    }
  } catch (err) {
    _state.status = 'error';
    _state.errors.push(err.message);
    _state.completedAt = new Date().toISOString();
    console.error(`[evaluator] Failed:`, err.message);
  }
}
