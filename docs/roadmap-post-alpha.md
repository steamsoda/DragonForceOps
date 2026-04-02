# Post-Alpha Roadmap 🗺️ Dragon Force Ops (INVICTA)

Live testing started 2026-03-19. Session 2: 2026-03-26.
Updated continuously. Last updated: 2026-04-01.

Current preview release line: `v1.3.6`

---

## Current Operational Tracks

### 1. Finance Ops Stabilization 💳

Next implementation priority. Group these together as one operational wave:

- `#33` lightweight 360Player recording is live in Caja; future automation/webhook work stays open separately
- `#34` cross-campus payment ownership is now in phase-one implementation on preview, especially for Linda Vista covering Contry workflows
- `#48` SQL-side finance/report aggregation hardening
- `#56` refunds workflow
- `#57` Corte Diario + cash session revamp, including printable report output and clearer UI

### 2. Permissions + Campus Operations 🔐

Second priority after finance:

- `#18` route and permission audit, now focused on hardening and extending the new campus-scoped `front_desk` model so staff do not need `director_admin` for normal work
- `#34` cross-campus support remains tied here operationally because it now depends on campus-scoped front-desk access
- `#64` campus workflow polish for Linda Vista acting as the central fallback hub

### 3. Sports Ops / Director Deportivo ⚽

Dedicated non-financial product track:

- `#38` tournament / league / cup management
- `#58` Director Deportivo dashboard, sports-only
- `#59` team-building and readiness workflow
- `#60` pending-by-month player filter, now partially implemented on `Jugadores` as an advanced filter
- `#63` attendance-sheet export, aligned with future attendance/coaching flows

### 4. Player + Admin Utility Wave 🧩

Follow after the operational tracks above:

- `#17` Uniformes tab
- `#35` player profile consolidation
- `#36` player document uploads
- `#37` bajas / dropout revamp
- `#61` specialist appointments products/categories
- `#62` general Excel/list exports, now in a correction/polish pass after the first attendance workbook rollout
- `#39` bounded inputs → button toggles UX pass

---

