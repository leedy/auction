// Storage layer — saves scraped lots to MongoDB
import Lot from './models/Lot.mjs';

/**
 * Save an array of scraped lots to MongoDB.
 * Uses upsert so re-running the same week updates bid data without duplicating.
 * Returns { inserted, updated, errors }
 */
export async function saveLots(lots, fetchedAt) {
  let inserted = 0;
  let updated = 0;
  const errors = [];

  for (const lot of lots) {
    // weekOf is the close date in YYYY-MM-DD format for easy grouping
    const weekOf = lot.bidCloseDateTime
      ? lot.bidCloseDateTime.split('T')[0]
      : null;

    try {
      const result = await Lot.findOneAndUpdate(
        { lotId: lot.lotId, auctionId: lot.auctionId },
        {
          ...lot,
          fetchedAt: new Date(fetchedAt),
          weekOf,
          bidOpenDateTime: lot.bidOpenDateTime ? new Date(lot.bidOpenDateTime) : null,
          bidCloseDateTime: lot.bidCloseDateTime ? new Date(lot.bidCloseDateTime) : null,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // If createdAt and updatedAt are the same, it was just inserted
      if (result.createdAt?.getTime() === result.updatedAt?.getTime()) {
        inserted++;
      } else {
        updated++;
      }
    } catch (err) {
      errors.push(`Lot ${lot.lotId}: ${err.message}`);
    }
  }

  console.error(`[store] Saved ${inserted} new, ${updated} updated, ${errors.length} errors`);
  return { inserted, updated, errors };
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
