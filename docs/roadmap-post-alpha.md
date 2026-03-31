# Post-Alpha Roadmap ? Dragon Force Ops (INVICTA)

Live testing started 2026-03-19. Session 2: 2026-03-26.
Updated continuously. Last updated: 2026-03-31.

---

## P0 ? Critical Bugs

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | **No receipt on enrollment ledger page** | âœ… Done | `postEnrollmentPaymentAction` now returns receipt data; `PaymentPostForm` is a client component using `useActionState` + `PrintReceiptButton` with `autoPrint` |
| 2 | **No receipt from player profile payment** | âœ… Done | Player profile links to Caja (`/caja?enrollmentId=...`) which already auto-prints |
| 3 | **Garbled Ã± / accents on printed receipts** | âœ… Done | Switched from `format: "plain"` to CP1252 base64 encoding in `printer.ts` |
| 4 | **Corte Diario UTC offset** | âœ… Done | Date queries now use Monterrey midnight (UTC+6h); display uses `timeZone: "America/Monterrey"` |
| 5 | **Date format MM/DD/YYYY ??? DD/MM/YYYY** | ??? Done | Manual `DD/MM/YYYY` formatting applied across date displays, and both player birth-date and enrollment start-date entry now use guided `DD/MM/YYYY` inputs instead of locale-dependent browser date widgets. |
| 23 | **Charge status stuck on "Pendiente" when fully paid** | âœ… Done | `getEffectiveStatus(status, pendingAmount)` in `charges-ledger-table.tsx` â€” shows "Pagado" when `pendingAmount â‰¤ 0` |
| 24 | **Cash session panel shows $0 MXN after midnight** | âœ… Done | `getSessionForDate()` helper in `cash-sessions.ts`; `sessionOpenedAt` + `sessionClosedAt` passed to `getCorteDiarioData()`, extending query window beyond midnight |
| 41 | **Enrollment payment does not auto-print receipt / wire into receipts correctly** | âœ… Done | Ledger payment flow now shares payment side-effect helpers with Caja: cash payments link into open sessions, `/receipts` is revalidated, and direct `?payment=` lookup works from AuditorÃ­a. |
| 44 | **Freeze historical data + retire post-payment charge mutation** | ? Done | Live payment flows no longer mutate charge amounts after posting. Historical payments, allocations, folios, and receipts remain untouched. |
| 45 | **Canonical financial definitions (`paid_at` vs `period_month`)** | ? Done | Collections remain tied to `payments.paid_at`; tuition-period reporting uses `charges.period_month` where present. |
| 46 | **Monterrey-local finance/reporting time standardization** | ? Done | Shared Monterrey time helpers are now used on key finance/reporting surfaces with `DD/MM/YYYY` display. The regular `/activity` page now also renders/filter bounds in Monterrey time instead of UTC. |
| 47 | **Scalable receipts search / recent receipts default** | ? Done | New SQL `search_receipts(...)` RPC + finance indexes; `/receipts` now defaults to recent posted receipts and paginates/filter in SQL. |
| 48 | **SQL-side aggregation hardening for financial reports** | ?? Open | Receipts search is SQL-backed; remaining report aggregation should keep moving from app memory into DB-side summary functions/views. |
| 53 | **Upcoming tuition pricing/versioning rollout for advance payments** | DONE | Added effective-date pricing-plan versioning for standard tuition, seeded a May 2026 plan version (700/900 active-player tuition, 700/350/next-month carryover for new enrollments), and repriced only pending future tuition charges with `period_month >= 2026-05-01` when they had no payment allocations. Historical posted payments/receipts stay untouched. |
| 49 | **Preview DB schema drift visibility for receipts/RPC features** | ? Done | `/receipts` now shows an explicit operational error when `search_receipts(...)` is missing instead of fake zero results. Preview policy: deploy validation must include confirming preview DB migrations/functions exist. Session 18 found preview DB had stopped at `20260321000000`; missing March 24-26 migrations were applied manually in preview to restore parity. |
| 50 | **Prod post-merge receipts/activity follow-up** | ? Done | Fixed the `Actividad` server-component `onClick` crash and corrected folio-search classification for underscore campus codes in `search_receipts(...)`. |
| 51 | **Receipts partial folio fragment search** | ? Done | `search_receipts(...)` now matches partial folio fragments like `202603` in addition to full folios and player names. |
| 52 | **Unblock prod migration chain blocked by Patch 1** | âœ… Done | Reworked `20260330120000_patch1_data_corrections.sql` into a recovery-safe, idempotent migration and pushed prod successfully. Patch 1 duplicates were removed, bajas and Mitre inserts were applied, and the blocked prod chain now records `20260330120000`, `20260330193000`, and `20260331041000`. |

