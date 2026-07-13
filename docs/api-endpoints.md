# API Endpoints

This file documents the root JavaScript foundation service. The separate EPDG TypeScript route surface and frontend compatibility status are controlled by [BACKEND_ROUTE_AUDIT.md](BACKEND_ROUTE_AUDIT.md). The authoritative Railway service/root mapping is not yet proven, and no deployment is implied by this inventory.

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

Public: mounted as a write-only route, but fail-closed with `503` unless `AGENCY_MODULE_ENABLED` is explicitly `true`. Do not enable it until the authoritative service, schema, recipient/intake workflow, and production CORS origin are confirmed.

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

Status: unavailable (`503`) on the root foundation service because it has no authentication or ownership checks. EPDG core submission writes also remain `503` until the authoritative deployment target and private storage ownership/delivery contract are confirmed.

No request-body contract is active. The service intentionally does not accept caller-supplied identity, placement, task, or file ownership values on this unauthenticated route.

### `POST /api/epdg/portfolio-evidence`

Purpose: future portfolio evidence endpoint.

Status: not implemented (`501`) until the final table and authorization contract are confirmed.

## Public Contributions

### `GET /api/public-contributions`

Purpose: returns public-safe intern contribution records only.

Public: mounted, but fail-closed with `503` unless `PUBLIC_CREDITS_ENABLED` is explicitly `true`.

Data rule: only show public/approved/consented records. The current route reads `epdg.career_files` where `is_public = true` and joins approved public-facing profile metadata.

## Certificates

### `GET /api/certificates/:certificateNumber`

Purpose: verifies issued certificates by certificate number.

Public: mounted, but fail-closed with `503` unless `CERTIFICATE_VERIFICATION_ENABLED` is explicitly `true`.

Response should not expose private intern notes, internal reviewer comments, or database IDs.

## Routes not mounted on this service

- `POST /api/signup`
- `/api/auth/*`
- `/api/admin/*`
- `/api/intern/*`
- `/api/mentor/*`
- `/api/portfolio/*`

Do not treat a `404` from these paths as evidence that the EPDG TypeScript service is healthy; it may indicate that Railway is running the root foundation entrypoint instead.

## Routes intentionally not public

Do not create public read routes for:

- Agency clients
- Agency service requests
- Agency document records
- Agency compliance acknowledgements
- Internal users
- Audit logs
- Private intern files
