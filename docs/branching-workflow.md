# Branching Workflow (Git + Supabase + Vercel)

Use this flow to ship changes with low downtime and avoid touching `main` directly.

## Concepts
- `git push`: uploads your branch commits to GitHub.
- `pull request` (PR): proposes merging your branch into `main`. This is where review and preview happen.
- Supabase Preview Branch: temporary database branch tied to a PR.
- Vercel Preview Deployment: temporary app URL tied to a branch/PR.

## Recommended flow (every feature)
1. Create a feature branch locally:
   - `git checkout -b feature/<short-name>`
2. Make changes in app code and SQL migrations.
3. Commit and push:
   - `git add .`
   - `git commit -m "feat: <message>"`
   - `git push -u origin feature/<short-name>`
4. Open PR from `feature/<short-name>` to `main`.
5. Supabase auto-creates preview DB branch (if enabled).
6. Vercel creates preview deployment URL.
7. Test on preview URL.
8. Merge PR to `main` when green.

## Migration rule (critical)
- Never do important schema changes only in dashboard manually.
- Always add SQL in `supabase/migrations/*`.
- Reason: preview branches are built from migrations, not from your memory of manual edits.

## Low-downtime release pattern
1. Keep production app in maintenance mode (`MAINTENANCE_MODE=true`) until ready.
2. Build and validate everything in preview.
3. Merge PR to `main`.
4. Turn off maintenance only after production health check passes.

## Env mapping rule (avoid project mismatch)
- `Preview` deploy must use preview Supabase URL/key.
- `Production` deploy must use production Supabase URL/key.
- In Vercel, set variables separately by environment (not shared unless intentionally same project).

## Preview auth checklist
1. Confirm authorize URL uses expected preview project ref:
   - `https://<preview-ref>.supabase.co/auth/v1/authorize?...`
2. In Supabase preview project, add redirect URL(s):
   - `https://<preview-vercel-domain>/auth/callback`
3. In Azure app registration, include callback:
   - `https://<preview-ref>.supabase.co/auth/v1/callback`
4. Login once with your user, then assign role in preview DB.

## Role assignment quick SQL
Run in preview SQL editor after first successful login:

```sql
insert into public.user_roles (user_id, role_id, campus_id)
select u.id, r.id, null
from auth.users u
join public.app_roles r on r.code = 'director_admin'
where lower(u.email) = lower('javierg@dragonforcemty.com')
on conflict (user_id, role_id, campus_id) do nothing;
```

## If preview login fails
1. Check first redirect URL and capture project ref.
2. Compare that ref to the Supabase dashboard project/branch you are editing.
3. If refs differ, Vercel env is pointing to the wrong project.
4. Update env, redeploy preview, retry.

