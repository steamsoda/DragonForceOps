# Production Access Runbook

Last updated: 2026-04-21

Use this when a live user reports `Sin autorizacion`, empty data, or intake/pricing setup errors after a deployment or env change.

## 1. Supabase Env Check

- In Vercel Production env, confirm these variables belong to the same Supabase project:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Safe project-ref check:
  - URL ref comes from `https://<project-ref>.supabase.co`
  - service-role JWT ref comes from the decoded JWT payload `ref`
  - refs must match
- Safe to share in logs:
  - project refs
  - JWT `role`
  - JWT `iss`
  - whether the key exists
- Never share:
  - full JWT/key value
  - database password
  - Azure secrets

The app guard in `src/lib/supabase/admin.ts` now blocks trusted admin clients if the URL project ref and service-role project ref are proven different.

## 2. Role Bootstrap Check

- Open `Super Admin > Auditoria accesos`.
- Confirm Supabase env status is `URL/key coinciden`.
- Confirm the user exists in `auth.users`.
- Confirm `user_roles` has the expected role code and campus scope.
- Confirm the resolved campus labels match the role:
  - directors and superadmin: all active campuses
  - front desk: assigned campus or global if `campus_id is null`
  - director deportivo: assigned campus or global if `campus_id is null`
  - nutritionist: assigned campus only unless explicitly global

If a role row exists but campus resolution is empty, inspect whether the nested `campuses` join is null and whether fallback by `campus_id` still resolves an active campus.

## 3. Post-Deploy Smoke Tests

- Superadmin:
  - `/inicio`
  - `/admin/access-audit`
  - `/players/new`
- Caja:
  - `/caja`
  - `/players/new`
  - `/sports-signups`
- Director Deportivo:
  - `/sports-signups`
  - no money amounts visible
- Nutritionist:
  - `/nutrition`
  - `/nutrition/measurements`
  - blocked from `/players` and finance/admin pages

## 4. Triage Rules

- Env mismatch errors are configuration incidents, not pricing-data incidents.
- Empty scoped-user data after login is usually role/campus bootstrap or campus scope, not missing player data.
- Do not fix sports or nutrition access by granting raw finance-table RLS. Use safe server queries or diagnostics that return only approved fields.
- Preview `Ver como` is not production proof. Production must be tested as the real user or via the read-only access diagnostic.
