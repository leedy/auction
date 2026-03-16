// Compare LLM models side-by-side on sample auction items
// Usage:
//   node test-llm-compare.mjs                          # uses models from COMPARE_MODELS env or defaults
//   node test-llm-compare.mjs model1 model2 model3     # specify models as args
//
// Requires LLM_BASE_URL and LLM_API_KEY in .env — model is overridden per-run
import { chatCompletion, jsonCompletion, getLLMConfig } from './src/llm.mjs';

// Sample auction lots for testing — mix of obvious, subtle, and non-matches
const SAMPLE_LOTS = [
  {
    title: 'Griswold #8 Cast Iron Skillet Erie PA',
    description: 'Vintage Griswold #8 skillet with Erie PA marking. Good condition, sits flat. Some pitting on cooking surface.',
  },
  {
    title: 'Lodge Cast Iron Skillet 10 inch',
    description: '10 inch Lodge cast iron skillet. Modern production. Good condition.',
  },
  {
    title: 'Box of Kitchen Utensils',
    description: 'Miscellaneous kitchen utensils, spatulas, wooden spoons, etc.',
  },
  {
    title: 'Vintage Star Wars Action Figures Lot',
    description: 'Lot of 12 Star Wars action figures. Appears to be 1977-1983 era. Some accessories missing.',
  },
  {
    title: 'Comic Books Short Box',
    description: 'Short box of comic books, mostly 1990s. Marvel and DC. Titles include X-Men, Batman, Spider-Man.',
  },
  {
    title: 'Wagner Ware Sidney O Drip Drop Roaster',
    description: 'Wagner Ware roaster with drip drop basting lid. Sidney O marking. Complete with lid.',
  },
  {
    title: 'Folding Table',
    description: '6 foot folding table. Good condition.',
  },
  {
    title: 'Pyrex Primary Colors Mixing Bowl Set',
    description: 'Complete set of 4 Pyrex nesting mixing bowls in primary colors (blue, red, green, yellow). Good condition, minimal wear.',
  },
];

const SYSTEM_PROMPT = `You are an auction item evaluator for a collector. Evaluate each item against the collector's interests.

## Collector Interests

### Vintage Cast Iron Cookware [high priority]
Collectible cast iron from the late 1800s through mid-1900s. Focus on pre-1960 American makers.
Direct matches: Griswold, Wagner, Sidney, Erie, Favorite, Wapak, Birmingham Stove
Semantic matches: gate marked, heat ring, block logo, slant logo
Watch for: Erie PA markings, patent dates, unusual sizes
Avoid: Lodge (modern production), unmarked imports, reproductions

### Vintage Toys & Games [medium priority]
Pre-1990 toys with collector value. Action figures, board games, tin toys, die-cast.
Direct matches: Star Wars, GI Joe, Transformers, Hot Wheels, Matchbox, Marx, Tonka
Semantic matches: vintage action figure, collectible toy, retro game
Watch for: original packaging, complete sets, first editions
Avoid: modern reproductions, common 1990s mass market toys

### Comic Books [low priority]
Comics with potential collector value. Focus on key issues, first appearances, silver/bronze age.
Direct matches: first appearance, key issue, silver age, bronze age, golden age
Semantic matches: rare comic, vintage comic, graded comic
Watch for: CGC graded, low print run, variant cover
Avoid: 1990s overproduced titles (X-Men #1 1991, Death of Superman), poor condition readers

For each item, return a JSON object with:
- interested: boolean
- confidence: "high", "medium", or "low"
- category: which interest matched (or null)
- reasoning: brief explanation (1-2 sentences)
- matchType: "direct", "semantic", or "none"`;

function buildUserPrompt(lot) {
  let prompt = `Evaluate this auction item:\nTitle: ${lot.title}`;
  if (lot.description) {
    prompt += `\nDescription: ${lot.description}`;
  }
  prompt += '\n\nReturn your evaluation as JSON.';
  return prompt;
}

async function evaluateWithModel(model, lots) {
  const results = [];

  for (const lot of lots) {
    const start = Date.now();
    try {
      const result = await jsonCompletion(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(lot) },
        ],
        { model, temperature: 0.2 }
      );
      results.push({
        lot: lot.title,
        ...result.data,
        model: result.model,
        timeMs: Date.now() - start,
        tokens: result.usage,
        error: null,
      });
    } catch (err) {
      results.push({
        lot: lot.title,
        error: err.message,
        model,
        timeMs: Date.now() - start,
      });
    }
  }

  return results;
}

