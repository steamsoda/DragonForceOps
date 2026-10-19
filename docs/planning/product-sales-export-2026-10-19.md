# Sized-product sales export

Status: implemented and verified locally; v1.19.0 prepared for owner-approved Preview deployment. Production not authorized.

## Scope

- Owner approved a paid-sales Excel export under Productos / Sudadera.
- Sized products now offer campus and payment-date selectors with Exportar ventas Excel.
- Existing ledger Excel/PNG and Uniformes fulfillment workflows remain unchanged.
- No database migration, financial repair, or production write.

## Workbook and payment semantics

- Detalle: academy ID, name, campus, birth year, current training group, purchased
  size, quantity, payment-completion timestamp in Monterrey time, and charge reference.
- Resumen por talla: quantities by campus/size and overall total.
- Charge size is used, not the player's current default uniform size.
- One sized Caja item is one charge; allocations are funding, not quantities.
  Separate purchases by the same player remain separate. Missing size is Sin talla.
- Current settlement is checked against v_charge_collection_balances. Completion
  time is calculated from surviving posted allocations and explicit credit applications.
  Unused credit never counts. Void charges (including charge cash refunds) are excluded;
  legacy payment refunds remove allocations and therefore no longer fund the charge.
- Dates include the selected start day and exclude midnight after the end day,
  using America/Monterrey. No date filter includes every paid purchase.
- No monetary totals are added to the workbook. Director Read Only preserves
  approved operational access. All privileged reads are restricted to authorized
  campuses and charge IDs obtained from the product ledger.
- Bounded batches and paged allocation/application reads avoid response caps.
  Query errors or missing balances fail the export rather than return a partial file.

## Evidence

- Read-only production API inspection on October 19: Sudadera 2026/2027 has
  72 settled charges: Contry 26, Linda Vista 46. No missing sizes/payment dates.
  No player names or financial records written to evidence files.
- node scripts/test-product-sales-export.cjs passed: partial/void/credit-only/mixed
  funding, multiple purchases, >500 credit applications, campus and role denial,
  missing data, Monterrey boundaries, workbook round-trip, totals, empty result,
  and formula-like names preserved as strings rather than Excel formulas.
- npx tsc --noEmit passed. Local Next webpack production build passed with existing
  package-version import and Browserslist warnings.
- scripts/smoke-product-sales-local.cjs passed against the local built app and
  Preview backend using an owned temporary account. Real Director and Director
  Read Only sessions downloaded XLSX; foreign-campus and invalid-date requests
  were denied. Front Desk and anonymous users did not receive an XLSX.
- Desktop (1280px) and mobile (390px) screenshots inspected; no control overlap.
- Temporary Preview Auth identity and role rows deleted and absence verified.
  No payment, customer, or production records changed; no emails/print jobs sent.

## Release boundary

- Local app: http://127.0.0.1:3112/products (Preview backend).
- Preview deployment and subsequent production promotion still pending.
- Unrelated existing dirty documentation and scripts preserved.
