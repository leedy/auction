import mongoose from 'mongoose';

const lotSchema = new mongoose.Schema({
  // Auction house reference
  auctionHouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'AuctionHouse', index: true },

  // HiBid identifiers
  lotId: { type: Number, required: true },
  itemId: { type: Number },
  auctionId: { type: Number, required: true, index: true },
  lotNumber: { type: String },

  // Listing content
  title: { type: String, required: true },
  description: { type: String, default: '' },
  estimate: { type: String, default: '' },
  quantity: { type: Number, default: 1 },
  url: { type: String },

  // Images
  image: { type: String },
  imageFull: { type: String },
  pictures: [{
    fullSizeLocation: { type: String },
    thumbnailLocation: { type: String },
    description: { type: String },
  }],

  // Bid state (snapshot at scrape time)
  highBid: { type: Number, default: 0 },
  bidCount: { type: Number, default: 0 },
  minBid: { type: Number, default: 0 },
  buyNow: { type: Number },
  status: { type: String },
  timeLeft: { type: String },
  timeLeftSeconds: { type: Number },
  isClosed: { type: Boolean, default: false },
  reserveSatisfied: { type: Boolean },

  // Final results (updated after auction closes)
  priceRealized: { type: Number },
  quantitySold: { type: Number },

  // Auction timing
  bidOpenDateTime: { type: Date },
  bidCloseDateTime: { type: Date, index: true },

  // Our metadata
  fetchedAt: { type: Date, required: true },
  weekOf: { type: String, index: true }, // e.g. "2026-02-19" — the Thursday close date
}, {
  timestamps: true,
});

// Compound index: one record per lot per auction
lotSchema.index({ lotId: 1, auctionId: 1 }, { unique: true });

// Query by auction house + week
lotSchema.index({ auctionHouseId: 1, weekOf: 1 });

const Lot = mongoose.model('Lot', lotSchema);

export default Lot;
