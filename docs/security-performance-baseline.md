# Security and Performance Baseline

This checklist is mandatory for every feature and PR.

## Security Baseline
1. Authentication and authorization
- All protected data paths require authenticated users.
- Authorization is enforced with role checks in app layer and RLS in database.
- No temporary bypass in production (`BOOTSTRAP_ADMIN_EMAILS` must not be used in prod).

2. Secrets and credentials
- No secrets in source code, commits, client bundles, screenshots, or logs.
- Use only environment variables in Vercel/Supabase/Azure.
- Rotate secrets immediately after accidental exposure.

3. Database exposure controls
- RLS enabled for all domain tables.
- Policies follow least privilege and explicit allow rules.
- Service-role key is server-only, never exposed client-side.

4. Input and mutation safety
- Validate and sanitize all request payloads server-side.
- Use parameterized database access only (no dynamic SQL concatenation).
- Critical operations are transactional where partial writes are risky.

5. Operational safeguards
- Preview and production env vars are scoped separately.
- Deployments use preview-first workflow.
- Auth audit logs are enabled and reviewed during incidents.

## Performance Baseline
1. Query design
- Select only required columns.
- Apply filters that match indexed columns.
- Avoid N+1 query patterns on list/detail pages.
- Pagination is required for list endpoints.

2. Indexing
- Every new filter/sort pattern on medium/high-traffic pages requires an index review.
- Add migration-backed indexes for recurring query patterns.
- Verify with `EXPLAIN` on slow queries.

3. API and page behavior
- Keep expensive calculations server-side and aggregated where possible.
- Reuse query modules to avoid repeated logic and regressions.
- Avoid unnecessary parallel requests from the same page for equivalent data.

4. Monitoring and regression control
- Track response times for key flows: login, players list, charges, payments, dashboard.
- Any significant slowdown blocks merge until resolved.

## PR Gate (must pass)
1. Security gate
- [ ] No secrets or keys added/changed in code.
- [ ] Protected routes still require auth.
- [ ] RLS/policy impact reviewed for any schema/data-path change.
- [ ] Temporary bypasses are disabled in production behavior.

2. Performance gate
- [ ] New/changed queries reviewed for indexes and column scope.
- [ ] Pagination preserved for list pages.
- [ ] `npm run build` passes.
- [ ] No obvious N+1 or duplicated query regressions.

## Owner Checklist (Platform)
1. Vercel
- Production and Preview env vars are explicitly scoped.
- Deployment protection is enabled for preview links.

2. Supabase
- Backups/PITR configured.
- RLS active on all domain tables.
- Auth redirect URLs and provider config are current.

3. Azure
- Redirect URIs match active Supabase project refs.
- Secret values are valid and rotated periodically.

