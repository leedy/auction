import { Router } from 'express';
import { fetchAvailableAuctions, fetchAuctionLots } from '../../src/scraper.mjs';
import { saveLots } from '../../src/store.mjs';
import Auction from '../../src/models/Auction.mjs';
import { resolveAuctionHouse } from '../resolveAuctionHouse.mjs';
import { asyncHandler } from '../utils/asyncHandler.mjs';
import { HttpError } from '../utils/HttpError.mjs';
import { scrapeLimiter } from '../middleware/rateLimits.mjs';

const router = Router();

router.get('/available', asyncHandler(async (req, res) => {
  const house = await resolveAuctionHouse(req.query.ah);
  if (!house) throw new HttpError(400, 'ah (auction house slug) query parameter is required');

  const { auctions, errors } = await fetchAvailableAuctions(house.subdomain);

  const importedAuctions = await Auction.find({
    auctionId: { $in: auctions.map((a) => a.auctionId) },
  }).lean();
  const importedMap = {};
  for (const a of importedAuctions) {
    importedMap[a.auctionId] = a;
  }

  const merged = auctions.map((a) => {
    const db = importedMap[a.auctionId];
    return {
      ...a,
      imported: db?.imported || false,
      importedAt: db?.importedAt || null,
      dbLotCount: db?.lotCount || 0,
    };
  });

  res.json({ auctions: merged, errors });
}));

router.post('/import', scrapeLimiter, asyncHandler(async (req, res) => {
  const { auctionId, ah } = req.body;
  if (!auctionId || !ah) throw new HttpError(400, 'auctionId and ah are required');

  const house = await resolveAuctionHouse(ah);
  if (!house) throw new HttpError(404, `Auction house "${ah}" not found`);

  const result = await fetchAuctionLots(auctionId, house.subdomain);
  if (result.lots.length === 0) {
    return res.json({ success: true, message: 'No lots found for this auction', imported: 0 });
  }

  const storeResult = await saveLots(result.lots, result.fetchedAt, house._id);

  const lot = result.lots[0];
  await Auction.findOneAndUpdate(
    { auctionId },
    {
      auctionId,
      auctionHouseId: house._id,
      name: result.auctionName || `Auction ${auctionId}`,
      bidOpenDateTime: lot.bidOpenDateTime ? new Date(lot.bidOpenDateTime) : null,
      bidCloseDateTime: lot.bidCloseDateTime ? new Date(lot.bidCloseDateTime) : null,
      lotCount: result.lots.length,
      imported: true,
      importedAt: new Date(),
      isOnline: true,
    },
    { upsert: true, new: true }
  );

  res.json({
    success: true,
    auctionId,
    auctionName: result.auctionName,
    totalLots: result.lots.length,
    inserted: storeResult.inserted,
    updated: storeResult.updated,
    errors: [...(result.errors || []), ...(storeResult.errors || [])],
  });
}));

router.post('/archive-closed', scrapeLimiter, asyncHandler(async (req, res) => {
  const cutoff = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const result = await Auction.updateMany(
    { imported: true, archived: { $ne: true }, bidCloseDateTime: { $lt: cutoff } },
    { $set: { archived: true } }
  );
  res.json({ success: true, archived: result.modifiedCount });
}));

router.post('/unarchive-all', asyncHandler(async (req, res) => {
  if (req.query.confirm !== 'yes-unarchive-all') {
    throw new HttpError(400, 'destructive operation requires ?confirm=yes-unarchive-all');
  }
  const result = await Auction.updateMany(
    { archived: true },
    { $set: { archived: false } }
  );
  res.json({ success: true, restored: result.modifiedCount });
}));

router.get('/imported', asyncHandler(async (req, res) => {
  const house = await resolveAuctionHouse(req.query.ah);
  const filter = { imported: true, archived: { $ne: true } };
  if (house) filter.auctionHouseId = house._id;
  const auctions = await Auction.find(filter)
    .sort({ bidCloseDateTime: -1 })
    .populate('auctionHouseId', 'name slug')
    .lean();

  const result = auctions.map((a) => ({
    ...a,
    houseName: a.auctionHouseId?.name || 'Unknown',
    houseSlug: a.auctionHouseId?.slug || null,
  }));

  res.json(result);
}));

export default router;
