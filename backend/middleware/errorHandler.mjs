import crypto from 'node:crypto';
import { HttpError } from '../utils/HttpError.mjs';

// Final error middleware. Mounted after all routes.
//
// HttpError → use its status + message (4xx is exposed, 5xx is redacted).
// Anything else → 500 with a generic message + requestId. The full stack +
// request context goes to stderr for log correlation.
//
// Sensitive keys (cookies, auth headers, body fields) are stripped from the
// log line so we don't write secrets to disk via PM2.

const REDACT_KEYS = new Set([
  'authorization', 'cookie', 'set-cookie',
  'password', 'currentpassword', 'newpassword', 'passphrase',
  'apikey', 'apikey', 'api_key', 'session_secret',
  'mongodb_uri',
]);

function redactObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = '[redacted]';
    } else if (v && typeof v === 'object') {
      out[k] = redactObject(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const requestId = crypto.randomUUID();

  if (err instanceof HttpError) {
    if (err.status >= 500) {
      console.error(`[${requestId}] ${req.method} ${req.originalUrl} - ${err.status} ${err.message}`, err.stack);
      console.error(`[${requestId}] headers:`, redactObject(req.headers));
      console.error(`[${requestId}] body:`, redactObject(req.body));
      return res.status(err.status).json({ error: 'internal error', requestId });
    }
    return res.status(err.status).json({ error: err.expose ? err.message : 'request rejected' });
  }

  // Mongoose validation messages describe the user's input — safe to expose as 400.
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  // Mongo duplicate-key errors (e.g. POST a unique field twice).
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'duplicate key' });
  }

  console.error(`[${requestId}] ${req.method} ${req.originalUrl} - 500 ${err?.message || err}`, err?.stack);
  console.error(`[${requestId}] headers:`, redactObject(req.headers));
  console.error(`[${requestId}] body:`, redactObject(req.body));
  res.status(500).json({ error: 'internal error', requestId });
}
