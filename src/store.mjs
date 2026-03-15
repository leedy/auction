// Storage layer — saves scraped lots to MongoDB
import Lot from './models/Lot.mjs';

/**
 * Save an array of scraped lots to MongoDB.
 * Uses upsert so re-running the same week updates bid data without duplicating.
 * Returns { inserted, updated, errors }
 */
export async function saveLots(lots, fetchedAt) {
  const errors = [];

  const ops = lots.map((lot) => {
    const weekOf = lot.bidCloseDateTime
      ? lot.bidCloseDateTime.split('T')[0]
      : null;

    return {
      updateOne: {
        filter: { lotId: lot.lotId, auctionId: lot.auctionId },
        update: {
          $set: {
            ...lot,
            fetchedAt: new Date(fetchedAt),
            weekOf,
            bidOpenDateTime: lot.bidOpenDateTime ? new Date(lot.bidOpenDateTime) : null,
            bidCloseDateTime: lot.bidCloseDateTime ? new Date(lot.bidCloseDateTime) : null,
          },
        },
        upsert: true,
      },
    };
  });

  if (ops.length === 0) {
    console.error('[store] No lots to save');
    return { inserted: 0, updated: 0, errors };
  }

  try {
    const result = await Lot.bulkWrite(ops, { ordered: false });
    const inserted = result.upsertedCount || 0;
    const updated = result.modifiedCount || 0;
    console.error(`[store] Saved ${inserted} new, ${updated} updated, ${errors.length} errors`);
    return { inserted, updated, errors };
  } catch (err) {
    // BulkWriteError still processes successful ops
    if (err.result) {
      const inserted = err.result.upsertedCount || 0;
      const updated = err.result.modifiedCount || 0;
      for (const writeErr of err.writeErrors || []) {
        errors.push(`Lot index ${writeErr.index}: ${writeErr.errmsg}`);
      }
      console.error(`[store] Saved ${inserted} new, ${updated} updated, ${errors.length} errors`);
      return { inserted, updated, errors };
    }
    throw err;
  }
}

/**
 * Get all lots for a given week (by close date string, e.g. "2026-02-19").
 */
export async function getLotsByWeek(weekOf) {
  return Lot.find({ weekOf }).sort({ lotNumber: 1 }).lean();
}

/**
 * Get distinct weekOf values we have stored.
 */
export async function getStoredWeeks() {
  return Lot.distinct('weekOf');
}
