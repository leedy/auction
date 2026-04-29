import { Router } from 'express';
import { getAllInterests, addInterest, updateInterest, removeInterest, toggleInterest } from '../../src/interests.mjs';
import { expandInterest } from '../../src/expander.mjs';
import Interest from '../../src/models/Interest.mjs';
import { asyncHandler } from '../utils/asyncHandler.mjs';
import { HttpError } from '../utils/HttpError.mjs';
import { llmSpendLimiter } from '../middleware/rateLimits.mjs';

const router = Router();

router.post('/expand', llmSpendLimiter, asyncHandler(async (req, res) => {
  const { name, notes } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new HttpError(400, 'name is required');
  }
  const profile = await expandInterest(name.trim(), notes);
  res.json(profile);
}));

router.get('/', asyncHandler(async (req, res) => {
  const interests = await getAllInterests();
  res.json(interests);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, priority, directMatches, semanticMatches, watchFor, avoid, notes } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new HttpError(400, 'name is required and must be a non-empty string');
  }
  if (!notes || typeof notes !== 'string' || !notes.trim()) {
    throw new HttpError(400, 'notes is required and must be a non-empty string');
  }
  if (priority && !['high', 'medium', 'low'].includes(priority)) {
    throw new HttpError(400, 'priority must be one of: high, medium, low');
  }
  for (const [field, value] of Object.entries({ directMatches, semanticMatches, watchFor, avoid })) {
    if (value !== undefined && (!Array.isArray(value) || !value.every((v) => typeof v === 'string'))) {
      throw new HttpError(400, `${field} must be an array of strings`);
    }
  }

  const interest = await addInterest({ name: name.trim(), priority, directMatches, semanticMatches, watchFor, avoid, notes: notes.trim() });
  res.status(201).json(interest);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const interest = await Interest.findById(req.params.id);
  if (!interest) throw new HttpError(404, 'Interest not found');
  const updated = await updateInterest(interest.name, req.body);
  res.json(updated);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const interest = await Interest.findById(req.params.id);
  if (!interest) throw new HttpError(404, 'Interest not found');
  await removeInterest(interest.name);
  res.json({ message: `Removed "${interest.name}"` });
}));

router.patch('/:id/toggle', asyncHandler(async (req, res) => {
  const interest = await Interest.findById(req.params.id);
  if (!interest) throw new HttpError(404, 'Interest not found');
  const toggled = await toggleInterest(interest.name);
  res.json(toggled);
}));

export default router;
