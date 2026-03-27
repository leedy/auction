// Shared helper to resolve an auction house slug to a document
import AuctionHouse from '../src/models/AuctionHouse.mjs';

const cache = new Map();
const CACHE_TTL = 60_000; // 1 minute

export async function resolveAuctionHouse(slug) {
  if (!slug) return null;

  const cached = cache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.doc;
  }

  const doc = await AuctionHouse.findOne({ slug }).lean();
  if (doc) {
    cache.set(slug, { doc, ts: Date.now() });
  }
  return doc;
}
