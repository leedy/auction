import mongoose from 'mongoose';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: EMAIL_REGEX,
  },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin'], default: 'admin' },
  active: { type: Boolean, default: true },
  totpSecret: { type: String, default: null },
  totpEnabled: { type: Boolean, default: false },
  lastLoginAt: { type: Date, default: null },
}, {
  timestamps: true,
});

const User = mongoose.model('User', userSchema);

export { EMAIL_REGEX };
export default User;