## P0 🔴 Critical Bugs

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | **No receipt on enrollment ledger page** | ✅ Done | `postEnrollmentPaymentAction` now returns receipt data; `PaymentPostForm` is a client component using `useActionState` + `PrintReceiptButton` with `autoPrint` |
| 2 | **No receipt from player profile payment** | ✅ Done | Player profile links to Caja (`/caja?enrollmentId=...`) which already auto-prints |
| 3 | **Garbled ñ / accents on printed receipts** | ✅ Done | Switched from `format: "plain"` to CP1252 base64 encoding in `printer.ts` |
| 4 | **Corte Diario UTC offset** | ✅ Done | Date queries now use Monterrey midnight (UTC+6h); display uses `timeZone: "America/Monterrey"` |
| 5 | **Date format MM/DD/YYYY → DD/MM/YYYY** | ✅ Done | Manual `DD/MM/YYYY` formatting applied across date displays, and both player birth-date and enrollment start-date entry now use guided `DD/MM/YYYY` inputs instead of locale-dependent browser date widgets. |
| 23 | **Charge status stuck on "Pendiente" when fully paid** | ✅ Done | `getEffectiveStatus(status, pendingAmount)` in `charges-ledger-table.tsx` — shows "Pagado" when `pendingAmount ≤ 0` |
| 24 | **Cash session panel shows $0 MXN after midnight** | ✅ Done | `getSessionForDate()` helper in `cash-sessions.ts`; `sessionOpenedAt` + `sessionClosedAt` passed to `getCorteDiarioData()`, extending query window beyond midnight |
| 41 | **Enrollment payment does not auto-print receipt / wire into receipts correctly** | ✅ Done | Ledger payment flow now shares payment side-effect helpers with Caja: cash payments link into open sessions, `/receipts` is revalidated, and direct `?payment=` lookup works from Auditoría. |
| 44 | **Freeze historical data + retire post-payment charge mutation** | ✅ Done | Live payment flows no longer mutate charge amounts after posting. Historical payments, allocations, folios, and receipts remain untouched. |
| 45 | **Canonical financial definitions (`paid_at` vs `period_month`)** | ✅ Done | Collections remain tied to `payments.paid_at`; tuition-period reporting uses `charges.period_month` where present. |
| 46 | **Monterrey-local finance/reporting time standardization** | ✅ Done | Shared Monterrey time helpers are now used on key finance/reporting surfaces with `DD/MM/YYYY` display. The regular `/activity` page now also renders/filter bounds in Monterrey time instead of UTC. |
| 47 | **Scalable receipts search / recent receipts default** | ✅ Done | New SQL `search_receipts(...)` RPC + finance indexes; `/receipts` now defaults to recent posted receipts and paginates/filter in SQL. |
| 48 | **SQL-side aggregation hardening for financial reports** | 🔴 Open | Receipts search is SQL-backed; remaining report aggregation should keep moving from app memory into DB-side summary functions/views. |
| 53 | **Upcoming tuition pricing/versioning rollout for advance payments** | ✅ Done | Added effective-date pricing-plan versioning for standard tuition, seeded a May 2026 plan version (700/900 active-player tuition, 700/350/next-month carryover for new enrollments), and repriced only pending future tuition charges with `period_month >= 2026-05-01` when they had no payment allocations. Historical posted payments/receipts stay untouched. Session 29 follow-up: patched the April 11 repricing function so it also skips any monthly tuition charge that already has payment allocations, protecting allocated April rows from being rewritten mid-month. |
| 49 | **Preview DB schema drift visibility for receipts/RPC features** | ✅ Done | `/receipts` now shows an explicit operational error when `search_receipts(...)` is missing instead of fake zero results. Preview policy: deploy validation must include confirming preview DB migrations/functions exist. Session 18 found preview DB had stopped at `20260321000000`; missing March 24-26 migrations were applied manually in preview to restore parity. |
| 50 | **Prod post-merge receipts/activity follow-up** | ✅ Done | Fixed the `Actividad` server-component `onClick` crash and corrected folio-search classification for underscore campus codes in `search_receipts(...)`. |
| 51 | **Receipts partial folio fragment search** | ✅ Done | `search_receipts(...)` now matches partial folio fragments like `202603` in addition to full folios and player names. |
| 52 | **Unblock prod migration chain blocked by Patch 1** | ✅ Done | Reworked `20260330120000_patch1_data_corrections.sql` into a recovery-safe, idempotent migration and pushed prod successfully. Patch 1 duplicates were removed, bajas and Mitre inserts were applied, and the blocked prod chain now records `20260330120000`, `20260330193000`, and `20260331041000`. |

---

## P1 🟠 High Priority (this week)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 6  | **Alphabetical sort in Caja category drill-down** | ✅ Done | `ORDER BY p.last_name, p.first_name` in `list_caja_players_by_campus_year` RPC |
| 7  | **Categoría + Campus on receipt** | ✅ Done | `birthYear` added to `ReceiptData`; `Categ.: {birthYear}` line in `buildReceipt()` |
| 8  | **Sequential receipt folio numbers** | ✅ Done | `campus_folio_counters` table + BEFORE INSERT trigger; format `LV-202603-00042` |
| 9  | **Split payment (multiple methods)** | ✅ Done | Two-pass FIFO allocation; 2 payment rows + split UI toggle in `caja-client.tsx` |
| 10 | **"Nueva Inscripción" button in Caja** | ✅ Done | Link button added to Caja page header alongside "Gestionar sesión" |
| 11 | **Edit guardian/tutor info from player profile** | ✅ Done | `/players/[id]/guardians/[id]/edit` page + `updateGuardianAction` with ownership check |
| 25 | **Sort all player lists by first name A→Z** | ✅ Done | Migration fixes ORDER BY in 3 RPCs (caja search, caja drill-down, pending). Pendientes: primary sort by birth year, then first name A→Z. |
| 26 | **Year of birth visible everywhere** | ✅ Done | Cat. column in Jugadores, Pendientes, Corte Diario. birthYear on all player rows. |
| 27 | **Player level (B1/B2/B3) at a glance** | ✅ Done | Nivel column in Jugadores list. Level sourced from team assignment join. |
| 28 | **Corte Diario quick-access shortcuts** | ✅ Done | "Corte {campus}" buttons in Caja header, directors only, pre-filter campus for today. |
| 29 | **Multiple items in Caja (cart model)** | ✅ Done | Caja now uses a unified POS-style checkout screen after enrollment selection: pending charges can be added inline to `Cobro actual`, fixed-price product tiles stage new items without immediately persisting them, advance tuition is back as a dedicated visible card, and one checkout posts the whole current selection while preserving the existing allocation/receipt/session flow. `Cobrar todo` still exists as the quick path when `Cobro actual` is empty. Session 27 hotfix: staged advance tuition checkout no longer depends on an active tuition product row in the catalog, so mixed carts like `mensualidad adelantada + producto` can charge correctly. |
| 54 | **Single-page new enrollment intake + streamlined initial charge/payment flow** | ✅ Done | `/players/new` is now a one-page front-desk intake that captures player data, one primary guardian, enrollment setup, pricing preview, and `Regreso` mode in one submit. It creates guardian + player + enrollment + initial charges atomically, then redirects directly into Caja. The intake also includes a lightweight duplicate/return warning by name + birth year that links to likely existing players without blocking the new record flow. |

