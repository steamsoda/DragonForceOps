# Security Review — 2026-04-07

This is the first lightweight security hardening review for the current app state.

## Second sweep update

This follow-up pass adds a repo/app-level review after the first CI scanners landed.

## Confirmed okay

- `SUPABASE_SERVICE_ROLE_KEY` appears server-only in `src/lib/supabase/admin.ts`.
- A repo-wide search for `createAdminClient()` only found the helper definition itself during this pass; no active app/runtime callers were found in the current codebase.
- Public Supabase config is loaded through `src/lib/supabase/env.ts` using the expected `NEXT_PUBLIC_*` env vars.
- Public env usage currently appears intentional and limited to:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_QZ_CERTIFICATE`
- `QZ_PRIVATE_KEY` is used only in the authenticated server route `src/app/api/sign-qz/route.ts`.
- The remaining `src/app/api/*` routes that were spot-checked are currently harmless placeholders returning `501`, not exposed data surfaces.
- High-risk mutation modules such as billing, caja, enrollments, payments, and admin consistently retrieve the authenticated user and then apply role/campus-aware checks through shared permission helpers or superadmin checks before sensitive writes.
- Campus-scoped RLS hardening is already reflected in the migration history through `current_user_allowed_campuses()` and the permissions hardening migration chain.
- `npm audit` is currently clean:
  - critical: 0
  - high: 0
  - moderate: 0
  - low: 0
- No explicit custom CORS headers were found in app routes during this first pass.

## Needs follow-up

- Keep reviewing RLS and app-layer access together after each major workflow wave; this remains the biggest real security surface for a Supabase app.
- Review sensitive server actions periodically for role drift, especially around finance, admin, and cross-campus workflows.
- Add a periodic secret-rotation drill for Supabase, Vercel, and any signing keys after the CI secret scan is in place.
- If the attendance export route becomes a wider operational surface, add an explicit route-level role/campus gate instead of relying only on the authenticated session plus downstream query protections.
- Placeholder API routes should stay non-functional until they are fully implemented with explicit auth/role behavior; do not let them evolve into partially-open data endpoints.

## Future hardening

- GitHub Actions workflow actions were moved to the current Node 24-compatible majors in this pass; keep monitoring action/runtime notices as GitHub updates hosted runners.
- Consider hard-gating TruffleHog once the advisory signal is stable.
- Consider hard-gating dependency audit on critical/high findings once the current clean baseline is sustained.
- Revisit SonarQube later only if broader static-analysis dashboards and PR-quality gates become worth the maintenance cost.
