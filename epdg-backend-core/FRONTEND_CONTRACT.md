# Frontend Integration Contract — Emerson Backend Auth & API

This document describes the locally implemented frontend contract. The 2026-07-11 stabilization tightened public registration, authorization, CORS, and privacy behavior; `../docs/BACKEND_ROUTE_AUDIT.md` remains the controlling route inventory.

> Stabilization note (2026-07-11): `../docs/BACKEND_ROUTE_AUDIT.md` is the controlling route and security inventory. Public administrator registration is disabled, authorization is checked against live database state, pending and rejected accounts are denied server-side, production CORS is environment-only, and public passport responses no longer include email.

Base URL: `{API_BASE}/api`. The canonical production origin is intentionally not specified until the authoritative Railway service is verified.

No backend deployment or production environment change is represented by this document. Current compatibility boundaries:

- `POST /api/signup` and `/api/portfolio/*` are not mounted and return the JSON `404` envelope.
- `POST /api/auth/refresh`, `POST /api/upload/cv`, agreement acceptance, legacy onboarding completion, private submission writes, intern session rating, and certificate issuance are mounted but return `503`.
- Company and school dashboard data APIs are not implemented. Their fixture-backed frontend views are development-gated.
- Opportunity APIs exist for approved admins/interns, but the active frontend does not consume them.

---

## 1. Standard response envelope

Reviewed JSON endpoints generally respond with:

```json
{ "success": true, ...fields }
```

or on failure:

```json
{ "success": false, "message": "Human-readable error", "errors": [] }
```

