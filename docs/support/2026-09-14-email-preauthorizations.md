# Email Preauthorizations: Pass 1

Implemented locally; not deployed or installed in either database. Preview
installation approval requested separately. Production 1.17.69 is unchanged.

- Reuses `porto_viewer_authorizations` and its existing auth.users trigger.
  Migration adds role, campus, revision and issue fields without changing old
  approvals. Existing manual-only emails stay manual-only unless explicitly saved.
- Superadmin-only authenticated RPCs list, save and revoke pending approvals.
  Table remains private. Server actions enforce Superadmin and debug write guards.
- Verified authentication claims the exact normalized email once. Existing roles
  are never overwritten or combined; conflicting approvals are disabled and audited.
  Claimed rows stay consumed even when the granted role is later removed.
- New staff approvals require `dragonforcemty.com` or `fcportodragonforcemty.com`.
  External domains are accepted only for `porto_viewer` and `director_readonly`.
  These are explicit checks on this new workflow, not a claim that all older
  manual-role paths already enforce a domain restriction. Coach access still
  requires the existing coach-account linking workflow.
- Required active campus scope is checked at save and claim. Revoked/banned
  approvers and banned/unverified recipients cannot activate access. Approval
  changes and claims use row locking; stale edits fail with a revision conflict.
- No invitation email, auth account provisioning or real-user role grant occurs
  when saving an approval. Audit records are transactional with each operation.
- UI has Usuarios / Preautorizaciones tabs, email search and 50-row pagination,
  a compact approval table, role/campus dialog and revocation confirmation.
  Existing account/coach controls remain unchanged; compacting those is pass 2.

## Verification

- `node scripts/test-email-preauthorizations.cjs`: 22 checks passed; Preview
  migration, accounts, grants and audit fixtures all rolled back.
- `node scripts/test-preauthorization-ui.cjs`: action guards, normalization,
  read-only feature gate, claimed/pending controls and unavailable state passed.
- TypeScript and full Next build passed.
- Browser QA used a temporary development-only route with synthetic rows;
  table/dialog, staff campus selection and Escape dismissal passed. At 375px,
  document scroll width was 375px and dialog bounds were x=16 to x=359.
  Test route removed. No form was submitted through the synthetic UI.
- Actual hosted signup/confirmation-to-role end-to-end still needs Preview
  installation and a disposable test account. No production changes authorized
  or performed in this pass.

Migration: `20260914180000_manage_email_preauthorizations.sql`.
Local server: http://localhost:3107/admin/users?tab=preauthorizations.
