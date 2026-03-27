// Migration: Create initial Kleinfelter's auction house and tag existing data
import { loadEnv } from '../src/env.mjs';
loadEnv();

import { connectDB } from '../src/db.mjs';
import AuctionHouse from '../src/models/AuctionHouse.mjs';
import Lot from '../src/models/Lot.mjs';
import Evaluation from '../src/models/Evaluation.mjs';
import UserPick from '../src/models/UserPick.mjs';

async function migrate() {
  await connectDB();

  // Create Kleinfelter's auction house if not exists
  let house = await AuctionHouse.findOne({ slug: 'kleinfelters' });
  if (!house) {
    house = await AuctionHouse.create({
      slug: 'kleinfelters',
      name: "Kleinfelter's",
      subdomain: 'kleinfelters.hibid.com',
      auctionDay: 'Thursday',
      timezone: 'America/New_York',
    });
    console.log('Created auction house:', house.name, house._id);
  } else {
    console.log('Auction house already exists:', house.name, house._id);
  }

  const ahId = house._id;

  // Tag all existing lots
  const lotResult = await Lot.updateMany(
    { auctionHouseId: { $exists: false } },
    { $set: { auctionHouseId: ahId } }
  );
  console.log(`Lots: ${lotResult.modifiedCount} tagged with auctionHouseId`);

  // Tag all existing evaluations
  const evalResult = await Evaluation.updateMany(
    { auctionHouseId: { $exists: false } },
    { $set: { auctionHouseId: ahId } }
  );
  console.log(`Evaluations: ${evalResult.modifiedCount} tagged with auctionHouseId`);

  // Tag all existing picks
  const pickResult = await UserPick.updateMany(
    { auctionHouseId: { $exists: false } },
    { $set: { auctionHouseId: ahId } }
  );
  console.log(`UserPicks: ${pickResult.modifiedCount} tagged with auctionHouseId`);

  console.log('Migration complete.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
