# App Roadmap

## Bugs & Fixes (from code review)

- [ ] **Port mismatch** — `server.mjs` defaults to port 5000 but CLAUDE.md and ecosystem config say 3006. Works in prod because PM2/env sets it, but `npm run dev` would use wrong port. Fix the default.
- [ ] **Catch-all route swallows API 404s** — `server.mjs:49` serves `index.html` for `*`, including mistyped `/api/foo`. Should exclude `/api` paths.
- [ ] **Evaluation confidence sort is wrong** — `evaluations.mjs:72` sorts alphabetically, putting "low" before "medium". Needs custom sort order.
- [ ] **`getUnevaluatedLots` is inefficient** — loads all lots and evaluations into memory, filters in JS. Use a MongoDB `$nin` query instead.
- [ ] **Sequential lot saves** — `store.mjs` does individual `findOneAndUpdate` for 300+ lots. `bulkWrite` would be significantly faster.
- [ ] **Sequential page fetches** — scraper fetches pages one at a time. After page 1, remaining pages could fetch in parallel.
- [ ] **No error display in frontend** — all pages swallow errors with `console.error`. Users see nothing when API fails.
- [ ] **CORS wide open** — `cors()` with no origin restriction. Fine for LAN, should lock down if ever exposed.
- [ ] **No input validation on interests POST** — `req.body` passed directly to `addInterest`. Mongoose provides some safety but explicit validation is better.
- [ ] **`update-interests.mjs` uses old schema** — references `keywords`/`context`/`exampleMatches` fields that don't exist in current model. Would fail if run.
- [ ] **`weekOf` timezone risk** — `split('T')[0]` on UTC dates could give wrong day for US timezone auctions.

---

## Feature Summary

### AI Features (shared LLM config)
1. **AI Interest Expansion** — build rich interest profiles from a simple name + note
2. **AI Lot Evaluation** — self-evaluate auction lots against profiles in batches
3. **Image-Based Evaluation** — use vision models to read maker marks, logos, condition from photos
4. **Feedback Loop** — feed user feedback back into evaluation prompts to improve accuracy over time

### App Features
5. **Scrape from UI** — "Refresh Auction" button instead of SSH + scripts
6. **Price Alerts / Bid Tracking** — re-scrape periodically, track bid changes on picked/flagged items
7. **Notifications** — push/email when new lots flagged or picked item bids change
8. **Auction History & Trends** — price trends across weeks ("Griswold #8s go for $45-$120")
9. **Multi-Auction Support** — configurable auction sources (other HiBid sellers use same API)
10. **Export Picks** — printable list or CSV of starred/flagged items to take to the auction
11. **Saved Searches** — quick filters like "under $20 with no bids" to find sleeper lots
12. **Mobile Polish** — improve lot grid and detail modal for phone use at the auction

---

## Feature 1: AI Interest Expansion

### Problem

Creating a good interest profile requires deep collector knowledge. The current profiles (Cast Iron, Vintage Toys, Comic Books) were built by an AI expanding simple category names into detailed directMatches, semanticMatches, watchFor, avoid, and notes. That process happened in a one-off Claude session via `seed-interests.mjs` — there's no way to do it from the app.

### How It Works

1. User goes to Interests page, clicks "+ New Interest"
2. Types a name like "Board Games" and a brief note like "vintage strategy and family games from the 70s-90s"
3. Clicks "AI Expand" button
4. LLM generates: directMatches (brand names, specific games), semanticMatches (concepts), watchFor (condition signals, editions), avoid (red flags), and detailed collector notes
5. User reviews the generated profile, edits anything that's off, then saves
6. After seeing evaluation results, user can refine — edit matches, add/remove keywords, adjust notes — and re-evaluate

### Workflow: Start Small, Refine

```
"Board Games" + brief note
        ↓  AI Expand
Rich profile (directMatches, semanticMatches, watchFor, avoid, notes)
        ↓  Save & run evaluation
See results on Flagged page
        ↓  Too many false positives? Missing things?
Edit the interest profile (add avoids, tweak matches)
        ↓  Re-evaluate
Better results → repeat as needed
```

### Files to Create/Modify

| File | Change |
|------|--------|
| `src/expander.mjs` | **New** — sends interest name + notes to LLM, returns full profile |
| `backend/routes/interests.mjs` | Add `POST /api/interests/expand` endpoint |
| `frontend/src/services/api.js` | Add `expandInterest(name, notes)` function |
| `frontend/src/components/InterestForm.jsx` | Add "AI Expand" button, loading state, pre-fill form with results |

