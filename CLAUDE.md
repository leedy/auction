# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack auction monitoring app for Kleinfelter's weekly Thursday auction on HiBid.com. Uses AI reasoning (via MCP/Beaker) to flag collectible items matching a configurable interest profile. Integrates with OpenClaw as an MCP skill.

## Commands

```bash
# Development
npm run dev:all              # Run backend (port 3006) + frontend (port 5186) concurrently
npm run dev                  # Backend only
cd frontend && npm run dev   # Frontend only (proxies /api → localhost:3006)

# Install dependencies
npm install                  # Root + backend
cd frontend && npm install   # Frontend

# Testing (no test framework — direct script execution)
node test-scraper.mjs        # Test HiBid scraping (no DB needed)
node test-hibid.mjs          # Test GraphQL API directly
node test-store.mjs          # Test scrape→store pipeline (needs MongoDB)
node test-mcp.mjs            # Test MCP server via JSON-RPC subprocess
node test-llm.mjs            # Test LLM connection (needs LLM_* env vars)
node test-llm-compare.mjs    # Compare models side-by-side on sample lots
node test-llm-compare.mjs model1 model2  # Compare specific models

# Data seeding
node seed-interests.mjs                    # Initialize collector interest profiles
node update-interests.mjs                  # One-off profile refinements
node seed-admin.mjs <email>                # Create the single admin user (TTY required for password)
node seed-admin.mjs --reset <email>        # Reset password on existing admin

# MCP Server (stdio transport, for OpenClaw config)
node mcp-server.mjs
```

## Architecture

**Three-layer system:** HiBid scraper → MongoDB storage → React frontend + MCP server

### Core Modules (`src/`)
- **`scraper.mjs`** — Fetches lots from any HiBid GraphQL API (parameterized by subdomain). No auth required. Paginates 100 lots/page, normalizes raw data, identifies auctions by configured day-of-week. Also fetches `priceRealized` from archive for closed auctions.
- **`store.mjs`** — Upserts lots to MongoDB by `(lotId, auctionId)` compound key. Sets `weekOf` from close date for week-based grouping.
- **`interests.mjs`** — CRUD for collector interest profiles. `getInterestsAsPrompt()` formats profiles as structured AI prompt with direct matches, semantic matches, watch-for boosters, and avoid red flags.
- **`evaluations.mjs`** — Saves/retrieves AI assessments. Protection: won't un-flag already-flagged items. Tracks user feedback (good_find, not_interested, already_knew).
- **`db.mjs`** — MongoDB connection singleton. URI from `MONGODB_URI` env var.
- **`llm.mjs`** — Provider-agnostic LLM client. Works with OpenRouter (cloud) or Ollama (local). Exposes `chatCompletion()` and `jsonCompletion()`. Config priority: env vars > DB settings. Uses native `fetch`, no SDK.
- **`settings.mjs`** — Singleton settings stored in MongoDB. CRUD for LLM config (base URL, API key, model, compare models).
- **`env.mjs`** — Zero-dependency .env loader (no dotenv package).

### Models (`src/models/`)
Eight Mongoose schemas: `AuctionHouse`, `Auction`, `Lot`, `Evaluation`, `Interest`, `UserPick`, `Settings`, `User`. AuctionHouse stores per-house config (slug, subdomain, auctionDay). Auction tracks individual HiBid auctions (auctionId, name from eventName, dates, imported status). Lot/Evaluation/UserPick have `auctionHouseId` and `auctionId` for per-auction filtering. Primary data selector is `auctionId` (not weekOf). Interest is global (applies to all houses). Settings is a singleton (key='global'). User is the single-admin auth subject (`email`, `passwordHash`, `role:'admin'`, `totpSecret`/`totpEnabled` reserved for Phase 1.7).

### Backend (`backend/`)
Express server on port 3006. helmet + explicit CSP, no CORS (same-origin). Routes at `/api/auth/*` (public), `/api/health` (public), and `/api/auction-houses`, `/api/lots`, `/api/evaluations`, `/api/interests`, `/api/picks`, `/api/settings`, `/api/auctions`, `/api/weeks` (all behind `requireAuth`). Most endpoints accept `?ah=<slug>` to scope by auction house. Serves `frontend/dist` in production.

