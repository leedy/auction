import { Router } from 'express';
import UserPick from '../../src/models/UserPick.mjs';
import Lot from '../../src/models/Lot.mjs';
import Evaluation from '../../src/models/Evaluation.mjs';
import { resolveAuctionHouse } from '../resolveAuctionHouse.mjs';
import { asyncHandler } from '../utils/asyncHandler.mjs';
import { HttpError } from '../utils/HttpError.mjs';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const { weekOf, ah, auctionId } = req.query;
  const filter = {};
  if (auctionId) filter.auctionId = Number(auctionId);
  else if (weekOf) filter.weekOf = weekOf;
  const house = await resolveAuctionHouse(ah);
  if (house) filter.auctionHouseId = house._id;
  const picks = await UserPick.find(filter).lean();
  res.json(picks);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { lotId, auctionId, weekOf } = req.body;
  if (!lotId || !auctionId) throw new HttpError(400, 'lotId and auctionId are required');

  const existing = await UserPick.findOne({ lotId, auctionId });
  if (existing) {
    await UserPick.deleteOne({ _id: existing._id });
    await Evaluation.deleteOne({ lotId, auctionId, model: 'manual' });
    return res.json({ picked: false, lotId });
  }

  const lotDoc = await Lot.findOne({ lotId, auctionId }).lean();
  const auctionHouseId = lotDoc?.auctionHouseId;

  const pick = await UserPick.create({ lotId, auctionId, weekOf, auctionHouseId });

  if (lotDoc) {
    const lot = lotDoc;
    await Evaluation.findOneAndUpdate(
      { lotId, auctionId, model: 'manual' },
      {
        lotId,
        auctionId,
        auctionHouseId,
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
}));

router.patch('/:lotId/note', asyncHandler(async (req, res) => {
  const lotId = Number(req.params.lotId);
  const { note } = req.body;
  const pick = await UserPick.findOneAndUpdate(
    { lotId },
    { note },
    { new: true }
  ).lean();
  if (!pick) throw new HttpError(404, 'Pick not found');
  res.json(pick);
}));

export default router;
