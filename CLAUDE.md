# Auction Monitor - Project Instructions

## Project Overview
OpenClaw skill that monitors Kleinfelter's Auction on HiBid.com weekly and uses AI reasoning (Claude API) to flag collectible items of interest.

## Collector Interest Profile
- Vintage cast iron skillets (Griswold, Wagner Ware, etc.)
- Vintage toys
- Comic books
- General collectibles
- AI should understand collector context — e.g. "Griswold #8 Erie PA" = cast iron skillet

## Architecture
- Backend-only Node.js app (no frontend)
- Zero external dependencies where possible — use Node built-in fetch
- Will be packaged as an OpenClaw skill with cron scheduling
- Delivery via OpenClaw daily briefing or direct message

## HiBid API
- See HIBID-API.md for full endpoint documentation
- GraphQL at `POST https://kleinfelters.hibid.com/graphql`
- No auth needed for public lot data

## Build Steps
1. ~~Explore HiBid subdomain / confirm JSON endpoints~~ DONE
2. Build scraper to pull current week's auction lots
3. Build collector interest profile
4. Build AI evaluation step (Claude API)
5. Package as OpenClaw skill with cron

## Project Conventions
- Plain JavaScript (no TypeScript)
- ES modules (.mjs or "type": "module" in package.json)
- async/await for all async operations
- Graceful error handling throughout