---

## P1 â€” High Priority (this week)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 6  | **Alphabetical sort in Caja category drill-down** | âœ… Done | `ORDER BY p.last_name, p.first_name` in `list_caja_players_by_campus_year` RPC |
| 7  | **CategorÃ­a + Campus on receipt** | âœ… Done | `birthYear` added to `ReceiptData`; `Categ.: {birthYear}` line in `buildReceipt()` |
| 8  | **Sequential receipt folio numbers** | âœ… Done | `campus_folio_counters` table + BEFORE INSERT trigger; format `LV-202603-00042` |
| 9  | **Split payment (multiple methods)** | âœ… Done | Two-pass FIFO allocation; 2 payment rows + split UI toggle in `caja-client.tsx` |
| 10 | **"Nueva InscripciÃ³n" button in Caja** | âœ… Done | Link button added to Caja page header alongside "Gestionar sesiÃ³n" |
| 11 | **Edit guardian/tutor info from player profile** | âœ… Done | `/players/[id]/guardians/[id]/edit` page + `updateGuardianAction` with ownership check |
| 25 | **Sort all player lists by first name Aâ†’Z** | âœ… Done | Migration fixes ORDER BY in 3 RPCs (caja search, caja drill-down, pending). Pendientes: primary sort by birth year, then first name Aâ†’Z. |
| 26 | **Year of birth visible everywhere** | âœ… Done | Cat. column in Jugadores, Pendientes, Corte Diario. birthYear on all player rows. |
| 27 | **Player level (B1/B2/B3) at a glance** | âœ… Done | Nivel column in Jugadores list. Level sourced from team assignment join. |
| 28 | **Corte Diario quick-access shortcuts** | âœ… Done | "Corte {campus}" buttons in Caja header, directors only, pre-filter campus for today. |
| 29 | **Multiple items in Caja (cart model)** | DONE | Caja now uses a unified POS-style checkout screen after enrollment selection: pending charges can be added to cart inline, fixed-price product tiles stage new items without immediately persisting them, tuition months are staged with version-aware pricing, and one checkout posts the whole cart while preserving the existing allocation/receipt/session flow. `Cobrar todo` still exists as the quick path when the cart is empty. |
| 54 | **Single-page new enrollment intake + streamlined initial charge/payment flow** | OPEN | The pricing engine and first-month tuition automation are now in place, the app already jumps directly to Caja after creating an enrollment, and the enrollment form now has a masked `DD/MM/YYYY` start-date field plus direct campus buttons. The broader one-page intake flow (player + guardian + enrollment + optional initial payment in one compact screen) still needs the UI redesign pass. |

---

