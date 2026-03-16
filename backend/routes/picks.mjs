import { Router } from 'express';
import UserPick from '../../src/models/UserPick.mjs';
import Lot from '../../src/models/Lot.mjs';
import Evaluation from '../../src/models/Evaluation.mjs';

const router = Router();

// GET /api/picks?weekOf=2026-02-19
router.get('/', async (req, res) => {
  try {
    const { weekOf } = req.query;
    const filter = weekOf ? { weekOf } : {};
    const picks = await UserPick.find(filter).lean();
    res.json(picks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/picks — toggle a pick (add if missing, remove if exists)
// Also creates/removes a "manual" evaluation for the Flagged page
router.post('/', async (req, res) => {
  try {
    const { lotId, auctionId, weekOf } = req.body;
    if (!lotId || !auctionId) {
      return res.status(400).json({ error: 'lotId and auctionId are required' });
    }

    const existing = await UserPick.findOne({ lotId, auctionId });
    if (existing) {
      await UserPick.deleteOne({ _id: existing._id });
      // Remove the manual evaluation
      await Evaluation.deleteOne({ lotId, auctionId, model: 'manual' });
      return res.json({ picked: false, lotId });
    }

    const pick = await UserPick.create({ lotId, auctionId, weekOf });

    // Create a "manual" evaluation so it shows on the Flagged page
    const lot = await Lot.findOne({ lotId, auctionId }).lean();
    if (lot) {
      await Evaluation.findOneAndUpdate(
        { lotId, auctionId, model: 'manual' },
        {
          lotId,
          auctionId,
          weekOf: lot.weekOf || weekOf,
          title: lot.title,
          description: lot.description || '',
          url: lot.url || '',
          image: lot.image || '',
          highBid: lot.highBid || 0,
          bidCount: lot.bidCount || 0,
          interested: true,
          confidence: 'high',
          category: 'My Picks',
          reasoning: 'Manually selected',
          matchType: 'direct',
          model: 'manual',
        },
        { upsert: true, new: true }
      );
    }

    res.json({ picked: true, lotId, pick });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/picks/:lotId/note — update note on a pick
router.patch('/:lotId/note', async (req, res) => {
  try {
    const lotId = Number(req.params.lotId);
    const { note } = req.body;
    const pick = await UserPick.findOneAndUpdate(
      { lotId },
      { note },
      { new: true }
    ).lean();
    if (!pick) {
      return res.status(404).json({ error: 'Pick not found' });
    }
    res.json(pick);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
