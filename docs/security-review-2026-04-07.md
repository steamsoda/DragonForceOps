# Security Review — 2026-04-07

This is the first lightweight security hardening review for the current app state.

## Confirmed okay

- `SUPABASE_SERVICE_ROLE_KEY` appears server-only in `src/lib/supabase/admin.ts`.
- Public Supabase config is loaded through `src/lib/supabase/env.ts` using the expected `NEXT_PUBLIC_*` env vars.
- `QZ_PRIVATE_KEY` is used only in the authenticated server route `src/app/api/sign-qz/route.ts`.
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

## Future hardening

- Consider hard-gating TruffleHog once the advisory signal is stable.
- Consider hard-gating dependency audit on critical/high findings once the current clean baseline is sustained.
- Revisit SonarQube later only if broader static-analysis dashboards and PR-quality gates become worth the maintenance cost.
