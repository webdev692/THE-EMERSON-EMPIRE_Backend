# API Endpoints

This file documents the MVP backend routes for The Emerson Empire backend API.

## Health

### `GET /health`

Purpose: confirms the API is running and checks whether the database is reachable.

Public: yes.

Example response:

```json
{
  "success": true,
  "service": "the-emerson-empire-backend",
  "status": "ok",
  "database": {
    "configured": true,
    "ok": true
  }
}
```

## Agency

### `POST /api/agency/booking-inquiries`

Purpose: receives public Agency booking inquiries.

Public: yes, write-only.

Required request fields:

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "requestedService": "Tax preparation",
  "acknowledgementAccepted": true
}
```

Optional request fields:

```json
{
  "phone": "",
  "preferredContactMethod": "email",
  "preferredDate": "2026-07-15",
  "preferredTimeWindow": "Afternoon",
  "message": "I would like to schedule a consultation."
}
```

Privacy rule: do not collect or store sensitive documents through this route.

## EPDG

### `POST /api/epdg/deliverable-submissions`

Purpose: receives EPDG deliverable submissions.

Public: internal/form-based MVP route. Authentication should be added before sensitive usage.

Required request fields:

```json
{
  "taskId": 1,
  "placementId": 1,
  "internId": 1,
  "fileUrl": "https://example.com/proof"
}
```

Optional request fields:

```json
{
  "fileName": "Week 10 Proof",
  "fileSizeKb": 125,
  "notes": "Submitted for review."
}
```

### `POST /api/epdg/portfolio-evidence`

Purpose: future portfolio evidence endpoint.

Status: placeholder until the final Supabase table is confirmed.

## Public Contributions

### `GET /api/public-contributions`

Purpose: returns public-safe intern contribution records only.

Public: yes.

Data rule: only show public/approved/consented records. The current route reads `epdg.career_files` where `is_public = true` and joins approved public-facing profile metadata.

## Certificates

### `GET /api/certificates/:certificateNumber`

Purpose: verifies issued certificates by certificate number.

Public: yes.

Response should not expose private intern notes, internal reviewer comments, or database IDs.

## Routes intentionally not public

Do not create public read routes for:

- Agency clients
- Agency service requests
- Agency document records
- Agency compliance acknowledgements
- Internal users
- Audit logs
- Private intern files