---

## P2 🟡 Near Term (next 1–2 weeks)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 12 | **Jersey number on player profile** | ✅ Done | Migration + `jersey_number` shown on profile, editable in player edit form |
| 13 | **Coach on player profile** | ✅ Done | `coaches` join in `getPlayerDetail`, displayed in profile info grid |
| 14 | **Past receipt / ticket search** | ✅ Done | `/receipts` page with folio/name search, campus filter, links to enrollment account |
| 15 | **Advance month payment** | ✅ Done | Month picker appears when creating a tuition charge; defaults to next month |
| 16 | **Pendientes — call center mode** | 🔴 Open | "Contactado" checkbox + notes per enrollment row, persisted across sessions |
| 30 | **New-enrollment tuition tiers (3 tiers)** | ✅ Done | Enrollment creation no longer trusts free-text tuition amounts. The server now resolves the correct tier by start date and pricing version: days 1-10 = full month, days 11-20 = mid-month tier, days 21+ = next-month-only tuition. This now rolls into the May 2026 price version automatically. |
| 31 | **Re-enrollment "Retorno" pricing plan** | 🔴 Open | A practical `Regreso` workflow now exists operationally inside issue #54 without creating a separate plan family: staff can flag the player as returning and choose full / inscription-only / waived inscription while monthly tuition keeps using standard rules. Keep this item open only if future business rules require a truly separate `retorno` pricing-plan family with different recurring tuition behavior. |
| 32 | **Absence/injury charge skip** | 🔴 Open | Staff flags an active enrollment to skip its next monthly charge for a specific month. Monthly charge generator respects flag (single-use, auto-clears after month passes). Schema: `enrollment_charge_skips (enrollment_id, period_month, reason, created_by)`. Show skip status on enrollment ledger page. |
| 33 | **Stripe payment recording + reconciliation** | 🟡 In progress | Lightweight Phase A is now live: Caja can register `360Player` payments as normal posted ledger payments, receipts remain searchable, and Corte Diario shows them in the transaction list while excluding them from corte totals. Future work stays focused on true automation/webhook ingestion once a practical external-matching path exists. |
| 34 | **Cross-campus payment ownership + campus-scoped front desk** | 🟡 In progress | Phase one is now implemented on preview: payments store `operator_campus_id`, Caja and enrollment-ledger posting can record the receiving campus, Corte Diario is operator-campus based with visible cross-campus markers, and `front_desk` access is now campus-scoped across the main operational surfaces. Keep issue `#18` open for broader permission hardening outside the first operational pass. |
| 42 | **Reprint receipt from app** | ✅ Done | `/receipts` now has a `Reimprimir` action per payment row. Rebuilds the receipt from stored payment, folio, allocation, and enrollment context, then prints through QZ Tray. |
| 43 | **Pricing change rollout (non-breaking)** | ✅ Done | Pricing now resolves through effective-date plan versions instead of mutating historical financial rows. Existing enrollments can continue using their original plan link while monthly generation and advance tuition resolve the correct version for the target month. |
| 55 | **Replace free-number financial inputs with guided button choices** | ✅ Done | New enrollment no longer uses free-number tuition inputs, advance tuition in Caja resolves automatically from the selected month/version, the POS checkout stages fixed-price product tiles with locked catalog amounts, uniform items now require `Talla` before they can be added, and only explicit special/manual charges keep open-amount entry. Date/campus entry for front desk also moved to guided controls (`DD/MM/YYYY` masked inputs, calendar access, direct campus buttons). |
| 56 | **Refund workflow** | 🔴 Open | New finance-op item. Track refund reason, original payment linkage, who authorized it, and how it affects receipts, audit logs, and reporting totals. Must not silently mutate historical posted payment records without traceability. |
| 57 | **Corte Diario + cash session revamp** | ✅ Done | Front desk now works against automatic campus corte checkpoints instead of manually opening/closing sessions. Corte Diario is campus-first, based on payments since the last printed corte for that campus, printing closes and rolls the next checkpoint automatically, `360Player` remains visible-but-excluded, and `paid_at` can now be backdated from Caja and the enrollment ledger when staff recovers a missed payment. Follow-up polish now adds row-level `Conceptos pagados` in the ledger plus a separate detailed browser-print report without changing the thermal corte flow. |

