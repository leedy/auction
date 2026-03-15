import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

import { loadEnv } from '../src/env.mjs';
loadEnv();

import { connectDB } from '../src/db.mjs';
import lotsRouter from './routes/lots.mjs';
import evaluationsRouter from './routes/evaluations.mjs';
import interestsRouter from './routes/interests.mjs';
import picksRouter from './routes/picks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3006;

const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/lots', lotsRouter);
app.use('/api/evaluations', evaluationsRouter);
app.use('/api/interests', interestsRouter);
app.use('/api/picks', picksRouter);

// Weeks endpoint (lives at top level since it's not lot-specific)
import { getStoredWeeks } from '../src/store.mjs';
app.get('/api/weeks', async (req, res) => {
  try {
    const weeks = await getStoredWeeks();
    // Sort descending so most recent is first
    weeks.sort((a, b) => b.localeCompare(a));
    res.json(weeks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend static build in production
const frontendDist = resolve(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: `Not found: ${req.path}` });
  }
  res.sendFile(resolve(frontendDist, 'index.html'));
});

// Start
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
