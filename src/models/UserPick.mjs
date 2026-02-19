import mongoose from 'mongoose';

const userPickSchema = new mongoose.Schema({
  lotId: { type: Number, required: true },
  auctionId: { type: Number, required: true },
  weekOf: { type: String, index: true },
  note: { type: String, default: '' },
}, {
  timestamps: true,
});

userPickSchema.index({ lotId: 1, auctionId: 1 }, { unique: true });

const UserPick = mongoose.model('UserPick', userPickSchema);

export default UserPick;
