// Evaluation management — AI models and manual picks write assessments, user reviews them
import Evaluation from './models/Evaluation.mjs';

/**
 * Save an evaluation of a lot (from AI or manual).
 * Upserts by (lotId, auctionId, model) — safe to re-evaluate.
 *
 * Protection: If an evaluation already exists with interested=true for this
 * model and this call tries to set interested=false, it will skip the overwrite.
 */
export async function saveLotEvaluation({ lotId, auctionId, weekOf, title, description, url, image, highBid, bidCount, interested, confidence, category, reasoning, matchType, model }) {
  const modelKey = model || 'unknown';

  // Don't un-flag items that are already flagged for this model
  if (!interested) {
    const existing = await Evaluation.findOne({ lotId, auctionId, model: modelKey }).lean();
    if (existing?.interested) {
      console.error(`[evaluations] Preserving flag on lot ${lotId} (${modelKey}) — already marked as interested`);
      return existing;
    }
  }

  const evaluation = await Evaluation.findOneAndUpdate(
    { lotId, auctionId, model: modelKey },
    {
      lotId,
      auctionId,
      weekOf,
      title,
      description,
      url,
      image,
      highBid,
      bidCount,
      interested,
      confidence: confidence || 'medium',
      category: category || null,
      reasoning: reasoning || '',
      matchType: matchType || 'none',
      model: modelKey,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return evaluation.toObject();
}

/**
 * Bulk save evaluations. Returns { saved, errors }.
 */
export async function saveBulkEvaluations(evaluations) {
  let saved = 0;
  const errors = [];

  for (const eval_ of evaluations) {
    try {
      await saveLotEvaluation(eval_);
      saved++;
    } catch (err) {
      errors.push(`Lot ${eval_.lotId}: ${err.message}`);
    }
  }

  console.error(`[evaluations] Saved ${saved}, ${errors.length} errors`);
  return { saved, errors };
}

/**
 * Get all flagged items (interested: true) for a given week.
 * Optionally filter by model.
 */
const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };

export async function getFlaggedLots(weekOf, model) {
  const filter = { weekOf, interested: true };
  if (model) filter.model = model;
  const results = await Evaluation.find(filter).lean();
  results.sort((a, b) => {
    const confDiff = (CONFIDENCE_ORDER[a.confidence] ?? 3) - (CONFIDENCE_ORDER[b.confidence] ?? 3);
    if (confDiff !== 0) return confDiff;
    return (a.category || '').localeCompare(b.category || '');
  });

  // When showing all sources, deduplicate by lotId — keep the highest-confidence
  // evaluation and note which models flagged it
  if (!model) {
    const byLot = new Map();
    for (const item of results) {
      const existing = byLot.get(item.lotId);
      if (!existing) {
        byLot.set(item.lotId, { ...item, models: [item.model] });
      } else {
        existing.models.push(item.model);
        // Replace if this one has higher confidence
        const existingRank = CONFIDENCE_ORDER[existing.confidence] ?? 3;
        const itemRank = CONFIDENCE_ORDER[item.confidence] ?? 3;
        if (itemRank < existingRank) {
          const models = existing.models;
          byLot.set(item.lotId, { ...item, models });
        }
      }
    }
    return [...byLot.values()];
  }

  return results;
}

/**
 * Get all evaluations for a week (flagged and skipped).
 * Optionally filter by model.
 */
export async function getAllEvaluations(weekOf, model) {
  const filter = { weekOf };
  if (model) filter.model = model;
  return Evaluation.find(filter).sort({ interested: -1, category: 1 }).lean();
}

/**
 * Get distinct models that have evaluations for a week.
 */
export async function getModelsForWeek(weekOf) {
  return Evaluation.distinct('model', { weekOf });
}

/**
 * Get lots that haven't been evaluated yet for a given week by a specific model.
 */
export async function getUnevaluatedLots(weekOf, model) {
  const Lot = (await import('./models/Lot.mjs')).default;

  const filter = { weekOf };
  if (model) filter.model = model;
  const evaluatedLotIds = (await Evaluation.find(filter, { lotId: 1 }).lean()).map((e) => e.lotId);
  return Lot.find({ weekOf, lotId: { $nin: evaluatedLotIds } }).lean();
}

/**
 * Record user feedback on a flagged item.
 * Model is required to target the correct evaluation.
 */
export async function setUserFeedback(lotId, auctionId, feedback, model) {
  const valid = ['good_find', 'not_interested', 'already_knew'];
  if (!valid.includes(feedback)) {
    throw new Error(`Invalid feedback: "${feedback}". Must be one of: ${valid.join(', ')}`);
  }

  const filter = { lotId, auctionId };
  if (model) filter.model = model;
  const evaluation = await Evaluation.findOneAndUpdate(
    filter,
    { $set: { userFeedback: feedback } },
    { new: true }
  );

  if (!evaluation) {
    throw new Error(`No evaluation found for lot ${lotId} in auction ${auctionId}`);
  }

  console.error(`[evaluations] Feedback for lot ${lotId}: ${feedback}`);
  return evaluation.toObject();
}

/**
 * Get a summary of this week's evaluations.
 * Optionally filter by model.
 */
export async function getWeekSummary(weekOf, model) {
  const filter = { weekOf };
  if (model) filter.model = model;
  const all = await Evaluation.find(filter).lean();
  const flagged = all.filter((e) => e.interested);
  const skipped = all.filter((e) => !e.interested);

  // When showing all sources, deduplicate counts by lotId
  let uniqueFlagged = flagged;
  let uniqueEvaluated = all;
  if (!model) {
    const seenFlagged = new Set();
    uniqueFlagged = flagged.filter((e) => {
      if (seenFlagged.has(e.lotId)) return false;
      seenFlagged.add(e.lotId);
      return true;
    });
    const seenAll = new Set();
    uniqueEvaluated = all.filter((e) => {
      if (seenAll.has(e.lotId)) return false;
      seenAll.add(e.lotId);
      return true;
    });
  }

  // Group flagged by category
  const byCategory = {};
  for (const e of uniqueFlagged) {
    const cat = e.category || 'Uncategorized';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(e);
  }

  return {
    weekOf,
    totalEvaluated: uniqueEvaluated.length,
    totalFlagged: uniqueFlagged.length,
    totalSkipped: uniqueEvaluated.length - uniqueFlagged.length,
    byCategory,
    flagged: uniqueFlagged,
  };
}
