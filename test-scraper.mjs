// Test the scraper module end-to-end
import { fetchAllOpenLots } from './src/scraper.mjs';

async function main() {
  console.log('=== Scraper Test ===\n');

  const result = await fetchAllOpenLots();

  console.log(`\n--- Summary ---`);
  console.log(`Total lots reported: ${result.totalCount}`);
  console.log(`Lots fetched:        ${result.lots.length}`);
  console.log(`Pages:               ${result.pages}`);
  console.log(`Fetched at:          ${result.fetchedAt}`);
  console.log(`Errors:              ${result.errors.length ? result.errors.join('; ') : 'none'}`);

  // Show first 5 lots as a sample
  console.log(`\n--- Sample Lots (first 5) ---\n`);
  for (const lot of result.lots.slice(0, 5)) {
    console.log(`  Lot #${lot.lotNumber}: ${lot.title}`);
    console.log(`    $${lot.highBid} high bid (${lot.bidCount} bids) — min $${lot.minBid}`);
    console.log(`    Time left: ${lot.timeLeft}`);
    console.log(`    URL: ${lot.url}`);
    if (lot.description) {
      console.log(`    Desc: ${lot.description.substring(0, 100)}${lot.description.length > 100 ? '...' : ''}`);
    }
    console.log('');
  }

  // Show last 3 lots to confirm pagination reached the end
  console.log(`--- Last 3 Lots (confirming full pagination) ---\n`);
  for (const lot of result.lots.slice(-3)) {
    console.log(`  Lot #${lot.lotNumber}: ${lot.title}`);
    console.log(`    $${lot.highBid} high bid (${lot.bidCount} bids)`);
    console.log('');
  }
}

main().catch(console.error);
