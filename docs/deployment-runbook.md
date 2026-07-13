# Deployment and rollback runbook

No deployment was performed as part of the 2026-07-11 backend audit.

## Blocked target selection

The repository has a root JavaScript service and an `epdg-backend-core` TypeScript service. Before any Railway action, verify all of the following from provider evidence:

1. Railway project and service identity.
2. Repository and branch.
3. Configured root directory.
4. Current deployment commit.
5. Build and start commands.
6. `/health` response and protected-route behavior.
7. GitHub deployment status.

Do not guess or document a production origin until that evidence agrees.

## Candidate EPDG service commands

If provider evidence confirms `epdg-backend-core` is the service root:

```text
Install: npm ci
Build: npm run build
Start: npm start
Health: /health
```

The checked-in `epdg-backend-core/railway.toml` encodes those commands. Node and npm versions come from `package.json`.

## Pre-deployment gates

- Root tests pass. Latest local result: `9/9`.
- EPDG build passes with no TypeScript errors. Latest local result: passed.
- EPDG route/security tests pass. Latest local result: `38/38`.
- EPDG lint has no errors. Latest local result: exit `0`, `0` errors, `161` unsuppressed warnings.
- Required environment variable names are present without logging their values.
- Production CORS is an explicit allowlist.
- No migration is run by application startup.
- Historical destructive migrations are not executed.
- A live schema-only comparison resolves announcement, feedback, and resource drift.
- Current-commit protected routes return `401` or `403`, not `404`; this must be verified against the same Railway deployment commit.
- Fail-closed routes remain fail-closed: `/api/auth/refresh`, `/api/upload/cv`, agreement acceptance, legacy onboarding completion, private submission writes, intern session rating, and certificate issuance.
- Unmounted compatibility paths remain documented as unavailable: `/api/signup`, `/api/portfolio/*`, company dashboard APIs, and school dashboard APIs.

## Unresolved release blockers

- Railway authentication and evidence tying the project, service, repository, branch, root directory, build/start commands, and public origin together.
- The final company, school, intern, mentor, administrator, and founder role/permission matrix.
- The mentor-session state machine, scheduling ownership, update/cancellation permissions, and rating/notes visibility rules.
- Private CV, submission, portfolio, and certificate storage ownership, bucket policy, upload, and time-limited delivery contracts.
- Tracked-versus-live schema drift for announcements, feedback, resources, identity mirrors, and migration history.
- School registration field normalization: the database uses the lowercase school-type enum and stores location in `schools.county`; the current frontend values and displayed `country` field need an agreed mapping.
- Backend-only opportunity routes have no active frontend consumer or end-to-end verification.

## Environment changes

Record environment changes by variable name only. Never copy values into this repository or release evidence. The canonical frontend API origin and production variable changes remain blocked until the authoritative Railway service is verified.

Do not populate or change `VITE_API_URL`, `CORS_ORIGINS`, database, email, storage, or signing variables until that mapping is proven. Record names and provider evidence only; never record their values.

## Rollback

For a code-only Railway release, select the last verified deployment for the same service and commit, redeploy it, and re-run `/health`, CORS, and unauthenticated protected-route checks. Do not roll back by rewriting Git history.

Database changes require their own reviewed compensating migration. Never drop, truncate, reset, or restore over production records as an application rollback shortcut.

Current release state: local code and documentation only. No backend deployment, production environment-variable change, live migration, external storage change, or merge has occurred.
