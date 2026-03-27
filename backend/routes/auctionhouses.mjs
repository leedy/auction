import { Router } from 'express';
import AuctionHouse from '../../src/models/AuctionHouse.mjs';

const router = Router();

// GET /api/auction-houses — list all (optionally filter by active)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.active === 'true') filter.active = true;
    const houses = await AuctionHouse.find(filter).sort({ name: 1 }).lean();
    res.json(houses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auction-houses/:slug
router.get('/:slug', async (req, res) => {
  try {
    const house = await AuctionHouse.findOne({ slug: req.params.slug }).lean();
    if (!house) return res.status(404).json({ error: 'Auction house not found' });
    res.json(house);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auction-houses — create new
router.post('/', async (req, res) => {
  try {
    const { slug, name, subdomain, auctionDay, timezone } = req.body;
    if (!slug || !name || !subdomain || !auctionDay) {
      return res.status(400).json({ error: 'slug, name, subdomain, and auctionDay are required' });
    }
    const house = await AuctionHouse.create({
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      name,
      subdomain,
      auctionDay,
      timezone: timezone || 'America/New_York',
    });
    res.status(201).json(house);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An auction house with that slug or subdomain already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auction-houses/:slug — update
router.patch('/:slug', async (req, res) => {
  try {
    const updates = {};
    for (const key of ['name', 'subdomain', 'auctionDay', 'timezone', 'active']) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const house = await AuctionHouse.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: updates },
      { new: true }
    );
    if (!house) return res.status(404).json({ error: 'Auction house not found' });
    res.json(house);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auction-houses/:slug
router.delete('/:slug', async (req, res) => {
  try {
    const house = await AuctionHouse.findOneAndDelete({ slug: req.params.slug });
    if (!house) return res.status(404).json({ error: 'Auction house not found' });
    res.json({ deleted: true, slug: req.params.slug });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
