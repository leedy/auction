# Multi-User Plan — Phase 2

**Status:** planned (2026-04-26). Builds on `SECURITY-PLAN.md` (Parts A + B implemented).

## Context

Phase 1 shipped a single-passphrase gate so the app can be safely exposed at `https://auction.notesin9.com`. This plan converts that into a small multi-user system for the owner plus a few trusted friends (target: 2–5 users), with **invite-only registration** — no public signup, no email/SMTP requirement. Per-user collector profiles are the differentiator: each user gets their own interests and their own AI evaluations against those interests.

The session middleware in Phase 1 was deliberately built so the cookie carries a `sub` claim. Today `sub = "owner"`. Phase 2 swaps that for a real `userId`.

---

## Data model

### New schemas

```
User    { username, passwordHash, role: 'admin' | 'user', active: bool,
          createdAt, lastLoginAt }
Invite  { token, createdBy: userId, role: 'user' | 'admin',
          usedBy: userId | null, usedAt, expiresAt, createdAt }
```

- `User.username` is the unique key. Lowercased on write.
- `Invite.token` is 32 random bytes, base64url. Single-use, 7-day expiry.

### Add `userId` to existing schemas

| Schema | Why |
|---|---|
| `UserPick` | your stars are not your friends' stars |
| `Interest` | each user maintains their own collector profile (the most useful part of multi-user) |
| `Evaluation` | keyed by `(lotId, model, userId)` — different profiles produce different verdicts |

LLM-spend impact of per-user evaluations: 5 users × ~800 lots × ~$0.001/lot ≈ $4/week worst case. Acceptable. The simpler data model wins over a shared cache.

### Unchanged (shared)

`AuctionHouse`, `Auction`, `Lot`, `Settings`.

---

## Auth changes

### Session payload bump

- `v:1` (current): `{ v:1, iat, exp, sub:"owner" }`
- `v:2` (new):     `{ v:2, iat, exp, sub: userId, role }`

`verifySession` rejects `v:1`, forcing every active session to re-login at deploy. Acceptable disruption.

### Middleware

- `requireAuth` — unchanged contract: any valid v2 session passes. Sets `req.session = { sub, role }`.
- `requireAdmin` — new. Wraps `requireAuth` and additionally requires `req.session.role === 'admin'`. Returns 403 otherwise.

### Endpoint authorization

| Scope | Example endpoints | Middleware |
|---|---|---|
| Public | `/api/health`, `/api/auth/*` (login, logout, accept-invite) | none |
| Any user | read lots/auctions, manage own picks/interests/evaluations, change own password | `requireAuth` |
| Admin only | `/api/settings/*`, `POST/PATCH/DELETE /api/auction-houses/*`, scrape/archive endpoints, `POST /api/invites`, `/api/users/*` | `requireAdmin` |

---

## Bootstrap & invites

### First admin

One-time seed script:

```
node seed-admin.mjs <username>
```

Prompts for password on stdin, hashes with bcrypt(12), inserts a User with `role=admin`. Refuses to run if any User already exists.

### Invite flow

