import { Router } from 'express';
import { getAllInterests, addInterest, updateInterest, removeInterest, toggleInterest } from '../../src/interests.mjs';
import Interest from '../../src/models/Interest.mjs';

const router = Router();

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
    const interest = await addInterest(req.body);
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