**Auth + hardening (`backend/middleware/`, `backend/utils/`):**
- `auth.mjs` — `requireAuth` checks the HMAC-signed session cookie (`{v:2, sub:userId, role}`) and validates the user is still active in DB.
- `errorHandler.mjs` — final error middleware. `HttpError` 4xx exposes its message; 5xx returns `{error:'internal error', requestId}` with full stack only in PM2 logs (with redaction of `Authorization`/`Cookie`/`password`/`apiKey`/`MONGODB_URI`/`SESSION_SECRET`). Mongoose `ValidationError` → 400, duplicate-key → 409.
- `rateLimits.mjs` — five named limiters: `loginLimiter` (5/15min IP), `changePasswordLimiter` (5/15min sub), `llmSpendLimiter` (10/hr sub), `scrapeLimiter` (30/hr sub), and `defaultLimiter` (split GET=600/15min IP, mutate=120/15min sub).
- `validateLlmBaseUrl.mjs` — SSRF guard on user-supplied LLM `baseUrl` (allowlist + DNS resolve check against private/loopback ranges).
- `utils/asyncHandler.mjs` + `utils/HttpError.mjs` — express-4 async wrapper and the error class.

### Frontend (`frontend/`)
React 19 + Vite + React Router. `AuthProvider` wraps the app; `<RequireAuth>` gates everything except `/login`. `AuctionHouseContext` provides global house selection (persisted to localStorage). Nav bar has auction house dropdown when multiple houses exist, plus user email and logout button. Pages: **Login** (email + password), **Account** (change password), **Auctions** (browse auction houses, check for available auctions, import specific ones), **Lots** (browse lots by imported auction, search, star picks), **Flagged** (AI-flagged items by auction with feedback buttons), **Interests** (manage collector profiles), **Models** (LLM model management, API-key edit form starts blank), **Admin** (auction house management). API service layer in `services/api.js` uses `withCredentials: true` and a 401 interceptor that flips `authed=false` so `RequireAuth` redirects to `/login`.

### MCP Server (`mcp-server.mjs`)
Stdio-based JSON-RPC server exposing 8 tools: `scrape_auction`, `get_weeks`, `get_auction_lots`, `get_interests`, `get_unevaluated_lots`, `save_evaluation`, `get_week_summary`, `get_user_picks`. **Critical:** use `console.error` for logging — `console.log` corrupts the stdio transport.

## Data Flow

```
HiBid GraphQL → scraper → saveLots (MongoDB)
                                ↓
Beaker/MCP: get_interests + get_unevaluated_lots → AI evaluates → save_evaluation
                                ↓
Frontend: Lots page (browse) / Flagged page (AI results) → user feedback
```

## Key Conventions

- Plain JavaScript, no TypeScript. ES modules (.mjs).
- Zero external deps for core scraper — uses Node built-in `fetch`.
- All data organized by `weekOf` (auction close date, YYYY-MM-DD format).
- Interest matching is tiered: direct (keyword hits) → semantic (AI context) → watch-for (confidence boosters) → avoid (red flags).
- User picks (manual stars) are separate from AI evaluations.
- Environment: copy `.env.example` to `.env`, set `MONGODB_URI`, `SESSION_SECRET` (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`), `LLM_*`. In `NODE_ENV=production` the server refuses to boot without `MONGODB_URI` + `SESSION_SECRET`.
- Evaluation model tracks `model` field — which LLM generated each evaluation.
- Routes use `asyncHandler` + `HttpError` (no `try/catch + res.json({error: err.message})`). Per-route limiters mount **before** the route handler; the global `defaultLimiter` is mounted on `/api` after `requireAuth` and runs on top.

## Deployment

PM2 on a home server (`pm2 restart auction-backend --update-env` after `.env` changes; `cd frontend && npm run build` rebuilds the SPA into `frontend/dist`). Currently binds `0.0.0.0:3006`. Phase 1 deploy plan is to put nginx at `auction.notesin9.com` (using the existing `*.notesin9.com` wildcard cert), proxy to `127.0.0.1:3006`, with Cloudflare orange-cloud + `CF-Connecting-IP` real-IP wiring (otherwise the rate limiter sees only Cloudflare's IPs). Once nginx is verified, flip the bind to `127.0.0.1:3006` and set `COOKIE_SECURE=true`. Detailed plan in `SECURITY-PLAN.md`. Phase 1.6 will move to Docker/Portainer; Phase 1.7 will turn on TOTP 2FA (schema fields already present).

## Documentation

- `HIBID-API.md` — Reverse-engineered GraphQL API reference
- `OpenClaw_Docs.md` — MCP server integration guide, tool reference, evaluation workflow
- `Beaker_requests.md` — Feature requests for Beaker integration (vision, feedback loop, logistics)
- `SECURITY-PLAN.md` — Phase 1 security hardening + deployment plan (auth, helmet, rate limits, nginx, Cloudflare). Most of it shipped 2026-04-29; nginx + Cloudflare + bind-flip still pending.
- `MULTIUSER-PLAN.md` — Phase 2 multi-user + invites plan (deferred; user is staying solo).
- `AI_ROADMAP.md` — Roadmap with check-marks for what's shipped.
