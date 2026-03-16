import { Router } from 'express';
import { getLotsByWeek, saveLots } from '../../src/store.mjs';
import { fetchThursdayAuction } from '../../src/scraper.mjs';
import Lot from '../../src/models/Lot.mjs';

const GRAPHQL_URL = 'https://kleinfelters.hibid.com/graphql';
const SITE_SUBDOMAIN = 'kleinfelters.hibid.com';

const router = Router();

/**
 * Fetch pictures for a specific lot from HiBid GraphQL.
 * Uses the lot title as search text to narrow results, then matches by ID.
 */
async function fetchLotPictures(lotId, title) {
  const searchWords = (title || '').split(/\s+/).slice(0, 3).join(' ');

  const gqlRes = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'SITE_SUBDOMAIN': SITE_SUBDOMAIN,
    },
    body: JSON.stringify({
      query: `query LotPictures($searchText: String, $pageLength: Int!) {
        lotSearch(
          input: { searchText: $searchText, status: OPEN, isArchive: false }
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
      }`,
      variables: {
        searchText: searchWords,
        pageLength: 20,
      },
    }),
  });

  const gqlJson = await gqlRes.json();
  const results = gqlJson?.data?.lotSearch?.pagedResults?.results || [];
  const match = results.find((r) => r.id === lotId);
  return match?.pictures || [];
}

// POST /api/lots/scrape — fetch current auction from HiBid and save to DB
router.post('/scrape', async (req, res) => {
  try {
    const auction = await fetchThursdayAuction();
    if (!auction.lots || auction.lots.length === 0) {
      return res.json({ success: true, message: 'No open auction found', inserted: 0, updated: 0 });
    }

    const result = await saveLots(auction.lots, auction.fetchedAt);
    res.json({
      success: true,
      auctionId: auction.auctionId,
      totalLots: auction.lots.length,
      inserted: result.inserted,
      updated: result.updated,
      weekOf: auction.lots[0]?.bidCloseDateTime
        ? new Date(auction.lots[0].bidCloseDateTime).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
        : null,
      errors: [...(auction.errors || []), ...(result.errors || [])],
    });
  } catch (err) {
    console.error('[lots] Scrape failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lots?weekOf=2026-02-19
router.get('/', async (req, res) => {
  try {
    const { weekOf } = req.query;
    if (!weekOf) {
      return res.status(400).json({ error: 'weekOf query parameter is required' });
    }
    const lots = await getLotsByWeek(weekOf);
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

    let pictures = [];
    try {
      pictures = await fetchLotPictures(lotId, lot.title);
    } catch (err) {
      console.error(`[lots] Failed to fetch pictures for lot ${lotId}:`, err.message);
    }

    res.json({ ...lot, pictures });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
