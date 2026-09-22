# Explicit Credit Release Review

Date: 2026-09-22
Scope: local explicit-credit transition; no deployment or persistent hosted changes.

## Review Disposition

The reviewed source has no newly identified blocking defect for a controlled
Preview release. This is not production acceptance. Hosted workflow checks remain
necessary, and the owner has deferred physical receipt printing until back at the office.

## Policy And Security Checks

- Credit defaults to zero and requires a reviewed charge/amount selection.
- Source scan found no application callers of automatic FIFO application or
  allocation normalization. Re-enrollment retains its compatibility RPC, now
  reporting available balances without spending or transferring them.
- Automatic charge-insert application is removed. Annulment/refund credit creation
  and reopening remain intact; historical payment facts are not rewritten.
- Posted cash/card money and selected credit are separately allocated and printed.
  Copa Tigres cannot receive credit. Tournament sync remains transactional.
- Checkout uses authenticated server authorization, campus/role rechecks in SQL,
  enrollment/source locks, private intent/receipt tables and exact-request replay.
- Front Desk cannot resolve another operator's pending operation. Director
  resolution requires confirmation/reason, records both actors and moves no money.
- Read-only inspection uses protected GET routes and reviewed enrollment scope;
  POST denial and database mutation guards remain in force.
- Collection badges use outstanding charge funding, not unused credit. The
  canonical accounting balance is not globally rewritten.
- New receipt reprints use the immutable original checkout snapshot, including
  split tenders. Physical printer output has not been signed off.

## Evidence

Fresh final-review runs:

- 60 checkout arithmetic/validation checks, including 500 cent-conservation cases.
- 5 collection-status, 8 recovery, 18 checkout-adapter, 53 credit-action,
  10 receipt-access and 21 resolution-action checks passed.
- 90 Preview database checks passed with all seven migrations and test fixtures
  rolled back. Cleanup assertions verified removal of the temporary table/user.
- 76 authenticated local browser/concurrency/signed-JWT checks passed, covering
  no-spend reads, mixed checkout, fresh-browser recovery, Director resolution,
  read-only inspection and mobile layout. Disposable containers were removed.

Prior unchanged-source evidence: production webpack build and TypeScript passed
at the end of the implementation pass. Existing version-import and Browserslist
warnings are nonblocking. No type checks were disabled.

## Preview Release Sequence

1. Confirm the target is Preview, inventory its installed migrations, and preserve
   the current deployment identity/schema recovery evidence. Exclude unrelated
   CLAUDE.md edits and generated files from the release commit.
2. Pause Preview financial testing during the coordinated change. Apply migrations
   20260922010000 through 20260922070000 in order and release the matching app.
   Do not expose a partially upgraded app/database pair to Front Desk.
3. Verify the stable Preview alias points to the intended deployment. Recheck
   authenticated Director, Front Desk and Director Read Only access, denied writes,
   account reads, mixed/credit-only checkout, retry/recovery and immutable reprints.
4. Finish hosted monthly-generation, full re-enrollment, historical regularization,
   concept correction, refund/annulment, ordinary tournament and Copa workflows.
   Reconciliation-RPC tests are not a substitute for the full re-enrollment UI.
5. Keep physical printing explicitly pending. Production requires separate owner
   approval and either printer signoff or an explicit decision to defer that gate.

## Browser Printer Isolation

The authenticated browser harness previously reached the real QZ auto-print path,
causing local trust prompts. It now installs a test-only in-memory QZ stub before
any page opens in every browser context, including fresh-session recovery. A
separate context-level WebSocket guard blocks all sockets except the local app's
HMR endpoint; service workers and the real QZ script are blocked. The isolation
test verifies socket denial, print capture, reload and fresh-context behavior.
This is not a physical printing test and makes no change to production printing.
The isolated authenticated regression passed 77 checks, including capture and
decoding of the auto-printed receipt. The independent isolation test also passed.

## Recovery Restrictions

If release verification fails, stop financial testing and retain evidence. Do not
blindly roll back just the app, re-enable automatic credit, drop receipt/intent
tables, or reverse valid payments. Once new operations exist, prefer a reviewed
forward fix; any coordinated rollback needs schema/data compatibility review.
Existing customer-account corrections remain separately approved work.
