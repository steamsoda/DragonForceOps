# Turnstile migration

## Scope

- Separate Cloudflare Managed widgets created for Preview and production; each
  allows only its canonical app hostname, with pre-clearance disabled.
- `AUTH_CAPTCHA_PROVIDER=turnstile` selects the provider explicitly. Set
  `NEXT_PUBLIC_AUTH_TURNSTILE_SITE_KEY` to the matching public site key.
- An unset provider preserves hCaptcha for staggered rollout and rollback.
  Unknown providers or missing selected keys fail closed, without fallback.
- Supabase remains responsible for CAPTCHA validation on sign-in, signup,
  resend and recovery. No secret key belongs in browser code or Git.
- Token expiry, challenge timeout, SDK errors and submission clear the token;
  reset follows each request. Existing origin, confirmation and role gates stay.

## Release gate

1. Test locally, deploy Preview with its public key and provider setting.
2. Coordinate Preview Supabase's provider/secret change with deployment.
   Do not disable CAPTCHA while switching. A mismatch temporarily blocks email auth.
3. Verify real signup, sign-in, recovery and invalid-token denial. Verify Microsoft
   login unchanged. Remove synthetic accounts after tests.
4. Production remains hCaptcha until separately approved and verified.
5. Rollback requires matching app provider and Supabase provider/secret; reverting
   only one side does not restore working email auth.

## Status

Implementation in isolated worktree; hosted configuration and live tests pending.
Policy/operation tests and all 11 built HTTP gate cases passed. Optimized build
including Next's TypeScript validation passed. Incremental standalone tsc exhausted
the local heap; a clean standalone run (`--noEmit --incremental false`, 8 GB heap)
passed. No type checks were disabled.
Vercel env download redacts Preview public credentials to empty strings; local
HTTP gate artifact was rebuilt with synthetic public settings. No real auth
requests are made by those HTTP gate tests.

Preview deployment submitted: `dpl_ES1nmghGoP5i1Z895DvSn5obGbD8`, with per-deployment
Turnstile provider and public site key. Supabase has not yet been switched.

- Initial cached build stalled and was canceled. Clean-cache deployment
  `dpl_2joNHyquitbrLuJmj1xCaT3w4fSN` built successfully but missed branch-scoped
  email-auth settings (signup returned 404). Stable Preview was immediately
  restored to `dragon-force-8pqh1f6gf-steamsodas-projects.vercel.app`.
- Turnstile provider/site-key variables now saved specifically for the `preview`
  Git branch. Use the normal branch release, not the isolated CLI branch, so
  existing Preview auth settings resolve. Supabase and production unchanged.
