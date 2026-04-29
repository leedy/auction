// SSRF guard for user-supplied LLM provider base URLs.
//
// Why: settings.models[].baseUrl flows into fetch(`${baseUrl}/chat/completions`).
// Without validation, an attacker can point that at LAN hosts, cloud metadata,
// or other internal services. We layer four checks: URL shape -> hostname
// allowlist -> scheme/port -> DNS resolution against private ranges (the last
// defeats DNS rebinding, where a public-looking name resolves to a private IP).

import dns from 'node:dns/promises';
import net from 'node:net';
import { HttpError } from '../utils/HttpError.mjs';

export { HttpError };

const DEFAULT_ALLOWLIST = [
  'openrouter.ai',
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'localhost',
  '127.0.0.1',
  'host.docker.internal',
];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);

function getAllowlist() {
  const env = process.env.LLM_BASEURL_ALLOWLIST;
  if (env) return env.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return DEFAULT_ALLOWLIST;
}

function hostMatchesAllowlist(host, allowlist) {
  return allowlist.some((a) => host === a || host.endsWith('.' + a));
}

function isPrivateIp(ip) {
  let addr = ip;
  if (addr.toLowerCase().startsWith('::ffff:')) addr = addr.slice(7);

  if (net.isIPv4(addr)) {
    const [a, b] = addr.split('.').map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;        // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true;                       // multicast/reserved
    return false;
  }

  if (net.isIPv6(addr)) {
    const v6 = addr.toLowerCase();
    if (v6 === '::1' || v6 === '::') return true;
    if (/^f[cd]/.test(v6)) return true;   // fc00::/7 unique-local
    if (/^fe[89ab]/.test(v6)) return true; // fe80::/10 link-local
    if (/^ff/.test(v6)) return true;       // ff00::/8 multicast
    return false;
  }
  return false;
}

export async function assertSafeBaseUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new HttpError(400, 'baseUrl is required');
  }

  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, 'baseUrl is not a valid URL');
  }

  if (url.username || url.password) {
    throw new HttpError(400, 'baseUrl must not contain credentials');
  }
  if (url.search || url.hash) {
    throw new HttpError(400, 'baseUrl must not contain a query string or fragment');
  }

  const host = url.hostname.toLowerCase();
  const isLocal = LOCAL_HOSTS.has(host);

  if (isLocal) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new HttpError(400, 'baseUrl must use http or https');
    }
  } else if (url.protocol !== 'https:') {
    throw new HttpError(400, 'baseUrl must use https for remote hosts');
  }

  if (!isLocal && url.port) {
    throw new HttpError(400, 'baseUrl must use the default port for remote hosts');
  }

  const allowlist = getAllowlist();
  if (!hostMatchesAllowlist(host, allowlist)) {
    throw new HttpError(400, `baseUrl host "${host}" is not in the allowlist`);
  }

  if (!isLocal) {
    let addresses;
    try {
      addresses = await dns.lookup(host, { all: true });
    } catch {
      throw new HttpError(400, `baseUrl host "${host}" could not be resolved`);
    }
    for (const a of addresses) {
      if (isPrivateIp(a.address)) {
        throw new HttpError(400, `baseUrl host "${host}" resolves to a private address`);
      }
    }
  }

  return url;
}