function printComparisonTable(allResults) {
  const models = Object.keys(allResults);

  for (const lot of SAMPLE_LOTS) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`LOT: ${lot.title}`);
    console.log(`${'─'.repeat(80)}`);

    for (const model of models) {
      const result = allResults[model].find((r) => r.lot === lot.title);
      if (!result) continue;

      const shortModel = model.length > 30 ? '...' + model.slice(-27) : model;

      if (result.error) {
        console.log(`  ${shortModel.padEnd(30)} ERROR: ${result.error}`);
        continue;
      }

      const flag = result.interested ? '✓ YES' : '✗ no ';
      const conf = (result.confidence || '?').padEnd(6);
      const cat = (result.category || '—').padEnd(25);
      const time = `${result.timeMs}ms`;

      console.log(`  ${shortModel.padEnd(30)} ${flag}  ${conf}  ${cat}  ${time}`);
      if (result.reasoning) {
        console.log(`  ${''.padEnd(30)} → ${result.reasoning}`);
      }
    }
  }
}

function printSummary(allResults) {
  const models = Object.keys(allResults);

  console.log(`\n${'═'.repeat(80)}`);
  console.log('SUMMARY');
  console.log(`${'═'.repeat(80)}`);

  for (const model of models) {
    const results = allResults[model].filter((r) => !r.error);
    const errors = allResults[model].filter((r) => r.error);
    const flagged = results.filter((r) => r.interested);
    const totalTime = allResults[model].reduce((sum, r) => sum + (r.timeMs || 0), 0);
    const totalTokensIn = results.reduce((sum, r) => sum + (r.tokens?.prompt_tokens || 0), 0);
    const totalTokensOut = results.reduce((sum, r) => sum + (r.tokens?.completion_tokens || 0), 0);

    console.log(`\n  ${model}`);
    console.log(`    Flagged: ${flagged.length}/${results.length} lots`);
    console.log(`    Errors:  ${errors.length}`);
    console.log(`    Time:    ${totalTime}ms total, ${Math.round(totalTime / SAMPLE_LOTS.length)}ms avg`);
    if (totalTokensIn > 0) {
      console.log(`    Tokens:  ${totalTokensIn} in / ${totalTokensOut} out`);
    }
  }

  // Agreement analysis
  if (models.length > 1) {
    console.log(`\n  AGREEMENT`);
    for (const lot of SAMPLE_LOTS) {
      const votes = models.map((m) => {
        const r = allResults[m].find((r) => r.lot === lot.title);
        return r?.interested ? 'Y' : 'N';
      });
      const allAgree = votes.every((v) => v === votes[0]);
      const marker = allAgree ? '  ' : '⚠ ';
      const shortTitle = lot.title.length > 45 ? lot.title.substring(0, 42) + '...' : lot.title;
      console.log(`    ${marker}${shortTitle.padEnd(45)} ${votes.join(' / ')}`);
    }
    console.log(`\n    Legend: ${models.map((m, i) => m).join(' / ')}`);
  }
}

async function main() {
  console.log('=== LLM Model Comparison ===\n');

  const config = await getLLMConfig();
  if (!config) {
    console.log('ERROR: LLM not configured. Set LLM_BASE_URL and LLM_API_KEY in .env');
    process.exit(1);
  }

  console.log(`Provider: ${config.provider}`);
  console.log(`Base URL: ${config.baseUrl}`);

  // Get models to compare: CLI args > env var > default model
  let models;
  if (process.argv.length > 2) {
    models = process.argv.slice(2);
  } else if (process.env.COMPARE_MODELS) {
    models = process.env.COMPARE_MODELS.split(',').map((m) => m.trim());
  } else {
    models = [config.model];
    console.log('\nTip: Compare multiple models with:');
    console.log('  node test-llm-compare.mjs openai/gpt-4o-mini anthropic/claude-haiku-4-5-20251001');
    console.log('  or set COMPARE_MODELS=model1,model2 in .env\n');
  }

  console.log(`\nModels to compare: ${models.join(', ')}`);
  console.log(`Sample lots: ${SAMPLE_LOTS.length}`);

  const allResults = {};

  for (const model of models) {
    console.log(`\nEvaluating with ${model}...`);
    allResults[model] = await evaluateWithModel(model, SAMPLE_LOTS);
    const errors = allResults[model].filter((r) => r.error).length;
    if (errors > 0) {
      console.log(`  ⚠ ${errors} errors`);
    }
  }

  printComparisonTable(allResults);
  printSummary(allResults);
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});
