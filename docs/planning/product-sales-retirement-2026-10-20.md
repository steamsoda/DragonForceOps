# Five-product Caja retirement

## Status

Preview restored. Migration 20261021044249 applied to Preview only.
Product configuration (excluding the intended sales_enabled flag), tournament
rows and affected charge snapshots matched before/after migration.
Production unchanged. Javier authorized Preview then production if gates pass.

## Authorized scope and inspected production identities

Javier's October 20 request was verified directly in Charles's thread.
Hide these products from new Caja sales, preserve existing Inscripciones/history:

- Copa Tigres 2026: 5589752a-2247-44bc-83c9-19cf1c757e91
- Liga Golden Septiembre: c1bb833d-634f-4642-a38e-8f60768f45bf
- Copa LH15 Septiembre: 9bda4dd8-e285-4e17-a5a9-80df2a4f4cd1
- Rosa Power Cup 13 Edicion: 2954cf35-a29f-4b9d-9e1b-1f826400609e
- Superliga Regia 17 Edicion: bb5aabbe-2b8a-4f8d-895e-bc540c0b9e3b

Superliga 18 and McAllen are unrelated and remain enabled. The sole inbound
bundle found was already inactive Combo Torneos Julio 2026,
ebd30377-03e5-4b6d-9af4-c5118e3bd104, granting Rosa 13/Superliga 17.
Keep its historical entitlements unchanged; the DB guard also checks nested bundles.

Copa Tigres tournaments are already inactive. LH15 dates ended October 4 despite
active flags; Rosa 13/Superliga 17 remain active through October 30. Golden has
no linked tournament. Do not reactivate, archive or change any of these statuses.

## Implementation

Migration 20261021044249_product_sales_availability adds products.sales_enabled,
default true, false only for the exact five product names above. is_active is
unchanged because sports-signups filters on it. No history or eligibility edits.

Normal/full-catalog lists and new product actions filter sales_enabled. Copa
options hide retired products unless an existing unpaid obligation exists.
Stale Copa cart without an existing charge is denied; an existing charge remains
payable without creation of another charge. Receipt/refund/credit code unchanged.

A SECURITY INVOKER trigger blocks charges INSERT and changed product_id pointing
to a retired product, including recursive bundle entitlements. Same-product
updates are untouched, so settlement/refund/history remains operational.
Trigger is not an exposed callable RPC and grants no additional data access.

## Local verification

- TypeScript: npx tsc --noEmit PASS.
- scripts/test-product-sales-retirement.cjs: 35 action/source checks PASS.
  Front Desk and Director normal/full catalog, forged ordinary charges,
  Copa stale cart, existing balance settlement and no second sale after paid.
- scripts/test-explicit-cart-server.cjs: 26 checks PASS.
- scripts/test-explicit-checkout.cjs: 60 checks and 500 cent-conservation cases PASS.
- git diff --check PASS (existing CRLF notices only).
- Production-mode build PASS (existing package-version import/Browserslist warnings).
- Preview rollback-only temporary table checks PASS: retired INSERT/product
  reassignment rejected; existing-row updates and McAllen accepted; Front Desk
  and Director authenticated roles tested. Owned test identity removed.
- Supabase connector repeatedly returned invalid_request_state; authenticated
  CLI Management API completed the same tests without weakening TLS or guards.
- Preview has three of five named products; Golden/LH15 require production
  configuration verification. Bundle checks cover existing matching fixtures.

## Release gates still outstanding

1. Commit only scoped files, deploy Preview, test hosted Caja and
   full catalog using temporary identities removed after test.
2. Verify hosted sports listings in both campuses and unaffected McAllen.
3. Under Javier's conditional approval, apply the same migration to production,
   preserve migration version parity, verify snapshots and exact five editions,
   then deploy the tested commit and repeat hosted read-only checks. Do not
   deploy app without its migration or ship any unrelated dirty files.

Preview v1.19.1 d0dd409 built successfully; all CI workflows passed. Front Desk
and Director catalog checks passed both campuses. Hosted sports check found
Preview Superliga 17 ended September 23 (unlike production October 30); v1.19.2
corrects the test to honor existing tournament dates rather than requiring an
expired tournament to appear. No application behavior changed in that follow-up.
The Preview friendly alias initially remained on v1.19.0 and was explicitly
updated to the new Ready deployment before testing. No real financial test writes.
