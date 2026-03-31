import { Router } from 'express';
import { getAllEvaluations, getFlaggedLots, getWeekSummary, setUserFeedback, getModelsForWeek } from '../../src/evaluations.mjs';
import { runEvaluation, getEvaluationStatus, cancelEvaluation } from '../../src/evaluator.mjs';
import Lot from '../../src/models/Lot.mjs';
import { resolveAuctionHouse } from '../resolveAuctionHouse.mjs';

const router = Router();

// GET /api/evaluations?auctionId=12345&model=...  or  ?weekOf=...&ah=...
router.get('/', async (req, res) => {
  try {
    const { weekOf, model, ah, auctionId } = req.query;
    if (!weekOf && !auctionId) {
      return res.status(400).json({ error: 'weekOf or auctionId query parameter is required' });
    }
    const house = await resolveAuctionHouse(ah);
    const evaluations = await getAllEvaluations(weekOf, model, house?._id, auctionId ? Number(auctionId) : undefined);
    res.json(evaluations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/evaluations/flagged?auctionId=12345  or  ?weekOf=...&ah=...
router.get('/flagged', async (req, res) => {
  try {
    const { weekOf, model, ah, auctionId } = req.query;
    if (!weekOf && !auctionId) {
      return res.status(400).json({ error: 'weekOf or auctionId query parameter is required' });
    }
    const house = await resolveAuctionHouse(ah);
    const aid = auctionId ? Number(auctionId) : undefined;
    const flagged = await getFlaggedLots(weekOf, model, house?._id, aid);
    // Join priceRealized from lots
    const lotIds = flagged.map((f) => f.lotId);
    const lotFilter = { lotId: { $in: lotIds } };
    if (aid) lotFilter.auctionId = aid;
    else if (weekOf) lotFilter.weekOf = weekOf;
    if (house) lotFilter.auctionHouseId = house._id;
    const lots = await Lot.find(lotFilter, { lotId: 1, priceRealized: 1, quantitySold: 1, highBid: 1, bidCount: 1, description: 1, lotNumber: 1 }).lean();
    const priceMap = {};
    for (const lot of lots) {
      priceMap[lot.lotId] = { priceRealized: lot.priceRealized, quantitySold: lot.quantitySold, highBid: lot.highBid, bidCount: lot.bidCount, description: lot.description, lotNumber: lot.lotNumber };
    }
    const enriched = flagged.map((f) => ({ ...f, ...priceMap[f.lotId] }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/evaluations/summary?auctionId=12345  or  ?weekOf=...&ah=...
router.get('/summary', async (req, res) => {
  try {
    const { weekOf, model, ah, auctionId } = req.query;
    if (!weekOf && !auctionId) {
      return res.status(400).json({ error: 'weekOf or auctionId query parameter is required' });
    }
    const house = await resolveAuctionHouse(ah);
    const summary = await getWeekSummary(weekOf, model, house?._id, auctionId ? Number(auctionId) : undefined);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/evaluations/models?auctionId=12345  or  ?weekOf=...&ah=...
router.get('/models', async (req, res) => {
  try {
    const { weekOf, ah, auctionId } = req.query;
    if (!weekOf && !auctionId) {
      return res.status(400).json({ error: 'weekOf or auctionId query parameter is required' });
    }
    const house = await resolveAuctionHouse(ah);
    const models = await getModelsForWeek(weekOf, house?._id, auctionId ? Number(auctionId) : undefined);
    res.json(models);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/evaluations/run?auctionId=12345&model=...  or  ?weekOf=...&ah=...
router.post('/run', async (req, res) => {
  try {
    const { weekOf, model, ah, auctionId } = req.query;
    if (!weekOf && !auctionId) {
      return res.status(400).json({ error: 'weekOf or auctionId query parameter is required' });
    }
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/evaluations/status — poll for evaluation progress
router.get('/status', async (req, res) => {
  res.json(getEvaluationStatus());
});

// POST /api/evaluations/cancel — cancel a running evaluation
router.post('/cancel', async (req, res) => {
  const cancelled = cancelEvaluation();
  if (cancelled) {
    res.json({ message: 'Cancellation requested — will stop after current batch' });
  } else {
    res.status(400).json({ error: 'No evaluation is currently running' });
  }
});

// PATCH /api/evaluations/:lotId/feedback
router.patch('/:lotId/feedback', async (req, res) => {
  try {
    const { auctionId, feedback, model } = req.body;
    if (!auctionId || !feedback) {
      return res.status(400).json({ error: 'auctionId and feedback are required in body' });
    }
    const evaluation = await setUserFeedback(Number(req.params.lotId), auctionId, feedback, model);
    res.json(evaluation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
