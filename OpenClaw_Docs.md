# Auction Monitor — OpenClaw Integration

## Overview

The Auction Monitor is an MCP server that lets Beaker (OpenClaw) monitor Kleinfelter's weekly Thursday auction on HiBid.com and flag collectible items of interest. It exposes tools for scraping auction data, reviewing lots against collector interest profiles, and saving evaluations.

## MCP Server Setup

### Server Location

```
/Users/beaker/MuppetLabs/Projects/auction/mcp-server.mjs
```

Standard stdio-based MCP server using `@modelcontextprotocol/sdk`.

### OpenClaw Configuration

Add to `openclaw.json` under the MCP servers section:

```json
"mcp": {
  "servers": {
    "auction-monitor": {
      "command": "node",
      "args": ["/Users/beaker/MuppetLabs/Projects/auction/mcp-server.mjs"],
      "env": {
        "MONGODB_URI": "mongodb://admin:mongopassword@192.168.1.27:27017/auction?authSource=admin"
      }
    }
  }
}
```

### Requirements

- Node.js v25+
- MongoDB instance at 192.168.1.27:27017 (Unraid Docker)
- npm dependencies installed in project root (`npm install`)

---

## Available Tools

### `scrape_auction`

Scrapes the current week's Thursday auction from Kleinfelter's on HiBid. Fetches all open lots via GraphQL, filters to the Thursday auction, and saves them to MongoDB.

**Parameters:** None

**When to use:** Run once a week (ideally early in the week when lots are posted, typically 10-11 days before the Thursday close). Can be re-run safely — it upserts, so bid data gets updated without duplicating lots.

**Returns:** Summary with lot count, auction ID, close date, and save stats.

---

### `get_weeks`

Lists all auction weeks stored in the database.

**Parameters:** None

**Returns:** List of week dates in YYYY-MM-DD format, sorted most recent first. Use this to find out what data is available before calling other tools.

---

### `get_auction_lots`

Gets auction lots for a given week. Returns lot titles, descriptions, bid info, and HiBid URLs.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `week_of` | string | Yes | Week date in YYYY-MM-DD format |
| `search` | string | No | Filter lots by title or description text |

**Returns:** Formatted list of lots with lot number, title, bid info, lot ID, URL, and description snippet.

---

### `get_interests`

Gets the collector's interest profiles formatted as a detailed evaluation guide.

**Parameters:** None

**Returns:** Markdown-formatted interest profiles including:
- Category name and priority level
- Detailed notes with context
- Direct matches (keyword hits)
- Semantic matches (evaluate by meaning)
- Watch for (confidence boosters)
- Avoid (red flags that indicate non-matches)

**Current interest profiles:**
1. **Vintage Cast Iron Cookware** (high priority) — Griswold, Wagner Ware, gate-marked skillets, etc.
2. **Vintage Toys 1970s-80s** (high priority) — Star Wars, Mego action figures, toys from that era
3. **Comic Books** (medium priority) — Silver/Bronze/Golden age comics, key issues

---

### `get_unevaluated_lots`

Gets lots that haven't been evaluated yet for a given week.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `week_of` | string | Yes | Week date in YYYY-MM-DD format |

**Returns:** List of lots still needing review, with titles, bid info, and descriptions. Returns a success message if all lots have been evaluated.

---

### `save_evaluation`

Saves an evaluation for an auction lot. Call this for every lot reviewed — whether it's interesting or not.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `lot_id` | number | Yes | The numeric lot ID from auction data |
| `auction_id` | number | Yes | The auction ID the lot belongs to |
| `week_of` | string | Yes | Week date in YYYY-MM-DD format |
| `title` | string | Yes | Lot title |
| `description` | string | No | Lot description |
| `url` | string | No | HiBid URL for the lot |
| `image` | string | No | Thumbnail image URL |
| `high_bid` | number | No | Current high bid amount |
| `bid_count` | number | No | Number of bids |
| `interested` | boolean | Yes | Whether this lot matches collector interests |
| `confidence` | enum | Yes | `high`, `medium`, or `low` |
| `category` | string | No | Which interest it matches (e.g. "Vintage Cast Iron", "Vintage Toys", "Comic Books") |
| `reasoning` | string | Yes | Brief explanation of why this is or isn't interesting |
| `match_type` | enum | Yes | `direct` (keyword match), `semantic` (meaning/context match), or `none` |

