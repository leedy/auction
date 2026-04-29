import bcrypt from 'bcryptjs';
import User, { EMAIL_REGEX } from './models/User.mjs';

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 5;

// Constant-time fallback hash so bcrypt.compare always runs at full cost
// when no user is found — denies an email-enumeration timing oracle.
const FALLBACK_HASH = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8.pYxRgxRJfA2N2c1B7l5iQqQyqBEC';

export class AuthError extends Error {
  constructor(message, code = 'auth_error') {
    super(message);
    this.code = code;
  }
}

export function normalizeEmail(raw) {
  if (typeof raw !== 'string') throw new AuthError('email required', 'invalid_email');
  const email = raw.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) throw new AuthError('invalid email', 'invalid_email');
  return email;
}

export function assertPasswordStrength(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`password must be at least ${MIN_PASSWORD_LENGTH} characters`, 'weak_password');
  }
}

export async function userExists() {
  return (await User.estimatedDocumentCount()) > 0;
}

export async function createAdmin({ email, password }) {
  const normalized = normalizeEmail(email);
  assertPasswordStrength(password);
  if (await userExists()) {
    throw new AuthError('a user already exists; refusing to create another', 'already_seeded');
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  return User.create({ email: normalized, passwordHash, role: 'admin', active: true });
}

export async function resetPassword({ email, password }) {
  const normalized = normalizeEmail(email);
  assertPasswordStrength(password);
  const user = await User.findOne({ email: normalized });
  if (!user) throw new AuthError('user not found', 'not_found');
  user.passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  await user.save();
  return user;
}

export async function verifyCredentials({ email, password }) {
  let normalized;
  try {
    normalized = normalizeEmail(email);
  } catch {
    // Still run bcrypt against the fallback so timing doesn't leak validity.
    await bcrypt.compare(typeof password === 'string' ? password : '', FALLBACK_HASH);
    return null;
  }
  const user = await User.findOne({ email: normalized });
  const hash = user?.passwordHash || FALLBACK_HASH;
  const provided = typeof password === 'string' ? password : '';
  const ok = await bcrypt.compare(provided, hash);
  if (!ok || !user || !user.active) return null;
  return user;
}

export async function changePassword({ userId, currentPassword, newPassword }) {
  assertPasswordStrength(newPassword);
  const user = await User.findById(userId);
  if (!user) throw new AuthError('user not found', 'not_found');
  const ok = await bcrypt.compare(typeof currentPassword === 'string' ? currentPassword : '', user.passwordHash);
  if (!ok) throw new AuthError('current password incorrect', 'invalid_current_password');
  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await user.save();
  return user;
}

export async function stampLogin(userId) {
  await User.updateOne({ _id: userId }, { $set: { lastLoginAt: new Date() } });
}
