# The Emerson Empire Backend API

Backend API foundation for The Emerson Empire ecosystem, including The Emerson Empire, The Emerson Agency LLC, Emerson Professional Development Group, and the Global Internship Program infrastructure.

## Architecture

```text
Netlify frontends -> Railway Express API -> Supabase Postgres
```

Netlify must never connect directly to PostgreSQL or store database credentials. Database access belongs in this backend API layer.

## Current Status

This repository now contains a deployment-ready Express foundation:

- `server.js` application entrypoint
- `db.js` Postgres/Supabase connection helper
- `/health` service and database health check
- `/api/agency/booking-inquiries` public Agency inquiry route
- `/api/epdg/deliverable-submissions` internal/form-based EPDG submission route
- `/api/epdg/portfolio-evidence` placeholder route awaiting final table confirmation
- `/api/public-contributions` public-safe intern contribution route
- `/api/certificates/:certificateNumber` certificate verification route

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Then open:

```text
http://localhost:3000/health
```

## Railway Setup

Use these settings in Railway:

```text
Repository: webdev692/THE-EMERSON-EMPIRE_Backend
Root directory: /
Install command: npm install
Start command: npm start
Health check path: /health
```

Required environment variables:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=<Supabase pooled or direct Postgres connection string>
CORS_ALLOWED_ORIGINS=https://theemerson.netlify.app,https://emersonagency.netlify.app,https://emersonprofessionaldevelopment.netlify.app,https://epdg.netlify.app
PUBLIC_CREDITS_ENABLED=true
AGENCY_MODULE_ENABLED=true
EPDG_MODULE_ENABLED=true
CERTIFICATE_VERIFICATION_ENABLED=true
```

## Security Rules

- Do not commit `.env` files.
- Do not commit Supabase service role keys.
- Do not expose `DATABASE_URL` in Netlify or frontend code.
- Do not create public read routes for Agency clients, service requests, document records, or internal users until authentication and authorization are implemented.
- Use mock data in development and documentation.

## Review Notes

Some routes depend on tables that may need to be created or aligned in Supabase before production use. See `docs/data-dictionary.md`, `docs/api-endpoints.md`, and `supabase/migrations/20260708_api_foundation_review.sql`.
