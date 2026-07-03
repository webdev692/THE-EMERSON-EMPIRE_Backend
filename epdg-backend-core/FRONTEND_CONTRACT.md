# Frontend Integration Contract — Emerson Backend Auth & API

This documents the exact request/response contract the frontend needs to work against. **Nothing in this document changed as a result of the recent core/epdg schema work** — that refactor was deliberately designed to be invisible to API consumers (same routes, same payloads, same JWT shape). This is a snapshot of the current, real behavior, verified against the running code, not a proposal.

Base URL: `{API_BASE}/api` (e.g. `http://localhost:5000/api` in dev).

---

## 1. Standard response envelope

Every endpoint responds with:

```json
{ "success": true, ...fields }
```

or on failure:

```json
{ "success": false, "message": "Human-readable error", "errors": [] }
```

`errors` is populated with [express-validator](https://express-validator.github.io/) field errors on `400` validation failures (array of `{ msg, param, location, ... }` objects); otherwise it's `[]`.

Uncaught errors fall through to a global handler and return `{ success: false, message, errors: [] }` with whatever status code the error carries (defaults to `500`).

---

## 2. Auth endpoints (`/api/auth/*`)

### `POST /api/auth/register`
Body:
```json
{
  "name": "string, required",
  "email": "string, required, valid email",
  "password": "string, required, min 8 chars",
  "role": "admin | company | intern | school, required",
  "contact_phone": "string, optional",
  "country": "string, optional",
  "county": "string, optional",
  "industry": "string, optional (company)",
  "contact_person": "string, optional (company/school)",
  "number_of_employees": "number, optional (company)",
  "website": "string, optional (company/school)",
  "city": "string, optional",
  "school_type": "university | college | polytechnic | tvet, optional (school)",
  "cover_letter": "string, optional (intern)",
  "cv_url": "string, optional (intern)"
}
```
`201` response:
```json
{
  "success": true,
  "user": { "id": 59, "email": "...", "name": "...", "role": "intern", "is_verified": false, "last_login_at": null, "created_at": "..." },
  "message": "Registration successful. Please check your email to verify your account."
}
```
- `409` if email already registered.
- Account is **not usable for login until email is verified** (see below), except this isn't enforced for `admin`-role self-registration in practice — but the UI shouldn't expose admin self-signup regardless.
- A verification email is sent async — don't block the UI on it; if email delivery fails server-side, registration still succeeds (logged, not surfaced to the client).

### `POST /api/auth/login`
Body: `{ "email": "...", "password": "...", "role": "admin | company | intern | school" }`

**`role` must match the account's actual role** — sending the wrong role returns the generic `401 "Invalid email or password"`, not a role-mismatch-specific error. The frontend's login form must know which role it's logging in as (this app doesn't have a single unified login — company/school/intern/admin are distinct login contexts).

`200` response:
```json
{
  "success": true,
  "token": "eyJ...",
  "user": {
    "id": 1, "name": "...", "email": "...", "role": "admin",
    "status": "approved | pending | rejected",
    "is_mentor": false,
    "force_password_change": false,
    "admin_role": "admin | super_admin"
  }
}
```
- `admin_role` is only present when `role === "admin"`. Don't expect it otherwise.
- `status` matters for company/school/intern: `"pending"` means their account/application hasn't been approved by an admin yet, `"rejected"` means it was declined (check for a rejection reason via `/me` or the relevant profile endpoint) — the frontend should gate the dashboard behind this, not just behind a successful login.
- `force_password_change: true` means the backend expects `PATCH /api/auth/change-password` before letting the user do anything else — this happens for admin/mentor accounts created by another admin with a temp password.
- `401` on bad credentials or unverified email (message text differs: `"Please verify your email before logging in"` vs `"Invalid email or password"` — safe to show either directly).
- **Rate limited**: max 5 login attempts per 15 minutes per IP, in addition to the general auth-namespace limit below. Handle `429` with a clear "too many attempts, try again later" message — don't retry automatically.

### `POST /api/auth/refresh`
Body: `{ "token": "<existing JWT, expired or not>" }` → `200 { "success": true, "token": "<new JWT>" }`, or `401` if invalid/unparseable.
- Use this to pick up **role/permission changes** without forcing a full re-login — e.g. if an admin is promoted to super_admin while a user is signed in, their existing JWT stays stale (still shows the old `admin_role`) until either they log in again or you call `/refresh`. Not rate-limited the way `/login` is.

### `GET /api/auth/verify-email?token=<token>`
`200 { "success": true, "message": "Email verified successfully" }` or `400` if invalid/expired (24h TTL).

