# The Emerson Empire backend repository

This repository currently contains two separate Express entrypoints:

- `server.js`: a small JavaScript API foundation for Agency inquiries, public contributions, and certificate-number verification.
- `epdg-backend-core`: the TypeScript API that implements the EPDG authentication, intern, mentor, and administrator route surface.

Do not infer the authoritative Railway service or root directory from this layout. Verify Railway project/service metadata, deployment logs, health behavior, and GitHub deployment evidence before changing production configuration.

## Toolchain

- Node.js `22.23.1`
- npm `11.17.0`

Use deterministic installs:

```text
npm ci
npm --prefix epdg-backend-core ci
```

## Verification

```text
npm test
npm --prefix epdg-backend-core run build
npm --prefix epdg-backend-core run lint
npm --prefix epdg-backend-core test
```

Latest local verification for the preserved release worktree:

- Root security tests: `9` passed, `0` failed.
- EPDG build: passed with no TypeScript errors.
- EPDG route/security tests: `38` passed, `0` failed.
- EPDG lint: exited `0` with `0` errors and `161` warnings. The warnings remain visible code-quality debt and were not suppressed.
- `git diff --check`: passed; Git reported line-ending conversion notices only.

The EPDG server validates required environment configuration and database connectivity before listening. It does not apply migrations at startup. The root foundation requires an explicit production database connection and CORS allowlist; feature switches are fail-closed.

The current EPDG compatibility boundary is deliberately fail-closed: generic `/api/signup` and `/api/portfolio/*` routes are not mounted, while token refresh, anonymous CV upload, agreement acceptance, legacy onboarding completion, private submission writes, session rating, and certificate issuance remain unavailable until their ownership, revocation, storage, or legal contracts are approved. Company and school dashboard data APIs are not implemented. Backend opportunity routes exist, but the active frontend does not consume them.

No Railway deployment, production environment change, database migration, or external storage change is represented by the local verification above. The Railway project, service, root directory, and canonical API origin still require provider evidence.

Environment variable names and purposes are documented in the two `.env.example` files. Never commit populated environment files.

See [docs/BACKEND_ROUTE_AUDIT.md](docs/BACKEND_ROUTE_AUDIT.md) for the exact route inventory, frontend coverage, and blocked schema/release decisions.
