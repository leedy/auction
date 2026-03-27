import mongoose from 'mongoose';

const userPickSchema = new mongoose.Schema({
  auctionHouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'AuctionHouse', index: true },
  lotId: { type: Number, required: true },
  auctionId: { type: Number, required: true },
  weekOf: { type: String, index: true },
  note: { type: String, default: '' },
}, {
  timestamps: true,
});

userPickSchema.index({ lotId: 1, auctionId: 1 }, { unique: true });
userPickSchema.index({ auctionHouseId: 1, weekOf: 1 });
userPickSchema.index({ auctionId: 1 });

const UserPick = mongoose.model('UserPick', userPickSchema);

export default UserPick;