---

## P3 ⚪ Backlog

| # | Item | Status | Notes |
|---|------|--------|-------|
| 17 | **Uniformes tab** | 🔴 Open | Weekly uniform sales + delivery marking. `uniform_orders` table exists, needs dedicated page. Fold in small front-desk asks like repeated uniform quantity and clear sold / ordered / delivered / pending states. |
| 18 | **Server-side route blocking** | ✅ Done | Added shared app-layer permission helpers, hardened direct-URL route gates for director-only pages, expanded front-desk record-level campus checks, and replaced broad front-desk RLS policies on core operational tables with campus-aware predicates driven by `current_user_allowed_campuses()`. |
| 19 | **Dashboard KPI verification** | 🔴 Open | Saldo Pendiente / Alumnos con Saldo may still show 0 — verify against live data |
| 21 | **Caja pending charge detail** | 🔴 Open | Expandable rows showing period month + charge type before paying |
| 22 | **Folio → payment lookup in Actividad** | 🔴 Open | Surface payment ID in audit log so staff can look up transactions by folio |
| 35 | **Player profile consolidation** | 🔴 Open | Show full account (enrollment, charges, payments, uniforms, guardians) directly on player profile page. "Cuenta Completa" accessible without navigating away — reduce clicks significantly. |
| 36 | **Document uploads per player** | 🔴 Open | Supabase Storage: photo ID, passport, birth certificate, medical forms. `player_documents` table + Storage bucket with RLS (director_admin+ only). |
| 37 | **Player dropout historical record / bajas revamp** | 🔴 Open | Current bajas flow needs a fuller operational picture. Improve the Bajas view with enrollment history, reasons, balances, and decision support for future re-enrollment handling. |
| 38 | **League/tournament tag + management tab** | 🔴 Open | Sports-ops priority. Use the existing `tournaments` schema as the base for tournament/league/cup management, team entries, and player-level readiness. Keep Director Deportivo views focused on payment status, not money totals. |
| 39 | **Input fields → button toggles (UX pass)** | 🔴 Open | Replace 2-option dropdowns with toggle buttons in Caja and elsewhere: payment method (Efectivo/Tarjeta), campus selector, gender, tuition tier selection. |
| 40 | **Custom receipt tickets** | ⚠️ Needs spec | Some products need a different ticket format. **Spec not provided — ask director which products and what the ticket should show before implementing.** |
| 58 | **Director Deportivo dashboard** | 🔴 Open | New sports-only dashboard. Show roster readiness, team-building signals, tournament participation status, and operational sports views without exposing finance totals, cash sessions, or report balances. |
| 59 | **Team-building / assign available players workflow** | 🔴 Open | Director Deportivo needs a way to build teams from available players, see readiness/payment-status indicators, and assign players without exposing money amounts. This must connect sports ops and finance status cleanly. |
| 60 | **Filter players pending a specific tuition month** | 🟡 In progress | First pass now lives on `/players` as an advanced filter by tuition month, driven by real pending `monthly_tuition` charges rather than aggregate balance only. Keep open for any dedicated sports-ops or call-center views beyond the current Jugadores implementation. |
| 61 | **Specialist appointments products/categories** | 🔴 Open | Add new catalog products/categories for Nutritionist, Physio, and Psychologist appointments. Keep this as a straightforward product-catalog/admin pass, not a new architecture track. |
| 62 | **Excel/list export tools** | 🟡 In progress | First Excel export is live on `/players` and now includes the first correctness pass: dynamic level sections so non-hardcoded levels like `B3` are not dropped, plus visible warning counts for active players excluded because they are missing gender. Keep this item open for broader list/export tooling beyond attendance rosters. |
| 63 | **Attendance-sheet export** | ✅ Done | `/players` exports a formatted `.xlsx` workbook for manual attendance use, with one sheet per campus + category + gender, level sections inside each sheet, alphabetical player rows, tutor phone, and 20 blank attendance columns. Missing-gender players are now intentionally excluded instead of generating fallback `Sin genero` sheets. |
| 64 | **Campus workflow polish (Linda Vista as hub)** | 🔴 Open | Make Linda Vista covering Contry workflows feel intentional instead of like a permissions workaround. Tied to cross-campus payment handling and the broader front-desk permissions audit. |