## P2 â€” Near Term (next 1â€“2 weeks)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 12 | **Jersey number on player profile** | âœ… Done | Migration + `jersey_number` shown on profile, editable in player edit form |
| 13 | **Coach on player profile** | âœ… Done | `coaches` join in `getPlayerDetail`, displayed in profile info grid |
| 14 | **Past receipt / ticket search** | âœ… Done | `/receipts` page with folio/name search, campus filter, links to enrollment account |
| 15 | **Advance month payment** | âœ… Done | Month picker appears when creating a tuition charge; defaults to next month |
| 16 | **Pendientes â€” call center mode** | ðŸ”´ Open | "Contactado" checkbox + notes per enrollment row, persisted across sessions |
| 30 | **New-enrollment tuition tiers (3 tiers)** | DONE | Enrollment creation no longer trusts free-text tuition amounts. The server now resolves the correct tier by start date and pricing version: days 1-10 = full month, days 11-20 = mid-month tier, days 21+ = next-month-only tuition. This now rolls into the May 2026 price version automatically. |
| 31 | **Re-enrollment "Retorno" pricing plan** | ðŸ”´ Open | Create `retorno` pricing plan in DB alongside standard plan. Staff picks at enrollment. Inscription + tuition amounts **TBD â€” confirm with director before implementing**. Enrollment is tagged with this plan; monthly charges follow retorno rules. Previous enrollment history preserved in DB. |
| 32 | **Absence/injury charge skip** | ðŸ”´ Open | Staff flags an active enrollment to skip its next monthly charge for a specific month. Monthly charge generator respects flag (single-use, auto-clears after month passes). Schema: `enrollment_charge_skips (enrollment_id, period_month, reason, created_by)`. Show skip status on enrollment ledger page. |
| 33 | **Stripe payment recording + reconciliation** | ðŸ”´ Open | Phase A (manual, now): staff enters Stripe payments â€” amount, Stripe reference ID, enrollment. Method = `stripe`. Excluded from Corte Diario cash/card totals; shown in a separate "Pagos Stripe" reconciliation block below the main summary. Phase B (later): Stripe webhook auto-creates payment + matches to enrollment by reference. |
| 34 | **Cross-campus payment flag** | ðŸ”´ Open | Payment goes to the open session's campus Corte Diario (intended behavior). Add "Pago Inter-Campus" flag on payment record + visible label in session view and Corte Diario so staff can spot cross-campus transactions easily. |
| 42 | **Reprint receipt from app** | âœ… Done | `/receipts` now has a `Reimprimir` action per payment row. Rebuilds the receipt from stored payment, folio, allocation, and enrollment context, then prints through QZ Tray. |
| 43 | **Pricing change rollout (non-breaking)** | DONE | Pricing now resolves through effective-date plan versions instead of mutating historical financial rows. Existing enrollments can continue using their original plan link while monthly generation and advance tuition resolve the correct version for the target month. |
| 55 | **Replace free-number financial inputs with guided button choices** | DONE | New enrollment no longer uses free-number tuition inputs, advance tuition in Caja resolves automatically from the selected month/version, the POS cart now stages fixed-price product tiles with locked catalog amounts, and only explicit special/manual charges keep open-amount entry. Date/campus entry for front desk also moved to guided controls (`DD/MM/YYYY` masked inputs, calendar access, direct campus buttons). |

---

## P3 â€” Backlog

| # | Item | Status | Notes |
|---|------|--------|-------|
| 17 | **Uniformes tab** | ðŸ”´ Open | Weekly uniform sales + delivery marking. `uniform_orders` table exists, needs dedicated page |
| 18 | **Server-side route blocking** | ðŸ”´ Open | Every `(protected)/` route needs explicit role check server-side, not just nav hiding |
| 19 | **Dashboard KPI verification** | ðŸ”´ Open | Saldo Pendiente / Alumnos con Saldo may still show 0 â€” verify against live data |
| 21 | **Caja pending charge detail** | ðŸ”´ Open | Expandable rows showing period month + charge type before paying |
| 22 | **Folio â†’ payment lookup in Actividad** | ðŸ”´ Open | Surface payment ID in audit log so staff can look up transactions by folio |
| 35 | **Player profile consolidation** | ðŸ”´ Open | Show full account (enrollment, charges, payments, uniforms, guardians) directly on player profile page. "Cuenta Completa" accessible without navigating away â€” reduce clicks significantly. |
| 36 | **Document uploads per player** | ðŸ”´ Open | Supabase Storage: photo ID, passport, birth certificate, medical forms. `player_documents` table + Storage bucket with RLS (director_admin+ only). |
| 37 | **Player dropout historical record** | ðŸ”´ Open | Improve Bajas view: full enrollment history per player â€” start date, end date, dropout reason, amounts paid, charges outstanding at dropout. Useful for re-enrollment decision-making. |
| 38 | **League/tournament tag + management tab** | ðŸ”´ Open | New player tag: has player paid current season league fee? New Director Deportivo section: tournament/league management â€” team entries, per-player payment status, % paid, amounts collected. Builds on existing `tournaments` table (schema exists, no UI yet). |
| 39 | **Input fields â†’ button toggles (UX pass)** | ðŸ”´ Open | Replace 2-option dropdowns with toggle buttons in Caja and elsewhere: payment method (Efectivo/Tarjeta), campus selector, gender, tuition tier selection. |
| 40 | **Custom receipt tickets** | âš  Needs spec | Some products need a different ticket format. **Spec not provided â€” ask director which products and what the ticket should show before implementing.** |

