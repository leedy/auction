// Test LLM connection — verifies config, sends a simple prompt, prints the response
import { chatCompletion, jsonCompletion, getLLMConfig } from './src/llm.mjs';

async function main() {
  console.log('=== LLM Connection Test ===\n');

  // Show config
  const config = getLLMConfig();
  if (!config) {
    console.log('ERROR: LLM not configured. Set LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL in .env');
    process.exit(1);
  }

  console.log(`Provider: ${config.provider}`);
  console.log(`Model:    ${config.model}`);
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(`API Key:  ${config.hasApiKey ? 'set' : 'not set'}`);

  // Test 1: Simple text completion
  console.log('\n--- Test 1: Text Completion ---\n');
  const start1 = Date.now();
  const textResult = await chatCompletion([
    { role: 'system', content: 'You are a helpful assistant. Be very brief.' },
    { role: 'user', content: 'Name three types of antique cast iron cookware in one sentence.' },
  ]);
  const time1 = Date.now() - start1;

  console.log(`Response: ${textResult.content}`);
  console.log(`Model:    ${textResult.model}`);
  console.log(`Time:     ${time1}ms`);
  if (textResult.usage) {
    console.log(`Tokens:   ${textResult.usage.prompt_tokens} in / ${textResult.usage.completion_tokens} out`);
  }

  // Test 2: JSON completion (critical for interest expansion and evaluation)
  console.log('\n--- Test 2: JSON Completion ---\n');
  const start2 = Date.now();
  const jsonResult = await jsonCompletion([
    { role: 'system', content: 'You are an auction item classifier. Respond with JSON only.' },
    {
      role: 'user',
      content: 'Classify this auction item: "Griswold #8 Cast Iron Skillet Erie PA". Return JSON with fields: interested (boolean), confidence (high/medium/low), category (string), reasoning (string).',
    },
  ]);
  const time2 = Date.now() - start2;

  console.log(`Response: ${JSON.stringify(jsonResult.data, null, 2)}`);
  console.log(`Model:    ${jsonResult.model}`);
  console.log(`Time:     ${time2}ms`);
  if (jsonResult.usage) {
    console.log(`Tokens:   ${jsonResult.usage.prompt_tokens} in / ${jsonResult.usage.completion_tokens} out`);
  }

  console.log('\n=== All tests passed ===');
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});
