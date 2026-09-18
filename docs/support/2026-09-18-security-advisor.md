# Security advisor and user access audit

## Production audit, no mutations

- Owner supplied 38 `security_definer_view` errors, all for Director read-only
  projection views. Full warning inventory is recorded below.
- Read-only installed-catalog audit confirms each is postgres-owned, has
  security_barrier=true, explicit projected columns, is_director_readonly()
  filter and OFFSET 0. Authenticated has SELECT but no INSERT/UPDATE/DELETE;
  anonymous has no SELECT. All 38 actual anonymous probes denied.
- Installed role guard requires the director_readonly role, verified email,
  no active ban and no conflicting role/campus assignments. This is not evidence
  of an anonymous data leak. It remains an elevated-privilege design needing
  review, not a finding to dismiss or automatically flip to security_invoker.
- A blanket invoker change would use existing raw-table restrictions and can
  break the projection contract. No database security changes applied.
- Next: authenticated role/revocation and column-exposure audit, evaluate an
  explicit least-privilege replacement in Preview, run existing database and
  route regressions, then request production approval. Do not merely move
  elevated access elsewhere to hide advisor findings.

## Last login

- Existing list_auth_users RPC already provides last_sign_in_at and is guarded
  for SuperAdmin. Existing active-user table already displayed this value.
- Local UI now includes pending accounts, uses shared Monterrey date/time
  formatting, handles null/invalid values and labels created_at accurately as
  account creation rather than first login. No new auth/schema permissions.
- This is last recorded sign-in, not a live-presence or last-page-view tracker.
- Local only. Deployment and full security remediation pending.

## Supplied warning inventory

- Parsed both owner-provided exports: 38 ERROR (security_definer_view), 1 WARN
  (anonymous definer execution), 80 WARN (authenticated definer execution).
  No separate Critical level in these files; categories all SECURITY.
- Live metadata confirms rls_auto_enable() returns event_trigger, is wired to
  enabled ensure_rls, pins search_path=pg_catalog and enables RLS for new public
  tables. Client EXECUTE grants are unnecessary; it is not an ordinary RPC.
- Prepared 20260918190000_restrict_rls_auto_enable_execute.sql: revoke only
  PUBLIC/anon/authenticated execution, preserving definition/owner/event trigger.
  Fail closed for unexpected return type; skip when optional helper is absent.
- Preview lacks this production helper. Rehearsal tested absent-helper no-op
  and a rollback-only representative event-trigger fixture: grant removal,
  definition/owner preservation, idempotence and automatic new-table RLS passed.
  No persistent Preview or production changes applied.
- Live definitions for merge_players, nuke_player and repair_payment_allocations
  contain caller role checks and deny-readonly guards. This is static evidence,
  not completed authenticated-path testing of all 80 functions.
- Remaining: per-function dependency/authorization review, actual-role denial
  and success tests, view architecture decision, full installed regression,
  then Preview release and explicit production approval. Do not claim all
  warnings fixed or treat definer execution alone as proof of exploitation.

## Installed Preview authenticated checks (2026-09-18)

- `test-director-readonly-db.cjs --installed`: 857 checks passed, covering 38
  projections, 76 raw tables, 30 guarded RPCs and 45 staff result comparisons.
  Includes email-verification removal, banning and role revocation for the
  reader. GraphQL extension is absent; this is unavailability evidence, not
  a valid-schema GraphQL authorization test. Installed mode applies no migration;
  before/after staff comparisons are stability checks, not new-migration evidence.
- `test-security-advisor-high-risk.cjs`: 63 checks passed across no-role,
  director_readonly, coach, front_desk, director_admin and superadmin identities.
  Actual existing Preview payment IDs exercise cross-campus refund/reassignment
  denial. Covers deletion, merging, actor spoofing, payment allocation repair,
  preauthorization management and auth-user listing. Authorized destructive
  operations use nonexistent IDs; authorized payment mutation success has NOT
  been tested. Every probe and synthetic identity rolls back.
- Production read-only inventory still reports 80 authenticated definers.
  Both anon and authenticated lack public-schema CREATE. Guard string presence
  in the inventory is only metadata, not semantic authorization proof.
- `test-readonly-invoker-compatibility.cjs`: an isolated Preview transaction
  changed only the players projection to security_invoker. Verified reader's
  visible rows fell from 535 to zero. All DDL and fixtures rolled back. Blanket
  invoker conversion is therefore incompatible with the current raw-table RLS.
- Last-login source/timezone tests and event-trigger grant-removal rehearsal
  reran successfully. No persistent DB changes or deployment in this pass.
- Remaining release gates: complete per-function scope review beyond tested
  RPCs, least-privilege projection replacement, authenticated HTTP/browser checks,
  build and Preview deployment. This pass does not clear the 38 view findings
  or claim all 80 functions are fully audited.

## Least-privilege replacement (Preview release candidate)

- Migration `20260918200000_least_privilege_director_projections.sql` preserves
  all 38 public view names, column contracts, filtering and paging. Public views
  are security invoker. Internal barrier views live in director_readonly_private,
  which must never be added to the PostgREST exposed schemas.
- This is NOT just schema relocation: their owner is a dedicated NOLOGIN,
  NOINHERIT, NOBYPASSRLS role with exactly the projected column grants, no source
  ownership, no DML, and no financial/auth-table access. API roles have no role
  membership. SELECT policies require the verified read-only identity; a matching
  restrictive policy prevents permissive PUBLIC policies from bypassing that guard.
  No new SECURITY DEFINER functions or client raw-table grants are introduced.
- Full migration rehearsal passed the existing 857-check suite twice. Additional
  contract checks passed idempotence, all-table column-grant equality, active RLS,
  owner restrictions, private-view revocation and anonymous denial. Two initial
  test-harness assumptions were corrected: direct owner queries can be blocked by
  existing policy helper ACLs; SET ROLE on a postgres session is not evidence of
  an API user's ability to assume a role. Actual API role memberships are checked.
- Three-sample reader query medians (planning + execution, ms): players
  1.146 -> 2.561, group assignments 1.172 -> 1.771, attendance records 1.034 ->
  1.597. These are DB paging probes, not full browser page-load measurements.
  Front Desk baseline comparisons remained within the regression budget.
- All 81 callable Preview definers denied or returned empty/false for a verified
  unassigned identity. This includes 79 production-callable functions plus two
  Preview-only mobile test functions. Production's 80th finding is the event
  trigger helper, absent from Preview and separately rehearsed with a fixture.
  Empty/missing-ID probes do not prove every authorized staff business path.
- Required guarded application/RLS definers retain authenticated EXECUTE. Their
  advisor warnings are NOT removed or declared universally harmless. Existing
  high-risk role/campus tests, full no-role surface tests and view regressions
  provide bounded coverage; retain the inventory for future role-specific audits.
- App policy, proxy, campus, selective-finance and final-parity tests passed.
  TypeScript passed. First local build failed to fetch the existing Google Font;
  network-enabled retry passed compilation, TypeScript and all 76 static pages.
  Hosted checks pending. No production release.
