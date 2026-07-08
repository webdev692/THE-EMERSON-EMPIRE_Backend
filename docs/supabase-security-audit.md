# Supabase Security Audit Notes

## Current Priority

The Supabase project is active and already contains substantial EPDG and core data structures. Before exposing direct client-side Supabase access, complete a Row Level Security review.

## Critical Finding

Supabase reported Row Level Security disabled on several tables, including:

- `epdg.career_files`
- `epdg.career_experiences`
- `epdg.career_projects`
- `epdg.career_skills`
- `core.branches`
- `core.users`
- `core.user_branch_roles`

This is a serious risk if Supabase client libraries are used directly from the frontend.

## Additional Finding

Many tables have RLS enabled but no policies. RLS-enabled-without-policy can block expected app access, while RLS-disabled can expose data. Both conditions need intentional policy design.

## Do Not Auto-Apply RLS

Do not enable RLS or add broad policies casually. Enabling RLS without policies can break the app; broad policies can expose private data.

## Recommended Next Steps

1. Decide whether the application will use backend-only database access or direct Supabase client access.
2. Keep database credentials out of Netlify and frontend code.
3. Build an `rls-policy-map.md` before applying RLS changes.
4. Create table-by-table policies for:
   - public read data,
   - authenticated intern data,
   - admin-only data,
   - backend service-only data.
5. Test policies in a Supabase branch or development project before production.

## Immediate Protection Strategy

For the MVP, use this safer architecture:

```text
Netlify frontend -> Railway backend API -> Supabase Postgres
```

This keeps sensitive database access server-side while the team designs proper RLS policies.
