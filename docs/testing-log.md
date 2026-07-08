# Testing Log

Use this file to record backend and deployment tests.

## Test Template

```text
Date:
Tester:
Environment: local / Railway / Netlify integration
Endpoint or feature tested:
Request body used, if applicable:
Expected result:
Actual result:
Status: pass / fail / blocked
Screenshot or proof link:
Reviewer:
Next step:
```

## Required MVP Tests

### Health

- [ ] `GET /health` works locally.
- [ ] `GET /health` works on Railway.
- [ ] Database status returns `ok` after `DATABASE_URL` is configured.

### Agency

- [ ] Missing required fields return `400`.
- [ ] Invalid email returns `400`.
- [ ] Missing acknowledgement returns `400`.
- [ ] Valid booking inquiry returns `201`.
- [ ] No sensitive documents are accepted or stored.

### EPDG

- [ ] Missing submission fields return `400`.
- [ ] Invalid `fileUrl` returns `400`.
- [ ] Valid deliverable submission returns `201` after table mapping is confirmed.

### Public Contributions

- [ ] Public contributions route returns only public records.
- [ ] Private or non-public records are not returned.

### Certificates

- [ ] Existing active certificate returns `200`.
- [ ] Missing certificate returns `404`.
- [ ] Revoked/inactive certificate is not exposed as valid.

## Current Blockers

- Railway logs are not directly visible in this chat.
- Supabase RLS policy review is still required.
- Agency tables may need to be created or aligned before Agency routes can be used in production.
