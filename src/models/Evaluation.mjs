import mongoose from 'mongoose';

const evaluationSchema = new mongoose.Schema({
  // Link to the lot
  lotId: { type: Number, required: true, index: true },
  auctionId: { type: Number, required: true },
  weekOf: { type: String, required: true, index: true },

  // Lot snapshot (so evaluations are readable without joining)
  title: { type: String, required: true },
  description: { type: String, default: '' },
  url: { type: String },
  image: { type: String },
  highBid: { type: Number, default: 0 },
  bidCount: { type: Number, default: 0 },

  // AI assessment
  interested: { type: Boolean, required: true },         // true = flagged for user
  confidence: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  category: { type: String },                             // which interest matched (e.g. "Vintage Cast Iron Cookware")
  reasoning: { type: String },                            // why it was flagged or skipped
  matchType: { type: String, enum: ['direct', 'semantic', 'none'], default: 'none' },
  model: { type: String },                                // which LLM model generated this evaluation

  // User feedback (optional — for Beaker to learn from over time)
  userFeedback: { type: String, enum: ['good_find', 'not_interested', 'already_knew', null], default: null },
}, {
  timestamps: true,
});

// One evaluation per lot per auction per model (allows multi-model comparison)
evaluationSchema.index({ lotId: 1, auctionId: 1, model: 1 }, { unique: true });

// Quick query: show me this week's flagged items
evaluationSchema.index({ weekOf: 1, interested: 1 });

const Evaluation = mongoose.model('Evaluation', evaluationSchema);

export default Evaluation;