---

## Later Phases

| Item | Notes |
|------|-------|
| Coach role + coach module | Coach logs in, takes attendance per training session |
| Attendance tracking | Per-session records, attendance-based baja detection (3 consecutive missed months) |
| Director Deportivo role + dashboard | Moved up into active backlog as #58, sports-ops focus only |
| Campus-scoped access (Contry cashier role) | `front_desk` sees only their campus data |
| Stripe webhook automation | Auto-ingest + match payments to enrollments |
| Uniform stock control | Count-based inventory, dashboard widget |
| Jersey number assignment | Business rules TBD |
| WhatsApp/SMS automated reminders | Phase 3+ |

---

## Completed (post-alpha)

| # | Item | Session | Notes |
|---|------|---------|-------|
| ✅ | Printer test button in top bar | 14 | `PrinterTestButton` next to logout, all users |
| ✅ | Preview branch login fix | 14 | x-forwarded-host in callback route + Supabase redirect URL added |
| ✅ | RBAC overhaul: front_desk expansion + admin_restricted removal | 15 | 13 RLS policies, relaxed app-layer guards (void payment, edit player, open/close session), nav restructure |
| ✅ | Contextual undo in Auditoría | 15 | `reversed_at` / `reversed_by` columns; payment.voided + charge.voided actions from audit log |
| ✅ | Nuke player (superadmin) | 15 | Atomic `nuke_player()` DB function, name-confirmation page, audit logged |
| ✅ | Auditoría page (superadmin) | 15 | Full audit log, 500 entries, filters, expandable JSON, contextual action buttons |
| ✅ | Early bird redesign | 15 | Direct charge amount update at payment time instead of separate discount charge row |
| ✅ | P0 fixes: charge status + Corte Diario midnight | 15–16 | v1.0.3: `getEffectiveStatus` for ledger display; `getSessionForDate` + session-anchored query window for Corte Diario |
| ✅ | P1 UX pass: sort, birth year, level, Cat. column | 15–16 | v1.0.4–1.0.5: ORDER BY first_name across all lists; birth year in Jugadores/Pendientes/Corte Diario; Nivel column in Jugadores; migration fixes 3 RPCs |
| ✅ | Corte Diario shortcuts in Caja header | 16 | v1.1.0: "Corte Linda Vista" / "Corte Contry" link buttons for directors; pre-filters campus for today |
| ✅ | Patch 1 data migration | 16 | v1.1.1: 11 name/birthdate corrections, 3 duplicate deletions, 4 bajas, 2 new players (Mitre brothers), 45 March payment backfills |
| ✅ | Receipt reprint + multi-month tuition selection in Caja | 17 | v1.1.3: `/receipts` can reprint historical receipts through QZ Tray; Caja advance tuition no longer forces immediate payment and can be stacked/charged together |
| ✅ | Preview demo SQL seed + ledger/Caja payment wiring alignment | 18 | v1.1.4: added manual `docs/preview-demo-seed.sql` for preview-only fake data; ledger payments now share folio/session/audit/cache side effects with Caja and `/receipts?payment=...` lookup works |
| ✅ | Preview build hotfix for shared payment helper | 18 | v1.1.5: fixed Next.js server-action build error by making `revalidatePaymentSurfaces()` async inside `"use server"` module and awaiting it from ledger/Caja payment flows |
| ✅ | Receipts search regression fix | 18 | v1.1.6: `/receipts` now loads payments first and resolves enrollment/player/campus labels in a second query, avoiding null nested relation rows that hid all receipts |
| ✅ | Receipts filtering hotfix | 18 | v1.1.7: removed DB-side prefiltering by enrollment/player for `/receipts`; filtering now happens after loading posted payments and enrollment metadata, which fixes zero-result searches in preview |
