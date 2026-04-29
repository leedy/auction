// Session auth — stateless HMAC-signed cookie + a single User-active lookup per request.
// Format: base64url( JSON({v:2, iat, exp, sub:userId, role}) ) "." base64url( HMAC-SHA256(payload, SESSION_SECRET) )
// Rotating SESSION_SECRET invalidates all outstanding sessions.

import crypto from 'node:crypto';
import User from '../../src/models/User.mjs';

export const COOKIE_NAME = 'session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_VERSION = 2;

function getSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET missing or too short (min 32 chars)');
  }
  return s;
}

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function b64urlDecode(str) {
  return Buffer.from(str, 'base64url');
}

export function signSession({ sub, role }) {
  const now = Date.now();
  const payload = { v: SESSION_VERSION, iat: now, exp: now + SESSION_TTL_MS, sub: String(sub), role };
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64urlEncode(sig)}`;
}

export function verifySession(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, sigB64] = token.split('.', 2);
  if (!payloadB64 || !sigB64) return null;

  const expected = crypto.createHmac('sha256', getSecret()).update(payloadB64).digest();
  let provided;
  try {
    provided = b64urlDecode(sigB64);
  } catch {
    return null;
  }
  if (provided.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(provided, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || payload.v !== SESSION_VERSION) return null;
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    const session = token ? verifySession(token) : null;
    if (!session) return res.status(401).json({ error: 'authentication required' });

    const user = await User.findById(session.sub).lean();
    if (!user || !user.active) return res.status(401).json({ error: 'authentication required' });

    req.session = { sub: session.sub, role: session.role, email: user.email };
    next();
  } catch (err) {
    next(err);
  }
}

// Today every user is role:'admin'. Wired in advance so Phase 2 multi-user
// doesn't have to find every endpoint that should be admin-gated.
export function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}
