// Evaluation management — Beaker writes assessments, user reviews them
import Evaluation from './models/Evaluation.mjs';

/**
 * Save Beaker's evaluation of a lot.
 * Upserts — safe to re-evaluate the same lot.
 *
 * Protection: If an evaluation already exists with interested=true and this
 * call tries to set interested=false, it will skip the overwrite. This prevents
 * automated keyword scans from un-flagging items that Beaker (or a manual edit)
 * already flagged. Flagging (interested=true) always goes through.
 */
export async function saveLotEvaluation({ lotId, auctionId, weekOf, title, description, url, image, highBid, bidCount, interested, confidence, category, reasoning, matchType }) {
  // Don't un-flag items that are already flagged
  if (!interested) {
    const existing = await Evaluation.findOne({ lotId, auctionId }).lean();
    if (existing?.interested) {
      console.error(`[evaluations] Preserving flag on lot ${lotId} — already marked as interested`);
      return existing;
    }
  }

  const evaluation = await Evaluation.findOneAndUpdate(
    { lotId, auctionId },
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
 * This is what the user sees.
 */
export async function getFlaggedLots(weekOf) {
  return Evaluation.find({ weekOf, interested: true })
    .sort({ confidence: 1, category: 1 }) // high confidence first (alphabetical: h < l < m)
    .lean();
}

/**
 * Get all evaluations for a week (flagged and skipped).
 */
export async function getAllEvaluations(weekOf) {
  return Evaluation.find({ weekOf }).sort({ interested: -1, category: 1 }).lean();
}

/**
 * Get lots that haven't been evaluated yet for a given week.
 * Compares lots collection against evaluations collection.
 */
export async function getUnevaluatedLots(weekOf) {
  const Lot = (await import('./models/Lot.mjs')).default;

  const allLots = await Lot.find({ weekOf }).lean();
  const evaluatedLotIds = new Set(
    (await Evaluation.find({ weekOf }, { lotId: 1 }).lean()).map((e) => e.lotId)
  );

  return allLots.filter((lot) => !evaluatedLotIds.has(lot.lotId));
}

/**
 * Record user feedback on a flagged item.
 */
export async function setUserFeedback(lotId, auctionId, feedback) {
  const valid = ['good_find', 'not_interested', 'already_knew'];
  if (!valid.includes(feedback)) {
    throw new Error(`Invalid feedback: "${feedback}". Must be one of: ${valid.join(', ')}`);
  }

  const evaluation = await Evaluation.findOneAndUpdate(
    { lotId, auctionId },
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
 * Get a summary of this week's evaluations (for Beaker to report).
 */
export async function getWeekSummary(weekOf) {
  const all = await Evaluation.find({ weekOf }).lean();
  const flagged = all.filter((e) => e.interested);
  const skipped = all.filter((e) => !e.interested);

  // Group flagged by category
  const byCategory = {};
  for (const e of flagged) {
    const cat = e.category || 'Uncategorized';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(e);
  }

  return {
    weekOf,
    totalEvaluated: all.length,
    totalFlagged: flagged.length,
    totalSkipped: skipped.length,
    byCategory,
    flagged,
  };
}
