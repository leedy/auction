// Test the full scrape → store flow
// Requires .env with MONGODB_URI set
import { loadEnv } from './src/env.mjs';
loadEnv();

import { connectDB, disconnectDB } from './src/db.mjs';
import { fetchThursdayAuction } from './src/scraper.mjs';
import { saveLots, getLotsByWeek, getStoredWeeks } from './src/store.mjs';

async function main() {
  console.log('=== Scrape & Store Test ===\n');

  // 1. Connect to MongoDB
  await connectDB();

  // 2. Scrape the Thursday auction
  const auction = await fetchThursdayAuction();

  if (auction.lots.length === 0) {
    console.log('\nNo Thursday auction lots found. Try running on a week when the auction is open.');
    await disconnectDB();
    return;
  }

  console.log(`\nScraped ${auction.lots.length} lots from auction ${auction.auctionId}`);
  console.log(`Closes: ${auction.bidCloseDateTime}\n`);

  // 3. Save to MongoDB
  const result = await saveLots(auction.lots, auction.fetchedAt);
  console.log(`\nInserted: ${result.inserted}`);
  console.log(`Updated:  ${result.updated}`);
  console.log(`Errors:   ${result.errors.length ? result.errors.join('; ') : 'none'}`);

  // 4. Verify — read back from Mongo
  const weeks = await getStoredWeeks();
  console.log(`\nStored weeks: ${weeks.join(', ')}`);

  const weekOf = auction.bidCloseDateTime?.split('T')[0];
  const storedLots = await getLotsByWeek(weekOf);
  console.log(`Lots stored for ${weekOf}: ${storedLots.length}`);

  // Show a few samples from Mongo
  console.log('\n--- Sample lots from MongoDB ---\n');
  for (const lot of storedLots.slice(0, 3)) {
    console.log(`  Lot #${lot.lotNumber}: ${lot.title}`);
    console.log(`    $${lot.highBid} high bid (${lot.bidCount} bids)`);
    console.log(`    URL: ${lot.url}`);
    console.log('');
  }

  // 5. Clean up
  await disconnectDB();
  console.log('=== Done ===');
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDB();
  process.exit(1);
});
