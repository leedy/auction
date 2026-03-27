# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack auction monitoring app for Kleinfelter's weekly Thursday auction on HiBid.com. Uses AI reasoning (via MCP/Beaker) to flag collectible items matching a configurable interest profile. Integrates with OpenClaw as an MCP skill.

## Commands

```bash
# Development
npm run dev:all              # Run backend (port 3006) + frontend (port 5173) concurrently
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
node seed-interests.mjs      # Initialize collector interest profiles
node update-interests.mjs    # One-off profile refinements

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
Six Mongoose schemas: `AuctionHouse`, `Lot`, `Evaluation`, `Interest`, `UserPick`, `Settings`. AuctionHouse stores per-house config (slug, subdomain, auctionDay). Lot/Evaluation/UserPick have `auctionHouseId` for multi-house filtering, compound unique indexes (lotId+auctionId), and `weekOf` for week-based queries. Interest is global (applies to all houses). Settings is a singleton (key='global').

### Backend (`backend/`)
Express server on port 3006 (production). CORS enabled. Routes at `/api/auction-houses`, `/api/lots`, `/api/evaluations`, `/api/interests`, `/api/picks`, `/api/settings`, `/api/weeks`, `/api/health`. Most endpoints accept `?ah=<slug>` to scope by auction house. Serves `frontend/dist` in production.

### Frontend (`frontend/`)
React 19 + Vite + React Router. AuctionHouseContext provides global house selection (persisted to localStorage). Nav bar has auction house dropdown when multiple houses exist. Four pages: **Lots** (browse all lots, search, star picks), **Flagged** (AI-flagged items grouped by category with feedback buttons), **Interests** (manage collector profiles), **Admin** (auction house management + LLM config). API service layer in `services/api.js`.

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
- Environment: copy `.env.example` to `.env`, set `MONGODB_URI` and `LLM_*` vars.
- Evaluation model tracks `model` field — which LLM generated each evaluation.

## Documentation

- `HIBID-API.md` — Reverse-engineered GraphQL API reference
- `OpenClaw_Docs.md` — MCP server integration guide, tool reference, evaluation workflow
- `Beaker_requests.md` — Feature requests for Beaker integration (vision, feedback loop, logistics)
