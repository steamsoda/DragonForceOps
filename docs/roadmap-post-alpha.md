# Post-Alpha Roadmap — Dragon Force Ops (INVICTA)

Live testing started 2026-03-19. This document tracks all bugs, QOL improvements,
and new features surfaced during testing. Updated continuously.

Last updated: 2026-03-24

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
| 6 | **Alphabetical sort in Caja category drill-down** | 🔴 Open | Player list within birth-year/campus shows in enrollment order; needs A–Z by first or last name |
| 7 | **Categoría + Campus on receipt** | 🔴 Open | Add birth year and campus name to printed receipt header |
| 8 | **Sequential receipt folio numbers** | 🔴 Open | Replace last-8-of-UUID with `LV-0042` / `CT-0017` format. Counter per campus in DB |
| 9 | **Split payment (multiple methods)** | 🔴 Open | Parents paying half cash, half card. UI: 2 method rows summing to total. Backend: 2 payments + 2 allocation sets |
| 10 | **"Nueva Inscripción" button in Caja** | 🔴 Open | Shortcut to new player flow or quick-search existing player → new enrollment |
| 11 | **Edit guardian/tutor info from player profile** | 🔴 Open | Guardian name + phone not editable from UI. Player edit exists but guardian edit does not |

---

## P2 — Near Term (next 1–2 weeks)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 12 | **Jersey number on player profile** | 🔴 Open | `players.jersey_number` (integer, nullable). Show + edit on profile. Business rules TBD (even/odd by birth year) |
| 13 | **Coach on player profile** | 🔴 Open | Active team shown already. Add coach name. Tournament entries if any |
| 14 | **Past receipt / ticket search** | 🔴 Open | Search by folio or player name. Requires P1-8 (sequential folio) first |
| 15 | **Advance month payment** | 🔴 Open | Collect April tuition before April 1st charge generates. Approach: manual charge creation for next period (no automation change) |
| 16 | **Pendientes — call center mode** | 🔴 Open | "Contactado" checkbox + notes per enrollment row, persisted across sessions |

---

## P3 — Backlog (after P1/P2 stabilizes)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 17 | **Uniformes tab** | 🔴 Open | Weekly uniform sales + delivery marking. `uniform_orders` table exists, needs dedicated page |
| 18 | **Server-side route blocking** | 🔴 Open | Every `(protected)/` route needs explicit role check server-side, not just nav hiding |
| 19 | **Dashboard KPI verification** | 🔴 Open | Saldo Pendiente / Alumnos con Saldo may still show 0 after reseed — verify |
| 20 | **Caja cancel UX** | 🔴 Open | Cancel during payment should return to enrollment panel, not page top |
| 21 | **Caja pending charge detail** | 🔴 Open | Expandable rows showing period month + charge type before paying |
| 22 | **Folio → payment lookup in Actividad** | 🔴 Open | Surface payment ID in audit log so staff can look up transactions by folio. Needs P1-8 first |

---

## Completed (post-alpha)

| # | Item | Session | Notes |
|---|------|---------|-------|
| — | Printer test button in top bar | 14 | `PrinterTestButton` next to logout, all users |
| — | Preview branch login fix | 14 | x-forwarded-host in callback route + Supabase redirect URL added |