### Prompt Design

System prompt tells the LLM to act as a collector/auction expert. User message provides the interest name and any notes. LLM returns JSON matching the Interest schema:

```json
{
  "directMatches": ["brand names", "specific terms"],
  "semanticMatches": ["concepts to evaluate"],
  "watchFor": ["condition signals", "desirable variants"],
  "avoid": ["red flags", "common false positives"],
  "notes": "Detailed collector knowledge..."
}
```

This is a single LLM call per interest — cheap regardless of provider.

---

## Feature 2: AI Lot Evaluation

### Goal

Self-evaluate auction lots against collector interest profiles without depending on an external MCP agent (Beaker/OpenClaw).

## How It Works

1. "Run AI Evaluation" button on the Flagged page
2. Backend loads interest profiles via `getInterestsAsPrompt()`
3. Gets all unevaluated lots for the selected week
4. Sends them to an LLM in batches of ~30 with a structured prompt
5. LLM returns JSON evaluations (interested, confidence, category, reasoning, matchType)
6. Results saved via existing `saveBulkEvaluations`
7. Frontend polls for progress and auto-refreshes when done

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/evaluator.mjs` | **New** — core module: prompt building, batch logic, LLM API calls |
| `backend/routes/evaluations.mjs` | Add `POST /run`, `GET /status`, `POST /cancel` endpoints |
| `frontend/src/pages/Flagged.jsx` | Add evaluate button, progress bar, cancel button |
| `frontend/src/services/api.js` | Add 3 new API functions |
| `package.json` | Add LLM SDK dependency (if needed) |
| `.env.example` | Add `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` |
| `test-ai-evaluate.mjs` | **New** — test script for validating on a small sample |

## LLM Provider Options

The evaluator should be provider-agnostic. Configure via env vars:

```
LLM_BASE_URL=https://openrouter.ai/api/v1   # or local Ollama, z.ai, etc.
LLM_API_KEY=your-key
LLM_MODEL=anthropic/claude-sonnet-4-20250514
```

### OpenRouter (cloud)
- Access to Claude, GPT, Gemini, etc. through one API key
- OpenAI-compatible API format
- ~$0.05-0.10 per weekly auction run with Sonnet

### z.ai (cloud)
- Offers GLM-5 and other models
- Would work if API is OpenAI-compatible

### Local via Ollama (recommended for cost)
- Runs on Mac Mini M4 Pro with 64GB RAM
- Exposes OpenAI-compatible API on `http://localhost:11434/v1`
- Zero ongoing cost after setup

## Model Recommendations

### Best value for this task
- **Qwen 2.5 32B** (local, ~20GB RAM) — excellent structured JSON output, strong instruction following. Best local option.
- **Claude Sonnet** or **GPT-4o-mini** (cloud) — fast, cheap, strong at structured classification.

### Budget/fast
- **Claude Haiku 4.5** or **Gemini 2.0 Flash** (cloud) — very cheap, good for keyword-heavy matches.
- **Llama 3.1 8B** or **Qwen 2.5 7B** (local, ~5-6GB) — fast but may miss subtle semantic matches.

### Bigger local models (fit in 64GB)
- **Llama 3.1 70B** (Q4, ~42GB) — more capable, slower inference.
- **Qwen 2.5 72B** (Q4, ~44GB) — excellent but likely overkill.

### Overkill (don't need for classification)
- Claude Opus, GPT-4o, GPT-o3 — paying for reasoning ability this task doesn't require.

## Why Batches of 30

- **One-at-a-time**: 300+ API calls, expensive and slow (system prompt repeated every call)
- **All-at-once**: risks output token limits, one failure loses everything
- **Batches of 30**: interest prompt sent once per batch, partial progress saved, cost-efficient

## Recommended Starting Point

Qwen 2.5 32B via Ollama on the Mac Mini. Best balance of quality, speed, and cost (free). If accuracy isn't sufficient, fall back to Claude Sonnet via OpenRouter.

Install: `ollama run qwen2.5:32b`

```
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=unused
LLM_MODEL=qwen2.5:32b
```

---

## Feature 3: Image-Based Evaluation

Auction titles are often vague — "Cast Iron Pan" with no brand name. But the photos frequently show maker marks, logos, and condition details that a text-only evaluation misses. Already requested in `Beaker_requests.md`.

