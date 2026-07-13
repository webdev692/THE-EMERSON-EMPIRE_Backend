# Backend route and frontend contract audit

Audit date: 2026-07-11

This repository contains two independent Express entrypoints. No deployment target is inferred from their presence:

- Root JavaScript foundation: `server.js`, default port `3000`.
- EPDG TypeScript platform: `epdg-backend-core/src/index.ts`, default port `8000`.

The authoritative Railway service, repository root directory, and public API origin require provider evidence. They are not selected in code or this document.

## Root JavaScript foundation

| Method | Route | Exposure and status |
|---|---|---|
| GET | `/` | Public service identification. |
| GET | `/health` | Public database-readiness check; returns only configured/available booleans. |
| POST | `/api/agency/booking-inquiries` | Public write, disabled unless `AGENCY_MODULE_ENABLED` is explicitly true. |
| POST | `/api/epdg/deliverable-submissions` | Always `503`; the legacy route has no identity or ownership checks. |
| POST | `/api/epdg/portfolio-evidence` | Always `501`; no table contract has been approved. |
| GET | `/api/public-contributions` | Public read, disabled unless `PUBLIC_CREDITS_ENABLED` is explicitly true; when enabled, restricts results to public career files attached to approved, active profiles. |
| GET | `/api/certificates/:certificateNumber` | Public verification, disabled unless `CERTIFICATE_VERIFICATION_ENABLED` is explicitly true. |

This entrypoint does not implement the EPDG frontend authentication or dashboard contract.

## EPDG TypeScript platform

All protected routes perform JWT verification and a live `core.users` / `core.user_branch_roles` / EPDG profile lookup. Deleted, unverified, pending, rejected, wrong-role, and forced-password-change states are denied before feature handlers run. Mentor-to-intern authorization uses the existing `intern_profiles.mentor_id` foreign key rather than mutable display names. Unauthenticated requests return `401`; authenticated but unauthorized requests return `403`.

### Infrastructure and public routes

| Method | Route | Status |
|---|---|---|
| GET | `/health` | Database readiness; privacy-safe `200` or `503`. |
| USE | `/api-docs/*` | Swagger UI. |
| GET | `/api-docs.json` | OpenAPI document. |
| POST | `/api/upload/cv` | Public path is mounted and rate limited, but returns `503`. Anonymous service-role upload remains disabled until ownership-verifiable private storage and delivery are approved. |
| GET | `/api/verify/:certificateId` | Public certificate verification fields only. |
| GET | `/api/passport/:slug` | Public opt-in career passport; email is not returned. |

### Authentication

| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/register` | Public; company, intern, or school only. Public admin registration is rejected. |
| POST | `/api/auth/login` | Public, rate limited. |
| POST | `/api/auth/refresh` | Mounted but returns `503`; token refresh is disabled until rotating revocation state is configured. |
| GET | `/api/auth/verify-email` | Public token verification. |
| POST | `/api/auth/resend-verification` | Public, non-enumerating response. |
| POST | `/api/auth/forgot-password` | Public, non-enumerating response. |
| POST | `/api/auth/reset-password` | Public reset-token exchange. |
| GET | `/api/auth/me` | Authenticated account owner. |
| PATCH | `/api/auth/change-password` | Authenticated account owner. |
| POST | `/api/auth/logout` | Public stateless acknowledgement. |

`POST /api/signup` is not mounted and returns the JSON `404` envelope. The supported registration route is `/api/auth/register`; the legacy frontend signup payload (`firstName`, `lastName`, `companyName`, `userType`) is not compatible with that contract and must not be silently translated without a reviewed product decision.

### Administrator

Every route below is prefixed with `/api/admin` and requires an approved `admin` account. Routes marked **super** additionally require `admin_role=super_admin`.

| Area | Methods and relative paths |
|---|---|
| Dashboard | `GET /stats` |
| Users | `GET /users`; **super** `POST /users`; `PATCH /users/:id`; **super** `DELETE /users/:id`; **super** `PATCH /users/:id/role`; `GET /users/:id/cv-analysis` |
| Mentors | `GET /mentors`; **super** `POST /mentors`; **super** `PATCH /mentors/:id/reset-password`; **super** `DELETE /mentors/:id` |
| Internship slots | `GET /slots`; `POST /slots`; `PATCH /slots/:id`; **super** `DELETE /slots/:id` |
| Applications | `GET /applications` |
| Certificates | `GET /certificates`; `POST /certificates` returns `503` while issuance/storage is gated; **super** `PATCH /certificates/:id/revoke`; `GET /certificate-templates` |
| Placements | `GET /placements`; `GET /placements/placeable-interns`; `POST /placements`; `PATCH /placements/:id/end` |
| Announcements | `GET /announcements`; `POST /announcements` |
| Gamification | `GET /gamification/leaderboard`; `GET /gamification/audit`; `GET /gamification/badges`; `POST /gamification/adjust`; `POST /gamification/badges/:id/award` |
| Cohort | `GET /cohort-analytics` |
| Resources | `GET /resources`; `POST /resources`; `PATCH /resources/:id`; **super** `DELETE /resources/:id` |
| Feedback | `GET /feedback`; `POST /feedback`; `PATCH /feedback/:id` |
| Settings | `GET /settings`; **super** `PATCH /settings` |
| Audit | `GET /audit-log` |
| Opportunities | `GET /opportunities`; `POST /opportunities`; `PATCH /opportunities/:id`; `GET /opportunities/applications`; `PATCH /opportunities/applications/:id` |
| Roadmap | `GET /roadmap/pending-level-ups`; `PATCH /roadmap/level-up`; `PATCH /roadmap/modules/:moduleId/sign-off` |
| Career files | `GET /career-analytics`; `GET /intern-search` |

There is no endpoint that changes an internship application from pending/shortlisted to accepted/rejected. Placement creation expects an accepted application, so the review transition remains a backend requirement.

The opportunity endpoints above are implemented backend routes. The active frontend has no opportunity API calls or route/view consuming them, so they are backend-only and have not received current end-to-end browser verification.

### Mentor

Every route is prefixed with `/api/mentor` and requires an approved admin account whose existing EPDG administrator profile is marked as a mentor.

- `GET /stats`
- `GET /interns`
- `PATCH /interns/:userId/activate-roadmap`
- `GET /career-file/:internProfileId`
- `PATCH /career-file/:internProfileId/skills/:skillId/endorse`
- `PATCH /career-file/:internProfileId/approve-tier`

Identifier contract:

- `GET /api/admin/mentors` returns each mentor's EPDG user ID as `id`. Intern approval must send that numeric value as `mentor_id`; the backend verifies it belongs to an active mentor and writes it to `intern_profiles.mentor_id`.
- `/api/mentor/interns/:userId/activate-roadmap` takes the intern's user ID.
- `/api/mentor/career-file/:internProfileId` and its skill/tier children take the intern-profile ID, not the user ID.
- Mentor authorization is derived from the authenticated mentor's live user ID and `admins.is_mentor`; display names are presentation fields only.

The final mentor permission matrix and any access beyond assigned interns still require founder/backend confirmation.

### Intern

Every route is prefixed with `/api/intern` and requires an approved intern account.

| Area | Methods and relative paths |
|---|---|
| Dashboard | `GET /dashboard` |
| Profile | `GET /profile`; `PATCH /profile` |
| Onboarding | `GET /onboarding/status`; `POST /onboarding/sign-agreement` returns `503` pending a versioned legal contract; `POST /onboarding/confirm-track`; `POST /onboarding/submit-discovery`; legacy `GET /onboarding`; legacy `PATCH /onboarding/:stepId/complete` returns `503` |
| Slots/applications | `GET /slots`; `POST /apply`; `GET /applications` |
| Opportunities | `GET /opportunities/applications`; `GET /opportunities`; `POST /opportunities/:id/apply`; backend-only because the active frontend has no consumer |
| Tasks | `GET /tasks`; `PATCH /tasks/:id` |
| Submissions | `GET /submissions`; `POST /submissions/upload`, `POST /submissions`, and `PATCH /submissions/:id` return `503` until private storage ownership/delivery is approved |
| Leaderboard/badges | `GET /leaderboard`; `GET /leaderboard/me`; `GET /badges` |
| Feedback | `POST /feedback`; `GET /feedback/received` |
| Roadmap | `POST /roadmap/modules/:id/complete`; `POST /roadmap/request-level-up`; `GET /roadmap` |
| Mentors | `GET /mentors-directory`; `GET /mentor`; `GET /mentor/sessions`; `POST /mentor/sessions`; `PATCH /mentor/sessions/:id/rate` returns `503` until the session feedback contract is approved |
| Progress | `GET /progress/stats`; `GET /progress/skills` |
| Career file | `GET /career-file`; `PUT /career-file`; `POST /career-file/auto-populate`; `POST /career-file/skills`; `DELETE /career-file/skills/:id`; `POST /career-file/experiences`; `DELETE /career-file/experiences/:id`; `POST /career-file/projects`; `DELETE /career-file/projects/:id` |

Session contract currently used by the frontend:

- `GET /api/intern/mentor` returns `null` or `{ mentor_id, mentor_name, mentor_email, mentor_department, mentor_bio, mentor_skills, placement_id }`. `mentor_id` is a user ID. Bio and skills are currently `null` placeholders, not persisted profile fields.
- `GET /api/intern/mentor/sessions` returns `{ upcoming: Session[], past: Session[] }`; session rows use the intern and mentor user IDs and include `id`, `scheduled_at`, `status`, `notes`, `intern_rating`, `mentor_name`, and, for past sessions, `mentor_notes`.
- `POST /api/intern/mentor/sessions` accepts `{ date, time, notes? }`, combines date/time server-side, and requires an active placement with a mentor. The final timezone, scheduling, cancellation, confirmation, and notes-visibility rules are not approved.
- `PATCH /api/intern/mentor/sessions/:id/rate` is intentionally unavailable (`503`), even though an older controller/service implementation remains in source.

The same router is also mounted at `/api/onboarding`, creating protected aliases such as `/api/onboarding/dashboard` and `/api/onboarding/onboarding`. The active frontend uses `/api/intern`; these aliases are a compatibility artifact, not a second onboarding-specific contract, and should not receive new consumers.

### Protected legacy scaffold

`GET /api/users`, `GET /api/users/:id`, `POST /api/users`, `PUT /api/users/:id`, and `DELETE /api/users/:id` require an approved admin and then return `501`. The previous fake user responses are no longer presented as functional data. Current administration uses `/api/admin/users`.

## Frontend coverage

The active frontend calls under `epdg/src` were compared with this inventory.

| Frontend area | Backend result |
|---|---|
| Auth (`/api/auth/*`) | Registration/login/verification/password/me/logout are mounted. `POST /api/auth/refresh` returns `503`. The separate generic `POST /api/signup` is not mounted (`404`); supported registration is `/api/auth/register`. |
| Intern dashboard/profile/onboarding/tasks/submissions/progress/feedback/mentor/roadmap/leaderboard | Read and reviewed write routes are mounted under `/api/intern/*`; agreement acceptance, legacy onboarding completion, private submission writes, and session rating return `503`. The legacy onboarding UI is development-gated. |
| Admin users, approvals, mentors, slots, placements, certificates, announcements, gamification, feedback, settings, resources | Implemented under `/api/admin/*`. |
| Public certificate verification | Implemented at `/api/verify/:certificateId`; admin certificate issuance returns `503`, and the frontend management view is development-gated. |
| Portfolio UI (`/api/portfolio/upload`, `/api/portfolio/submissions*`) | Not mounted (`404`) and the frontend views are development-gated. Career-file routes are not payload-compatible substitutes and no replacement endpoint was invented. |
| Company dashboard | No company-specific API routes. Registration/login/profile state only; fixture-backed frontend views are development-gated. |
| School dashboard | No school-specific API routes. Registration/login/profile state only; the fixture-backed frontend view is development-gated. |
| Internship application review transition | Missing write route; listing exists, placement expects accepted applications. |
| Standalone intern announcements/resources | No dedicated intern endpoints; only dashboard aggregation and admin management exist. |

### School registration and administration shape

- `POST /api/auth/register` uses `name` for the institution name and `contact_phone` for the phone number. It accepts the role value `school`; there is no `/api/signup` school translation layer.
- The tracked database type for `school_type` is the lowercase enum `university | college | polytechnic | tvet`. The current frontend select includes title-cased and additional values, so the field must be normalized or the product/schema contract revised before school registration is considered production-ready.
- The service currently stores `city` (falling back to `county`) in `epdg.schools.county`. The schools table has no country column in the tracked reference schema.
- `GET /api/admin/users?role=school` normalizes school contact data as `phone`, location as `city` and `county`, and returns `country: null`. The current frontend displays both city and country, so it must tolerate the null country until a reviewed schema/UX mapping exists.
- School accounts have registration, login, approval, and `/api/auth/me` state, but no school-specific dashboard data routes. The final school permissions and ownership model remain blocked.

## Database and release blockers

- Historical migrations `011-create_admins_table.sql` and `024-fix-certificates-table.sql` contain `DROP TABLE`. They must not be run against production as-is.
- Migration history is no longer applied at server startup and is never deleted on a hash mismatch.
- The tracked migration sequence, `SCHEMA_REFERENCE.sql`, and service queries disagree on announcements, feedback, and resources. A live schema-only comparison is required before a forward-only reconciliation migration is prepared.
- The `core.users` / `epdg.users` compatibility mirror has no database trigger. Application-managed dual writes are now transactional and fail closed when either row is missing, but live row-level ID, branch-role, and password-hash parity still must be verified without reading or reporting private values.
- The tracked schema does not define a reviewed RLS/grant matrix for `core` and `epdg` objects.
- CV and submission storage access needs a reviewed private-file delivery contract. No public-bucket or long-lived-link migration was applied.
- Certificate issuance storage, portfolio storage, mentor-session lifecycle/feedback, legal agreement versioning, and the complete company/school/mentor/admin permission matrix remain blocked.
- The authoritative Railway project, service, repository mapping, root directory, and public API origin remain unverified.
- Certificate links now require the configured `FRONTEND_URL`; the service no longer falls back to an unverified domain.
- Local backend commits `9c41b24` and `cc605ca` preserve the runtime/authentication stabilization. No database migration, Railway deployment, production environment update, or push was performed during this audit.

## Latest local verification

- Root tests: `9` passed, `0` failed.
- EPDG TypeScript build: passed with no compile errors.
- EPDG route/security tests: `38` passed, `0` failed.
- EPDG lint: exit `0`, `0` errors, `161` warnings. The warnings were not suppressed.
- `git diff --check`: passed with line-ending conversion notices only.

These results apply to the preserved local release worktree. They are not deployment evidence. No Railway deployment, production environment-variable change, database migration, storage change, or merge has occurred.

## Rollback boundary

No external backend state changed, so the current rollback boundary is the focused, reviewable local diff. A future code deployment must roll back by selecting the last verified deployment for the same Railway service and commit, then re-running health, CORS, authentication, and route-gate checks. A future database change must use a separately reviewed forward compensating migration; Git history rewrite, destructive schema rollback, and record replacement are prohibited.
