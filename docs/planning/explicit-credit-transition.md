# Explicit Credit Transition

Status: local implementation, integrated Caja review/recovery and retirement migration. Production and hosted Preview
remain v1.17.77 with their existing automatic-credit behavior. Do not release
the transition until the UI, checkout and automatic-path retirement are complete.

## Approved Policy

- Default credit usage is zero. Staff choose target charges and exact amounts,
  review money due and credit remaining, then confirm.
- Reading/searching accounts, creating charges, refunds, concept corrections,
  monthly generation and reingreso must not silently consume credit.
- Legitimate annulment/refund credit creation or reopening remains supported.
- Existing payments, credit applications, cash entries and historical receipts
  are preserved. Questionable legacy credit requires separate review, not erasure.
- Copa Tigres never accepts credit. Ordinary tournament eligibility/funding rules
  must still drive registration after an explicit application.
- Reingreso may explicitly settle historical charges; no automatic cross-account
  transfer, conversion or deletion of remaining credit.

## Audit Map

Read-only production audit confirmed these paths before implementation:

| Path | Current implementation | Required change |
|---|---|---|
| Opening Caja | `getEnrollmentForCajaAction` calls automatic FIFO | Make reads side-effect free |
| New charges/monthly job | `trg_apply_explicit_credit_after_charge_insert` | Retire auto-application, preserve charge generation |
| Annul charge | `void_charge_to_explicit_credit` applies released credit | Preserve creation/reopening; leave balance available |
| Cash refund | `record_charge_cash_refund` applies reopened credit | Preserve refund/cash facts; leave credit available |
| Concept correction | `reassignPaymentAction` invokes FIFO | Keep selected reassignment, stop remainder sweep |
| Caja payment | `postCajaPaymentAction` sweeps old payment remainders | Allocate new money only plus explicit confirmed credit |
| Void payment/audit reversal | `normalizeRemainingPostedCreditAllocations` | Stop redistributing other payments automatically |
| Reingreso | `reconcile_returning_enrollment_credit_fifo` | Replace automatic reconciliation with deliberate choice |
| Mixed Copa checkout | Trigger applies credit to ordinary staged lines | Require explicit credit selection; Copa stays excluded |
| Old manual-credit action | Separate amount-based RPC, no settlement transaction | Replace/retire once all consumers use the new path |

Canonical net balance and charge-level outstanding are different metrics. Audit
Caja search, player profiles, Pendientes, follow-ups, reporting and receipts before
changing display semantics. Show outstanding charges and unused credit separately;
do not globally rewrite the accounting view just to change collection badges.

Normal receipt reconstruction currently reads later charge-credit applications.
Move new operations to immutable transaction snapshots, including credit-only
receipts. Preserve old receipt history and label reconstruction limits honestly.

## Chunk 1: Explicit-Credit Foundation

Implemented locally in `20260922010000_explicit_credit_selection_foundation.sql`:

- Additive RPC `apply_explicit_credit_selection`; actor comes from authenticated
  claims, not input. Verified email, active ban check, role and campus checks run
  on every call, including replay. Reader roles veto access.
- Exact per-charge amount and expected pending, expected total available credit,
  canonical command comparison, private operation receipt, and idempotent retries.
- Reject duplicate/invalid targets, stale balances, Copa, mixed currency and
  voided/refunded/overcommitted credit source payments. No legacy remainder sweep.
- Explicit ledger sources consumed oldest-first only within the chosen charge
  amounts. Unchosen charges and unused funds are untouched.
- Credit applications, receipt/audit, tournament sync and fully funded uniform
  orders commit atomically; no payment or cash-session records created.
- Historical enrollment status is preserved when staff explicitly settle its debt.
- Existing automatic functions and callers intentionally remain unchanged until
  the coordinated switchover. No UI is connected to this new RPC yet.

Validation script: `scripts/test-explicit-credit-selection-db.cjs`. Preview pinned,
DDL/fixtures always rolled back, no emails or production writes. Includes stale
selection, credit-only/partial application, snapshot stability, retries, roles,
campus denial, source integrity and forced late failure rollback. Concurrent
two-session contention and end-to-end browser tests remain release gates.

