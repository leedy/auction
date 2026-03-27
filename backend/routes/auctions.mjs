import { Router } from 'express';
import { fetchAvailableAuctions, fetchAuctionLots } from '../../src/scraper.mjs';
import { saveLots } from '../../src/store.mjs';
import Auction from '../../src/models/Auction.mjs';
import { resolveAuctionHouse } from '../resolveAuctionHouse.mjs';

const router = Router();

// GET /api/auctions/available?ah=kleinfelters — fetch available auctions from HiBid
router.get('/available', async (req, res) => {
  try {
    const house = await resolveAuctionHouse(req.query.ah);
    if (!house) {
      return res.status(400).json({ error: 'ah (auction house slug) query parameter is required' });
    }

    const { auctions, errors } = await fetchAvailableAuctions(house.subdomain);

    // Merge with import status from DB
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
  } catch (err) {
    console.error('[auctions] Available fetch failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auctions/import — import a specific auction's lots
router.post('/import', async (req, res) => {
  try {
    const { auctionId, ah } = req.body;
    if (!auctionId || !ah) {
      return res.status(400).json({ error: 'auctionId and ah are required' });
    }

    const house = await resolveAuctionHouse(ah);
    if (!house) {
      return res.status(404).json({ error: `Auction house "${ah}" not found` });
    }

    const result = await fetchAuctionLots(auctionId, house.subdomain);
    if (result.lots.length === 0) {
      return res.json({ success: true, message: 'No lots found for this auction', imported: 0 });
    }

    const storeResult = await saveLots(result.lots, result.fetchedAt, house._id);

    // Create/update Auction record
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
  } catch (err) {
    console.error('[auctions] Import failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auctions/imported?ah=kleinfelters — list imported auctions
router.get('/imported', async (req, res) => {
  try {
    const house = await resolveAuctionHouse(req.query.ah);
    const filter = { imported: true };
    if (house) filter.auctionHouseId = house._id;
    const auctions = await Auction.find(filter)
      .sort({ bidCloseDateTime: -1 })
      .populate('auctionHouseId', 'name slug')
      .lean();

    // Add house name for display
    const result = auctions.map((a) => ({
      ...a,
      houseName: a.auctionHouseId?.name || 'Unknown',
      houseSlug: a.auctionHouseId?.slug || null,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
