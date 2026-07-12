# Overnight full-stack release journal

All timestamps use America/New_York. This journal records variable names only and contains no secret values or private records.

## 2026-07-11 20:58 - Backend audit and local stabilization

### Scope

- Repository: `webdev692/THE-EMERSON-EMPIRE_Backend`
- Branch: `codex/full-stack-release-2026-07-11`
- Starting commit: `c2ce386`
- Worktree: isolated backend release worktree

### Audit completed

- Inventoried every tracked file and both backend entrypoints.
- Reviewed startup, route mounts, authentication, role guards, approval state, database connection, CORS, environment handling, health responses, Railway configuration, tests, migrations, schema reference, and frontend network calls.
- Confirmed the root foundation and `epdg-backend-core` expose different route surfaces.
- Confirmed the authoritative Railway service and API origin cannot be selected from repository evidence alone.

### Local changes prepared

- Added permanent repository rules and pinned Node/npm declarations.
- Added deterministic lockfiles and cross-platform migration-copy build tooling.
- Added fail-closed environment validation and production CORS handling.
- Removed application-startup migration execution and migration-history deletion.
- Added database-aware, privacy-safe readiness responses and JSON 404 handling.
- Added a final 5xx response sanitizer for controllers that catch errors directly.
- Added live database authorization checks for role, approval, deletion, mentor flag, super-administrator rank, and forced password change.
- Replaced mentor assignment authorization by mutable display name with the existing mentor foreign key.
- Rejected public administrator registration.
- Protected and disabled the fake legacy user scaffold.
- Synchronized core/EPDG soft deletion, approval/rejection, and mentor password changes.
- Made every AuthService core/EPDG identity mirror write transactional, with row-count verification and rollback on mirror failure.
- Removed public passport email output and hardcoded mentor-name assignment pools.
- Restricted CV parsing to the configured Supabase storage origin with redirect, timeout, and size limits.
- Kept anonymous CV upload unavailable until a private ownership-verifiable storage flow exists.
- Kept token refresh unavailable until rotating revocation state exists; access tokens use an explicit purpose, HS256, and a one-hour lifetime.
- Kept legal agreement acceptance, legacy onboarding completion, private submission writes, intern session rating, and certificate issuance unavailable pending their controlling contracts.
- Kept `/api/signup` and `/api/portfolio/*` unmounted rather than inventing incompatible handlers.
- Disabled the root unauthenticated deliverable write route.
- Restricted public contribution reads to public career files attached to approved, active profiles.
- Removed the stale certificate frontend fallback and made certificate links use required configuration.
- Tightened the final 5xx response boundary so arbitrary controller fields cannot cross it.
- Corrected the placement query to use the schema's `accepted` application status and removed queries for a nonexistent intern-profile deletion column.
- Added exact route/frontend coverage documentation and release blockers.

### Commands and interim results

- `git branch --show-current`: `codex/full-stack-release-2026-07-11`.
- `git status --short`: clean before implementation.
- `git diff --check`: passed before implementation.
- Official Node `22.23.1` archive: SHA-256 verified before use.
- Official npm `11.17.0` package: registry integrity verified before use.
- Root `npm ci --ignore-scripts --no-audit --no-fund`: passed, 87 packages.
- EPDG core `npm ci --ignore-scripts --no-audit --no-fund`: passed, 445 packages.
- Root `npm test`: passed, 6 tests.
- EPDG core `npm run build`: passed.
- EPDG core `npm run lint`: exited successfully with zero errors and 166 existing warnings, primarily explicit `any` and console warnings.
- EPDG core `npm test`: passed, 17 tests.

Dependency installation reported upstream deprecation warnings for legacy ESLint/glob support packages. No install lifecycle scripts were run.

### Database and service actions

- Migrations prepared: none.
- Migrations applied: none.
- Supabase changes: none.
- Railway deployment: none.
- Environment-variable changes: none.
- Local commits prepared: `9c41b24` (`fix: harden backend runtime foundation`) and `cc605ca` (`fix: enforce backend auth and route contracts`).
- Git pushes: none.

### Blockers

- Authoritative Railway project/service, root directory, and API origin.
- Historical migrations `011` and `024` contain table drops and cannot be approved as production-safe.
- Tracked migration/schema drift for announcements, feedback, and resources.
- Reviewed RLS/grant matrix for `core` and `epdg`.
- Live row-level `core.users` / `epdg.users` ID, EPDG branch-role, and password-hash parity verification.
- Final company, school, mentor, administrator, and founder permission matrix.
- Mentor-session lifecycle, scheduling ownership, cancellation/confirmation, and rating/notes visibility rules.
- School type/location normalization between the frontend, service, and tracked schema.
- Missing company/school dashboard APIs, portfolio APIs, generic signup compatibility, and internship-application review transition.
- Backend-only opportunity routes have no active frontend consumer or current browser evidence.
- Private CV/submission delivery and storage policy.
- Production environment values and provider access.

### Rollback and compensating plan

No external state changed. The two local commits are unpublished and remain reviewable; any correction should be a focused follow-up commit rather than a reset or history rewrite. After any future code deployment, Railway rollback must select the last verified deployment for the same service and commit. Database changes require a separately reviewed forward compensating migration; destructive rollback is prohibited.

### Latest local verification

- Offline manifest/lock regeneration check: passed for both packages.
- Manifest/lock parity and exact direct-version check: passed for both packages.
- Root tests: 9 passed, 0 failed, 0 skipped, 0 canceled.
- EPDG build: passed.
- EPDG lint: exited `0` with 0 errors and 161 warnings; warnings remain a documented code-quality debt and were not suppressed.
- EPDG route/security tests: 38 passed, 0 failed, 0 skipped, 0 canceled.
- `git diff --check`: passed.
- High-confidence secret-pattern scan: passed.
- Names-only environment example scan: passed.
- Tracked generated/environment artifact scan: passed.
- Nested EPDG Git repository check: passed.

The verification above is local worktree evidence only. No backend deployment, Railway environment change, live database migration, external storage change, merge, or production verification occurred.