Latest local rehearsal: 46 foundation checks passed; existing installed Copa
mixed-cart suite passed 33 checks. Both transactions rolled back. Node syntax
and diff whitespace checks passed; no frontend code changed in this chunk.

## Chunk 2: Selector, Server Actions And Printing

- Added `ExplicitCreditPanel`, intentionally not yet mounted in live Caja.
  Nothing selected by default; exact per-charge inputs, separate pending/available
  totals, Copa disabled, historical remainder labeled for review.
- Explicit review and confirmation; no submission on input Enter. Unknown result
  retains the identical request ID/payload and disables edits/dismissal. Known
  stale balances require reload and a fresh review. Duplicate-click guard included.
- `loadExplicitCredit` uses the scoped ledger, not the write-on-read Caja loader.
  Private receipt history is enrollment-scoped and read only after authorization.
  `confirmExplicitCredit` enforces role/debug/input guards and uses authenticated
  RPC claims; no client-supplied actor or service-role impersonation.
- Director Read-Only can explore selection/review but cannot confirm or print.
- Snapshot includes player/campus identity; display and print/reprint use saved
  identity, currency, date and line amounts. Dedicated QZ credit receipt separates
  zero money received from credit used. Print failure never repeats application.
- 34 mocked action/schema/receipt checks and 21 synthetic Playwright checks passed.
  Desktop 1280x900 and mobile 390x844 screenshots inspected; no horizontal overflow.
  These are isolated-fixture tests, not an authenticated end-to-end hosted checkout
  or physical-printer signoff. Updated database rehearsal passed 46 checks and
  rolled back. Full app build remains a separate recorded check in the devlog.
- Harness sources: `scripts/fixtures/explicit-credit-*`; generated bundles and
  screenshots stay under `.tmp/explicit-credit-ui`. Browser test closes its local
  server and browser. No hosted migration/deployment or production changes.

## Chunk 3a: Exact Checkout Funding Contract

- Added `src/lib/finance/explicit-checkout.ts`, an isolated pure calculation and
  validation module. It is not a server action and is not connected to live Caja.
- A server-resolved snapshot identifies each existing/staged line, pending amount,
  amount chosen for collection, currency and credit eligibility. Credit defaults
  to zero; only explicitly selected line amounts are deducted from new money.
- Exact-cent arithmetic; reject under/overpayment rather than normalizing tender.
  Preserve up to two tender amounts/methods, including allocations crossing lines.
  Credit-only review has no payments or payment allocations. Partial ordinary
  collection leaves the unpaid portion outstanding.
- Copa accepts only 600/1250 initially or 650 after reservation, always MXN money,
  never credit even if a caller incorrectly marks the line eligible. Mixed carts
  allocate new money to Copa first, preserving tender order and amounts.
- Canonical reviewed command records expected balances, targets and eligibility;
  reject changed snapshots, duplicate targets (including UUID case aliases),
  unselected credit destinations, invalid methods and sub-cent amounts.
- `scripts/test-explicit-checkout.cjs`: 60 checks passed, including 500 generated
  cent-conservation cases. Existing 34 action/receipt checks and TypeScript passed.
  No database/network access, browser changes, migrations, commits or deployment
  in this subpass. Previous DB/browser results above were not rerun here.

The funding contract is not itself a transaction. The remaining application
adapter must resolve prices/eligibility using existing helpers, preserve stable
staged-item keys (the current form submits payloads without those keys), and repeat
balance/source/role/campus checks inside one locked database transaction. Bind the
saved request to the complete payload, including campus, date, notes and prepared
product/tuition plans; the funding command alone is not the idempotency boundary.
New charge insertion must not trigger automatic credit. Payment/credit writes,
settlement, audit and immutable receipt must commit together. Do not call the
credit-only action and then post money as two independent operations.

## Chunk 3b: Atomic Checkout And Snapshot Printing

- Added `20260922020000_explicit_cart_checkout.sql`, not installed persistently.
  `checkout_explicit_cart` is service-only: verified/nonbanned actor, reader-role
  veto, active enrollment and staff/campus checks also run before receipt replay.
  Prepared product/tuition plans must come from trusted server pricing helpers;
  this RPC must never be exposed as a client-supplied-price endpoint.
