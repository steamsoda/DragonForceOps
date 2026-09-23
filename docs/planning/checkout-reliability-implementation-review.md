# Checkout reliability - 2026-09-23

Approved scope: bounded reliability fixes and isolated diagnostic tracing after
the compact receipt pass. No production deployment, financial repair, query/index
optimization, lock redesign or Grupos y horarios work.

## Implemented

- Authoritative checkout success sets the saved receipt immediately. Acknowledgement
  is independently tracked and can be retried without submitting a payment.
- Acknowledgement checks lookup errors, RPC errors and the persisted completed state.
  The SQL migration verifies actor, current role/campus, confirmed/non-banned user,
  account blocks and a matching committed receipt. Repeated acknowledgement is safe.
- Original local recovery is retained until checked acknowledgement. A late response
  can clear only the matching request, never a newer operation for that account.
- Ten-second acknowledgement delay changes the status to unconfirmed and exposes
  a retry. A late failure cannot overwrite a newer confirmed acknowledgement.
- Printing no longer shares payment saving/busy state. A confirmed payment remains
  closable while printing is pending, failed or unconfirmed.
- A 30-second print deadline means delivery unknown, not definitely failed. The
  original transport stays tracked outside the dialog and blocks another dispatch
  for that printer until it settles. Late replies update only that original attempt.
- No automatic retry. Recovered/previously attempted checkouts do not auto-print.
  Manual reprint of a recovered or previously attempted receipt requires confirmation
  that another copy might be produced. Physical paper delivery remains unobservable.
- Failed QZ script loading removes the failed element and releases its cached
  rejection; concurrent loads and connections share one in-flight operation.
- Bounded stage traces use independent diagnostic IDs and fixed stage labels.
  No names, account IDs, payment IDs, amounts, commands, keys or payloads are logged.
  Instrumented stages cover browser review/save response, saved-render scheduling,
  server authorization/lookup/resolve/ledger/item preparation/staging/checkout,
  acknowledgement/verification, invalidation, account refresh, logo/connect/print,
  and signing authorization/signature generation. Signing has its own correlated
  client/server diagnostic ID; it is not a complete distributed trace of QZ internals.

## Validation

- 133 rollback-only Preview database checks passed, including new snapshot category,
  immutable historical replay, existing finance/recovery invariants and checked
  acknowledgement with revoked/downgraded/wrong-campus/banned actor denial.
- A real temporary Supabase identity was authenticated without sending an email.
  Front Desk role assignment and all financial fixtures/migrations were transactional
  and rolled back. The temporary auth identity was then deleted and absence verified.
- 24 isolated desktop/mobile browser checks passed for delayed/error/lost acknowledgement,
  lost committed response, reload recovery, closability, no automatic recovered print,
  explicit reprint confirmation, late settlement and one financial request.
- 22 reliability unit checks passed: script fail/retry, one connection, stalled signing,
  open socket/no reply, late replies, signing authorization, trace privacy/bounds,
  recovery isolation and printer-attempt behavior.
- 26 server-adapter, 8 local-recovery, 55 compact receipt, 12 receipt access,
  53 explicit-credit and 17 cancellation/refund checks passed.
- TypeScript and full `npm run build` passed. Existing package-version import and
  stale Browserslist-data warnings remain; no unrelated dependency changes made.
- ESLint remains unavailable because this repository has no v9 configuration.
- All printing is mocked/captured; no physical printer or QZ socket was contacted.

## Bounded timing evidence

Preview, synthetic Front Desk, one existing ordinary charge, card, no selected credit.
These include DB network round-trip time from this workstation. SQL calls occur in
savepoint/rollback fixtures, not full hosted Next server actions or real collection.

| Stage | Samples | Observed ms |
| --- | --- | --- |
| Supabase getUser verification | 1 | 151 |
| Authenticated Front Desk scoped charge read | 3 | 49, 49, 49 |
| Stage RPC | 3 | 51, 48, 49 |
| Checkout RPC | 3 | 59, 57, 58 |
| Checked acknowledgement RPC | 3 | 48, 48, 48 |

Synthetic browser fault traces recorded the saved callback 0/1 ms after the mocked
successful checkout response while acknowledgement and printing remained stalled.
That is callback timing, not proof of paint latency or a production speedup.
Browser assertions, not the timing JSON alone, verify closability and no duplication.

Artifacts in this worktree:

- `.tmp/checkout-front-desk-traces.json`
- `.tmp/checkout-reliability-ui/synthetic-traces.json`
- `.tmp/checkout-reliability-ui/unknown-1280.png`
- `.tmp/checkout-reliability-ui/unknown-390.png`

## Remaining release gates

Changes are local/uncommitted; both migrations remain uninstalled outside rollback
rehearsals. No Preview/production deployment was performed. Preserve unrelated dirty
release notes and CLAUDE.md. On approval, install migrations before the application,
then run hosted authenticated role/recovery checks and capture a full action timeline
(existing charge versus new tuition, ledger/preparation, framework response, signing).
No production cause, contention problem or broad optimization is established by n=3.
Office hardware smoke remains separate. A print timeout never authorizes collecting
the same payment again, and it cannot guarantee that paper was not delivered.
