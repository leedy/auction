# Security Hardening Plan — Public Exposure

**Status:** in progress (2026-04-29). Required before exposing at `https://auction.notesin9.com`.

## Context

The auction app runs on a home dev server with PM2, bound to `0.0.0.0:3006`. As of 2026-04-29 it has **zero authentication** (a single-passphrase login was built 2026-04-26 and removed at the user's request — see commit history). The SSRF fix on the LLM `baseUrl` (originally Part B) is still in place; everything else from the original Phase-1 plan still needs to ship before public exposure.

This plan covers everything required to make the app **safe to expose on the public internet as a single-user app, owned and operated by a single admin**. The auth model is **email + password** for one admin; there is no public registration.

The plan is sequenced for the current PM2 + nginx + Cloudflare stack. A separate small follow-up plan will move the same artifact to Docker on Portainer/Unraid; the auth and HTTP layers below are written so that move is config-only.

### Confirmed high-severity findings still open

| # | Finding | Location |
|---|---------|----------|
| 1 | Zero auth on all `/api/*` — anyone on the LAN can trigger LLM spend, delete data, mutate settings | `backend/server.mjs`, every router |
| 2 | CORS wildcard — `app.use(cors())` with no options = origin `*` | `backend/server.mjs` |
| 3 | No rate limits anywhere | whole app |
| 4 | Error responses leak Mongoose/LLM/HiBid internals via `res.json({ error: err.message })` | every router |
| 5 | `POST /api/auctions/unarchive-all` wipes archive flags with no confirmation gate | `backend/routes/auctions.mjs` |
| 6 | Frontend Models page round-trips raw API keys during edit | `frontend/src/pages/Models.jsx` |
| 7 | No security headers (CSP, HSTS, X-Frame-Options) | `backend/server.mjs` |

Resolved already: SSRF via settings `baseUrl` (`backend/middleware/validateLlmBaseUrl.mjs`, fetched with `redirect: 'error'`); `.env` gitignored; Mongo authenticated; no `dangerouslySetInnerHTML`/`child_process` sinks; Mongoose IDs cast correctly.

---

## Goals

- **Email + password login** for one admin user. No public registration. Cookie-signed session carrying `{sub: userId, role}` — the `role` field exists today as a forward-compat seam, not because there's more than one role.
- **In-app password change.** Lost-password recovery via shell (`seed-admin.mjs --reset`). No SMTP / no email reset link.
- **All `/api/*` requires auth** except `/api/health` and `/api/auth/*`.
- **HTTP hardening:** helmet + explicit CSP, HSTS, no CORS, body limit, rate limits, unified error handler that stops leaking internals.
- **PM2 + nginx + Cloudflare deployment** with real-IP plumbing so rate limits work behind Cloudflare.
- **Forward-compat seams left intact** for 2FA (Phase 1.7) and Docker (Phase 1.6) without rework.

---

## Part A — Authentication (single admin, email + password)

### Data model

New schema `src/models/User.mjs`:

```js
{
  email: String (unique, lowercased + trimmed on write, required, RFC-5322-ish regex),
  passwordHash: String (bcrypt cost 12, required),
  role: String (enum: ['admin'], default 'admin'),
  active: Boolean (default true),
  totpSecret: String (default null, unused until Phase 1.7),
  totpEnabled: Boolean (default false, unused until Phase 1.7),
  createdAt: Date,
  lastLoginAt: Date,
}
```

Only one document is expected. The schema is sized for "add a second account later via CLI" without re-architecture; it is not a multi-user UI.

### Bootstrap (`seed-admin.mjs`)

```
node seed-admin.mjs <email>          # creates the admin; refuses if any User exists
node seed-admin.mjs --reset <email>  # resets password on existing user; refuses if user missing
```

- Validates `<email>` against the same regex as the schema; refuses malformed input.
- Reads password from stdin twice (with confirmation), no echo. Refuses passwords < 5 chars.
- Hashes with bcrypt(12).
- `--reset` is the lost-password escape hatch: log in to the server, rerun, done.

### Session

- HMAC-SHA256 signed JSON `{ v:2, iat, exp, sub: userId, role }`. Base64url cookie. Stateless — no DB lookup per request.
- Cookie: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=30 days`.
- `SESSION_SECRET` env var: 48 random bytes, base64url. Rotating it invalidates every outstanding session.
- `verifySession` only accepts `v:2` (no v:1 sessions to migrate — there are none).

### Endpoints

| Method | Path | Auth | Behavior |
|---|---|---|---|
| POST | `/api/auth/login` | none | Body `{email, password}`. Email lowercased + trimmed before lookup. `bcrypt.compare` against the user (active=true). On success: stamp `lastLoginAt`, set cookie, return `{ok:true, email, role}`. On failure: 401 `{error:'invalid credentials'}`. **Always runs bcrypt** even when user not found, to deny an email-enumeration timing oracle. Rate-limited 5/15min per IP. |
| POST | `/api/auth/logout` | none | Clears cookie. Idempotent. |
| GET | `/api/auth/me` | optional | Returns `{authenticated:true, email, role}` or 401. Used by frontend on mount. |
| POST | `/api/auth/change-password` | required | Body `{currentPassword, newPassword}`. Re-verifies current; updates hash; rotates the session (re-signs with new `iat`). Rate-limited 5/15min per `sub`. |

### Middleware

- `requireAuth(req,res,next)` — verifies cookie signature + expiry + that `req.session.sub` matches an active User. **Active check is one cheap `findById`** per request — acceptable for a single-user app, lets us implement "kick the user" later by flipping `active=false`. (For multi-user this would need caching; not relevant here.)
- `requireAdmin` — exists but is a passthrough today (only role is `'admin'`). Wired up at the right routes so Phase 2 can flip it on without finding every endpoint.

### Frontend

- `frontend/src/context/AuthContext.jsx` — state `{authed: bool|null, email, role}`. On mount, GET `/api/auth/me`; null while in flight. Exposes `login`, `logout`, `changePassword`, `refresh`.
- `frontend/src/components/RequireAuth.jsx` — wraps protected routes; redirects to `/login` while preserving `from` location.
- `frontend/src/pages/Login.jsx` — `<input type="email" autocomplete="username">` + password fields, posts to `/api/auth/login`.
- `frontend/src/pages/Account.jsx` — **new**. Shows email + role, change-password form (current + new + confirm). On success, toast + clears the form.
- `frontend/src/components/Nav.jsx` — show "logged in as `<email>`", logout button, link to Account.
- `frontend/src/services/api.js` — `withCredentials: true`, 401 interceptor that calls back into AuthContext to flip `authed=false` (which triggers redirect to `/login`).

### What does NOT ship in Part A

- **2FA** — schema fields `totpSecret`/`totpEnabled` added so turning it on is a UI-only change. Login does not enforce it. Tracked as Phase 1.7.
- **Per-user data scoping** — single-user, no need.
- **Forgot-password email flow** — no SMTP, no reset link. Use the CLI `--reset`.
- **Account lockout** — login rate limit is sufficient for one user; lockout adds a self-DoS surface.

---

## Part B — HTTP hardening

### Helmet + CSP

`helmet()` defaults plus an explicit Content-Security-Policy:

- `default-src 'self'`
- `img-src 'self' data: https:` — HiBid CDN hosts vary; tighten later if we know the set.
- `script-src 'self'` — Vite emits hashed bundles, no inline.
- `style-src 'self' 'unsafe-inline'` — required for React inline `style` attrs.
- `connect-src 'self'` — same-origin `/api/*` only.
- `font-src 'self' https://fonts.gstatic.com` — if we keep the Cormorant Garamond `@import`. Otherwise self-host the font and drop this.
- `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`.

HSTS: 180 days, no preload yet (so we can back out of HTTPS without burning the domain).

### CORS

**Remove `cors()` entirely.** The frontend is served by the same Express process, same origin. CORS is a footgun when not needed.

### Body limit

`express.json({ limit: '100kb' })` already in place. Keep.

### Rate limits

`express-rate-limit@^7` (the version that fixes the IPv4-mapped-IPv6 bypass), declared once in `backend/middleware/rateLimits.mjs` and mounted by route group:

| Limiter | Scope | Limit | Key |
|---|---|---|---|
| `loginLimiter` | `POST /api/auth/login`, `POST /api/auth/change-password` | 5 / 15 min | `req.ip` (login) / `req.session.sub` (change-password) |
| `llmSpendLimiter` | `POST /api/evaluations/run`, `POST /api/interests/expand`, `POST /api/settings/models/:id/test`, `POST /api/settings/test-llm` | 10 / hour | `req.session.sub` |
| `scrapeLimiter` | `POST /api/lots/scrape`, `POST /api/lots/update-prices`, `POST /api/lots/:id/fetch-photos`, `POST /api/auctions/import`, `POST /api/auctions/archive-closed` | 30 / hour | `req.session.sub` |
| `mutateLimiter` | every other `POST|PATCH|PUT|DELETE` on `/api/*` | 120 / 15 min | `req.session.sub` |
| `readLimiter` | catch-all read | 600 / 15 min | `req.ip` |

`loginLimiter` uses `skipSuccessfulRequests: true` so a legitimate user who rotates passwords doesn't lock themselves out.

### Unified error handler

- `backend/utils/asyncHandler.mjs` — `(fn) => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next)`. Replace per-route try/catch.
- `backend/utils/HttpError.mjs` — `class HttpError extends Error { constructor(status, message, {expose}={}) { ... } }`. 4xx default `expose=true`, 5xx default `expose=false`.
- `backend/middleware/errorHandler.mjs` — final 4-arg middleware. 4xx → `{error: err.message}`. 5xx → log full stack with a request id (`crypto.randomUUID()`) and return `{error:'internal error', requestId}`.
- Log redaction list: never emit `Authorization`, `Cookie`, `passphrase`, `password`, `apiKey`, `MONGODB_URI`, `SESSION_SECRET`.

### Server timeouts + trust proxy

- `server.setTimeout(30_000)` global. LLM endpoints keep their own longer AbortController budgets but the outer HTTP layer caps at 30s.
- `app.set('trust proxy', Number(process.env.TRUST_PROXY||0))`. Set to `1` once nginx is in front (nginx is one hop).

### Dangerous endpoint gates

- `POST /api/auctions/unarchive-all` — require `?confirm=yes-unarchive-all`; 400 otherwise. Frontend prompts for `RESTORE`.
- `DELETE /api/auction-houses/:slug` — require `?confirm=<slug>` path echo. Existing 200 path stays.
- Other `DELETE`s (interests, models) — fine behind auth + `mutateLimiter`.

### Frontend Models-page hardening

- Edit form: API-key input starts **empty** with placeholder `(leave blank to keep current)`.
- Backend `getSafeModels` returns `apiKeyLast4` (4 chars + `····`). Display only.
- Save: omit `apiKey` from PATCH if blank. Backend treats `undefined` as "leave alone."

### Referrer policy

`frontend/index.html`: `<meta name="referrer" content="strict-origin-when-cross-origin">`.

---

## Part C — Deployment (PM2 + nginx + Cloudflare)

### nginx

New server block in the existing nginx config (sibling to other `notesin9.com` blocks). Reuses the existing `*.notesin9.com` wildcard cert — no certbot run needed.

```nginx
server {
  listen 443 ssl http2;
  server_name auction.notesin9.com;

  ssl_certificate     /path/to/wildcard.notesin9.com.fullchain.pem;
  ssl_certificate_key /path/to/wildcard.notesin9.com.key;
  # (use the same paths as the other *.notesin9.com server blocks)

  location / {
    proxy_pass http://127.0.0.1:3006;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
  }
}

server {
  listen 80;
  server_name auction.notesin9.com;
  return 301 https://$host$request_uri;
}
```

**PM2 binding stays at `0.0.0.0:3006` for now** so the app is still reachable on the LAN during the transition. Once nginx is verified, change `backend/server.mjs` to bind `127.0.0.1:3006` so the public internet can only reach it via nginx.

### Cloudflare real-IP plumbing

Without this, every request looks like a Cloudflare IP and the rate limiter is useless.

- Enable `ngx_http_realip_module` in nginx.
- Add `set_real_ip_from` for every Cloudflare IPv4/IPv6 range (https://www.cloudflare.com/ips-v4 / ips-v6).
- `real_ip_header CF-Connecting-IP;`
- Add a monthly cron (`/etc/cron.monthly/cf-ips`) that pulls the current ranges and reloads nginx. (Stub script in the verification plan.)

### Cloudflare dashboard

- DNS `auction.notesin9.com` → home server IP, **proxied (orange cloud)**.
- SSL/TLS mode **Full (strict)** — Cloudflare verifies the origin's cert. Existing `*.notesin9.com` wildcard covers this hostname so no new cert work.
- "Always Use HTTPS" on.
- Bot Fight Mode on.
- (Optional) WAF rule: country-allow US/Canada once stable; not blocking, just challenging.

### Environment

`.env` (production) gets:

```
NODE_ENV=production
SESSION_SECRET=<48 random base64url bytes>
COOKIE_SECURE=true            # only flip after HTTPS verified end-to-end
TRUST_PROXY=1                 # nginx is one hop in front
PUBLIC_ORIGIN=https://auction.notesin9.com
```

Startup self-check: in `NODE_ENV=production`, refuse to boot without `MONGODB_URI` + `SESSION_SECRET`. (Old check also required `AUTH_PASSPHRASE_HASH`; that's gone — replaced by "at least one User row exists in Mongo," which `seed-admin.mjs` enforces out-of-band.)

`.env.example` gets the same keys with placeholders + the `node -e ...` generator one-liner for `SESSION_SECRET`.

---

## Out of scope (deferred)

- **Phase 1.6 — Docker / Portainer.** Multi-stage Dockerfile, `docker-compose.yml` with `127.0.0.1:3006:3006` host-loopback binding, env from Portainer stack vars. Tracked as a separate plan; the auth + HTTP layers above are written so this is config-only.
- **Phase 1.7 — 2FA (TOTP).** `User` schema reserves `totpSecret` and `totpEnabled`. Login flow gets a second step. Account page gets a "set up authenticator" QR. ~half-day.
- **Phase 2 — Multi-user / invites.** `MULTIUSER-PLAN.md` still describes the path. Not currently planned to ship — user wants the app to stay solo.
- **CSRF tokens.** SameSite=Lax + same-origin + only POST/PATCH/DELETE for mutations makes classic CSRF infeasible. Re-evaluate if the API ever serves cross-origin clients.
- **Audit log.**

---

## Critical files

| Path | Action |
|---|---|
| `src/models/User.mjs` | **new** — User schema (incl. `totpSecret`/`totpEnabled` fields, unused for now) |
| `src/auth.mjs` | **new** — `createUser`, `verifyCredentials`, `changePassword`, `requirePasswordStrength` |
| `seed-admin.mjs` | **new** — bootstrap + `--reset` |
| `backend/middleware/auth.mjs` | **new** — `signSession`/`verifySession`/`requireAuth`/`requireAdmin`/`cookieOptions` |
| `backend/routes/auth.mjs` | **new** — login, logout, me, change-password |
| `backend/middleware/rateLimits.mjs` | **new** — named limiters |
| `backend/middleware/errorHandler.mjs` | **new** — final error middleware |
| `backend/utils/asyncHandler.mjs` | **new** |
| `backend/utils/HttpError.mjs` | **new** |
| `backend/server.mjs` | wire helmet, drop cors, body limit (kept), cookie-parser, mount auth router, apply requireAuth, apply rate limits, mount error handler, trust proxy, server timeout, prod self-check |
| every other router | swap `try/catch + err.message` for `asyncHandler` + `HttpError` |
| `backend/routes/auctions.mjs` | confirm gate on `unarchive-all` |
| `backend/routes/auctionhouses.mjs` | confirm gate on `DELETE /:slug` |
| `backend/routes/settings.mjs` | strip raw-key roundtrip; emit `apiKeyLast4` from `getSafeModels` |
| `frontend/src/context/AuthContext.jsx` | **new** |
| `frontend/src/components/RequireAuth.jsx` | **new** |
| `frontend/src/components/Nav.jsx` | email display, account link, logout |
| `frontend/src/pages/Login.jsx` | **new** — email + password |
| `frontend/src/pages/Account.jsx` | **new** — change password |
| `frontend/src/pages/Models.jsx` | placeholder edit, last4 display |
| `frontend/src/services/api.js` | `withCredentials`, 401 interceptor, auth/account endpoints |
| `frontend/src/App.jsx` | mount AuthProvider, RequireAuth, /login + /account routes |
| `frontend/src/App.css` | login/account styles |
| `frontend/index.html` | referrer meta tag |
| `package.json` | add `helmet`, `cookie-parser`, `bcryptjs`, `express-rate-limit@^7` |
| `.env.example` | add `SESSION_SECRET`, `COOKIE_SECURE`, `TRUST_PROXY`, `PUBLIC_ORIGIN`, `NODE_ENV` |
| nginx config | add `auction.notesin9.com` server block + Cloudflare real-IP wiring |
| `AI_ROADMAP.md` | link to this plan; remove the obsolete "passphrase" highlight |
| `CLAUDE.md` | update auth + deployment notes |

---

## Verification plan

### Local pre-deploy (PM2 still on 0.0.0.0)

1. `node seed-admin.mjs dleedy@leedy.org` → prompts → creates user. Re-run → refuses.
2. `node seed-admin.mjs --reset dleedy@leedy.org` → prompts → updates hash.
3. `pm2 restart auction-backend && curl -i http://localhost:3006/api/health` → 200.
4. `curl -i http://localhost:3006/api/lots` → **401**.
5. `curl -X POST -H "Content-Type: application/json" -d '{"email":"dleedy@leedy.org","password":"WRONG"}' http://localhost:3006/api/auth/login` six times → sixth returns **429**.
6. `curl -c cookies.txt -X POST -H "Content-Type: application/json" -d '{"email":"dleedy@leedy.org","password":"<correct>"}' http://localhost:3006/api/auth/login` → 200 + cookie. `curl -b cookies.txt http://localhost:3006/api/lots` → 200.
7. Browser: open in fresh profile → `/login` page; bad creds → error; good creds → app works; `/account` → change password → re-login required.
8. `curl -i http://localhost:3006/api/lots` (no cookie) again after change-password → 401 still.
9. `POST /api/auctions/unarchive-all` without `?confirm=yes-unarchive-all` → 400.
10. `curl http://localhost:3006/api/lots/9999` (does not exist, behind auth, with cookie) — **error response shape is `{error:'internal error', requestId}` for 5xx**, not raw `err.message`.

### Cloudflare orange-cloud + nginx

1. Add nginx server block; reload; `sudo nginx -t` clean.
2. From a phone on cellular: `https://auction.notesin9.com/` → app loads.
3. Response headers: `strict-transport-security`, `content-security-policy`, no `x-powered-by`.
4. Six bad logins from cellular over Cloudflare → sixth returns **429** (verifies real-IP is plumbed; if it's still 200, the rate limiter is keying on Cloudflare's IPs and we're done).
5. Flip `backend/server.mjs` to bind `127.0.0.1:3006`; `pm2 restart`. From the LAN, `http://homeserver:3006/` is now refused; `https://auction.notesin9.com/` still works.
6. Set `COOKIE_SECURE=true`, restart, confirm login still works over HTTPS, fails over plain HTTP (which Cloudflare 301s anyway).

---

## Suggested implementation order

1. **Deps + schema + seed script** (no behavior change yet). `User` model, `seed-admin.mjs`, `helmet`/`cookie-parser`/`bcryptjs`/`express-rate-limit` added.
2. **Auth module + routes** (still no middleware gating).
3. **Apply `requireAuth`** + verify everything is 401 without cookie. Frontend Login + AuthContext + Account page.
4. **Helmet + drop CORS + error handler refactor + log redaction.**
5. **Rate limiters.**
6. **Confirm gates on `unarchive-all` + `auction-houses DELETE`. Models page key handling.**
7. **PM2 ready on 0.0.0.0 — full local verification (steps 1–10 above).**
8. **nginx server block + Cloudflare orange-cloud + real-IP wiring + HTTPS verification.**
9. **Flip server bind to 127.0.0.1, set `COOKIE_SECURE=true`, smoke-test from cellular.**
10. **Update `AI_ROADMAP.md` + `CLAUDE.md`.**
11. (Follow-up plan) Phase 1.6 Docker move.
12. (Follow-up plan) Phase 1.7 2FA.
