import { Router } from 'express';
import { verifyCredentials, changePassword as doChangePassword, stampLogin, AuthError } from '../../src/auth.mjs';
import User from '../../src/models/User.mjs';
import {
  signSession,
  verifySession,
  cookieOptions,
  COOKIE_NAME,
  requireAuth,
} from '../middleware/auth.mjs';
import { asyncHandler } from '../utils/asyncHandler.mjs';
import { HttpError } from '../utils/HttpError.mjs';
import { loginLimiter, changePasswordLimiter } from '../middleware/rateLimits.mjs';

const router = Router();

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  const user = await verifyCredentials({ email, password });
  if (!user) throw new HttpError(401, 'invalid credentials');

  await stampLogin(user._id);
  const token = signSession({ sub: user._id.toString(), role: user.role });
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({ ok: true, email: user.email, role: user.role });
}));

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

router.get('/me', asyncHandler(async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  const session = token ? verifySession(token) : null;
  if (!session) return res.status(401).json({ authenticated: false });

  const user = await User.findById(session.sub).lean();
  if (!user || !user.active) return res.status(401).json({ authenticated: false });

  res.json({ authenticated: true, email: user.email, role: user.role });
}));

router.post('/change-password', requireAuth, changePasswordLimiter, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  try {
    await doChangePassword({
      userId: req.session.sub,
      currentPassword,
      newPassword,
    });
  } catch (err) {
    if (err instanceof AuthError) throw new HttpError(400, err.message);
    throw err;
  }
  // Rotate the session so the cookie's iat reflects the password change.
  const token = signSession({ sub: req.session.sub, role: req.session.role });
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({ ok: true });
}));

export default router;
