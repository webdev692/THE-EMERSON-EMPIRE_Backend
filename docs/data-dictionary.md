# Data Dictionary

This document records the API-to-database assumptions used by the backend foundation.

## Database Target

Primary database target: Supabase Postgres project `Emerson Empire Database`.

## Agency Tables

The Agency booking route expects the following tables. If these do not yet exist in Supabase, review the SQL migration file before applying changes.

### `agency.clients`

| Column | Purpose |
|---|---|
| `id` | Primary key |
| `first_name` | Client/prospect first name |
| `last_name` | Client/prospect last name |
| `email` | Client/prospect email |
| `phone` | Optional phone number |
| `preferred_contact_method` | Email, phone, or other preferred contact method |
| `client_type` | Defaults to `individual` |
| `status` | Defaults to `prospect` |
| `created_at` | Creation timestamp |
| `updated_at` | Update timestamp |

### `agency.booking_inquiries`

| Column | Purpose |
|---|---|
| `id` | Primary key |
| `client_id` | Links to `agency.clients` |
| `inquiry_source` | Usually `website` |
| `requested_service` | Requested service area |
| `preferred_date` | Optional preferred date |
| `preferred_time_window` | Optional preferred time window |
| `message` | Optional message |
| `status` | Defaults to `new` |
| `created_at` | Creation timestamp |
| `updated_at` | Update timestamp |

### `agency.compliance_acknowledgements`

| Column | Purpose |
|---|---|
| `id` | Primary key |
| `client_id` | Links to `agency.clients` |
| `acknowledgement_type` | Disclaimer type |
| `version` | Disclaimer version |
| `accepted` | Boolean acknowledgement |
| `accepted_at` | Acceptance timestamp |
| `ip_address` | Request IP if available |
| `user_agent` | Browser/user-agent string if available |

## EPDG Tables Used by Current Routes

### `epdg.submissions`

Used by `POST /api/epdg/deliverable-submissions`.

| Column | Purpose |
|---|---|
| `task_id` | Links to assigned task |
| `placement_id` | Links to placement |
| `intern_id` | Links to intern user |
| `file_url` | Submission proof URL |
| `file_name` | Optional display name |
| `file_size_kb` | Optional size metadata |
| `notes` | Optional intern notes |
| `status` | Defaults to `submitted` |
| `submitted_at` | Submission timestamp |

### `epdg.career_files`

Used by `GET /api/public-contributions`.

Only records where `is_public = true` should be returned publicly.

### `epdg.certificates`

Used by `GET /api/certificates/:certificateNumber`.

Only active certificate records should verify publicly.

## Privacy Direction

No route should return private Agency records, real tax/insurance/credit documents, WhatsApp messages, private intern notes, database credentials, or raw internal audit data.
