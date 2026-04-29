# Product Roadmap (Execution)

This complements `docs/legacy/phase-1-sdd.md` with a practical delivery plan.

## Active Task List
See **`docs/roadmap-post-alpha.md`** for the current prioritized bug + feature list (updated after alpha testing started 2026-03-19).

---

## Current State (as of 2026-03-24, session 13–14)
- App version: v0.9. Live testing day 1. Production hardened and stable.
- Core billing loop: enrollment → charges → payments → ledger → pending list → reports. All wired.
- Real data (reseeded 2026-03-24): 687 players, 811 guardians, 687 enrollments (10 beca), 2,958 charges, 1,585 payments. Full data wipe + clean reseed from corrected Excel (Mes P misclassification fixed).
- Caja POS: player search + category drill-down (campus → birth year → player), pending charges, payment posting, thermal receipt.
- Cash session management: open/close per campus, linked cash payments, variance notes, Corte Diario integration.
- Dashboard: 8 KPIs, MoM trends, payment/charge charts. Campus + month filters. Real data end-to-end.
- Reports live: Corte Diario, Corte Semanal, Resumen Mensual, Porto Mensual (all sections wired).
- Activity log: human-readable audit feed, date range + actor + action type filters.
- Products catalog: categories + sizes + charge type linking, POS grid in Caja.
- Role system: `superadmin`, `director_admin`, `front_desk`. RLS enforced. Role-aware nav.
- **User admin panel**: `/admin/users` — superadmin sees pending + active users, grants/revokes roles.
- **Login fixed**: OAuth callback now writes session cookies directly onto redirect response — single-click login, no redirect loop.
- **Unified login page**: `/` merges landing + login — server-side auth check, branded UI.
- Void charges: director-only, any pending charge, with required reason. Audit logged.
- Batch baja write-off: `/pending/bajas` — bulk void for ended/cancelled enrollments.
- Player tags: configurable badges (Al corriente/Pendiente, Selectivo/Clases, Portero, Uniforme) toggled from `/admin/configuracion`.
- Goalkeeper flag: `players.is_goalkeeper`, editable, shown as badge on player detail.
- Uniform orders: `ordered → delivered` lifecycle per player, UI on player detail page.
- **Teams system**: full team CRUD + roster management — list, create, edit, transfer, refuerzo pattern, new-arrival flag. Auto-assign B2 on enrollment. Team shown on player detail.
- **Thermal printer**: QZ Tray ESC/POS integration. Silent two-copy receipt. Auto-print on payment. Corte Diario via QZ Tray. Ethernet setup guide written. Physical setup pending static IP assignment.
- **Player edit**: full edit form (name, birth date, gender, goalkeeper, uniform size, medical notes). Director-only.
- **Player merge**: `/admin/merge-players` — atomic DB function merges duplicate players, re-points all FK references, audit logged. Director-only.
- **Performance**: covering indexes on charges/payments for index-only balance scans. Pending RPC rewritten to single GROUP BY CTE. Loading skeleton screens on all major pages.

## Delivery Principles
- Build and validate in `preview` first.
- Every DB change must be a migration in `supabase/migrations`.
- Merge to `main` only after preview smoke tests pass.
- Keep production maintenance mode enabled only during controlled release windows.

## Phase 1A: Stabilization ✅ COMPLETE
Goal: make current features reliable for daily internal usage.

1. ✅ Auth + Access Hardening — roles seeded, RLS enforced, bootstrap env removed.
2. ✅ Data Integrity Pass — allocation edge cases handled, server-side validation in place.
3. ✅ Report Reliability — corte diario and resumen mensual verified against real data.

## Milestone Snapshot (completed)
- Preview deployment/auth baseline stabilized.
- Dashboard v2 live with campus/month filters and MoM trends.
- Enrollment ledger operational with charge/payment detail.
- Charge creation and payment posting operational.
- Pending collections view operational with filters and call shortcuts.
- Security/performance baseline documented and adopted.

