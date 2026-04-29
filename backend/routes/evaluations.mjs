import { Router } from 'express';
import { getAllEvaluations, getFlaggedLots, getWeekSummary, setUserFeedback, getModelsForWeek } from '../../src/evaluations.mjs';
import { runEvaluation, getEvaluationStatus, cancelEvaluation } from '../../src/evaluator.mjs';
import Lot from '../../src/models/Lot.mjs';
import Auction from '../../src/models/Auction.mjs';
import AuctionHouse from '../../src/models/AuctionHouse.mjs';
import Evaluation from '../../src/models/Evaluation.mjs';
import { resolveAuctionHouse } from '../resolveAuctionHouse.mjs';
import { asyncHandler } from '../utils/asyncHandler.mjs';
import { HttpError } from '../utils/HttpError.mjs';
import { llmSpendLimiter } from '../middleware/rateLimits.mjs';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const { weekOf, model, ah, auctionId } = req.query;
  if (!weekOf && !auctionId) throw new HttpError(400, 'weekOf or auctionId query parameter is required');
  const house = await resolveAuctionHouse(ah);
  const evaluations = await getAllEvaluations(weekOf, model, house?._id, auctionId ? Number(auctionId) : undefined);
  res.json(evaluations);
}));

router.get('/flagged-open', asyncHandler(async (req, res) => {
  const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };

  const openLots = await Lot.find(
    { isClosed: false },
    { lotId: 1, auctionId: 1, priceRealized: 1, highBid: 1, bidCount: 1, description: 1, lotNumber: 1, pictures: 1 }
  ).lean();

  if (openLots.length === 0) return res.json([]);

  const openAuctionIds = new Set(openLots.map((l) => l.auctionId));

  const auctions = await Auction.find({
    auctionId: { $in: [...openAuctionIds] },
    imported: true,
    archived: { $ne: true },
    bidCloseDateTime: { $gt: new Date() },
  }).lean();

  const validAuctionIds = new Set(auctions.map((a) => a.auctionId));
  if (validAuctionIds.size === 0) return res.json([]);

  const auctionMap = new Map(auctions.map((a) => [a.auctionId, a]));
  const houseIds = [...new Set(auctions.map((a) => a.auctionHouseId?.toString()).filter(Boolean))];
  const houses = await AuctionHouse.find({ _id: { $in: houseIds } }).lean();
  const houseMap = new Map(houses.map((h) => [h._id.toString(), h]));

  const lotKey = (lotId, auctionId) => `${lotId}-${auctionId}`;
  const lotMap = new Map();
  for (const lot of openLots) {
    if (validAuctionIds.has(lot.auctionId)) {
      lotMap.set(lotKey(lot.lotId, lot.auctionId), lot);
    }
  }

  const rawEvals = await Evaluation.find({
    interested: true,
    auctionId: { $in: [...validAuctionIds] },
  }).lean();

  const filtered = rawEvals.filter((e) => lotMap.has(lotKey(e.lotId, e.auctionId)));

  filtered.sort((a, b) => {
    const confDiff = (CONFIDENCE_ORDER[a.confidence] ?? 3) - (CONFIDENCE_ORDER[b.confidence] ?? 3);
    if (confDiff !== 0) return confDiff;
    return (a.category || '').localeCompare(b.category || '');
  });

  const byLot = new Map();
  for (const item of filtered) {
    const evalEntry = { model: item.model, reasoning: item.reasoning, confidence: item.confidence, category: item.category, matchType: item.matchType };
    const existing = byLot.get(item.lotId);
    if (!existing) {
      byLot.set(item.lotId, { ...item, models: [item.model], allEvaluations: [evalEntry] });
    } else {
      existing.models.push(item.model);
      existing.allEvaluations.push(evalEntry);
      const existingRank = CONFIDENCE_ORDER[existing.confidence] ?? 3;
      const itemRank = CONFIDENCE_ORDER[item.confidence] ?? 3;
      if (itemRank < existingRank) {
        const { models, allEvaluations } = existing;
        byLot.set(item.lotId, { ...item, models, allEvaluations });
      }
    }
  }

  const enriched = [...byLot.values()].map((f) => {
    const lot = lotMap.get(lotKey(f.lotId, f.auctionId));
    const auction = auctionMap.get(f.auctionId);
    const house = auction ? houseMap.get(auction.auctionHouseId?.toString()) : null;
    return {
      ...f,
      ...(lot ? { highBid: lot.highBid, bidCount: lot.bidCount, description: lot.description, lotNumber: lot.lotNumber, priceRealized: lot.priceRealized } : {}),
      auctionName: auction?.name || null,
      auctionHouseName: house?.name || null,
      bidCloseDateTime: auction?.bidCloseDateTime || null,
    };
  });

  res.json(enriched);
}));

