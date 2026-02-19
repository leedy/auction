// Analyze auction timing patterns from current lots
import { fetchAllOpenLots } from './src/scraper.mjs';

async function main() {
  const result = await fetchAllOpenLots();

  // Group lots by time remaining to understand auction schedule
  const timeGroups = {};
  for (const lot of result.lots) {
    // Round to nearest day bucket
    const seconds = lot.timeLeftSeconds;
    const days = Math.floor(seconds / 86400);
    const label = days === 0 ? 'Under 24h' : `~${days}d left`;
    timeGroups[label] = (timeGroups[label] || 0) + 1;
  }

  console.log('\n--- Lots grouped by time remaining ---');
  const sorted = Object.entries(timeGroups).sort((a, b) => {
    const aNum = a[0] === 'Under 24h' ? 0 : parseInt(a[0].match(/\d+/)?.[0] || 0);
    const bNum = b[0] === 'Under 24h' ? 0 : parseInt(b[0].match(/\d+/)?.[0] || 0);
    return aNum - bNum;
  });
  for (const [label, count] of sorted) {
    console.log(`  ${label}: ${count} lots`);
  }

  // Check for distinct auction events (lot number ranges / time clusters)
  console.log('\n--- Distinct closing windows ---');
  const closingWindows = {};
  for (const lot of result.lots) {
    // Round timeLeftSeconds to nearest 6-hour window
    const hours = Math.round(lot.timeLeftSeconds / 3600);
    const dayLabel = Math.floor(hours / 24);
    const hourBucket = hours % 24 < 12 ? 'morning' : 'evening';
    const key = `Day +${dayLabel} ${hourBucket}`;
    if (!closingWindows[key]) closingWindows[key] = { count: 0, sampleTimeLeft: lot.timeLeft };
    closingWindows[key].count++;
  }
  for (const [window, info] of Object.entries(closingWindows).sort()) {
    console.log(`  ${window}: ${info.count} lots (e.g. "${info.sampleTimeLeft.trim()}")`);
  }
}

main().catch(console.error);
