# EPDG backend core

Express and TypeScript API for the EPDG platform.

## Local workflow

Use Node.js `22.23.1` and npm `11.17.0`.

```text
npm ci
npm run build
npm run lint
npm test
```

Latest local release-worktree results: build passed, route/security tests passed `38/38`, and lint exited `0` with `0` errors and `161` unsuppressed warnings. These are local results only; no Railway deployment or production environment change has occurred.

Populate a local `.env` from the variable names in `.env.example`. Never commit the populated file.

The server validates core configuration, connects to the database, and only then listens. Application startup never applies migrations. The manual migration function also requires an explicit acknowledgement and does not erase migration history on a hash mismatch.

Production browser origins come only from `CORS_ORIGINS`; hardcoded production domains are intentionally absent. Development mode permits the documented local Vite origins.

Current fail-closed boundaries:

- There is no mounted `POST /api/signup`; supported public registration is `POST /api/auth/register`.
- `POST /api/auth/refresh`, anonymous CV upload, agreement acceptance, legacy onboarding completion, private submission writes, intern session rating, and certificate issuance return `503`.
- `/api/portfolio/*`, company dashboard APIs, and school dashboard APIs are not mounted.
- Opportunity routes exist for approved admins and interns, but the active frontend has no opportunity API consumer.

Do not enable the blocked routes by configuration alone. The final role matrix, session lifecycle, private storage ownership/delivery, certificate issuance, and tracked-versus-live schema contracts require review first.

The exact API inventory and known missing frontend contracts are documented in `../docs/BACKEND_ROUTE_AUDIT.md`.
