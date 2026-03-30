import { Router } from 'express';
import { getLotsByWeek, getLotsByAuction, saveLots, updateFinalPrices } from '../../src/store.mjs';
import { fetchCurrentAuction, fetchFinalPrices } from '../../src/scraper.mjs';
import Lot from '../../src/models/Lot.mjs';
import AuctionHouse from '../../src/models/AuctionHouse.mjs';
import { resolveAuctionHouse } from '../resolveAuctionHouse.mjs';

const router = Router();

/**
 * Fetch pictures for a specific lot from HiBid GraphQL.
 */
const LOT_PICTURES_QUERY = `query LotPictures($searchText: String, $pageLength: Int!, $isArchive: Boolean = false) {
  lotSearch(
    input: { searchText: $searchText, isArchive: $isArchive }
    pageNumber: 1
    pageLength: $pageLength
  ) {
    pagedResults {
      results {
        id
        pictures {
          fullSizeLocation
          thumbnailLocation
          description
        }
      }
    }
  }
}`;

async function searchLotPictures(searchWords, lotId, isArchive, subdomain) {
  const url = `https://${subdomain}/graphql`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'SITE_SUBDOMAIN': subdomain,
    },
    body: JSON.stringify({
      query: LOT_PICTURES_QUERY,
      variables: { searchText: searchWords, pageLength: 20, isArchive },
    }),
  });
  const json = await res.json();
  const results = json?.data?.lotSearch?.pagedResults?.results || [];
  const match = results.find((r) => r.id === lotId);
  return match?.pictures || [];
}

async function fetchLotPictures(lotId, title, subdomain) {
  const searchWords = (title || '').split(/\s+/).slice(0, 3).join(' ');
  const pictures = await searchLotPictures(searchWords, lotId, false, subdomain);
  if (pictures.length) return pictures;
  return searchLotPictures(searchWords, lotId, true, subdomain);
}

// POST /api/lots/scrape?ah=kleinfelters — fetch current auction from HiBid and save to DB
router.post('/scrape', async (req, res) => {
  try {
    const house = await resolveAuctionHouse(req.query.ah);
    if (!house) {
      return res.status(400).json({ error: 'ah (auction house slug) query parameter is required' });
    }

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
  } catch (err) {
    console.error('[lots] Scrape failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lots/update-prices?weekOf=2026-03-19&ah=kleinfelters or ?auctionId=12345
router.post('/update-prices', async (req, res) => {
  try {
    const { weekOf, ah, auctionId: qAuctionId } = req.query;
    if (!weekOf && !qAuctionId) {
      return res.status(400).json({ error: 'weekOf or auctionId query parameter is required' });
    }

    const house = await resolveAuctionHouse(ah);
    const lotFilter = {};
    if (qAuctionId) lotFilter.auctionId = Number(qAuctionId);
    else lotFilter.weekOf = weekOf;
    if (house) lotFilter.auctionHouseId = house._id;

    const sampleLot = await Lot.findOne(lotFilter);
    if (!sampleLot) {
      return res.status(404).json({ error: `No lots found` });
    }

    // Resolve subdomain from the lot's auction house
    const subdomain = house?.subdomain
      || (await AuctionHouse.findById(sampleLot.auctionHouseId).lean())?.subdomain;
    if (!subdomain) {
      return res.status(400).json({ error: 'Could not determine auction house subdomain' });
    }

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
  } catch (err) {
    console.error('[lots] Update prices failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lots?weekOf=2026-02-19&ah=kleinfelters or GET /api/lots?auctionId=12345
router.get('/', async (req, res) => {
  try {
    const { weekOf, ah, auctionId } = req.query;
    if (!weekOf && !auctionId) {
      return res.status(400).json({ error: 'weekOf or auctionId query parameter is required' });
    }
    if (auctionId) {
      const lots = await getLotsByAuction(Number(auctionId));
      return res.json(lots);
    }
    const house = await resolveAuctionHouse(ah);
    const lots = await getLotsByWeek(weekOf, house?._id);
    res.json(lots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lots/:lotId — lot from Mongo + live photos from HiBid
router.get('/:lotId', async (req, res) => {
  try {
    const lotId = Number(req.params.lotId);
    const lot = await Lot.findOne({ lotId }).lean();
    if (!lot) {
      return res.status(404).json({ error: 'Lot not found' });
    }

    // Get subdomain from lot's auction house
    let subdomain = 'kleinfelters.hibid.com'; // fallback
    if (lot.auctionHouseId) {
      const house = await AuctionHouse.findById(lot.auctionHouseId).lean();
      if (house) subdomain = house.subdomain;
    }

    let pictures = [];
    try {
      pictures = await fetchLotPictures(lotId, lot.title, subdomain);
    } catch (err) {
      console.error(`[lots] Failed to fetch pictures for lot ${lotId}:`, err.message);
    }

    res.json({ ...lot, pictures });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
