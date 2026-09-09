# Porto Viewer Security Checkpoint

Date: 2026-09-09. Scope: Rita.Cabral@fcporto.pt, operational read-only, no financial information.

## Access Contract

- Separate `/porto` portal: players, guardians, training groups, attendance, squads, games, enrollment records and trial classes, with campus/search/date filters and pagination where applicable.
- No Caja, charges, payments, balances, receipts, scholarships, pricing, financial reports, collection notes, staff administration, debug tools or financial repair tools. Original staff pages are not reused because they mix operational and financial information.
- No player/guardian edits, attendance posting, enrollment creation or squad/game changes. Account sign-out remains available.
- Role is assignable only to the exact confirmed Rita email, with no campus restriction and no other role allowed alongside it. Sign-in alone grants no business access.
- Operational personal data is intentionally visible per owner instructions. Read-only does not prevent copying, screenshots or disclosure by a permitted viewer.

## Findings And Candidate Repairs

1. An existing unapproved Gmail identity authenticated through Azure but held no application role. It could read professor and area-map rows. Four broad authenticated read policies now require internal staff authority.
2. `get_porto_datos_generales` exposed financial aggregates without a role gate. It now requires director authority, excluding the viewer.
3. Latest finance reconciliation and legacy team-list RPCs received explicit authorization guards.
4. Business tables receive restrictive viewer RLS policies. Role-table writes are also blocked. The operational viewer uses a fixed-column SECURITY DEFINER projection, never a client-side filter over financial responses.
5. QZ signing previously required only authentication. It now requires operational authorization and returns generic signing errors.
6. Next.js and related runtime dependencies were updated. Runtime audit has two moderate Excel/uuid advisories remaining; resolving the suggested Excel downgrade requires a separate compatibility pass. Full development-dependency audit is not clean and is not represented as production runtime exposure.

## Verification

- `node scripts/test-porto-viewer-db.cjs`: 123 checks against the production schema/data inside a transaction that always rolls back. Includes raw business-table denials, eight exact-schema operational projections, financial RPC denial, mutation/role-combination protections, unapproved identity denial, and representative existing staff recognition.
- `node scripts/assert-porto-viewer.mjs`: input bounds, projection and authorization source checks passed.
- `node scripts/preview-porto-validation.cjs --setup`: real Supabase Preview authenticated session and RPC checks; generated a test link locally without sending email. `--cleanup` removed its temporary role/session and local session files after browser verification.
- Browser: all eight views, search, desktop/mobile visual inspection, redirect from Caja, HTTP 403 for financial export/raw staff roster and printer signing.
- TypeScript and production build passed. Existing debug-reset, passwordless-proof, attendance finance-visibility, credit-checkout, training-workload role checks passed during this session.
- Built browser files: 118 checked against configured private credential values, zero matches. Public frontend JavaScript remains inspectable by design; server code and credentials must stay server-side.
- These checks are bounded regression/security tests, not an assurance against every possible vulnerability. Real Microsoft SSO for Rita and deployed production behavior remain untested.

## Release Boundary And Next Steps

- Preview DB has migration `20260909120000`; its migration history is recorded. No production schema or account grant persists from this audit.
- Application deployed to Preview as v1.17.67 (`e462afb`), Vercel deployment `dpl_Gva1zcydH7ZhRQQgbNnj3Sphvzxe`. Migration workflow `34384870939` and security workflows passed. Do not authorize Rita in production before code and DB protections are released together.
- Deployed verification: all eight views, four staff-route redirects, three API denials, anonymous redirect, and post-cleanup access revocation passed (17 checks). Temporary role/session removed; no email sent. Preview alias: https://dragon-force-ops-git-preview-steamsodas-projects.vercel.app/porto.
- Obtain explicit production approval, apply migration/deploy, repeat denial checks, then have Rita try Microsoft login and grant only the dedicated role to her confirmed identity.
- If Microsoft rejects her account, reconsider email delivery. The administrative test session does not establish Microsoft compatibility. No invitation or OTP email was sent in this pass.
- Existing test helpers are audit/support scripts, not automatic enrollment or production provisioning jobs. Do not run temporary-role setup against production.