## Phase 1B: Operational MVP Completion ✅ LARGELY COMPLETE
Goal: complete the minimum operational feature set for steady daily use.

1. ✅ **Caja — POS Panel** — player search, pending charges, payment posting, receipt, session guardrail.
2. ✅ **Role System** — `front_desk`, `director_admin`, `superadmin`. RLS enforced. Role-aware nav.
3. ✅ **Dashboard KPIs** — 8 KPIs wired to real data, MoM trends, payment/charge charts.
4. ✅ **Pending Workflow** — campus/balance/overdue filters, pagination. Enrollment ledger links present.
5. ✅ **Cash Session UX** — open/close per campus, linked payments, variance notes, Corte Diario integration, prominent Caja banner.
6. ✅ **Porto Monthly Report** — Datos Generales auto-compute, Eventos log, Mapa de Área log, Equipos/Clases wired.
7. ✅ **Activity Log UI** — human-readable audit feed, last 200 entries. ⚠ No filters yet.
8. ✅ **Corte Diario charge-type summary** — charge-type breakdown grid live.
9. ✅ **Weekly Corte** — week-by-week view with bar chart and drill-down links.
10. ✅ **Caja ad-hoc charges** — fully built. "+ Cargo" button → product grid (uniforms, tournaments, etc.) with size + goalkeeper options, amount input, creates charge and returns to enrollment panel.

### Phase 1B — ✅ ALL COMPLETE
- ✅ Porto Mensual Equipos + Clases wired from teams + coaches data.
- ✅ Activity log filters: date range, actor, action type.
- ✅ Batch baja write-off: `/pending/bajas` — bulk void pending charges for dropped players.
- ✅ Dropout reason expansion: 34-reason Porto taxonomy, Porto report labels synced.

## Phase 2: Roles, Integrations, and Ops Expansion
Goal: broader operational support and integrations.

1. **Role Expansion**
- Implement `coach` role: read-only access to own team rosters. No financials.
- Campus-scoped access rules (front desk sees only their campus).

2. ✅ **Caja Phase 2 — Thermal Printer**
- ESC/POS via QZ Tray. Epson TM-T20IV on-site.
- Silent two-copy receipt, no browser dialog. Corte Diario prints via QZ Tray.
- Ethernet IP + multi-machine sharing pending physical setup.

3. **External Payments**
- Define ingestion path for 360Player/Stripe events.
- Add reconciliation queue for unmatched events.

4. **Export and Ops Tooling**
- CSV/PDF exports for daily and monthly reports.
- Basic admin diagnostics page for auth/env/role checks.

5. **Coach Module**
- Coaches log into app to take attendance per training session.
- Attendance records link to team/session/date.
- Attendance-based baja detection (3 consecutive missed months).

6. **Uniform Delivery Tracking**
- `player_uniform_deliveries` table: tracks who has/hasn't received training kit, game kit, goalkeeper kit.
- Player card shows uniform status badges.
- Goalkeeper kit flagged as distinct product type.

7. **Uniform Stock Control (Light Inventory)**
- Count-based inventory: units on hand per type/size.
- Dashboard widget: "Training kits on hand: 12 · Order 8 more this week"
- No barcode/SKU in Phase 2.

8. **Player Documents / File Uploads**
- Supabase Storage for photo ID, passport, birth certificate, medical forms.
- `player_documents` table + Storage bucket with RLS (director_admin+ only).

9. **Jersey Number Assignment**
- Business rules TBD (confirmed: even birth year → even number; odd → odd; more rules pending).
- Do not design schema until full ruleset confirmed.

10. **Tournament Entity**
- `tournaments` table, team entries, mandatory vs optional, auto charge generation.

## Prioritized Backlog (as of 2026-03-19, session 12)

