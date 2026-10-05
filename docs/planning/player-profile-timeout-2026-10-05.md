# Player Detail Timeout Incident - October 5, 2026

## Scope and Checkpoint

Javier prioritized the incident and subsequently authorized necessary tests and production promotion after validation, relayed by Charles. Stripe INV-PLAN-009 remains paused and planning-only: two early/late prices, registration today, tuition-month income attribution, daily corte exclusion with optional footer, preserved 360Player history; duplicate/retry/atomicity/stale-price/credit/reference safeguards remain unresolved. No Stripe implementation is included.

Source and both remote branches were verified at v1.18.4 / d08f92a. Production alias resolved to dpl_2f8bsCcfhexMhUZnfT7mq6jNvKQ6. Work uses the existing .tmp/copa-tigres checkout; unrelated dirty files are preserved.

## Reproduction

Read-only production JWT role simulation independently reproduced the reported multi-enrollment collection-balance timeout at the eight-second limit for Patricia, Lorena and a plain Front Desk account. Patricia equality reads completed in 70/85 ms, Lorena in 72/78 ms; Superadmin combined read took 1502 ms and equality reads 58/57 ms. Measurements are individual observations, not an SLA.

The plain Front Desk role could read only the active enrollment; the other enrollment was correctly hidden by campus RLS. The fix must request only the already visible enrollments and must not replace inaccessible/missing balances with zero. This establishes the query-shape/role interaction, not blame for a specific migration or proof of Patricia's exact browser request.

## Narrow Fix

In getPlayerDetail, replace the combined IN balance query with sequential equality queries against the SAME v_enrollment_collection_balances view and SAME authorized client/facade. Preserve campus filtering and canonical explicit-credit accounting. Reject errors, missing balances or mismatched enrollment IDs. No migration, elevated ordinary-role client, timeout increase, financial mutation, or permission change.

## Validation

- 13 full getPlayerDetail regression checks passed, covering active/historical/single enrollment, explicit-credit balance values, query failure/missing/mismatched rows, finance-disabled mode, campus filtering and read-only facade denial.
- TypeScript no-emit passed; existing read-only permission and campus regressions passed.
- Local authenticated Preview-backend full-page checks passed for Patricia/Lorena role combinations, scoped Front Desk and Superadmin with active+historical and single-enrollment profiles. Balances matched the canonical view.
- Initial cross-campus browser assertion treated a streamed HTTP 200 shell as access; captured Next redirect proves unauthorized denial with no player content. Test now explicitly checks that redirect, not just HTTP status.
- Local read-only feature was initially disabled; aligning the test server configuration with hosted Preview allowed read-only multi/single profile checks to pass. Read-only POST and owned synthetic blocked-account DB/page denial passed. No deployed feature flags changed.
- All temporary identities/roles/block fixtures removed after each run. Existing Preview financial records were read only.
- Clean optimized v1.18.5 build passed, including TypeScript and all 78 static pages. Hosted matrix remains the next release gate.

## Release Gates and Rollback

Hosted Preview must render the exact new version and pass the complete role matrix in a single run. Then promote only that exact commit, using production configuration, followed by non-destructive production whole-page checks on the originally reported player plus single-enrollment/denied-campus/read-only cases. Production real user accounts stay untouched; only owned temporary Auth test identities may be created and removed. No real payment, printing, or financial correction tests.

With no schema change, rollback is restoring the prior production deployment dpl_2f8bsCcfhexMhUZnfT7mq6jNvKQ6 / d08f92a, coordinated with the main ref; this would reintroduce the original timeout. No rollback performed.
