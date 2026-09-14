# Production Database Preflight

## Status

2026-09-14: **887 checks passed; all migration DDL and fixtures rolled back.**
Production installation has NOT been executed. Parent review and an explicit
commit go-ahead are required before invoking the prepared installer.

Target: `hjvytfaalnfcqfgbxsmj`, pinned through both API and database credentials
from `.env.prod.local`. Preview comparison: `eqefgwdsqabnmpnbpqbq`.

Only pending approved versions (199 production history entries, 201 Preview):

| Version | Migration | Exact SHA-256 |
| --- | --- | --- |
| 20260914120000 | porto_manual_role_authorization | `79fc5e2dd8682221792c8b2499f44345bd6f7670b2f33a0654864ee5925b8397` |
| 20260914160000 | director_readonly | `048cbbadbbb9220ff98442234b1c92dbc2da8377470cc953dba914ffb29fd88d` |

No blanket database push is authorized by these scripts. Neither migration grants
an account a role. The rehearsal temporarily applied 120000 before the readonly
baseline so the readonly migration's Porto-body preservation check remains exact.

## Results

- 887 complete readonly checks: 38 explicit projections, 76 raw public tables,
  and 28 callable guarded legacy definer signatures, including receipt search.
- Revoked verified reader and fresh verified no-role account: **117 checks each**.
- 81 unchanged staff/Porto outputs across nine roles: admin_oficina,
  attendance_admin, coach, director_admin, director_deportivo, front_desk,
  nutritionist, porto_viewer, superadmin.
- Production had no assigned Porto viewer. A verified synthetic Porto identity
  was granted only inside the rollback transaction to cover its regression path.
- Workload parity: 513 rows. Frequency parity: 257 rows. Historical coach
  attribution, injected-extra-field sanitization, and original report ACLs passed.
- Median receipt search: 42.263 -> 41.757 ms. Player list: 30.343 -> 30.434 ms.
  Three samples each; both passed the existing regression budget. These are not
  concurrent production load tests or full staff mutation-workflow tests.
- After rollback to the enclosing savepoint, auth.users and user_roles fingerprints
  matched, and catalog/history inventory matched the initial production snapshot.
  The outer transaction then rolled back and the connection closed successfully.
- Production Storage has no buckets, objects, or policies; objects/buckets RLS is
  enabled. No Storage changes were made.
- Zero-row REST profile probe: 406 PGRST106, exposing only public and graphql_public.
  Production has no pg_graphql extension. Exact disabled-engine probes passed;
  enabled-engine authorization is not claimed. Rehearse the staff-valid GraphQL
  branch if the engine is enabled later.

The increased count versus Preview comes from broader staff-role coverage; the
two Preview-only mobile-test RPCs do not exist in production, reducing each
applicable denial sweep. There are no missing production finance RPC checks on
that account.

## Drift Review

The machine-readable metadata inventory is
`docs/support/director-readonly-production-preflight.json`. It contains hashes and
object names, not definitions, credentials, or user rows.

- 44 older matching history versions have different stored statement hashes.
  Do not rewrite or replay those historical migrations to make hashes match.
  Live catalog comparison was used independently.
- After rehearsing the two approved versions, only two common public function
  definitions differ from Preview. All compared policies, relation projections,
  ACLs, and ordinary trigger definitions otherwise match.
- `get_recent_player_attendance(uuid[],integer)`: whitespace-only source
  difference; identical ACL/settings and 15-row limit.
- `assign_payment_folio()`: genuine pre-existing behavior difference. Preview
  returns early when a supplied folio exists; production does not. ACL, owner,
  search path and function attributes match. Neither approved migration replaces
  this trigger function; production behavior is deliberately preserved.
- Production-only `rls_auto_enable()` remains untouched. Preview-only
  `mobile_test_enqueue_notification` and `mobile_test_register_device` are not
  installed in production. The listed `director_readonly_test_mutation()` was a
  deliberate rollback-only fixture and was removed by rollback.
- The auth.users trigger is claim_preauthorized_porto_viewer. Its source did not
  match the external-network-call warning patterns; this heuristic is not a
  general proof about future trigger dependencies.

## Pre-Change Recovery Evidence

Git-ignored local artifact (no table rows; identity/secret-literal screening passed):

`.tmp/director-readonly-production-backup/2026-09-14T08-29-38.151Z/schema.json`

SHA-256: `bfee5e4f8349d1688599a76492c1bcd365ad586f3054829fe88edc3276676553`.

Contains 125 public function definitions including original role helpers and
wrapped candidates; owner/function ACLs; 268 policies; 87 relation metadata
records including RLS/options/ACLs; column ACLs; 19 ordinary triggers; schema and
default ACLs. It is evidence for a reviewed recovery, not an executable undo.
No live definition or credential was printed in the audit output. The artifact
must remain local/ignored and should be preserved through the release window.

Post-commit fallback procedure, requiring separate parent review:

1. Stop the application release/disable the new role surface. Determine whether
   any readonly accounts have since been assigned; do not remove policies while
   live reader credentials can still use them. This release itself grants none.
2. Diagnose the exact failing function or policy and compare its installed hash
   with the reviewed installation and captured pre-change definition. Stop on
   intervening schema drift. Prefer a narrowly scoped forward correction.
3. If restoration is needed, prepare a specific transaction for the identified
   changed objects using the captured definitions, owners, and ACLs. Preserve
   production's original folio trigger and unrelated changes. Any new role/policy/
   view/trigger removal must list exact objects, prove no live dependents, and be
   reviewed; never use a generic schema reset or CASCADE cleanup.
4. Rehearse the proposed restoration with rollback, check affected staff reads and
   writes plus financial boundaries, then request its own execution approval.
   Reconcile migration history only after actual object restoration is verified;
   deleting history rows alone is not rollback.

## Prepared Commands

Rollback-only preflight:

```powershell
node scripts/preflight-director-readonly-production.cjs --production --rehearse
```

Read-only Storage/API catalog audit:

```powershell
node scripts/test-director-readonly-db.cjs --production --audit
```

`scripts/install-director-readonly-production.cjs` is prepared but **not run**.
It requires the exact reviewed baseline digest
`3ac0eda0c639a44de38b8193af4550c12c405e32ac4d4e26f476b23c191c5f38`, both migration
hashes, matching successful preflight evidence, and the intact recovery artifact.
It checks target/history drift, captures a fresh backup, applies only the two
versions transactionally, runs the installed rollback suite, checks unchanged
auth/users and assignments, requires 38 views/28 guarded RPCs/zero reader grants,
and writes exact history entries with checksums before commit. Post-commit history
readback is included. It is syntax-checked, not production-execution-tested.

Schema deployments must be serialized; advisory locks do not constrain unrelated
tools that ignore them. DDL locks can block Preview/production readers during the
installed transaction, so coordinate the execution window with the parent.
Application/auth-provider settings and authenticated browser QA remain the
parent's separate release gate. No production commit go-ahead has been consumed.
