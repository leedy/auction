// Migration: Create Auction records for existing imported lot data
import { loadEnv } from '../src/env.mjs';
loadEnv();

import { connectDB } from '../src/db.mjs';
import Lot from '../src/models/Lot.mjs';
import Auction from '../src/models/Auction.mjs';

async function migrate() {
  await connectDB();

  // Group existing lots by auctionId to create Auction records
  const groups = await Lot.aggregate([
    { $group: {
      _id: '$auctionId',
      auctionHouseId: { $first: '$auctionHouseId' },
      bidOpenDateTime: { $min: '$bidOpenDateTime' },
      bidCloseDateTime: { $max: '$bidCloseDateTime' },
      lotCount: { $sum: 1 },
    }},
  ]);

  console.log(`Found ${groups.length} distinct auctions in lot data`);

  let created = 0;
  let skipped = 0;
  for (const group of groups) {
    if (!group._id) continue;

    const existing = await Auction.findOne({ auctionId: group._id });
    if (existing) {
      skipped++;
      continue;
    }

    // Derive a name from the close date
    const closeDate = group.bidCloseDateTime
      ? new Date(group.bidCloseDateTime).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
      : 'Unknown Date';

    await Auction.create({
      auctionId: group._id,
      auctionHouseId: group.auctionHouseId,
      name: `${closeDate} Auction`,
      bidOpenDateTime: group.bidOpenDateTime,
      bidCloseDateTime: group.bidCloseDateTime,
      lotCount: group.lotCount,
      imported: true,
      importedAt: new Date(),
      isOnline: true,
    });
    created++;
  }

  console.log(`Created ${created} Auction records, ${skipped} already existed`);
  console.log('Migration complete.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
