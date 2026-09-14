# Email/password authentication: Preview implementation

Historical implementation notes follow. Production was enabled on September 14
in release 1.17.69 with explicit production gates. Current release evidence and
remaining real-email verification are in `2026-09-14-production-auth-release.md`;
earlier Preview-only and pending-provider statements below describe prior checkpoints.

## Dashboard checkpoint: September 14

- Resend domain `auth.fcportodragonforcemty.com` verified. User created the restricted sending key and saved the SMTP password directly in Supabase Preview.
- Reload verified custom SMTP enabled, host `smtp.resend.com`, port 465, sender INVICTA, minimum interval 60 seconds. Credential validity/delivery has not yet been tested.
- Saved Preview confirmation and recovery templates using the TokenHash/RedirectTo links below, with INVICTA subjects and Spanish text. Supabase reported successful saves.
- Enabled and saved Preview email provider with explicit owner approval. Confirm email and leaked-password protection are enabled; Azure remains enabled. No anonymous sign-in or manual linking enabled. Owner confirmed saving minimum password length 12.
- Native hCaptcha enabled with the user-entered secret. Live missing/invalid token tests both returned `400 captcha_failed`. Sitekey uses Always Challenge. Domain allowlisting is unavailable in the dashboard; official hCaptcha configuration documentation describes it as forthcoming. It is not enforced.
- Added exact Preview `/auth/confirm` and `/auth/reset-password` redirects, preserving existing redirects. No production change or credential stored in repository/chat.

## Controlled Preview deployment: September 14

- Current Preview deployment after manual Porto authorization UI update: `dpl_8JBiDXUcXPVyhPFB5ui6zjoK8hrV`, `https://dragon-force-ra439vdok-steamsodas-projects.vercel.app`, Ready and assigned to the stable Preview origin. Supersedes the builds below; all login flags preserved for the controlled test.
- Follow-up: owner requested personal Gmail `javigarza93@gmail.com` for testing and an 8-character minimum. UI and signup/reset backend validation now use 8; boundary tests cover 7/8/128/129 characters. Owner confirmed saving 8 in Preview Supabase while retaining leaked-password protection. No new role grant was requested or performed for Gmail.
- Eight-character update supersedes the initial deployment below: `dpl_G8EAARFT3KeZd5kbL3C49JprHBdS`, `https://dragon-force-cq4ruhv1h-steamsodas-projects.vercel.app`, Ready and assigned to the same stable Preview origin. Cloud build, local typecheck and policy tests passed; hosted form reports 8 and hosted endpoint rejects a seven-character signup with 400 before email delivery.
- Owner approved Preview deployment, email/password enablement and tests with `tigres.azulyoro@live.com` only. Rita remains untouched.
- Deployment `dpl_BoV3o2cE46PNiDCNvajqogXqokLe` is Ready at `https://dragon-force-ez65k5i3g-steamsodas-projects.vercel.app`.
- Stable test origin `https://dragon-force-ops-git-preview-steamsodas-projects.vercel.app` now points to that deployment.
- Built from HEAD plus an explicit allowlist of authentication source files in `.tmp/auth-preview-release-20260914`. Unrelated working-tree files and local credentials were excluded. No Git commit/push performed.
- The five authentication environment settings below were passed as deployment-scoped build/runtime values, not saved as persistent Vercel project settings. Readiness flags were enabled for this owner-approved controlled test; successful delivery is still pending, not certified by those flags. A future deployment must deliberately preserve these settings.
- Cloud build/typecheck succeeded. Local password policy tests passed. Installed Preview authorization checks: 28 passed, all fixtures rolled back. Deployed cross-origin request rejected 403. Same-origin invalid-CAPTCHA recovery returns the deliberately generic response; provider rejection was verified separately.
- Hosted signup renders the real hCaptcha widget. User handoff: enter a private test password, complete CAPTCHA and submit signup, then verify email arrival. Confirmation, recovery and authenticated viewer tests remain pending. No successful email delivery claimed yet.

## Scope and release state

Implementation is deployed to Preview from an isolated source snapshot, with source changes still uncommitted locally. Microsoft authentication remains unchanged.
Preview provider configuration is described above. No database migration or manual persistent role change performed; successful email delivery remains unverified.
The older `/api/auth/email` magic-link proof is disabled.

Routes: `/` (sign in), `/auth/create-account`, `/auth/resend-confirmation`,
`/auth/confirm`, `/auth/forgot-password`, `/auth/reset-password`, `/api/auth/password`.
Verified users continue through `/inicio` and existing database authorization.
Unapproved users see the no-access screen with a working sign-out action.
Automatic preauthorization remains exact-email, confirmed-only, one-time. Rita remains manual-only.
Preview migration `20260914120000` removes the allowlist requirement for manual Porto grants and
operational-view reads. Any verified account can be assigned the role by Superadmin. Existing
RLS, no-finance/no-write rules and role-isolation guards remain. Revoke access by removing the
role in Usuarios y Permisos; disabling a preapproval is not a substitute for role revocation.
The Gmail signup was verified successfully and has no role; no real account was granted access
by this change. Rollback-only installed tests passed 23 checks, including authenticated manual
grant, self-grant denial, unverified denial, eight projections, raw/financial denial and revocation.

## Environment gates

All unset by default. Do not put credentials in this document or git.