- Private RLS receipt table stores the actual complete payload, actor, enrollment
  and receiving campus. Same request returns the same snapshot; changed payload
  conflicts. Application request-key reuse across other credit/Copa operations is
  rejected. Same-enrollment transactions acquire the enrollment lock first.
- Existing/staged charges and safe unallocated tuition repricing are handled in
  one transaction. New product availability is checked under lock. The existing
  automatic-credit filter is transaction-scoped to no targets, then restored;
  migration asserts the required filter exists. Global automatic paths unchanged.
- Locks charges and credit sources, checks exact expected pending/available,
  rejects voided/refunded/overcommitted sources and applies only selected credit.
  No legacy payment remainder sweep. New money is never resized to fit credit.
- Zero to two exact tender records, allocations, cash-session entries/warnings,
  selected credit, tournament settlement, fully funded uniform orders, follow-up
  cleanup, audit and saved receipt succeed together or roll back together.
  Staged tuition requires full coverage of that month and earlier monthly debt.
- Copa supports reservation, remainder and full payment, including new staged
  Copa products, with no credit. Ordinary partial collections retain pending debt;
  partial uniform funding does not create a premature order.
- Saved snapshot separates money/credit per line and overall, both tender folios
  and methods, remaining charge debt, remaining credit and both campus identities.
  `printExplicitCheckoutReceipt` prints/reprints only that snapshot, with Monterrey
  time and separate payment/recorded dates. Credit-only receipts invent no payment
  folio/date. Printer failures do not perform financial writes.
- `scripts/test-explicit-cart-db.cjs`: 71 real-role Preview database checks passed;
  DDL and fixtures always rolled back, with cleanup verified. Covers forged direct
  invocation, roles, campus, bans/unconfirmed users, stale/invalid data, source
  integrity, retries/revocation, forced late failure, staged charges/repricing,
  Copa and settlement. 41 action/receipt tests passed, including print retries;
  60 calculation checks (500 generated cases) and TypeScript passed as well.
- Not wired to an application action or Caja yet; no commit, deployment, persistent
  Preview migration, production changes or physical printing. Concurrent two-session
  races and full authenticated browser workflows remain release gates.

## Caja Integration And Retirement (Local, 2026-09-21)

- Caja now opens a server-priced review dialog with zero credit selected by
  default. Staff select credit per charge and confirm exact tender amounts.
  Copa remains ineligible for credit. A scoped server adapter resolves plans;
  replay reuses the stored payload and rechecks authorization rather than
  rebuilding charges. An uncertain response freezes the current dialog attempt.
- Mounted explicit credit selection in Caja and enrollment charges, including
  historical accounts. Credit-only checkout history is available without a fake
  payment. Payment reprints route through the saved checkout receipt snapshot.
- Removed account-read application and old checkout/application actions, plus
  payment-remainder normalization in the edited billing/admin paths. Retirement
  migration removes the charge-insert trigger, revokes the old credit RPC, and
  makes automatic FIFO and returning-enrollment reconciliation non-spending.
  Existing payment/credit history and credit creation remain intact.
- Validation: TypeScript, 60 calculation checks (including 500 generated cases),
  43 action/receipt checks, 14 server adapter checks, and 75 Preview database
  checks with retirement enabled passed. Database DDL and fixtures were rolled
  back and cleanup verified. Full Next.js webpack build passed with existing
  version-import and Browserslist warnings. Synthetic desktop/mobile browser checks cover
  explicit selection, Copa denial, frozen retry and receipt state; screenshots
  inspected at 1280 and 390 pixels. These are not hosted authenticated UI tests.
- No commit, push, persistent migration or production changes. This supersedes
  the earlier "not wired" status, not the coordinated-release requirements.

## Remaining Release Work

1. Complete the authenticated workflow matrix. Caja now has server-side pending
   intent recovery when the same authorized operator reopens the same enrollment,
   including another browser/device. It does not automatically locate the player.
   Standalone credit-selector recovery now has equivalent fresh-browser coverage;
   saved credit receipts also remain available in its history. A pending operation
     owned by another operator blocks a fresh checkout until that operator recovers
     it or a Director resolves it through the audited workflow below.
