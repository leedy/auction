import { Router } from 'express';
import { getAllInterests, addInterest, updateInterest, removeInterest, toggleInterest } from '../../src/interests.mjs';
import { expandInterest } from '../../src/expander.mjs';
import Interest from '../../src/models/Interest.mjs';

const router = Router();

// POST /api/interests/expand — AI-generate a full profile from name + optional notes
router.post('/expand', async (req, res) => {
  try {
    const { name, notes } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const profile = await expandInterest(name.trim(), notes);
    res.json(profile);
  } catch (err) {
    console.error('[interests] Expand failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/interests
router.get('/', async (req, res) => {
  try {
    const interests = await getAllInterests();
    res.json(interests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/interests
router.post('/', async (req, res) => {
  try {
    const { name, priority, directMatches, semanticMatches, watchFor, avoid, notes } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required and must be a non-empty string' });
    }
    if (!notes || typeof notes !== 'string' || !notes.trim()) {
      return res.status(400).json({ error: 'notes is required and must be a non-empty string' });
    }
    if (priority && !['high', 'medium', 'low'].includes(priority)) {
      return res.status(400).json({ error: 'priority must be one of: high, medium, low' });
    }
    for (const [field, value] of Object.entries({ directMatches, semanticMatches, watchFor, avoid })) {
      if (value !== undefined && (!Array.isArray(value) || !value.every((v) => typeof v === 'string'))) {
        return res.status(400).json({ error: `${field} must be an array of strings` });
      }
    }

    const interest = await addInterest({ name: name.trim(), priority, directMatches, semanticMatches, watchFor, avoid, notes: notes.trim() });
    res.status(201).json(interest);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/interests/:id
router.patch('/:id', async (req, res) => {
  try {
    const interest = await Interest.findById(req.params.id);
    if (!interest) {
      return res.status(404).json({ error: 'Interest not found' });
    }
    const updated = await updateInterest(interest.name, req.body);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/interests/:id
router.delete('/:id', async (req, res) => {
  try {
    const interest = await Interest.findById(req.params.id);
    if (!interest) {
      return res.status(404).json({ error: 'Interest not found' });
    }
    await removeInterest(interest.name);
    res.json({ message: `Removed "${interest.name}"` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/interests/:id/toggle
router.patch('/:id/toggle', async (req, res) => {
  try {
    const interest = await Interest.findById(req.params.id);
    if (!interest) {
      return res.status(404).json({ error: 'Interest not found' });
    }
    const toggled = await toggleInterest(interest.name);
    res.json(toggled);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
