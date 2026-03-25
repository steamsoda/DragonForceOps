# Post-Alpha Roadmap — Dragon Force Ops (INVICTA)

Live testing started 2026-03-19. This document tracks all bugs, QOL improvements,
and new features surfaced during testing. Updated continuously.

Last updated: 2026-03-24 (P1 all done)

---

## P0 — Critical Bugs (fix before next testing session)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | **No receipt on enrollment ledger page** | ✅ Done | `postEnrollmentPaymentAction` now returns receipt data; `PaymentPostForm` is a client component using `useActionState` + `PrintReceiptButton` with `autoPrint` |
| 2 | **No receipt from player profile payment** | ✅ Done | Player profile links to Caja (`/caja?enrollmentId=...`) which already auto-prints — not a separate bug |
| 3 | **Garbled ñ / accents on printed receipts** | ✅ Done | Switched from `format: "plain"` to CP1252 base64 encoding in `printer.ts`; all Spanish chars now print correctly |
| 4 | **Corte Diario UTC offset** | ✅ Done | Date queries now use Monterrey midnight (UTC+6h); display uses `timeZone: "America/Monterrey"` |
| 5 | **Date format MM/DD/YYYY → DD/MM/YYYY** | ✅ Done | Manual `DD/MM/YYYY` formatting (no `new Date()`) applied across all date display sites |

---

## P1 — High Priority (this week)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 6 | **Alphabetical sort in Caja category drill-down** | ✅ Done | `ORDER BY p.last_name, p.first_name` in `list_caja_players_by_campus_year` RPC |
| 7 | **Categoría + Campus on receipt** | ✅ Done | `birthYear` added to `ReceiptData`; `Categ.: {birthYear}` line in `buildReceipt()` |
| 8 | **Sequential receipt folio numbers** | ✅ Done | `campus_folio_counters` table + BEFORE INSERT trigger; format `LV-202603-00042` |
| 9 | **Split payment (multiple methods)** | ✅ Done | Two-pass FIFO allocation; 2 payment rows + split UI toggle in `caja-client.tsx` |
| 10 | **"Nueva Inscripción" button in Caja** | ✅ Done | Link button added to Caja page header alongside "Gestionar sesión" |
| 11 | **Edit guardian/tutor info from player profile** | ✅ Done | `/players/[id]/guardians/[id]/edit` page + `updateGuardianAction` with ownership check |

---

## P2 — Near Term (next 1–2 weeks)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 12 | **Jersey number on player profile** | ✅ Done | Migration + `jersey_number` shown on profile, editable in player edit form |
| 13 | **Coach on player profile** | ✅ Done | Already implemented — `coaches` join in `getPlayerDetail`, displayed in profile info grid |
| 14 | **Past receipt / ticket search** | ✅ Done | `/receipts` page with folio/name search, campus filter, links to enrollment account |
| 15 | **Advance month payment** | ✅ Done | Month picker appears when creating a tuition charge; defaults to next month |
| 16 | **Pendientes — call center mode** | 🔴 Open | "Contactado" checkbox + notes per enrollment row, persisted across sessions |

---

## P3 — Backlog (after P1/P2 stabilizes)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 17 | **Uniformes tab** | 🔴 Open | Weekly uniform sales + delivery marking. `uniform_orders` table exists, needs dedicated page |
| 18 | **Server-side route blocking** | 🔴 Open | Every `(protected)/` route needs explicit role check server-side, not just nav hiding |
| 19 | **Dashboard KPI verification** | 🔴 Open | Saldo Pendiente / Alumnos con Saldo may still show 0 after reseed — verify |
| 20 | **Caja cancel UX** | ✅ Done | Cancel returns to enrollment panel — resolved as part of prior Caja refactor |
| 21 | **Caja pending charge detail** | 🔴 Open | Expandable rows showing period month + charge type before paying |
| 22 | **Folio → payment lookup in Actividad** | 🔴 Open | Surface payment ID in audit log so staff can look up transactions by folio. Needs P1-8 first |

---

## Completed (post-alpha)

| # | Item | Session | Notes |
|---|------|---------|-------|
| — | Printer test button in top bar | 14 | `PrinterTestButton` next to logout, all users |
| — | Preview branch login fix | 14 | x-forwarded-host in callback route + Supabase redirect URL added |