2. Finish the automatic-path audit map and review balance display,
   reingreso, refund/annulment copy and existing historical regularization flows.
   Do not disable validation, audit, source-protection or settlement guards.
3. Preview release gate: authenticated browser/role tests, concurrent duplicate
   submissions, source refund/reversal races, mixed/credit-only and failed checkout,
   printing/reprinting, monthly generation, reingreso, ordinary tournaments and
   Copa. No balances should move on account reads, charge creation or cancellation.
4. Owner acceptance and separate production approval. Preserve rollback evidence
   and require fresh account-specific approval for historical repairs.

## Recovery And Workflow Checks (Local, 2026-09-21)

- Pending Caja attempts are stored in sessionStorage before submission, scoped
  by the server-authorized actor and enrollment. Storage failure blocks submission.
  Reopening the account after a reload restores the same reviewed command without
  submitting automatically or resolving new prices. Every save also verifies that
  the signed-in operator matches the reviewed operator; stored data grants no access.
- Saved results clear the pending record. Unknown/conflicting/permission-denied
  outcomes remain locked. Known transactional failures refresh server prices and
  clear the prior selection before another review. Closing the browser tab is a
  remaining recovery limitation, not a claim of durable cross-device recovery.
- Removed unused postCajaPaymentAction and its dead client handler; the rendered
  POS already used the new atomic checkout. This eliminates the obsolete exported
  non-atomic payment route instead of leaving a second submission path.
- Receipt retrieval now also verifies snapshot operation/enrollment identity.
  Ten mocked access tests cover authorization before private reads, wrong-account
  rejection and complete split-tender snapshot recovery.
- Expanded rollback-only Preview rehearsal passed 83 checks: charge annulment
  reopens credit and preserves newly released payment credit without spending it;
  cash refunds return money only and leave reopened credit available; historical
  reconciliation leaves explicit/legacy funds untouched and status unchanged.
  These tests cover the reconciliation RPC, not the full re-enrollment UI workflow.
- Fifteen adapter checks, eight recovery-isolation/corruption checks, 43 existing
  action/receipt checks and 60 funding checks pass. Synthetic 1280/390px browser
  tests include actual page reload followed by an identical retry and cleanup.
  TypeScript and the full Next.js webpack build pass (existing version-import and
  Browserslist warnings). No persistent DB writes, deployment, commit or push.

## Concurrency, Durable Recovery And Collection Status (Local, 2026-09-22)

- Added service-only pending intents before checkout. Store the reviewed command
  and trusted prepared payload, lock one pending attempt per enrollment, and retain
  recovery until the client acknowledges the immutable receipt. A fresh request
  cannot replace an uncertain one; a different actor cannot read its payload.
- Known transaction failures release the intent only after taking the enrollment
  lock and checking that no checkout committed. Existing receipts can be recovered
  after an enrollment ends; new payments still require an active enrollment and
  all retries retain current actor, role and campus authorization checks.
- Collection balances now sum unpaid charge amounts after posted allocations and
  explicit credit applications, rather than subtract unused/legacy credit. Updated
  Caja search, Jugadores, pending lists, tuition-pending and follow-up clearing.
  Ledger/profile cards distinguish charge funding from the unchanged accounting
  balance. Missing financial data fails closed instead of displaying paid/zero.
- Local two-session tests verify duplicate requests serialize and return one receipt,
  competing requests cannot spend the same credit twice, and voiding a source while
  checkout waits prevents spending it. Signed-JWT PostgREST tests cover own/cross-
  campus reads, private-table denial, service-only checkout and immutable retries.
- Thirty-three local concurrency/API/browser checks pass. Authenticated Caja uses
  real local GoTrue/PostgREST and Next.js with synthetic users only. Front Desk sees
  700 pending plus 200 unused credit; loading posts no payment. Explicitly selecting
  200 credit records exactly 500 cash and settles the charge. The test drops the
  committed response, closes the browser context, reopens with the same authorized
  actor and no sessionStorage, then replays the original receipt with no duplicate
  payment and verifies that acknowledgement releases the intent. The clone copies
  schema/role names and Auth migration versions only, never customer rows or hashes.
