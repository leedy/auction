import mongoose from 'mongoose';

const interestSchema = new mongoose.Schema({
  // What to call this interest
  name: { type: String, required: true, unique: true },

  // How important is this to the collector (high, medium, low)
  priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },

  // --- Tiered matching fields ---

  // Direct keyword hits (case-insensitive) — brand names, maker marks, specific terms
  directMatches: [{ type: String }],

  // Semantic concepts the AI should evaluate — "does this listing mean this?"
  semanticMatches: [{ type: String }],

  // Bonus signals that boost confidence when found alongside a match
  watchFor: [{ type: String }],

  // Red flags that lower confidence or disqualify a match
  avoid: [{ type: String }],

  // Collector context / notes for the AI to reason with
  notes: { type: String, required: true },

  // Active flag — allows disabling without deleting
  active: { type: Boolean, default: true },
}, {
  timestamps: true,
});

const Interest = mongoose.model('Interest', interestSchema);

export default Interest;
