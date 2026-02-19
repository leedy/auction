#!/usr/bin/env node

// Auction Monitor MCP Server
// Exposes auction lot data, interests, evaluations, and scraping as MCP tools
// Connects via stdio for OpenClaw Gateway integration

// IMPORTANT: Never use console.log in stdio MCP servers — it corrupts JSON-RPC.
// Use console.error for all logging (writes to stderr).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { loadEnv } from './src/env.mjs';
loadEnv();

import { connectDB } from './src/db.mjs';
import { fetchThursdayAuction } from './src/scraper.mjs';
import { saveLots, getLotsByWeek, getStoredWeeks } from './src/store.mjs';
import {
  getActiveInterests,
  getInterestsAsPrompt,
  getInterestsSummary,
} from './src/interests.mjs';
import {
  saveLotEvaluation,
  saveBulkEvaluations,
  getFlaggedLots,
  getUnevaluatedLots,
  getWeekSummary,
} from './src/evaluations.mjs';
import UserPick from './src/models/UserPick.mjs';

// --- Create MCP Server ---

const server = new McpServer({
  name: 'auction-monitor',
  version: '1.0.0',
});

// --- Tool: scrape_auction ---

server.tool(
  'scrape_auction',
  'Scrape the current week\'s Thursday auction from Kleinfelter\'s on HiBid. Fetches all open lots, filters to the Thursday auction, and saves them to the database. Run this once a week (ideally early in the week) to load new auction data.',
  {},
  async () => {
    console.error('[mcp] scrape_auction: starting...');
    try {
      const result = await fetchThursdayAuction();

      if (result.lots.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No Thursday auction found. The weekly auction may not be posted yet, or it may have already closed.',
          }],
        };
      }

      const storeResult = await saveLots(result.lots, result.fetchedAt);
      const weekOf = result.bidCloseDateTime?.split('T')[0] || 'unknown';

      const summary = [
        `Scraped ${result.lots.length} lots from Kleinfelter's Thursday auction.`,
        `Auction ID: ${result.auctionId}`,
        `Closes: ${result.bidCloseDateTime}`,
        `Week: ${weekOf}`,
        `Saved: ${storeResult.inserted} new, ${storeResult.updated} updated, ${storeResult.errors.length} errors`,
      ].join('\n');

      console.error(`[mcp] scrape_auction: done — ${result.lots.length} lots saved`);
      return { content: [{ type: 'text', text: summary }] };
    } catch (err) {
      console.error(`[mcp] scrape_auction error: ${err.message}`);
      return { content: [{ type: 'text', text: `Error scraping auction: ${err.message}` }] };
    }
  }
);

// --- Tool: get_weeks ---