`errors` is populated with privacy-safe [express-validator](https://express-validator.github.io/) validation entries shaped as `{ field, message }` (or `{ message }` when no field is available); otherwise it is `[]`.

The final response boundary replaces arbitrary `5xx` controller bodies with `{ "success": false, "message": "Internal server error", "errors": [] }`. Public logs and responses do not include private record contents or secret values.

Compatibility exception: a successful `POST /api/auth/forgot-password` currently returns `{ "message": "Reset link sent." }` without a `success` field. Clients must use the HTTP status for that endpoint rather than assuming the standard success envelope.

---

## 2. Auth endpoints (`/api/auth/*`)

### `POST /api/auth/register`
Body:
```json
{
  "name": "string, required",
  "email": "string, required, valid email",
  "password": "string, required, min 8 chars",
  "role": "company | intern | school, required",
  "contact_phone": "string, optional",
  "country": "string, optional",
  "county": "string, optional",
  "industry": "string, optional (company)",
  "contact_person": "string, optional (company/school)",
  "number_of_employees": "number, optional (company)",
  "website": "string, optional (company/school)",
  "city": "string, optional",
  "school_type": "university | college | polytechnic | tvet, optional (school)",
  "cover_letter": "string, optional (intern)"
}
```
`201` response:
```json
{
  "success": true,
  "user": { "id": 59, "email": "...", "name": "...", "role": "intern", "is_verified": false, "last_login_at": null, "created_at": "..." },
  "message": "Registration saved. Verification email delivery is processed separately."
}
```
- `409` if email already registered.
- Account is **not usable for login until email is verified**. Public administrator registration is rejected by the backend; administrators are created only through the protected administrative workflow.
- Verification email delivery starts after the registration transaction commits. Provider failure does not roll back the account and is not presented as confirmed delivery to the client.
- School registration uses `contact_phone`, not `phone`. The tracked database enum requires lowercase `school_type` values. The service stores `city` (falling back to `county`) in `schools.county`; the tracked schools table has no country column. Until the schema/UX mapping is reviewed, admin school responses return `city`/`county` and `country: null`.
- Anonymous CV upload is disabled, and registration does not accept or persist `cv_url`.

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
- `status` matters for company/school/intern: `"pending"` means their account/application has not been approved, and `"rejected"` means it was declined. The backend denies protected feature routes for both states; the frontend should also render the corresponding status view.
- `force_password_change: true` means the backend expects `PATCH /api/auth/change-password` before letting the user do anything else — this happens for admin/mentor accounts created by another admin with a temp password.
- `401` on bad credentials or unverified email (message text differs: `"Please verify your email before logging in"` vs `"Invalid email or password"` — safe to show either directly).
- **Rate limited**: max 5 login attempts per 15 minutes per IP, in addition to the general auth-namespace limit below. Handle `429` with a clear "too many attempts, try again later" message — don't retry automatically.

### `POST /api/auth/refresh`
Status: unavailable. The mounted route always returns `503` until rotating revocation state is configured. The frontend must not call it or treat it as session renewal; after a one-hour access token expires, require a new login.

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
  { "id": 1, "email": "...", "role": "admin", "admin_role": "super_admin", "purpose": "access", "iat": ..., "exp": ... }
  ```
- Access tokens are HS256 tokens with an explicit `purpose: "access"` claim and a **one-hour** lifetime. Password-reset JWTs cannot authenticate. There is currently no refresh-token rotation or server-side revocation endpoint.
- Protected requests re-check current role, approval, deletion, mentor, forced-password-change, and administrator state in the database, so authorization changes take effect on the next request. Use `/api/auth/me` to update visible navigation while the access token remains valid; otherwise require login.

---

## 4. Roles & route gating

Four base roles: `admin`, `company`, `intern`, `school`. Admins additionally have `admin_role`: `admin` or `super_admin` (super_admin is a strictly higher tier — e.g. deleting resources, deleting slots, promoting other admins).

Route prefixes and what they require:
| Prefix | Requires |
|---|---|
| `/api/admin/*` | authenticated + `role === "admin"` (specific routes additionally require `admin_role === "super_admin"` — expect `403 "Access denied. Super admin required."` distinctly from the generic `403 "Access denied. Insufficient permissions."`) |
| `/api/mentor/*` | authenticated, approved, no forced password change, `role === "admin"`, and live `admins.is_mentor === true` |
| `/api/intern/*` and duplicate `/api/onboarding/*` aliases | authenticated, approved, no forced password change, and `role === "intern"`; use `/api/intern/*` in the frontend |
| `/api/upload/cv` | public path, rate limited, but always `503` while anonymous CV storage is disabled |
| `/api/verify/:certificateId`, `/api/passport/:slug` | public, no auth |

Distinguish the two 403 messages in your error handling if you want to show "you need to be a super admin for this" vs a generic access-denied — they're different strings, not different status codes.

### Identifier and response-shape contract

- `GET /api/admin/mentors` returns the mentor's EPDG user ID as `id`. Intern approval sends that value as numeric `mentor_id`; never send a mentor display name as authorization data.
- `PATCH /api/mentor/interns/:userId/activate-roadmap` takes the intern user ID. `/api/mentor/career-file/:internProfileId` takes the intern-profile ID. These identifiers are not interchangeable.
- `GET /api/intern/mentor` returns `null` or `{ mentor_id, mentor_name, mentor_email, mentor_department, mentor_bio, mentor_skills, placement_id }`. `mentor_id` is a user ID; bio and skills are currently `null` placeholders.
- `GET /api/intern/mentor/sessions` returns `{ upcoming, past }`. `POST /api/intern/mentor/sessions` accepts `{ date, time, notes? }` and requires an active placement with a mentor. Session rating returns `503`; timezone, cancellation/confirmation, and notes-visibility rules remain blocked.
- School registration sends `name`, `email`, `password`, `role: "school"`, lowercase `school_type`, `contact_person`, `contact_phone`, and optional `website` plus location fields. Admin school rows expose `phone`, `city`, `county`, and `country: null`; no school dashboard data route exists.

### Other fail-closed compatibility paths

| Path | Current behavior |
|---|---|
| `POST /api/intern/onboarding/sign-agreement` | `503`; legal agreement version/acceptance contract is unapproved. |
| `PATCH /api/intern/onboarding/:stepId/complete` | `503`; legacy completion writes are disabled. |
| `POST /api/intern/submissions/upload`, `POST /api/intern/submissions`, `PATCH /api/intern/submissions/:id` | `503`; private storage ownership/delivery is unapproved. |
| `PATCH /api/intern/mentor/sessions/:id/rate` | `503`; feedback visibility/lifecycle is unapproved. |
| `POST /api/admin/certificates` | `503`; issuance/storage is unapproved. |
| `/api/portfolio/*` | Not mounted (`404`); portfolio frontend views are development-gated. |
| `/api/signup` | Not mounted (`404`); use the role-specific `/api/auth/register` contract. |

Admin/intern opportunity endpoints are implemented, but no active frontend component calls them. Treat them as backend-only until an end-to-end product flow is approved and tested.

---

## 5. Rate limits (per IP)

- All of `/api/auth/*` combined: **20 requests / 15 min**.
- `/api/auth/login` specifically: **5 requests / 15 min** (counts against the 20 too).
- On `429`, response body is `{ "success": false, "message": "Too many requests, please try again later." }` (or the login-specific variant of that message). Surface this directly, don't retry in a loop.

---

## 6. CORS

Production origins come only from the server's comma-separated `CORS_ORIGINS` allowlist. Development additionally permits `http://localhost:5173` and `http://localhost:5174`. The canonical production domain is not hardcoded in the service.

---

## 7. Known pre-existing quirks (not going to be "fixed" without a separate task — don't build around them expecting them to change soon, but don't be surprised by them either)

- Admin announcements occasionally show duplicate-looking entries with slightly different field naming underneath (a historical data seeding issue, not an API contract issue — the shape returned to you is consistent).
- The intern router is mounted under both `/api/intern` and `/api/onboarding`, which creates aliases such as `/api/onboarding/dashboard` and `/api/onboarding/onboarding`. Existing frontend calls use `/api/intern`; do not add new consumers of the duplicate aliases.

## 8. Release blockers and rollback

Production release remains blocked on authoritative Railway service/root/origin evidence, the final role matrix, mentor-session rules, private storage ownership/delivery, school field normalization, and tracked-versus-live schema reconciliation. No deployment, production environment-variable change, database migration, or storage change has occurred.

Latest local verification: root tests `9/9`, EPDG build passed, EPDG route/security tests `38/38`, and EPDG lint exited `0` with `0` errors and `161` unsuppressed warnings.

For a future code rollback, select the last verified deployment for the same Railway service and commit and repeat health/CORS/authentication checks. Database rollback must be a reviewed forward compensating migration; never rewrite Git history or destructively replace production data.
