# Tournament credit-funded registration visibility

## Scope and audit

Production read-only audit on 2026-10-28 found 32 fully covered charges on active
enrollments for tournament products whose direct payment allocations alone did
not cover the charge: Superliga 18 (9), CECAFF Septiembre (19), Superliga 17 (3),
J5 Agosto (1). This is a charge count, not a global unique-player count.

Superliga 18: DF-0919, DF-0459, DF-0578, DF-0497, DF-0815, DF-0330, DF-0603,
DF-0775, DF-0833. All nine have confirmed entries, ready squad memberships,
matching squad/training programs, no exclusions, and zero tournament balance.
Do not reapply credit, invent payments, or move their existing squads.

Eight registrations are absent, not cancelled: CECAFF DF-0782, DF-0068, DF-0143,
DF-0387, DF-0794, DF-0664; Superliga 17 DF-0323, DF-0446.

## Implementation

- The shared sports-signup allocation reader now sums payment allocations plus
  enrollment_credit_applications. Credit settlement dates use applied_at, not
  the date the credit was created. Unused credit is never included.
- Existing consumers cover dashboard categories/groups, details, exports, and
  paid callup candidates. Existing void-charge and reservation filters remain.
- Copa Tigres retains the 600 reservation threshold and its database credit ban.
- Migration 20261029034752 inserts only absent fully credit/mixed-funded entries
  for active, not-ended tournaments and active enrollments. It handles bundle
  entitlements, preserves any existing entry, audits repairs under the verified
  approving superadmin email, and invokes existing roster reconciliation.
- Normal explicit credit and checkout transactions already invoke the
  credit-aware registration sync; no automatic credit application is restored.

## Verification and release status

- TypeScript check passed.
- assert-tournament-credit-funding.mjs passed: credit-only, mixed, direct payment,
  dates, partial/unpaid, removed applications, pagination, batching, errors,
  installment thresholds, and sync wiring.
- assert-competition-roster-live-workflow.mjs passed.
- Preview repair transaction passed with a temporary credit-funded fixture:
  confirmed entry, audit, idempotency, unchanged funding, roster reconciliation.
  Everything was rolled back. No persistent Preview or Production data changes.
- Legacy assert-credit-funded-checkout.mjs fails on getReusablePaymentRemainder,
  a reference to the old checkout implementation in unchanged Caja code.
- The reported Teams-screen disappearance is not yet reproduced in hosted UI.
  Database memberships exist; do not claim the display was verified from SQL.
- Not committed, pushed, or deployed. Next: hosted Preview validation across
  tabs/exports and roles, then approved Production release with the migration.