**Notes:**
- Upserts — safe to re-evaluate the same lot
- Set `interested: true` only for items the collector would genuinely want to know about
- Be specific in `reasoning` — the user sees this in the UI
- Use `confidence: high` only when you're very sure (e.g. "Griswold #8" is clearly cast iron)

---

### `get_week_summary`

Gets a summary of evaluations for a given week.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `week_of` | string | Yes | Week date in YYYY-MM-DD format |

**Returns:** Summary including total evaluated, flagged, and skipped counts. Flagged items grouped by category with titles, confidence levels, and reasoning.

---

### `get_user_picks`

Gets items the user has manually starred in the web UI.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `week_of` | string | Yes | Week date in YYYY-MM-DD format |

**Returns:** List of user-picked lots with bid info and any notes. These are items the user found interesting on their own — useful context for understanding what catches their eye and improving future evaluations.

---

## Recommended Workflow

### Weekly Evaluation (Thursday Auction)

```
1. scrape_auction          → Pull this week's lots into the database
2. get_interests           → Load the collector's interest profiles
3. get_unevaluated_lots    → See what needs reviewing
4. Review lots and call save_evaluation for each one
5. get_week_summary        → Report results to the user
6. get_user_picks          → Check what the user starred themselves (learning context)
```

### Evaluation Guidelines

When reviewing lots:

- **Read the interest profiles carefully** — they contain detailed matching criteria
- **Direct matches** are keyword-based: if a lot title contains "Griswold" or "Star Wars", it's a direct match
- **Semantic matches** require understanding context: "Erie PA skillet" likely means Griswold even without the brand name
- **Watch for** items boost confidence: maker's marks, specific model numbers, era indicators
- **Avoid** items are red flags: reproductions, modern replicas, damaged items (unless the interest profile says otherwise)
- **Be conservative with high confidence** — use it for clear, unambiguous matches
- **Skip irrelevant lots quickly** — most lots won't match. Set `interested: false` with brief reasoning like "Not collectible — household items"
- **Batch by category** — you can process lots in groups, doing all potential cast iron first, then toys, etc.

### User Feedback Loop

After evaluation, the user can review flagged items in the web UI and leave feedback:
- **Good Find** — Beaker flagged something genuinely interesting
- **Not Interested** — False positive, doesn't match interests
- **Already Knew** — Good match but user spotted it themselves

This feedback is stored and can inform future evaluations.

---

## Data Architecture

### MongoDB Database: `auction`

| Collection | Description |
|-----------|-------------|
| `lots` | Scraped auction lots (upserted weekly) |
| `evaluations` | Beaker's assessments per lot |
| `interests` | Collector interest profiles |
| `userpicks` | Items the user manually starred |

### Key Relationships

- Lots and evaluations are linked by `lotId` + `auctionId` (compound unique)
- All records include `weekOf` (YYYY-MM-DD) for filtering by auction week
- User picks reference `lotId` + `auctionId`

---

## Web UI

A companion web app runs at `http://localhost:5000` for browsing lots and reviewing Beaker's evaluations.

**Pages:**
- **All Lots** — Grid view of all lots, sorted by lot number, with search, star/pick toggle, and photo gallery modal
- **Flagged** — Items Beaker flagged, grouped by category, with feedback buttons and photo viewing
- **Interests** — View and edit collector interest profiles

**Running the web UI:**
```bash
cd /Users/beaker/MuppetLabs/Projects/auction
node backend/server.mjs
```

---

## HiBid API Reference

Full API documentation is in `HIBID-API.md`. Key details:

- **Endpoint:** `POST https://kleinfelters.hibid.com/graphql`
- **Headers:** `Accept: application/json`, `Content-Type: application/json`, `SITE_SUBDOMAIN: kleinfelters.hibid.com`
- **Auth:** None needed for public lot data
- **Query:** `lotSearch` with pagination, status filtering, and search

---

## Troubleshooting

### MCP server won't start
- Check that MongoDB is running at 192.168.1.27:27017
- Verify `MONGODB_URI` is set correctly in the env config
- Run `node mcp-server.mjs` directly to see stderr output

### No Thursday auction found
- The auction may not be posted yet (lots typically appear 10-11 days before close)
- Check if Kleinfelter's is running a different schedule that week

### Lots show as already evaluated
- Evaluations persist across scrapes for the same week
- If you need to re-evaluate, the upsert will overwrite previous evaluations

### stdout corruption
- All logging in shared source files uses `console.error` (writes to stderr)
- Never add `console.log` to any file imported by `mcp-server.mjs`