router.get('/flagged', asyncHandler(async (req, res) => {
  const { weekOf, model, ah, auctionId } = req.query;
  if (!weekOf && !auctionId) throw new HttpError(400, 'weekOf or auctionId query parameter is required');
  const house = await resolveAuctionHouse(ah);
  const aid = auctionId ? Number(auctionId) : undefined;
  const flagged = await getFlaggedLots(weekOf, model, house?._id, aid);
  const lotIds = flagged.map((f) => f.lotId);
  const lotFilter = { lotId: { $in: lotIds } };
  if (aid) lotFilter.auctionId = aid;
  else if (weekOf) lotFilter.weekOf = weekOf;
  if (house) lotFilter.auctionHouseId = house._id;
  const lots = await Lot.find(lotFilter, { lotId: 1, priceRealized: 1, quantitySold: 1, highBid: 1, bidCount: 1, description: 1, lotNumber: 1, pictures: 1 }).lean();
  const priceMap = {};
  for (const lot of lots) {
    priceMap[lot.lotId] = { priceRealized: lot.priceRealized, quantitySold: lot.quantitySold, highBid: lot.highBid, bidCount: lot.bidCount, description: lot.description, lotNumber: lot.lotNumber };
  }
  const enriched = flagged.map((f) => ({ ...f, ...priceMap[f.lotId] }));
  res.json(enriched);
}));

router.get('/summary', asyncHandler(async (req, res) => {
  const { weekOf, model, ah, auctionId } = req.query;
  if (!weekOf && !auctionId) throw new HttpError(400, 'weekOf or auctionId query parameter is required');
  const house = await resolveAuctionHouse(ah);
  const summary = await getWeekSummary(weekOf, model, house?._id, auctionId ? Number(auctionId) : undefined);
  res.json(summary);
}));

router.get('/models', asyncHandler(async (req, res) => {
  const { weekOf, ah, auctionId } = req.query;
  if (!weekOf && !auctionId) throw new HttpError(400, 'weekOf or auctionId query parameter is required');
  const house = await resolveAuctionHouse(ah);
  const models = await getModelsForWeek(weekOf, house?._id, auctionId ? Number(auctionId) : undefined);
  res.json(models);
}));

router.post('/run', llmSpendLimiter, asyncHandler(async (req, res) => {
  const { weekOf, model, ah, auctionId } = req.query;
  if (!weekOf && !auctionId) throw new HttpError(400, 'weekOf or auctionId query parameter is required');
  const status = getEvaluationStatus();
  if (status.status === 'running') {
    return res.status(409).json({ error: 'Evaluation already running', status });
  }
  const house = await resolveAuctionHouse(ah);
  const models = model ? model.split(',').map((m) => m.trim()).filter(Boolean) : undefined;
  const modelArg = models?.length > 1 ? models : models?.[0];
  const aid = auctionId ? Number(auctionId) : undefined;
  // Fire and forget — don't await
  runEvaluation(weekOf, modelArg, house?._id, aid).catch((err) => console.error('[evaluations] Run error:', err.message));
  res.json({ message: 'Evaluation started', weekOf, auctionId: aid, models: models || ['default'] });
}));

router.get('/status', asyncHandler(async (req, res) => {
  res.json(getEvaluationStatus());
}));

router.post('/cancel', asyncHandler(async (req, res) => {
  const cancelled = cancelEvaluation();
  if (!cancelled) throw new HttpError(400, 'No evaluation is currently running');
  res.json({ message: 'Cancellation requested — will stop after current batch' });
}));

router.patch('/:lotId/feedback', asyncHandler(async (req, res) => {
  const { auctionId, feedback, model } = req.body;
  if (!auctionId || !feedback) throw new HttpError(400, 'auctionId and feedback are required in body');
  const evaluation = await setUserFeedback(Number(req.params.lotId), auctionId, feedback, model);
  res.json(evaluation);
}));

export default router;