- Ninety Preview DB checks passed with every migration and fixture rolled back.
  Eighteen adapter, 43 action/receipt, 60 funding (including 500 generated cases),
  five collection arithmetic and prior recovery/browser checks passed.
- Standalone TypeScript and the full Next.js webpack build passed. Full build
  required deleting its generated TypeScript cache and a 10 GB heap after an 8 GB
  memory-limit failure; no type checks were disabled. Existing version-import
  warning remains. Physical receipt printing and hosted Preview are not verified.
- No commit, push, persistent hosted migration or production change. Remaining
  release checks above are deliberate gates, not completed claims. An operator
  who loses access with an unresolved intent currently requires support; do not
  clear such records manually without checking transaction/receipt state first.

## Standalone Credit Recovery (Local, 2026-09-22)

- Sixth coordinated migration adds private standalone-credit intents. The server
  stages the exact reviewed command before spending, and the original authorized
  operator recovers it when reopening Credito de la cuenta in another browser.
  No credit is applied merely by opening/recovering the panel. The server also
  checks the operator against the identity that originally reviewed the command.
- Existing receipt replay remains authoritative; acknowledgement completes recovery.
  Known failure cleanup waits on the enrollment lock and cannot discard a committed
  result. Another operator gets a blocked message, not the private selection.
  Pending Caja and standalone operations mutually block new spending on the account.
  Selection changes and read-only/cross-campus callers are rejected in the database.
- Passed 45 combined local concurrency/API/authenticated-browser checks, including
  losing a committed standalone response and recovering in a fresh browser with
  exactly 200 credit used once, zero new cash payments and acknowledged receipt.
  A follow-up 35-check API/concurrency run includes five additional cross-campus,
  altered-command, role-revocation and malformed-stage checks. These suites overlap;
  do not sum them.
- Ninety existing Preview finance/role checks passed with all six migrations and
  fixtures rolled back. Fifty-three mocked action/receipt checks and 21 synthetic
  desktop/mobile browser checks passed. No persistent hosted writes or deployment.
- Full Next.js webpack build and TypeScript passed with the 10 GB build heap.
  Existing version-import/Browserslist warnings remain; no checks were skipped.
- Next: controlled recovery for an unresolved operation owned by another operator,
  followed by the remaining hosted workflow and physical-printer release checks.

## Director Resolution (Local, 2026-09-22)

- Added Operaciones pendientes inside Credito de la cuenta, shared by Caja and
  enrollment charge pages. Directors inspect original operator/time and whether
  a saved receipt exists, then confirm with an 8-500 character reason. Front Desk
  cannot access this workflow; Director Read Only can inspect but cannot resolve.
- The seventh coordinated migration records an immutable resolution with original
  operator, resolving Director, reason, request identity and outcome. It never
  posts/refunds money, spends credit, rewrites a receipt or impersonates an operator.
- Resolution takes the same enrollment lock as checkout. A committed operation
  returns its exact receipt and completes recovery; an old uncommitted attempt is
  marked failed so a late original submission cannot spend. Fresh unsaved attempts
  require two minutes before closure. Repeating resolution returns the same result.
- The authenticated local browser verifies required confirmation, audited closure
  and unchanged payment counts. A two-session race verifies resolution waits for
  checkout and recovers its committed receipt. The 53-check local API/concurrency
  suite and 76-check combined browser run passed, including responsive/read-only
  UI and Copa Tigres reads. These suites overlap. Twenty-one resolution-action tests, 53 credit-action
  tests, 18 cart-adapter tests and 90 rollback-only Preview DB checks also passed.
- Read-only credit, operation inspection and Copa Tigres use the protected GET
  reader, retaining the global POST denial. Enrollment scope uses the reviewed
  read-only view and campus checks, not direct access to the protected base table.
- Final webpack production build, TypeScript and diff whitespace checks passed.
  Existing version-import and Browserslist warnings remain.
- No commit, push or persistent hosted migration. Remaining work is release-matrix
  verification, coordinated Preview approval/deployment, hosted role checks and
  physical receipt printing. Existing account corrections remain separate approvals.