### `POST /api/auth/resend-verification`
Body: `{ "email": "..." }` → always `200` with a generic message, regardless of whether the email exists (don't leak account existence).

### `POST /api/auth/forgot-password`
Body: `{ "email": "..." }` → always `200 { "message": "Reset link sent." }` regardless of whether the email exists. Reset link format: `{FRONTEND_URL}/reset-password?token=<jwt>` (30 min TTL) — the frontend needs a route at `/reset-password` that reads `?token=` and posts it to reset-password below.

### `POST /api/auth/reset-password`
Body: `{ "token": "...", "password": "string, min 8 chars" }` → `200` on success, `400` if token invalid/expired.

### `GET /api/auth/me` — requires `Authorization: Bearer <token>`
`200` response:
```json
{
  "success": true,
  "user": {
    "id": 1, "email": "...", "name": "...", "is_verified": true,
    "last_login_at": "...", "created_at": "...", "role": "admin", "admin_role": "super_admin",
    "profile": { /* full companies/schools/intern_profiles/admins row for this user, or null */ }
  }
}
```
`admin_role` is present (possibly `null`) on every response now, regardless of role — don't assume its absence means non-admin the way you might with the login response.

### `PATCH /api/auth/change-password` — requires auth
Body: `{ "current_password": "...", "new_password": "string, min 8 chars" }` → `200` on success. `400` if current password wrong.

### `POST /api/auth/logout`
No-op server-side (JWTs are stateless, nothing to invalidate server-side) — just discard the token client-side. Always `200`.

---

## 3. Using the JWT

- Send it as `Authorization: Bearer <token>` on every authenticated request.
- Payload shape (decode client-side for UI purposes only — **never trust the client-decoded payload for anything security-sensitive**, the backend re-verifies signature + re-checks role on every protected route):
  ```json
  { "id": 1, "email": "...", "role": "admin", "admin_role": "super_admin", "iat": ..., "exp": ... }
  ```
- Tokens are valid for **30 days**. There's no refresh-token rotation or short-lived-access-token pattern here — one token, long-lived, refreshable via `/api/auth/refresh`.
- **Role/permission changes don't take effect until the token is refreshed or reissued.** If your UI shows role-dependent chrome (e.g. an admin nav), and an admin promotes/demotes someone, that someone won't see the change until next login or an explicit `/refresh` call. Worth calling `/refresh` after any action that might change the current user's own role.

---

## 4. Roles & route gating

Four base roles: `admin`, `company`, `intern`, `school`. Admins additionally have `admin_role`: `admin` or `super_admin` (super_admin is a strictly higher tier — e.g. deleting resources, deleting slots, promoting other admins).

Route prefixes and what they require:
| Prefix | Requires |
|---|---|
| `/api/admin/*` | authenticated + `role === "admin"` (specific routes additionally require `admin_role === "super_admin"` — expect `403 "Access denied. Super admin required."` distinctly from the generic `403 "Access denied. Insufficient permissions."`) |
| `/api/mentor/*` | authenticated + `role === "admin"` (mentors are admins with `admin_type === "mentor"` on their profile — check `/me`'s `profile.admin_type`, not a separate role) |
| `/api/intern/*` and `/api/onboarding/*` | authenticated + `role === "intern"` (these two prefixes are currently mounted to the identical router — a known quirk, not a bug you need to work around, just don't be surprised both work) |
| `/api/upload/*` | public, no auth (CV pre-upload before account creation) |
| `/api/verify/:certificateId`, `/api/passport/:slug` | public, no auth |

Distinguish the two 403 messages in your error handling if you want to show "you need to be a super admin for this" vs a generic access-denied — they're different strings, not different status codes.

---

## 5. Rate limits (per IP)

- All of `/api/auth/*` combined: **20 requests / 15 min**.
- `/api/auth/login` specifically: **5 requests / 15 min** (counts against the 20 too).
- On `429`, response body is `{ "success": false, "message": "Too many requests, please try again later." }` (or the login-specific variant of that message). Surface this directly, don't retry in a loop.

---

## 6. CORS

Allowed origins (credentials included, so cookies/auth headers work cross-origin): `http://localhost:5173`, `http://localhost:5174`, `https://epdg.netlify.app`, `https://emersonproffesionaldevelopment.netlify.app`, plus anything in the server's `CORS_ORIGINS` env var. **If your frontend is deployed anywhere else, it needs to be added to that list server-side** — this isn't something the frontend can work around.

---

## 7. Known pre-existing quirks (not going to be "fixed" without a separate task — don't build around them expecting them to change soon, but don't be surprised by them either)

- Admin announcements occasionally show duplicate-looking entries with slightly different field naming underneath (a historical data seeding issue, not an API contract issue — the shape returned to you is consistent).
- `/api/intern` and `/api/onboarding` are literally the same router mounted twice — use whichever reads better in your routing, they're interchangeable.
