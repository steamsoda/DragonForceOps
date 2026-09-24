# Fast POS credit-control polish

## Approved Local Scope

- Selected-cart command renamed from Cobrar carrito to Cobrar. Cobrar todo remains unchanged.
- Usar credito moved to its own row directly below the Metodo tender choices, with the available account credit. It is not a tender radio option and does not replace the chosen payment method.
- Unknown, invalid or zero credit disables the control. Initial recovery checks and account refreshes keep it disabled; failed refreshes do not restore stale positive availability. The handler independently rejects unresolved/zero credit.
- Existing authoritative account data is reused. Review/transaction stale-state checks, explicit allocations, mixed payments and credit-only operations remain intact.
- Account refresh responses are guarded against superseded requests/unmounts.

No changes to stripe_360player, historical method labels, payment integration, database schema, financial checkout backend, receipt format or printing exemptions. Charles owns the separate Stripe recording proposal.

## Validation

- TypeScript no-emit check passed after implementation and test additions.
- 27 isolated desktop/mobile control checks passed: unknown, invalid, zero and positive balances; native disabled behavior; refresh invalidation; read-only locks; viewport fit; label and placement integration. Screenshots inspected under `.tmp/credit-payment-choice-ui/`.
- 30 authenticated local-app checks against isolated Preview fixtures passed, including stale-price rejection, ordinary one-click payment, unused credit preservation, concurrent/lost-response recovery, explicit mixed/credit-only payment, zero-credit disabled entry and split tender. Fixture enrollment, payments and Auth identity removed.
- 12 fast-checkout domain checks and 26 checkout adapter checks passed.
- Physical printing was blocked/mocked. No production financial writes or hosted deployment performed.
- Clean optimized v1.18.4 build passed on September 24, including TypeScript and all 78 static pages. The existing package-version import and outdated Browserslist warnings remain unchanged.

## Release State

Preview-only release authorized by Javier and relayed by Charles. Version bumped to 1.18.4 on top of 1ef9820; only the bounded polish, its tests, version files and this report are included. Hosted validation remains a post-deployment gate.

Remote refs rechecked after validation:

- Preview: v1.18.3 / 1ef9820a831e6d56dd8c3e599a8f86f5d3844ff1, original fast POS without this polish.
- Main/production baseline: v1.18.2 / b90129a1fee37b99664022aa8227d04cac7c8ee7.

Next step: scoped Preview deployment and hosted verification of the actual alias-rendered version, payment recovery and role denials. Do not promote to production from this step. Unrelated dirty files are preserved.
