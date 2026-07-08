# Privacy and Security Notes

## Core Rule

The frontend must not connect directly to PostgreSQL. The frontend should call the backend API, and the backend API should connect to Supabase/Postgres using server-side environment variables.

## Do Not Store Publicly

Do not commit or expose:

- Real client financial records
- Tax documents
- Insurance documents
- Credit documents
- Government IDs
- Social Security numbers
- Private intern phone numbers
- WhatsApp messages
- Database passwords
- Supabase service role keys
- Railway secrets

## Agency Intake Boundaries

The Agency booking inquiry endpoint should collect only basic scheduling and service-interest information. It should not upload or store sensitive documents.

## Public Contributions Boundaries

Public contribution records must be:

1. public-facing by design,
2. approved by leadership or an authorized reviewer,
3. consented to by the intern or contributor,
4. free of private contact information and private internal notes.

## Certificate Verification Boundaries

Certificate verification routes should only expose public-safe verification details:

- certificate number
- intern name snapshot
- program name
- issue date
- status

Do not expose internal database IDs, admin notes, reviewer notes, or private documents.

## Supabase RLS Warning

Supabase currently requires a dedicated Row Level Security review. Some tables have RLS disabled, and many RLS-enabled tables do not yet have policies. Do not expose direct frontend Supabase access until policies are reviewed and tested.

## Authentication

The MVP routes in this PR are API foundation routes. Before production-sensitive use, add authentication and authorization for:

- admin routes,
- intern submissions,
- private dashboard reads,
- internal Agency records,
- audit logs.
