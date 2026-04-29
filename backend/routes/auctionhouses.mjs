import { Router } from 'express';
import AuctionHouse from '../../src/models/AuctionHouse.mjs';
import { asyncHandler } from '../utils/asyncHandler.mjs';
import { HttpError } from '../utils/HttpError.mjs';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.active === 'true') filter.active = true;
  const houses = await AuctionHouse.find(filter).sort({ name: 1 }).lean();
  res.json(houses);
}));

router.get('/:slug', asyncHandler(async (req, res) => {
  const house = await AuctionHouse.findOne({ slug: req.params.slug }).lean();
  if (!house) throw new HttpError(404, 'Auction house not found');
  res.json(house);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { slug, name, subdomain, auctionDay, timezone } = req.body;
  if (!slug || !name || !subdomain || !auctionDay) {
    throw new HttpError(400, 'slug, name, subdomain, and auctionDay are required');
  }
  const house = await AuctionHouse.create({
    slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    name,
    subdomain,
    auctionDay,
    timezone: timezone || 'America/New_York',
  });
  res.status(201).json(house);
}));

router.patch('/:slug', asyncHandler(async (req, res) => {
  const updates = {};
  for (const key of ['name', 'subdomain', 'auctionDay', 'timezone', 'active']) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const house = await AuctionHouse.findOneAndUpdate(
    { slug: req.params.slug },
    { $set: updates },
    { new: true }
  );
  if (!house) throw new HttpError(404, 'Auction house not found');
  res.json(house);
}));

router.delete('/:slug', asyncHandler(async (req, res) => {
  if (req.query.confirm !== req.params.slug) {
    throw new HttpError(400, `destructive operation requires ?confirm=${req.params.slug}`);
  }
  const house = await AuctionHouse.findOneAndDelete({ slug: req.params.slug });
  if (!house) throw new HttpError(404, 'Auction house not found');
  res.json({ deleted: true, slug: req.params.slug });
}));

export default router;
