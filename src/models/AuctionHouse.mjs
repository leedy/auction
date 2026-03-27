import mongoose from 'mongoose';

const auctionHouseSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true }, // URL-safe id, e.g. "kleinfelters"
  name: { type: String, required: true },               // Display name, e.g. "Kleinfelter's"
  subdomain: { type: String, required: true, unique: true }, // e.g. "kleinfelters.hibid.com"
  auctionDay: { type: String, required: true },          // e.g. "Thursday"
  timezone: { type: String, default: 'America/New_York' },
  active: { type: Boolean, default: true },
  autoImport: { type: Boolean, default: false }, // for future cron-based auto-import
}, {
  timestamps: true,
});

const AuctionHouse = mongoose.model('AuctionHouse', auctionHouseSchema);

export default AuctionHouse;
