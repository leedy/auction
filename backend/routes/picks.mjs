import { Router } from 'express';
import UserPick from '../../src/models/UserPick.mjs';

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
router.post('/', async (req, res) => {
  try {
    const { lotId, auctionId, weekOf } = req.body;
    if (!lotId || !auctionId) {
      return res.status(400).json({ error: 'lotId and auctionId are required' });
    }

    const existing = await UserPick.findOne({ lotId, auctionId });
    if (existing) {
      await UserPick.deleteOne({ _id: existing._id });
      return res.json({ picked: false, lotId });
    }

    const pick = await UserPick.create({ lotId, auctionId, weekOf });
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
