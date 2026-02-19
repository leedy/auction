// Test the MCP server by sending JSON-RPC messages via stdio
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, 'mcp-server.mjs');

const proc = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: __dirname,
});

let output = '';
proc.stdout.on('data', (data) => {
  output += data.toString();
});

proc.stderr.on('data', (data) => {
  process.stderr.write(`[server stderr] ${data}`);
});

function send(msg) {
  const json = JSON.stringify(msg);
  proc.stdin.write(json + '\n');
}

// Wait for server to be ready, then send messages
setTimeout(() => {
  console.log('--- Sending initialize ---');
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
  });
}, 3000);

setTimeout(() => {
  console.log('--- Sending initialized notification ---');
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
}, 4000);

setTimeout(() => {
  console.log('--- Listing tools ---');
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
}, 5000);

setTimeout(() => {
  console.log('--- Calling get_weeks ---');
  send({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'get_weeks', arguments: {} },
  });
}, 6000);

setTimeout(() => {
  console.log('--- Calling get_interests ---');
  send({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'get_interests', arguments: {} },
  });
}, 7000);

setTimeout(() => {
  console.log('\n=== RESPONSES ===');
  const messages = output.split('\n').filter(Boolean);
  for (const msg of messages) {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.id === 1) {
        console.log('\n[initialize response]');
        console.log('  Server:', parsed.result?.serverInfo?.name, parsed.result?.serverInfo?.version);
      } else if (parsed.id === 2) {
        console.log('\n[tools/list response]');
        const tools = parsed.result?.tools || [];
        console.log(`  ${tools.length} tools available:`);
        for (const t of tools) {
          console.log(`    • ${t.name} — ${t.description?.substring(0, 80)}...`);
        }
      } else if (parsed.id === 3) {
        console.log('\n[get_weeks response]');
        console.log(' ', parsed.result?.content?.[0]?.text);
      } else if (parsed.id === 4) {
        console.log('\n[get_interests response]');
        const text = parsed.result?.content?.[0]?.text || '';
        console.log(' ', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
      }
    } catch {
      console.log('  [raw]', msg.substring(0, 100));
    }
  }

  proc.kill();
  process.exit(0);
}, 9000);