1. Admin opens **Users** admin page → **Generate invite** → server creates `Invite` row with random 32-byte token, returns the URL `https://<host>/invite/<token>`.
2. Admin sends URL to friend out-of-band (text, email, signal — your choice; not the app's job).
3. Friend visits the URL → invite-accept form → submits `{ username, password }`.
4. Server validates token (exists, not used, not expired), creates User, marks invite consumed, signs them in.

### Retiring the passphrase

Once `seed-admin.mjs` has run successfully:
- Remove `AUTH_PASSPHRASE_HASH` from `.env`.
- The login route stops accepting `{ passphrase }` and only accepts `{ username, password }`.

---

## UI changes

### New pages

- `/login` — already exists; rebuild form to take `username` + `password`.
- `/invite/:token` — new. Form takes `username` + `password`. On success, redirects to `/lots` (already authed via the cookie set by accept-invite).
- `/account` — new. Change password, see username. Linked from Nav.
- `/admin/users` — new. Admin-only. List users (username, role, active, last login). Buttons: generate invite, deactivate user, change role. Link from Admin page.

### Updated pages

- **Nav** — show `logged in as <username>`. Logout button stays. "Admin" link visible only to admins.
- **Picks / Flagged / Interests** — frontend doesn't filter; backend returns only the current user's rows. No UI change needed beyond the data scoping.
- **Models / Settings / Auction Houses** — show a "you must be admin" empty state for non-admins.

---

## Migration

One-shot script `migrate-to-multiuser.mjs`:

1. Refuse if any User row already exists.
2. Read admin username from CLI arg, password from stdin.
3. Create admin User.
4. Stamp `userId = adminId` on every existing `UserPick`, `Interest`, `Evaluation` document.
5. Print: `done. now remove AUTH_PASSPHRASE_HASH from .env and restart.`

The migration is idempotent in spirit — re-running with users already present is a no-op (refuses).

---

## Known limits (deferred)

- **Forced session invalidation** — demoting an admin to user takes effect on next login (up to 30 days). Implementing instant kick requires either (a) per-user `sessionVersion` in the JWT (re-introduces a DB lookup per request, undoing Phase 1's stateless design), or (b) a session blocklist in Mongo. Both are real work; defer until needed.
- **Password reset by email** — no SMTP. Reset = admin manually resets via Users page. Friend DMs the admin: "I forgot."
- **2FA** — still out of scope.
- **Audit log** of admin actions — still out of scope.
- **MCP server** — local stdio, no change. Will operate as the admin user implicitly when called from a local Beaker session.

---

## Critical files to modify / create

| Path | Purpose |
|---|---|
| `src/models/User.mjs` | **new** — User schema |
| `src/models/Invite.mjs` | **new** — Invite schema |
| `src/models/UserPick.mjs` | add `userId` |
| `src/models/Interest.mjs` | add `userId` |
| `src/models/Evaluation.mjs` | add `userId`; update unique key to include it |
| `src/auth.mjs` | **new** — `createUser`, `verifyCredentials`, `createInvite`, `consumeInvite`, `changePassword` |
| `backend/middleware/auth.mjs` | bump session to v2, add `requireAdmin`, change `verifySession` to reject v1 |
| `backend/routes/auth.mjs` | login takes `{username, password}`; add `POST /api/auth/accept-invite` |
| `backend/routes/users.mjs` | **new** — admin-only CRUD over users |
| `backend/routes/invites.mjs` | **new** — admin-only invite generation; `GET /api/invites/:token` for the accept page to validate before showing the form |
| `backend/routes/picks.mjs` | scope every query/insert by `req.session.sub` |
| `backend/routes/interests.mjs` | scope every query/insert by `req.session.sub` |
| `backend/routes/evaluations.mjs` | scope every query/insert by `req.session.sub` |
| `backend/routes/settings.mjs`, `auctionhouses.mjs`, `auctions.mjs` | apply `requireAdmin` to mutating endpoints |
| `seed-admin.mjs` | **new** — first-admin bootstrap |
| `migrate-to-multiuser.mjs` | **new** — stamp userId onto existing picks/interests/evaluations |
| `frontend/src/pages/Login.jsx` | username + password fields |
| `frontend/src/pages/InviteAccept.jsx` | **new** |
| `frontend/src/pages/Account.jsx` | **new** — change password |
| `frontend/src/pages/Users.jsx` | **new** — admin user management |
| `frontend/src/components/Nav.jsx` | show username, hide admin links from regular users |
| `frontend/src/context/AuthContext.jsx` | expose `username`, `role` |
| `frontend/src/services/api.js` | new endpoints for invites, users, account |
| `frontend/src/App.jsx` | add `/invite/:token`, `/account`, `/admin/users` routes; admin-route guard |
| `.env.example` | drop `AUTH_PASSPHRASE_HASH` from the auth section once retired |
| `SECURITY-PLAN.md` | mark Phase 2 multi-user complete; update "Out of scope" |

---

## Verification plan

1. `seed-admin.mjs` creates the first admin; second invocation refuses.
2. Admin login (username + password) → 200 + cookie. Old passphrase → 401.
3. Cookie carries `sub: userId`, `role: 'admin'`.
4. Admin generates invite → accept-invite URL works → new user created with role=user.
5. Regular user can read lots/auctions, manage own picks, run own evaluations, see only their own flagged.
6. Regular user gets 403 on `POST /api/settings/models`, `POST /api/auctions/import`, `POST /api/auction-houses`, `POST /api/invites`.
7. Admin sees both Users management page and other users' usernames in the list. Regular user can't reach `/admin/users` (frontend redirect + backend 403).
8. Admin deactivates a user → that user's next request returns 401 (active=false check on requireAuth).
9. Migration script: dry-run on staging Mongo dump; counts of picks/interests/evaluations with `userId` set match originals.

---

## Suggested implementation order

1. User + Invite schemas + auth helpers (no routes yet).
2. `seed-admin.mjs` + manual creation of the admin in dev DB.
3. Session v2 bump, `requireAdmin`, login refactor (still single-tenant data).
4. Invite generation + accept-invite endpoint + frontend invite page.
5. Per-user scoping on picks → interests → evaluations (one schema at a time, verify each).
6. `requireAdmin` applied to settings/auction-houses/auctions/scrape endpoints.
7. Frontend: Account page, Users admin page, Nav username display, role-aware nav.
8. Migration script.
9. End-to-end verification on a staging copy of Mongo.
10. Production cutover: stop service, run migration, restart, remove `AUTH_PASSPHRASE_HASH`, hand out invites.
