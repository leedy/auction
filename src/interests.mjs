// Interest profile management — CRUD operations
import Interest from './models/Interest.mjs';

/**
 * Get all active interests, sorted by priority (high first).
 */
export async function getActiveInterests() {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const interests = await Interest.find({ active: true }).lean();
  interests.sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));
  return interests;
}

/**
 * Get all interests (including inactive).
 */
export async function getAllInterests() {
  return Interest.find().sort({ name: 1 }).lean();
}

/**
 * Add a new interest. Returns the created document.
 */
export async function addInterest({ name, priority, directMatches, semanticMatches, watchFor, avoid, notes }) {
  const interest = await Interest.create({
    name,
    priority: priority || 'medium',
    directMatches: directMatches || [],
    semanticMatches: semanticMatches || [],
    watchFor: watchFor || [],
    avoid: avoid || [],
    notes,
    active: true,
  });
  console.error(`[interests] Added: "${name}" (${priority || 'medium'})`);
  return interest.toObject();
}

/**
 * Update an existing interest by name. Pass only the fields to change.
 */
export async function updateInterest(name, updates) {
  const interest = await Interest.findOneAndUpdate(
    { name },
    { $set: updates },
    { new: true }
  );
  if (!interest) {
    throw new Error(`Interest "${name}" not found`);
  }
  console.error(`[interests] Updated: "${name}"`);
  return interest.toObject();
}

/**
 * Remove an interest by name (hard delete).
 */
export async function removeInterest(name) {
  const result = await Interest.deleteOne({ name });
  if (result.deletedCount === 0) {
    throw new Error(`Interest "${name}" not found`);
  }
  console.error(`[interests] Removed: "${name}"`);
}

/**
 * Toggle an interest active/inactive by name.
 */
export async function toggleInterest(name) {
  const interest = await Interest.findOne({ name });
  if (!interest) {
    throw new Error(`Interest "${name}" not found`);
  }
  interest.active = !interest.active;
  await interest.save();
  console.error(`[interests] "${name}" is now ${interest.active ? 'active' : 'inactive'}`);
  return interest.toObject();
}

/**
 * Format all active interests as a structured prompt for the AI evaluator.
 * This is what gets sent to Claude API alongside lot data.
 */
export async function getInterestsAsPrompt() {
  const interests = await getActiveInterests();

  if (interests.length === 0) {
    return 'No collector interests are currently defined.';
  }

  const sections = interests.map((i) => {
    let section = `## ${i.name} [${i.priority} priority]\n\n`;
    section += `${i.notes}\n`;

    if (i.directMatches?.length > 0) {
      section += `\nDirect matches (keyword hits): ${i.directMatches.join(', ')}\n`;
    }
    if (i.semanticMatches?.length > 0) {
      section += `\nSemantic matches (evaluate meaning): ${i.semanticMatches.join(', ')}\n`;
    }
    if (i.watchFor?.length > 0) {
      section += `\nWatch for (confidence boosters): ${i.watchFor.join(', ')}\n`;
    }
    if (i.avoid?.length > 0) {
      section += `\nAvoid (red flags): ${i.avoid.join(', ')}\n`;
    }

    return section;
  });

  return `# Collector Interest Profile\n\n${sections.join('\n')}`;
}

/**
 * Format all interests as a concise readable list (for OpenClaw summaries).
 */
export async function getInterestsSummary() {
  const interests = await getAllInterests();

  if (interests.length === 0) {
    return 'No interests defined yet.';
  }

  return interests.map((i) => {
    const status = i.active ? '✓' : '✗';
    return `${status} ${i.name} (${i.priority}) — ${i.directMatches?.length || 0} direct, ${i.semanticMatches?.length || 0} semantic`;
  }).join('\n');
}
