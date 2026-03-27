import mongoose from 'mongoose';

const auctionSchema = new mongoose.Schema({
  auctionId: { type: Number, required: true, unique: true }, // HiBid auction ID
  auctionHouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'AuctionHouse', index: true },
  name: { type: String },                    // from HiBid eventName
  bidOpenDateTime: { type: Date },
  bidCloseDateTime: { type: Date },
  lotCount: { type: Number, default: 0 },
  imported: { type: Boolean, default: false },
  importedAt: { type: Date },
  isOnline: { type: Boolean, default: true }, // false = webcast/live
}, {
  timestamps: true,
});

auctionSchema.index({ auctionHouseId: 1, bidCloseDateTime: -1 });

const Auction = mongoose.model('Auction', auctionSchema);

export default Auction;
