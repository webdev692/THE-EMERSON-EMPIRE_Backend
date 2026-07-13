# Repository operating rules

These rules apply to every contributor and automation agent working in this backend repository.

## Scope and attribution

- Preserve prior intern contributions and authorship. Make focused changes and do not rewrite unrelated work.
- Keep this backend and the frontend as separate sibling Git repositories. Never nest another `.git` directory here.
- Treat the root JavaScript foundation service and `epdg-backend-core` as distinct entrypoints until the authoritative Railway service and root directory are verified.

## Safety

- Never commit environment files, credentials, tokens, private keys, production data, personal records, applications, evaluations, rosters, contracts, or private messages.
- Environment documentation contains variable names and purposes only.
- Never invent production origins, domains, form destinations, recipients, legal text, endpoints, or role permissions.
- Database work must be forward-only, idempotent, non-destructive, reviewed for RLS/grants, and accompanied by verification and a compensating plan.
- Application startup must never apply migrations or rewrite migration history.
- Do not drop or truncate production objects, overwrite real records, rewrite Git history, or force-push protected branches.

## Toolchain and verification

- Use Node.js `22.23.1` and npm `11.17.0` unless a reviewed repository-wide upgrade changes all declarations together.
- Use `npm ci` for deterministic installs. Do not update lockfiles incidentally.
- Run root tests and, for `epdg-backend-core`, run build, lint, and route-security tests.
- Browser and deployment evidence must correspond to the current commit. Never count stale, skipped, neutral, or canceled results as passing verification.

## Release discipline

- Keep commits logical and reviewable. Review the complete staged diff before each commit.
- Do not deploy or merge code with failing required checks.
- Record releases, migrations, deployments, verification, blockers, and rollback instructions in `docs/OVERNIGHT_FULL_STACK_RELEASE.md`.
- Public errors and logs must be privacy-safe and must never include secret values or private record contents.
