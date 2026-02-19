import { Router } from 'express';
import { getLotsByWeek } from '../../src/store.mjs';
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
