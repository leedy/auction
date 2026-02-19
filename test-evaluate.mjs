// Test the evaluation flow — simulates what Beaker will do
// Reads lots + interests from Mongo, does a simple keyword pre-scan,
// and saves evaluations
import { loadEnv } from './src/env.mjs';
loadEnv();

import { connectDB, disconnectDB } from './src/db.mjs';
import { getLotsByWeek } from './src/store.mjs';
import { getActiveInterests } from './src/interests.mjs';
import { saveBulkEvaluations, getFlaggedLots, getWeekSummary } from './src/evaluations.mjs';

/**
 * Simple keyword pre-scan — NOT the real evaluation.
 * Beaker will do proper AI reasoning. This just tests the data flow
 * and shows what a direct-match pass looks like.
 */
function preScreenLot(lot, interests) {
  const text = `${lot.title} ${lot.description}`.toLowerCase();

  for (const interest of interests) {
    // Check direct matches
    for (const keyword of interest.directMatches || []) {
      if (text.includes(keyword.toLowerCase())) {
        // Check red flags
        const hasRedFlag = (interest.avoid || []).some((flag) =>
          text.includes(flag.toLowerCase())
        );
        if (hasRedFlag) continue;

        // Check for confidence boosters
        const boosters = (interest.watchFor || []).filter((w) =>
          text.includes(w.toLowerCase())
        );
        const confidence = boosters.length >= 2 ? 'high' : boosters.length === 1 ? 'medium' : 'low';

        return {
          interested: true,
          confidence,
          category: interest.name,
          matchType: 'direct',
          reasoning: `Direct match on "${keyword}"${boosters.length ? ` + boosters: ${boosters.join(', ')}` : ''}`,
        };
      }
    }
  }

  return { interested: false, matchType: 'none', reasoning: 'No direct keyword match' };
}

async function main() {
  await connectDB();

  const weekOf = '2026-02-19';
  console.log(`=== Evaluation Test (week of ${weekOf}) ===\n`);

  // Load data
  const lots = await getLotsByWeek(weekOf);
  const interests = await getActiveInterests();
  console.log(`Lots: ${lots.length}`);
  console.log(`Active interests: ${interests.length}\n`);

  // Pre-screen all lots (keyword pass only)
  const evaluations = lots.map((lot) => {
    const result = preScreenLot(lot, interests);
    return {
      lotId: lot.lotId,
      auctionId: lot.auctionId,
      weekOf: lot.weekOf,
      title: lot.title,
      description: lot.description,
      url: lot.url,
      image: lot.image,
      highBid: lot.highBid,
      bidCount: lot.bidCount,
      ...result,
    };
  });

  // Save to Mongo
  const { saved, errors } = await saveBulkEvaluations(evaluations);
  console.log(`\nSaved: ${saved}, Errors: ${errors.length}`);

  // Show results
  const summary = await getWeekSummary(weekOf);
  console.log(`\n--- Week Summary ---`);
  console.log(`Total evaluated: ${summary.totalEvaluated}`);
  console.log(`Flagged: ${summary.totalFlagged}`);
  console.log(`Skipped: ${summary.totalSkipped}`);

  console.log(`\n--- Flagged by Category ---`);
  for (const [cat, items] of Object.entries(summary.byCategory)) {
    console.log(`\n  ${cat} (${items.length} items):`);
    for (const item of items) {
      console.log(`    [${item.confidence}] Lot #${item.title}`);
      console.log(`      $${item.highBid} (${item.bidCount} bids) — ${item.url}`);
      console.log(`      Reason: ${item.reasoning}`);
    }
  }

  await disconnectDB();
  console.log('\n=== Done ===');
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDB();
  process.exit(1);
});