- `EMAIL_PASSWORD_AUTH_ENABLED=true`: display forms only on Vercel Preview or local development. Explicitly denied on production, even when set.
- `AUTH_SITE_URL`: exact trusted origin, no path/query; HTTPS on Preview, e.g. a stable Preview alias. Local example `http://localhost:3107`.
- `NEXT_PUBLIC_AUTH_HCAPTCHA_SITE_KEY`: public hCaptcha site key for the approved domains.
- `AUTH_EMAIL_DELIVERY_READY=true`: enables email operations after sender/SMTP/template configuration; temporarily enabled for the approved controlled Preview delivery test. It does not itself prove delivery.
- `AUTH_SECURITY_CONFIG_VERIFIED=true`: operator acknowledgement of the checklist below. Not an automated verification of provider settings.

Both readiness flags plus the CAPTCHA site key are required before any password endpoint operation.
New flags are deployment-scoped in Vercel Preview. Supabase Preview provider configuration is saved.
The earlier localhost UI test enabled only the display flag and origin; email delivery remained false there.

## Provider checklist before enabling

1. Resend must verify `auth.fcportodragonforcemty.com`. Preserve IONOS root mail records.
2. Set Supabase custom SMTP with a sending-only Resend key and sender such as
   `INVICTA <acceso@auth.fcportodragonforcemty.com>`; never expose the SMTP secret to client code.
3. **Confirm email must be enabled**, email provider enabled. Audit the current public signup setting.
   Direct Supabase Auth requests exist independently of these app gates: provider protections are mandatory.
4. Enable Supabase native hCaptcha verification using the matching secret key. The app forwards
   `captchaToken` to Supabase on login/signup/recovery/resend; it does not pretend token presence verifies it.
   Confirm missing/invalid tokens fail against the real provider, not just this proxy.
5. Configure Supabase password minimum 8 (owner-requested September 14) and appropriate password/rate-limit protections. Keep native
   rate limits enabled; verify shared-server request behavior before increasing any limits.
6. Add exact Preview confirmation and recovery redirect URLs. No broad wildcard production redirects.
7. Configure email templates below. Do not enable this flow with default callback templates.
8. Confirm public signup cannot write roles; preapproval table remains private. Never accept a role
   from signup metadata. Confirm an existing Microsoft user's verified email does not lose/change roles.

## Templates

Supabase owns passwords, token generation, expiration and one-time verification.
Use custom TokenHash templates (not the default ConfirmationURL) to reach our inert GET screens:

Confirm signup link:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}">Confirmar mi correo</a>
```

Recovery link:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}">Crear nueva contrasena</a>
```

The backend supplies the fixed matching `/auth/confirm` or `/auth/reset-password` RedirectTo.
Use clear INVICTA branding and expiry text matching actual provider settings; do not include passwords.
Disable link tracking. GET does not consume tokens, protecting against email link scanners.
Forms remove the query string from browser history after loading, and auth routes send no-referrer/no-store
headers and are excluded from Speed Insights. Reloading the cleaned page requires reopening the email link.

Recovery submits the token and validated password together, verifies **recovery** type in a fresh client
with no caller session, updates only the password, and requests global sign-out. No recovery session is
returned to the browser. Existing access JWTs can remain valid until expiration; global sign-out revokes
refresh sessions, not already-issued JWTs immediately. A consumed token cannot be retried after a failed update;
the screen tells the user to request another link. Account email changes are outside this pass.

### September 14 recovery verification correction

Supabase Auth intentionally looks up the same RecoveryToken for `magiclink` and `recovery`:
https://github.com/supabase/auth/blob/master/internal/api/verify.go . The original synthetic test
incorrectly assumed a strict purpose boundary. An emailed sign-in token is already an identity
credential; acceptance here alone is not proof of unauthenticated account takeover. Do not describe
this flow as recovery-only token isolation. Strict purpose separation would need a different design.

The corrected hosted Preview test passed: shared-token compatibility, invalid/expired/reused token
denial, actual password update, no live browser session cookie returned, zero remaining synthetic
sessions and rejection of both an original and a freshly created refresh token. Expiry was simulated
only on the guarded synthetic account. Cleanup removed that account and local session files.
This is backend evidence, not real email-delivery or CAPTCHA acceptance proof.

Production SMTP was saved by the owner using a separate sending key; the supplied screenshot
confirmed the expected sender/host/port/username. Browser input readouts omitted visible values,
so do not ask the owner to repeat SMTP setup based only on those readouts. Production email provider
retains confirmation and Azure. Leaked-password protection and minimum length 8 were submitted
through the production dialog; saved-state readback remains pending. CAPTCHA setup/secret entry,
production templates/redirects, and actual mail testing are still pending. Browser approval-service
capacity failures interrupted setup. No production app or migration deployment was performed.

## Verification and launch blockers

- Local typecheck, production build, mocked auth operation tests and retired-proof/Porto source regressions passed.
- Built production HTTP test passed: flags cannot enable the password route/screens; Microsoft login remains present.
- Preview installed preauthorization/RLS checks: 28 passed, all fixtures rolled back.
- Local HTTP: cross-origin POST denied 403; same-origin request with delivery disabled denied 503.
- Browser: desktop/mobile signup, password mismatch, visibility, all auth screens at 320px and token URL removal checked. No horizontal overflow.
- Still required: real hCaptcha rejection/acceptance, signup delivery/confirmation (including existing email),
  confirmation-token rejection by recovery, recovery delivery, approved test identity read-only
  login, unknown identity denial, Microsoft regression and financial/RPC denial through authenticated sessions.
- Admin preapproval/pending-user UI is a follow-up pass. No production enablement until the real flows pass
  and the owner explicitly approves release.

Tests: `node scripts/test-password-auth.mjs`, `npm run typecheck`,
`npm run build`, `node scripts/test-password-auth-production-gate.mjs`,
`node scripts/assert-porto-passwordless-proof.mjs`, `node scripts/assert-porto-viewer.mjs`,
`node scripts/test-porto-preauthorization.cjs --preview --verify-live` (rollback-only).
