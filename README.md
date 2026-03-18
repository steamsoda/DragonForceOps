# Dragon Force Ops

Internal operations MVP for FC Porto Dragon Force Monterrey.

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Postgres + Auth + RLS)
- Vercel deployment

## Local setup
1. Install dependencies:
   - `npm install`
2. Copy env template:
   - `cp .env.example .env.local`
3. Set environment values:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (recommended)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy fallback)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
   - `MAINTENANCE_MODE` (`true` or `false`)
   - `BOOTSTRAP_ADMIN_EMAILS` (optional, comma-separated allowlist for temporary admin access)
4. Run dev:
   - `npm run dev`

## Database
- Core migration:
  - `supabase/migrations/20260224090000_phase1_core.sql`
- Initial admin role seed:
  - `supabase/migrations/20260224094000_seed_admin_user_role.sql`
- Preview sample data seed (manual):
  - `supabase/seeds/preview_sample_data.sql`
- Apply using Supabase CLI or SQL editor in your project.

## Auth setup (Microsoft 365 / Azure)
- In Supabase Dashboard:
  - Authentication -> Providers -> Azure -> enable provider.
  - Configure Azure tenant/client credentials and redirect URL:
    - `https://<your-vercel-domain>/auth/callback`
    - `http://localhost:3000/auth/callback`
- First login flow:
  - Admin user signs in once so the record exists in `auth.users`.
  - Run `20260224094000_seed_admin_user_role.sql` (or re-run, idempotent) to assign `director_admin`.
  - Temporary fallback: set `BOOTSTRAP_ADMIN_EMAILS` to allow access before role seeding is complete.

## Vercel
- Add the same env vars in Vercel Project Settings for Preview and Production.
- Build command: `npm run build`
- Output: Next.js default (no custom output config needed).
- Recommended rollout:
  - Production env: `MAINTENANCE_MODE=true`
  - Preview env: `MAINTENANCE_MODE=false`
  - Then use Vercel Preview deployments (feature branches / PRs) to validate live work before promoting to production.

## Workflow
- Branching and preview DB workflow:
  - `docs/branching-workflow.md`

## Roadmap
- High-level product/design:
  - `docs/phase-1-sdd.md`
- Execution roadmap and next feature priorities:
  - `docs/roadmap-execution.md`

## Devlog
- Development history and decisions:
  - `docs/devlog.md`

## Security and Performance
- Mandatory baseline checklist:
  - `docs/security-performance-baseline.md`
