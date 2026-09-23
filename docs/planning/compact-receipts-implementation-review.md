# Compact checkout receipts - 2026-09-23

Scope: approved compact receipt pass only. No deployment, financial repair,
checkout acknowledgement change, print transport change, or slowdown fix.
Charles owns the separate slowdown investigation. Grupos y horarios is deferred.

This records the receipt-only pass. The separately approved follow-on changes and
updated validation are in `checkout-reliability-implementation-review.md`.

## Changes

- Both CLIENTE and ACADEMIA use the same compact transaction formatter.
- New checkout snapshots capture birthYear from players.birth_date in SQL.
- Historical snapshots are not rewritten. Missing birthYear prints
  `Categoria: no registrada`; reprints never substitute today's profile value.
- Concepts show the amount covered in this transaction, not original charge value.
- Positive credit applied, available credit and remaining debt remain visible.
  Outstanding charges are never reduced by unapplied available credit.
- Credit-only checkout explicitly shows zero money received.
- Each split tender retains its method, amount and folio.
- Payment time uses America/Monterrey. Registration time remains visible when
  distinct at printed minute precision; cross-campus receipts retain student campus.
- Operation UUID is omitted from ordinary printed copies only. Saved snapshot and
  audit identity remain unchanged. Long names, concepts and folios wrap at 42
  columns instead of truncating; printer-control characters in body text are removed.
- QZ connection, signing, encoding, logo, cuts and copy labels are unchanged.
- Standalone credit and cancellation/refund receipts retain their distinct formats.

## Verification

- TypeScript: `npx tsc --noEmit --incremental false --pretty false` passed.
- 55 compact formatter/captured-printer-payload checks passed. Includes both copies,
  legacy category, mixed credit, credit-only, split tenders, installments, backdating,
  long text, snapshot immutability and identical bytes through reprint dispatch.
- 12 explicit receipt authorization/reprint checks passed.
- 53 explicit-credit action/validation/receipt checks passed, including printer
  failure/retry without repeating financial actions.
- 18 checkout adapter checks and 17 cancellation/refund receipt checks passed.
- All print tests use mocked QZ. No physical printing or printer network traffic.
- ESLint could not run: repository has no ESLint configuration for installed v9.
  No unrelated lint setup changes were made.
- Preview rollback-only migration/database regression: 120 checks passed against
  eqefgwdsqabnmpnbpqbq. Verified exact function-body delta, unchanged grants and
  historical snapshots, legacy replay after migration, authoritative new category
  under Front Desk, new receipt replay, and unchanged accounting/denial regressions.
  All DDL and fixtures were rolled back; original function and absence of temporary
  test user verified afterward. No production writes or emails.
- Full production build and hosted deployment smoke are deferred to the release gate.

## Ordinary receipt sample

Synthetic transaction, before existing logo/header and copy cut handling:

```text
Alumno: Jugador de ejemplo
Categoria: 2015
Fecha de pago: 22/09/2026, 17:00
------------------------------------------
Mensualidad septiembre             $700.00
------------------------------------------
Tarjeta                            $700.00
Folio: EJEMPLO-001
DINERO RECIBIDO                    $700.00
```

Run `node scripts/test-compact-checkout-receipt.cjs --samples` for all eight
synthetic examples. These are text/payload checks, not physical paper proof.

## Release boundary

Changes remain local and uncommitted. The migration is prepared, not installed.
Before an authorized release, apply the guarded migration in the target environment
before the app, perform hosted verification and a physical printer smoke test.
No assertion is made that this formatting change resolves reported payment delays.