### Session 12 — Completed ✅
1. ✅ **Login redirect loop** — OAuth callback now writes session cookies onto the redirect response. Single-click login.
2. ✅ **Player full edit** — name, birth date, gender, goalkeeper, uniform size, medical notes. Director-only page + action.
3. ✅ **Player merge** — `/admin/merge-players`. Atomic DB function, full FK re-pointing, audit logged.
4. ✅ **Performance pass** — covering indexes for index-only balance scans; pending RPC rewritten to GROUP BY CTE; loading skeletons on all major pages.
5. ✅ **Tuition data fix** — pending monthly_tuition charges corrected $600 → $750 (first month per enrollment kept at $600).
6. ✅ **Thermal printer Ethernet guide** — step-by-step setup guide written. Physical setup pending.

### Post-Testing Backlog (2026-03-19+)
1. **Nav/panel audit** — collect staff feedback from first testing day, then audit what stays/merges/gets cut/needs rewiring.
2. **Server-side route blocking** — nav hides links but routes may not actively block unauthorized users. Every protected route needs a server-side role check. Particularly admin routes.
3. **Receipt folio → payment lookup** — folio on receipt is last 8 chars of payment UUID. Actividad log needs to surface payment ID so staff can look up a transaction by its receipt number.
4. **Caja cancel UX** — cancel during payment returns to player enrollment panel, not page top.
5. **Caja charge detail** — expandable rows in pending charges showing period + charge type before staff decides what to pay.
6. **Dashboard KPI 0s** — Saldo Pendiente and Alumnos con Saldo may still show 0 (balance is cumulative, not month-scoped). Verify after first testing session.

### Security Audit (scheduled post-testing)
1. **Route-level access control** — audit every route in `(protected)/` for server-side role checks, not just nav visibility.
2. **RLS verification** — run through all tables, confirm policies are correct for each role. `front_desk` should have zero read access to `audit_logs`, financial aggregates.
3. **sign-qz rate limiting** — `/api/sign-qz` has no rate limit. Add basic throttle.
4. **Full security writeup** — document weak points, mitigations, recommended next steps.

### Phase 2 (active)
1. **Thermal printer — Ethernet setup** — assign static IP to Epson TM-T20IV, update printer name in Admin → Configuración. QZ Tray on each front desk machine shares via network. Guide written in session 12.
2. **Thermal receipt logo** — ESC/POS bitmap header (INVICTA/Porto logo). Requires image → ESC/POS raster conversion.
3. ✅ **Player profile expansion** — active team + coach shown on player detail; uniform orders section; goalkeeper badge; no-team warning.
4. ✅ **Player list tags** — configurable badges: Al corriente/Pendiente, Selectivo/Clases, Portero, Uniforme.
5. ✅ **Teams system** — full build: list, create, edit, roster, transfer, refuerzo, new-arrival flag.
6. **Tournament UI** — `tournaments` table + team entries + player entries. Mandatory vs optional. Auto charge generation. Schema exists, no UI yet.
7. **Campus-scoped access**: deferred until testing stabilizes across both campuses.
8. **Uniform delivery tracking**: `uniform_orders` table + UI live. Inventory/stock control is Phase 3.
9. **CSV/PDF exports**: Corte Diario goes through thermal printer. Other reports TBD post-testing.
10. **External payment reconciliation**: ingestion path for 360Player/Stripe events.

### Phase 3+ (deferred)
- Coach role + attendance module (coach logs in, takes attendance per session)
- Attendance-based baja detection (3 consecutive missed months)
- Uniform stock control (count-based inventory, dashboard widget)
- Player documents / file uploads (Supabase Storage)
- Jersey number assignment (business rules TBD)
- Tournament entity full build (auto charge generation)
- WhatsApp/SMS automated reminders


## Working Rhythm (Recommended)
- Plan: 1 short planning session per week (30-45 min).
- Build: all feature work in `preview`.
- Validate: smoke test after each significant push.
- Release: merge to `main` only from a green preview state.
