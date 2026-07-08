# Deployment Runbook

## Production Target

```text
Netlify frontends -> Railway backend API -> Supabase Postgres
```

## Railway Service Settings

```text
Repository: webdev692/THE-EMERSON-EMPIRE_Backend
Branch: main after PR merge
Root directory: /
Install command: npm install
Start command: npm start
Health check path: /health
```

## Required Railway Environment Variables

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=<Supabase Postgres connection string>
CORS_ALLOWED_ORIGINS=https://theemerson.netlify.app,https://emersonagency.netlify.app,https://emersonprofessionaldevelopment.netlify.app,https://epdg.netlify.app
PUBLIC_CREDITS_ENABLED=true
AGENCY_MODULE_ENABLED=true
EPDG_MODULE_ENABLED=true
CERTIFICATE_VERIFICATION_ENABLED=true
```

## Netlify Environment Variables

The EPDG dashboard should point to the public Railway API URL:

```env
VITE_API_URL=https://backend-production-4b0a9.up.railway.app
VITE_MOCK_AUTH=false
```

Do not add `DATABASE_URL`, Supabase service-role keys, or private API secrets to Netlify frontend sites.

## Deployment Verification

1. Railway deploy completes without crashing.
2. Open `https://backend-production-4b0a9.up.railway.app/health`.
3. Confirm response includes `service: the-emerson-empire-backend`.
4. Confirm database status is `ok` after `DATABASE_URL` is configured.
5. Confirm Netlify EPDG dashboard still loads.
6. Confirm no database secrets are exposed in frontend code or Netlify public env vars.

## Known Risks

- Railway cannot work until the backend repo contains a valid `package.json` and `npm start` script.
- Agency routes require Agency tables to exist in Supabase.
- EPDG routes depend on existing EPDG table names and may need refinement as frontend forms are finalized.
- Supabase RLS must be reviewed before exposing direct client-side Supabase access.
