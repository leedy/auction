import { Router } from 'express';
import { getAllEvaluations, getFlaggedLots, getWeekSummary, setUserFeedback, getModelsForWeek } from '../../src/evaluations.mjs';
import { runEvaluation, getEvaluationStatus } from '../../src/evaluator.mjs';
import Lot from '../../src/models/Lot.mjs';
import { resolveAuctionHouse } from '../resolveAuctionHouse.mjs';

const router = Router();

// GET /api/evaluations?weekOf=2026-02-19&model=openai/gpt-4o-mini&ah=kleinfelters
router.get('/', async (req, res) => {
  try {
    const { weekOf, model, ah } = req.query;
    if (!weekOf) {
      return res.status(400).json({ error: 'weekOf query parameter is required' });
    }
    const house = await resolveAuctionHouse(ah);
    const evaluations = await getAllEvaluations(weekOf, model, house?._id);
    res.json(evaluations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/evaluations/flagged?weekOf=2026-02-19&model=openai/gpt-4o-mini&ah=kleinfelters
router.get('/flagged', async (req, res) => {
  try {
    const { weekOf, model, ah } = req.query;
    if (!weekOf) {
      return res.status(400).json({ error: 'weekOf query parameter is required' });
    }
    const house = await resolveAuctionHouse(ah);
    const flagged = await getFlaggedLots(weekOf, model, house?._id);
    // Join priceRealized from lots
    const lotIds = flagged.map((f) => f.lotId);
    const lotFilter = { lotId: { $in: lotIds }, weekOf };
    if (house) lotFilter.auctionHouseId = house._id;
    const lots = await Lot.find(lotFilter, { lotId: 1, priceRealized: 1, quantitySold: 1 }).lean();
    const priceMap = {};
    for (const lot of lots) {
      priceMap[lot.lotId] = { priceRealized: lot.priceRealized, quantitySold: lot.quantitySold };
    }
    const enriched = flagged.map((f) => ({ ...f, ...priceMap[f.lotId] }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/evaluations/summary?weekOf=2026-02-19&model=openai/gpt-4o-mini&ah=kleinfelters
router.get('/summary', async (req, res) => {
  try {
    const { weekOf, model, ah } = req.query;
    if (!weekOf) {
      return res.status(400).json({ error: 'weekOf query parameter is required' });
    }
    const house = await resolveAuctionHouse(ah);
    const summary = await getWeekSummary(weekOf, model, house?._id);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/evaluations/models?weekOf=2026-03-19&ah=kleinfelters
router.get('/models', async (req, res) => {
  try {
    const { weekOf, ah } = req.query;
    if (!weekOf) {
      return res.status(400).json({ error: 'weekOf query parameter is required' });
    }
    const house = await resolveAuctionHouse(ah);
    const models = await getModelsForWeek(weekOf, house?._id);
    res.json(models);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/evaluations/run?weekOf=2026-03-19&model=openai/gpt-4o-mini&ah=kleinfelters
router.post('/run', async (req, res) => {
  try {
    const { weekOf, model, ah } = req.query;
    if (!weekOf) {
      return res.status(400).json({ error: 'weekOf query parameter is required' });
    }
    const status = getEvaluationStatus();
    if (status.status === 'running') {
      return res.status(409).json({ error: 'Evaluation already running', status });
    }
    const house = await resolveAuctionHouse(ah);
    // Fire and forget — don't await
    runEvaluation(weekOf, model || undefined, house?._id).catch((err) => console.error('[evaluations] Run error:', err.message));
    res.json({ message: 'Evaluation started', weekOf, model: model || 'default' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/evaluations/status — poll for evaluation progress
router.get('/status', async (req, res) => {
  res.json(getEvaluationStatus());
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