---

## Later Phases

| Item | Notes |
|------|-------|
| Coach role + coach module | Coach logs in, takes attendance per training session |
| Attendance tracking | Per-session records, attendance-based baja detection (3 consecutive missed months) |
| Director Deportivo role + dashboard | Separate role with sports-ops focus |
| Campus-scoped access (Contry cashier role) | front_desk sees only their campus data |
| Stripe webhook automation | Auto-ingest + match payments to enrollments |
| Uniform stock control | Count-based inventory, dashboard widget |
| Jersey number assignment | Business rules TBD |
| WhatsApp/SMS automated reminders | Phase 3+ |

---

## Completed (post-alpha)

| # | Item | Session | Notes |
|---|------|---------|-------|
| â€” | Printer test button in top bar | 14 | `PrinterTestButton` next to logout, all users |
| â€” | Preview branch login fix | 14 | x-forwarded-host in callback route + Supabase redirect URL added |
| â€” | RBAC overhaul: front_desk expansion + admin_restricted removal | 15 | 13 RLS policies, relaxed app-layer guards (void payment, edit player, open/close session), nav restructure |
| â€” | Contextual undo in AuditorÃ­a | 15 | `reversed_at` / `reversed_by` columns; payment.voided + charge.voided actions from audit log |
| â€” | Nuke player (superadmin) | 15 | Atomic `nuke_player()` DB function, name-confirmation page, audit logged |
| â€” | AuditorÃ­a page (superadmin) | 15 | Full audit log, 500 entries, filters, expandable JSON, contextual action buttons |
| â€” | Early bird redesign | 15 | Direct charge amount update at payment time instead of separate discount charge row |
| â€” | P0 fixes: charge status + Corte Diario midnight | 15â€“16 | v1.0.3: `getEffectiveStatus` for ledger display; `getSessionForDate` + session-anchored query window for Corte Diario |
| â€” | P1 UX pass: sort, birth year, level, Cat. column | 15â€“16 | v1.0.4â€“1.0.5: ORDER BY first_name across all lists; birth year in Jugadores/Pendientes/Corte Diario; Nivel column in Jugadores; migration fixes 3 RPCs |
| â€” | Corte Diario shortcuts in Caja header | 16 | v1.1.0: "Corte Linda Vista" / "Corte Contry" link buttons for directors; pre-filters campus for today |
| â€” | Patch 1 data migration | 16 | v1.1.1: 11 name/birthdate corrections, 3 duplicate deletions, 4 bajas, 2 new players (Mitre brothers), 45 March payment backfills |
| â€” | Receipt reprint + multi-month tuition selection in Caja | 17 | v1.1.3: `/receipts` can reprint historical receipts through QZ Tray; Caja advance tuition no longer forces immediate payment and can be stacked/charged together |
| â€” | Preview demo SQL seed + ledger/Caja payment wiring alignment | 18 | v1.1.4: added manual `docs/preview-demo-seed.sql` for preview-only fake data; ledger payments now share folio/session/audit/cache side effects with Caja and `/receipts?payment=...` lookup works |
| â€” | Preview build hotfix for shared payment helper | 18 | v1.1.5: fixed Next.js server-action build error by making `revalidatePaymentSurfaces()` async inside `"use server"` module and awaiting it from ledger/Caja payment flows |
| â€” | Receipts search regression fix | 18 | v1.1.6: `/receipts` now loads payments first and resolves enrollment/player/campus labels in a second query, avoiding null nested relation rows that hid all receipts |
| â€” | Receipts filtering hotfix | 18 | v1.1.7: removed DB-side prefiltering by enrollment/player for `/receipts`; filtering now happens after loading posted payments and enrollment metadata, which fixes zero-result searches in preview |