server.tool(
  'get_weeks',
  'Get a list of all auction weeks stored in the database. Returns week dates (YYYY-MM-DD format) sorted most recent first. Use this to find out what data is available.',
  {},
  async () => {
    try {
      const weeks = await getStoredWeeks();
      weeks.sort((a, b) => b.localeCompare(a));

      if (weeks.length === 0) {
        return { content: [{ type: 'text', text: 'No auction data stored yet. Run scrape_auction first.' }] };
      }

      return {
        content: [{ type: 'text', text: `Available weeks:\n${weeks.map((w) => `• ${w}`).join('\n')}` }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  }
);

// --- Tool: get_auction_lots ---

server.tool(
  'get_auction_lots',
  'Get auction lots for a given week. Returns lot titles, descriptions, bid info, and URLs. Use this to review what\'s in the auction before evaluating.',
  {
    week_of: z.string().describe('Week date in YYYY-MM-DD format (e.g. "2026-02-19"). Use get_weeks to see available weeks.'),
    search: z.string().optional().describe('Optional search text to filter lots by title or description.'),
  },
  async ({ week_of, search }) => {
    try {
      let lots = await getLotsByWeek(week_of);

      if (search) {
        const q = search.toLowerCase();
        lots = lots.filter(
          (lot) =>
            lot.title?.toLowerCase().includes(q) ||
            lot.description?.toLowerCase().includes(q)
        );
      }

      if (lots.length === 0) {
        return { content: [{ type: 'text', text: `No lots found for week ${week_of}${search ? ` matching "${search}"` : ''}.` }] };
      }

      // Format lots concisely for the AI
      const formatted = lots.map((lot) => {
        const bid = lot.bidCount > 0 ? `$${lot.highBid} (${lot.bidCount} bids)` : `Min: $${lot.minBid}`;
        return `[Lot #${lot.lotNumber}] ${lot.title}\n  ${bid} | ID: ${lot.lotId} | ${lot.url}\n  ${lot.description ? lot.description.substring(0, 150) : '(no description)'}`;
      });

      return {
        content: [{
          type: 'text',
          text: `${lots.length} lots for week ${week_of}${search ? ` matching "${search}"` : ''}:\n\n${formatted.join('\n\n')}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  }
);

// --- Tool: get_interests ---

server.tool(
  'get_interests',
  'Get the collector\'s interest profiles. Returns detailed matching criteria including direct keyword matches, semantic concepts, confidence boosters, and red flags. Use this to understand what the collector is looking for before evaluating lots.',
  {},
  async () => {
    try {
      const prompt = await getInterestsAsPrompt();
      return { content: [{ type: 'text', text: prompt }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  }
);

// --- Tool: get_unevaluated_lots ---

server.tool(
  'get_unevaluated_lots',
  'Get lots that haven\'t been evaluated yet for a given week. Returns lots that still need to be reviewed. Use this to know what work remains.',
  {
    week_of: z.string().describe('Week date in YYYY-MM-DD format.'),
  },
  async ({ week_of }) => {
    try {
      const lots = await getUnevaluatedLots(week_of);

      if (lots.length === 0) {
        return { content: [{ type: 'text', text: `All lots for week ${week_of} have been evaluated!` }] };
      }

      const formatted = lots.map((lot) => {
        const bid = lot.bidCount > 0 ? `$${lot.highBid} (${lot.bidCount} bids)` : `Min: $${lot.minBid}`;
        return `[Lot #${lot.lotNumber}] ${lot.title}\n  ${bid} | ID: ${lot.lotId}\n  ${lot.description ? lot.description.substring(0, 150) : '(no description)'}`;
      });

      return {
        content: [{
          type: 'text',
          text: `${lots.length} lots still need evaluation for week ${week_of}:\n\n${formatted.join('\n\n')}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  }
);

// --- Tool: save_evaluation ---

server.tool(
  'save_evaluation',
  'Save your evaluation of an auction lot. Call this for each lot you review — whether it\'s interesting or not. Set interested=true for items the collector would want to know about.',
  {
    lot_id: z.number().describe('The lot ID (numeric) from the auction data.'),
    auction_id: z.number().describe('The auction ID the lot belongs to.'),
    week_of: z.string().describe('Week date in YYYY-MM-DD format.'),
    title: z.string().describe('Lot title.'),
    description: z.string().optional().describe('Lot description.'),
    url: z.string().optional().describe('URL to the lot on HiBid.'),
    image: z.string().optional().describe('Thumbnail image URL.'),
    high_bid: z.number().optional().describe('Current high bid.'),
    bid_count: z.number().optional().describe('Number of bids.'),
    interested: z.boolean().describe('Whether this lot matches the collector\'s interests.'),
    confidence: z.enum(['high', 'medium', 'low']).describe('How confident you are in this evaluation.'),
    category: z.string().optional().describe('Which interest category this matches (e.g. "Vintage Cast Iron", "Vintage Toys", "Comic Books").'),
    reasoning: z.string().describe('Brief explanation of why this is or isn\'t interesting.'),
    match_type: z.enum(['direct', 'semantic', 'none']).describe('Whether the match was by keyword (direct), by meaning/context (semantic), or no match (none).'),
  },
  async ({ lot_id, auction_id, week_of, title, description, url, image, high_bid, bid_count, interested, confidence, category, reasoning, match_type }) => {
    try {
      const result = await saveLotEvaluation({
        lotId: lot_id,
        auctionId: auction_id,
        weekOf: week_of,
        title,
        description: description || '',
        url: url || '',
        image: image || '',
        highBid: high_bid || 0,
        bidCount: bid_count || 0,
        interested,
        confidence,
        category: category || null,
        reasoning,
        matchType: match_type,
      });

      const status = interested ? `FLAGGED (${confidence} confidence, ${category})` : 'SKIPPED';
      return {
        content: [{ type: 'text', text: `Evaluation saved for Lot #${lot_id}: ${status}\nReasoning: ${reasoning}` }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error saving evaluation: ${err.message}` }] };
    }
  }
);

// --- Tool: get_week_summary ---

server.tool(
  'get_week_summary',
  'Get a summary of evaluations for a given week. Shows how many lots were flagged vs skipped, grouped by category. Good for reporting results to the user.',
  {
    week_of: z.string().describe('Week date in YYYY-MM-DD format.'),
  },
  async ({ week_of }) => {
    try {
      const summary = await getWeekSummary(week_of);

      if (summary.totalEvaluated === 0) {
        return { content: [{ type: 'text', text: `No evaluations yet for week ${week_of}.` }] };
      }

      let text = `Week ${week_of} Summary:\n`;
      text += `• ${summary.totalEvaluated} lots evaluated\n`;
      text += `• ${summary.totalFlagged} flagged as interesting\n`;
      text += `• ${summary.totalSkipped} skipped\n\n`;

      if (summary.totalFlagged > 0) {
        text += 'Flagged items by category:\n';
        for (const [category, items] of Object.entries(summary.byCategory)) {
          text += `\n### ${category} (${items.length})\n`;
          for (const item of items) {
            text += `• [Lot #${item.lotId}] ${item.title} — ${item.confidence} confidence\n  ${item.reasoning}\n`;
          }
        }
      }

      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  }
);

// --- Tool: get_user_picks ---

server.tool(
  'get_user_picks',
  'Get items the user has manually starred/picked from the auction. These are lots the user found interesting on their own (separate from AI evaluations). Useful context for understanding what catches the user\'s eye.',
  {
    week_of: z.string().describe('Week date in YYYY-MM-DD format.'),
  },
  async ({ week_of }) => {
    try {
      const picks = await UserPick.find({ weekOf: week_of }).lean();

      if (picks.length === 0) {
        return { content: [{ type: 'text', text: `No user picks for week ${week_of}.` }] };
      }

      // Fetch the lot data for each pick
      const Lot = (await import('./src/models/Lot.mjs')).default;
      const lotIds = picks.map((p) => p.lotId);
      const lots = await Lot.find({ lotId: { $in: lotIds } }).lean();
      const lotMap = {};
      for (const lot of lots) lotMap[lot.lotId] = lot;

      const formatted = picks.map((pick) => {
        const lot = lotMap[pick.lotId];
        if (!lot) return `• Lot ${pick.lotId} (data not found)${pick.note ? ` — Note: ${pick.note}` : ''}`;
        const bid = lot.bidCount > 0 ? `$${lot.highBid} (${lot.bidCount} bids)` : `Min: $${lot.minBid}`;
        return `• [Lot #${lot.lotNumber}] ${lot.title}\n  ${bid} | ${lot.url}${pick.note ? `\n  User note: ${pick.note}` : ''}`;
      });

      return {
        content: [{
          type: 'text',
          text: `${picks.length} user picks for week ${week_of}:\n\n${formatted.join('\n\n')}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }] };
    }
  }
);

// --- Start Server ---

async function main() {
  console.error('[mcp] Auction Monitor MCP server starting...');
  await connectDB();
  console.error('[mcp] Database connected.');

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp] MCP server running on stdio.');
}

main().catch((err) => {
  console.error(`[mcp] Fatal error: ${err.message}`);
  process.exit(1);
});
