import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

import { loadEnv } from '../src/env.mjs';
loadEnv();

import { connectDB } from '../src/db.mjs';
import lotsRouter from './routes/lots.mjs';
import evaluationsRouter from './routes/evaluations.mjs';
import interestsRouter from './routes/interests.mjs';
import picksRouter from './routes/picks.mjs';
import settingsRouter from './routes/settings.mjs';
import auctionHousesRouter from './routes/auctionhouses.mjs';
import auctionsRouter from './routes/auctions.mjs';
import authRouter from './routes/auth.mjs';
import { requireAuth } from './middleware/auth.mjs';
import { errorHandler } from './middleware/errorHandler.mjs';
import { asyncHandler } from './utils/asyncHandler.mjs';
import { defaultLimiter } from './middleware/rateLimits.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3006;

if (process.env.NODE_ENV === 'production') {
  const required = ['MONGODB_URI', 'SESSION_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[server] refusing to start: missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const app = express();

const trustProxy = Number(process.env.TRUST_PROXY || 0);
if (trustProxy > 0) app.set('trust proxy', trustProxy);

app.disable('x-powered-by');

// helmet defaults + an explicit CSP. Permissive img-src for HiBid CDN hosts;
// frontend is same-origin so connect/script/style stay tight.
// HSTS and upgrade-insecure-requests are gated on COOKIE_SECURE — they only make sense
// once we're behind TLS (step 9 of SECURITY-PLAN). Sending them over plain HTTP poisons
// the browser's HSTS cache and breaks LAN access.
const isHttps = process.env.COOKIE_SECURE === 'true';

const cspDirectives = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'https:'],
  'connect-src': ["'self'"],
  'frame-ancestors': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
};
if (isHttps) {
  cspDirectives['upgrade-insecure-requests'] = [];
} else {
  // helmet's useDefaults adds upgrade-insecure-requests; null disables it.
  cspDirectives['upgrade-insecure-requests'] = null;
}

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: cspDirectives,
  },
  // 180-day HSTS, no preload (so we can roll back HTTPS without burning the domain).
  // Disabled until we're actually on HTTPS.
  strictTransportSecurity: isHttps
    ? { maxAge: 60 * 60 * 24 * 180, includeSubDomains: false, preload: false }
    : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);

// Everything below this line requires a valid session cookie.
app.use('/api', requireAuth);

// Default per-method rate limit (mutate vs read). Per-route limiters mounted
// inside individual routers (login, llm-spend, scrape) run first and are
// always more restrictive — both must pass, the tighter one wins.
app.use('/api', defaultLimiter);

app.use('/api/lots', lotsRouter);
app.use('/api/evaluations', evaluationsRouter);
app.use('/api/interests', interestsRouter);
app.use('/api/picks', picksRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/auction-houses', auctionHousesRouter);
app.use('/api/auctions', auctionsRouter);

import { getStoredWeeks } from '../src/store.mjs';
import { resolveAuctionHouse } from './resolveAuctionHouse.mjs';
app.get('/api/weeks', asyncHandler(async (req, res) => {
  const house = await resolveAuctionHouse(req.query.ah);
  const weeks = await getStoredWeeks(house?._id);
  weeks.sort((a, b) => b.localeCompare(a));
  res.json(weeks);
}));

// Unknown /api routes return 404 before the static handler tries to serve index.html
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Not found: ${req.originalUrl}` });
});

// Error handler for everything mounted above (must come after the routes).
app.use('/api', errorHandler);

const frontendDist = resolve(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  res.sendFile(resolve(frontendDist, 'index.html'));
});

async function start() {
  await connectDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] Auction Monitor API running on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  process.exit(1);
});
