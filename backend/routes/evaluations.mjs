import { Router } from 'express';
import { getAllEvaluations, getFlaggedLots, getWeekSummary, setUserFeedback } from '../../src/evaluations.mjs';

const router = Router();

// GET /api/evaluations?weekOf=2026-02-19
router.get('/', async (req, res) => {
  try {
    const { weekOf } = req.query;
    if (!weekOf) {
      return res.status(400).json({ error: 'weekOf query parameter is required' });
    }
    const evaluations = await getAllEvaluations(weekOf);
    res.json(evaluations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/evaluations/flagged?weekOf=2026-02-19
router.get('/flagged', async (req, res) => {
  try {
    const { weekOf } = req.query;
    if (!weekOf) {
      return res.status(400).json({ error: 'weekOf query parameter is required' });
    }
    const flagged = await getFlaggedLots(weekOf);
    res.json(flagged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/evaluations/summary?weekOf=2026-02-19
router.get('/summary', async (req, res) => {
  try {
    const { weekOf } = req.query;
    if (!weekOf) {
      return res.status(400).json({ error: 'weekOf query parameter is required' });
    }
    const summary = await getWeekSummary(weekOf);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/evaluations/:lotId/feedback
router.patch('/:lotId/feedback', async (req, res) => {
  try {
    const { auctionId, feedback } = req.body;
    if (!auctionId || !feedback) {
      return res.status(400).json({ error: 'auctionId and feedback are required in body' });
    }
    const evaluation = await setUserFeedback(Number(req.params.lotId), auctionId, feedback);
    res.json(evaluation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
