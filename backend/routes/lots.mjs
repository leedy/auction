import { Router } from 'express';
import { getLotsByWeek, getLotsByAuction, saveLots, updateFinalPrices } from '../../src/store.mjs';
import { fetchCurrentAuction, fetchFinalPrices, fetchLotPictures } from '../../src/scraper.mjs';
import Lot from '../../src/models/Lot.mjs';
import AuctionHouse from '../../src/models/AuctionHouse.mjs';
import { resolveAuctionHouse } from '../resolveAuctionHouse.mjs';
import { asyncHandler } from '../utils/asyncHandler.mjs';
import { HttpError } from '../utils/HttpError.mjs';
import { scrapeLimiter } from '../middleware/rateLimits.mjs';

const router = Router();

// POST /api/lots/scrape?ah=kleinfelters — fetch current auction from HiBid and save to DB
router.post('/scrape', scrapeLimiter, asyncHandler(async (req, res) => {
  const house = await resolveAuctionHouse(req.query.ah);
  if (!house) throw new HttpError(400, 'ah (auction house slug) query parameter is required');

  const auction = await fetchCurrentAuction({
    subdomain: house.subdomain,
    auctionDay: house.auctionDay,
    timezone: house.timezone,
  });
  if (!auction.lots || auction.lots.length === 0) {
    return res.json({ success: true, message: 'No open auction found', inserted: 0, updated: 0 });
  }

  const result = await saveLots(auction.lots, auction.fetchedAt, house._id);
  res.json({
    success: true,
    auctionId: auction.auctionId,
    auctionHouse: house.name,
    totalLots: auction.lots.length,
    inserted: result.inserted,
    updated: result.updated,
    weekOf: auction.lots[0]?.bidCloseDateTime
      ? new Date(auction.lots[0].bidCloseDateTime).toLocaleDateString('en-CA', { timeZone: house.timezone || 'America/New_York' })
      : null,
    errors: [...(auction.errors || []), ...(result.errors || [])],
  });
}));

// POST /api/lots/update-prices?weekOf=2026-03-19&ah=kleinfelters or ?auctionId=12345
router.post('/update-prices', scrapeLimiter, asyncHandler(async (req, res) => {
  const { weekOf, ah, auctionId: qAuctionId } = req.query;
  if (!weekOf && !qAuctionId) throw new HttpError(400, 'weekOf or auctionId query parameter is required');

  const house = await resolveAuctionHouse(ah);
  const lotFilter = {};
  if (qAuctionId) lotFilter.auctionId = Number(qAuctionId);
  else lotFilter.weekOf = weekOf;
  if (house) lotFilter.auctionHouseId = house._id;

  const sampleLot = await Lot.findOne(lotFilter);
  if (!sampleLot) throw new HttpError(404, 'No lots found');

  const subdomain = house?.subdomain
    || (await AuctionHouse.findById(sampleLot.auctionHouseId).lean())?.subdomain;
  if (!subdomain) throw new HttpError(400, 'Could not determine auction house subdomain');

  const auctionId = sampleLot.auctionId;
  const priceData = await fetchFinalPrices(auctionId, subdomain);

  if (priceData.lots.length === 0) {
    return res.json({ success: true, message: 'No price data returned from HiBid', updated: 0 });
  }

  const result = await updateFinalPrices(priceData.lots, auctionId);
  const withBids = priceData.lots.filter((l) => l.highBid > 0).length;
  res.json({
    success: true,
    auctionId,
    weekOf,
    totalLots: priceData.lots.length,
    withPrices: result.withPrices,
    withBids,
    updated: result.updated,
    source: priceData.source || 'archive',
    errors: [...(priceData.errors || []), ...(result.errors || [])],
  });
}));

// GET /api/lots?weekOf=2026-02-19&ah=kleinfelters or GET /api/lots?auctionId=12345
router.get('/', asyncHandler(async (req, res) => {
  const { weekOf, ah, auctionId } = req.query;
  if (!weekOf && !auctionId) throw new HttpError(400, 'weekOf or auctionId query parameter is required');
  if (auctionId) {
    const lots = await getLotsByAuction(Number(auctionId));
    return res.json(lots);
  }
  const house = await resolveAuctionHouse(ah);
  const lots = await getLotsByWeek(weekOf, house?._id);
  res.json(lots);
}));

// POST /api/lots/:lotId/fetch-photos
router.post('/:lotId/fetch-photos', scrapeLimiter, asyncHandler(async (req, res) => {
  const lotId = Number(req.params.lotId);
  const lot = await Lot.findOne({ lotId }).lean();
  if (!lot) throw new HttpError(404, 'Lot not found');

  const subdomain = (await AuctionHouse.findById(lot.auctionHouseId).lean())?.subdomain;
  if (!subdomain) throw new HttpError(400, 'Could not determine auction house subdomain');

  const pictures = await fetchLotPictures(lotId, lot.title, subdomain);
  await Lot.updateOne({ lotId }, { $set: { pictures } });

  res.json({ success: true, lotId, count: pictures.length, pictures });
}));

// GET /api/lots/:lotId — lot detail from Mongo
router.get('/:lotId', asyncHandler(async (req, res) => {
  const lotId = Number(req.params.lotId);
  const lot = await Lot.findOne({ lotId }).lean();
  if (!lot) throw new HttpError(404, 'Lot not found');
  res.json(lot);
}));

export default router;
