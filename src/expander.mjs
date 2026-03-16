// AI Interest Expander — generates rich collector profiles from a name + optional notes
import { jsonCompletion } from './llm.mjs';

const SYSTEM_PROMPT = `You are an expert auction collector and appraiser. Given a collecting interest name and optional notes, generate a detailed collector profile for identifying relevant items at a weekly general auction (household goods, antiques, collectibles, tools, etc.).

Return a JSON object with exactly these fields:

{
  "directMatches": ["brand names", "maker marks", "specific product names", "exact terms that should always match"],
  "semanticMatches": ["broader concepts the AI should evaluate contextually", "descriptions that suggest relevance"],
  "watchFor": ["condition signals", "desirable variants", "edition markers", "features that boost value"],
  "avoid": ["common false positives", "mass-produced versions", "red flags", "things that look relevant but aren't"],
  "notes": "Detailed collector knowledge paragraph — what makes items in this category valuable, what to look for, price context, and tips for identifying quality pieces at auction."
}

Guidelines:
- directMatches: 10-25 specific, concrete terms (brand names, maker marks, model numbers). These are keyword hits.
- semanticMatches: 5-15 broader concepts that require context to evaluate (e.g. "pre-war manufacturing" or "hand-painted details").
- watchFor: 5-15 signals that increase an item's value or collectibility.
- avoid: 5-15 things that look relevant but aren't worth bidding on (reproductions, common items, damaged goods that aren't worth restoring).
- notes: 2-4 sentences of expert collector knowledge. Be specific about what makes items valuable in this category.

Be practical — this is for a real weekly auction, not a museum. Focus on items that actually show up at general auctions.`;

/**
 * Expand a collecting interest name + notes into a full profile.
 *
 * @param {string} name — the interest category (e.g. "Board Games", "Cast Iron")
 * @param {string} [userNotes] — optional hint from the user about what they're looking for
 * @returns {Promise<{directMatches: string[], semanticMatches: string[], watchFor: string[], avoid: string[], notes: string, model: string}>}
 */
export async function expandInterest(name, userNotes) {
  let userMessage = `Collecting interest: "${name}"`;
  if (userNotes && userNotes.trim()) {
    userMessage += `\n\nUser notes: ${userNotes.trim()}`;
  }

  console.error(`[expander] Expanding "${name}"...`);

  const result = await jsonCompletion([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ], {
    temperature: 0.5,
    maxTokens: 2048,
    timeout: 180_000, // 3 min — cloud providers can be slow
  });

  const profile = result.data;

  // Validate expected fields
  const requiredArrays = ['directMatches', 'semanticMatches', 'watchFor', 'avoid'];
  for (const field of requiredArrays) {
    if (!Array.isArray(profile[field])) {
      profile[field] = [];
    }
  }
  if (typeof profile.notes !== 'string') {
    profile.notes = '';
  }

  console.error(`[expander] Expanded "${name}": ${profile.directMatches.length} direct, ${profile.semanticMatches.length} semantic, ${profile.watchFor.length} boosters, ${profile.avoid.length} red flags`);

  return {
    directMatches: profile.directMatches,
    semanticMatches: profile.semanticMatches,
    watchFor: profile.watchFor,
    avoid: profile.avoid,
    notes: profile.notes,
    model: result.model,
  };
}
