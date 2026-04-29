// Five named rate limiters keyed by user (sub) where possible, falling back to
// IP for unauthenticated routes. The IP fallback uses ipKeyGenerator so IPv6
// (incl. IPv4-mapped) gets normalized to a /64 prefix — without this, a
// modern attacker can rotate ::ffff:* addresses to bypass per-IP buckets.

import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

const subOrIp = (req, res) => req.session?.sub || ipKeyGenerator(req, res);

const baseOpts = {
  standardHeaders: true,
  legacyHeaders: false,
};

export const loginLimiter = rateLimit({
  ...baseOpts,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  message: { error: 'too many login attempts; try again in a few minutes' },
});

export const changePasswordLimiter = rateLimit({
  ...baseOpts,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: subOrIp,
  message: { error: 'too many change-password attempts; try again in a few minutes' },
});

export const llmSpendLimiter = rateLimit({
  ...baseOpts,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: subOrIp,
  message: { error: 'LLM-spend rate limit exceeded; try again in an hour' },
});

export const scrapeLimiter = rateLimit({
  ...baseOpts,
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: subOrIp,
  message: { error: 'scrape rate limit exceeded; try again in an hour' },
});

export const mutateLimiter = rateLimit({
  ...baseOpts,
  windowMs: 15 * 60 * 1000,
  limit: 120,
  keyGenerator: subOrIp,
  message: { error: 'rate limit exceeded; try again in a few minutes' },
});

export const readLimiter = rateLimit({
  ...baseOpts,
  windowMs: 15 * 60 * 1000,
  limit: 600,
  message: { error: 'rate limit exceeded' },
});

// Use as `app.use('/api', defaultLimiter)` after auth — applies the right
// limiter based on HTTP method.
export function defaultLimiter(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return readLimiter(req, res, next);
  return mutateLimiter(req, res, next);
}