### Approach
- When evaluating lots, include thumbnail URLs in the LLM request
- Requires a vision-capable model (GPT-4o, Claude Sonnet, Gemini Flash — all support images)
- Local option: LLaVA or Qwen-VL via Ollama
- Could be a second-pass evaluation — text-first to filter, then vision on "maybe" items to save cost

### Considerations
- Sending images increases token cost significantly — use selectively
- HiBid thumbnails are low-res; full-size images are better but larger
- Most valuable for: maker marks on cast iron, comic book covers/grades, toy packaging condition

---

## Feature 4: Feedback Loop

The Evaluation model already tracks `userFeedback` (good_find, not_interested, already_knew) but nothing uses it. Feeding this back into the evaluation prompt would improve accuracy over time.

### Approach
- Before evaluating, query past feedback for the same interest categories
- Include examples in the prompt: "Items like 'Lodge Cast Iron Skillet 10 inch' were marked not_interested" and "Items like 'Griswold #8 Erie PA Skillet' were marked good_find"
- Over time, the evaluator learns what the collector actually wants vs. what the profile says
- Could also auto-suggest profile refinements: "You've marked 3 Lodge items as not_interested — add 'Lodge' to the avoid list?"

---

## Feature 5: Scrape from UI

Currently requires SSH to run `node test-store.mjs` or MCP tools. Add a button to the Lots page.

### Implementation
- `POST /api/lots/scrape` endpoint — calls `fetchThursdayAuction()` + `saveLots()`
- Button on Lots page header: "Refresh Auction"
- Show progress: "Scraping page 3/5..." then "Saved 312 lots"
- Auto-refresh lot list on completion
- Simple — no LLM needed, just wiring up existing code to the UI

---

## Feature 6: Price Alerts / Bid Tracking

Lots are scraped once as a snapshot. Bids change throughout the week.

### Approach
- Periodic re-scrape (cron or manual) that updates bid data on existing lots
- Track bid history: store snapshots so you can see "this went from $5 to $45 in 2 days"
- Alert when a picked/flagged item gets new bids or crosses a price threshold
- Could show "hot" indicator on lots with rapid bid activity

---

## Feature 7: Notifications

No way to know about new flags or bid changes without opening the app.

### Options
- **Email** — simplest, use Nodemailer or a service like SendGrid
- **Push notifications** — requires service worker (PWA), more complex
- **Webhook** — post to Discord/Slack channel
- Trigger on: new lots flagged after evaluation, bid changes on picked items, auction closing soon

---

## Feature 8: Auction History & Trends

Week-over-week data is accumulating in MongoDB. Make it useful.

### Ideas
- Price history for similar items across weeks
- "Griswold #8 skillets have sold for $45-$120 over the last 6 months"
- Category trends: "Comic book lots are averaging more bids this month"
- Help inform bidding strategy — know what things actually go for at this auction

---

## Feature 9: Multi-Auction Support

The scraper is hardcoded to `kleinfelters.hibid.com`. Other HiBid sellers use the same GraphQL API.

### Approach
- Make `GRAPHQL_URL` and `SITE_SUBDOMAIN` configurable per auction source
- Add an `AuctionSource` model: name, subdomain, schedule (Thursday, Saturday, etc.)
- Scraper accepts a source parameter instead of hardcoding Kleinfelter's
- UI: auction source selector alongside week selector
- Same evaluation pipeline works regardless of source

---

## Feature 10: Export Picks

Take a list to the auction without needing the app open.

### Options
- CSV download of picked/flagged items (lot number, title, current bid, notes)
- Printable HTML view — compact list optimized for paper
- Could include thumbnail images for recognition at the auction
- Endpoint: `GET /api/picks/export?weekOf=2026-02-19&format=csv`

---

## Feature 11: Saved Searches

Beyond interest profiles, quick filters for browsing lots.

### Examples
- "Under $20 with no bids" — find sleeper lots
- "Closing in < 1 hour" — last-minute opportunities
- "Has 'vintage' in title, under $50"
- Save as named filters, show as quick buttons on Lots page

---

## Feature 12: Mobile Polish

The app works on mobile but could be smoother for use at the auction.

### Areas to improve
- Lot grid: larger touch targets, swipe between lots
- Detail modal: full-screen on mobile, swipe to next/previous lot
- Flagged page: more compact card layout for scanning
- Bottom nav instead of top nav on mobile
- Pull-to-refresh gesture
- Consider PWA (installable, works offline with cached data)
