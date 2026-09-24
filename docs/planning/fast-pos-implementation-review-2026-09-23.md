# Fast ordinary-payment POS review

## Scope

Implementation of INV-AUDIT-001-fast-pos-handoff-r1. Version 1.18.3, based on released v1.18.2 / b90129a. Preview promotion is conditionally approved after validation; production promotion is not approved.

- Ordinary Cobrar todo / Cobrar carrito freezes the displayed targets, per-line prices, amounts, methods and request ID, then submits once through the existing atomic checkout service.
- Existing available credit is not spent. Usar credito deliberately opens the allocation review.
- Pago registrado uses the saved receipt, with player/category, concepts, money, methods, folios and independent printing status.
- Regresar al alumno refreshes the account. Siguiente alumno returns to search. Ultimo comprobante retains access to the prior saved receipt without another automatic print.
- Checked acknowledgement, same-request recovery, independent print-attempt tracking and method-specific print exceptions remain in place.
- No migrations, permission changes, automatic credit application, receipt-format changes or production financial repairs.

## Review Findings Addressed

The first authenticated local run found a fixed-amount input could be empty while the cart displayed 700. The noneditable value now derives from the displayed cart total for both rendering and submission. Split amounts remain explicitly editable and validated. A synchronous submission guard prevents repeated clicks before rendering the processing state.

Stale prices are rejected without writing. The client snapshot is not authoritative: the existing server resolver and locked transaction still validate it. Durable recovery retains the fast-flow marker and diagnostic trace, while restoring the original server snapshot and request.

## Evidence

- Local authenticated Front Desk synthetic test: 24 checks passed before the final split extension. Existing-charge fast save, untouched available credit, stale-price rejection, navigation while ack/print are held, concurrent same-request new tuition, lost response, fresh-browser recovery, deliberate reprint, mixed and credit-only flows, and fixture cleanup.
- Local development server with remote Preview DB: ordinary click-to-saved 15,932 ms; explicit mixed and credit-only confirm-to-saved 7,541 and 7,553 ms. These are single development samples, not production performance claims. Fewer required clicks does not mean all server latency is resolved.
- Isolated new-panel browser fault tests: 24 desktop/mobile checks for ack timeout/retry/late failure, print timeout/late resolution, recovery without auto-print, ambiguous outcomes and viewport overflow.
- Domain/adapter/recovery/receipt tests: 12 fast checkout, 60 checkout (including 500 cent-conservation cases), 26 adapter, 8 recovery, 22 reliability, 55 compact receipt, 53 explicit-credit action and 12 receipt-access checks passed.
- TypeScript and clean-cache optimized build passed. Both the old review dialog and new success panel passed 24 isolated browser fault checks each. The optimized-build split test passed: 300 card plus 400 cash created exactly two tender payments and cleanup verified absence of the synthetic enrollment and identity.
- Screenshots inspected: local `.tmp/fast-pos-saved.png` and `.tmp/fast-pos-recovered-mobile.png`.
- Every automated printer connection is blocked; receipt output is captured by a test double. No physical paper output claimed.

## Release Gates

- Optimized build: passed after removing generated .next output; stale build output caused repeated type-check heap exhaustion. Clean build used 8 GB Node heap, with no source-level type-check bypass.
- Final split-tender browser assertion: passed against the optimized local build. The original extended fixture ran out of offered advance-tuition months; it now creates a separate synthetic charge for this case.
- Preview version/commit/alias and hosted role/payment smoke: pending.
- Production: unchanged at v1.18.2 / b90129a; no production promotion authorized for fast POS.

Copa amount restrictions and split conservation are covered by domain/adapter tests. A complete Copa enrollment UI scenario and physical office-printer output are not claimed as tested by this release gate.

Unrelated dirty files, planning-owned handoff, historical release artifacts and Grupos y horarios work are excluded from this change.
