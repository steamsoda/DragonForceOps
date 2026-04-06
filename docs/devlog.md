# Devlog

## 2026-04-06 (session 47)

### Archive Player Profile Badge Polish

- Strengthened the visual archive state on dropped-player profiles.
- Archive-mode player profiles now show a larger, more obvious `Jugador dado de baja` banner near the top instead of relying only on the small status chip.
- The banner also surfaces the recorded dropout reason and whether the archived player still has pending balance, so front-desk staff can confirm at a glance that the baja applied correctly.

## 2026-04-06 (session 46)

### Dropout Reason Constraint Hotfix

- Fixed the `Dar de baja` failure caused by a DB/app mismatch on `enrollments.dropout_reason`.
- Root cause:
  - the app-level baja forms and validation now use a much larger dropout-reason catalog
  - but the database check constraint was still limited to the original small legacy set
  - result: valid baja submissions reached Supabase but the `enrollments` update was rejected and surfaced as `No se pudo registrar la baja. Intenta de nuevo.`
- Added an idempotent migration to expand `enrollments_dropout_reason_check` so it accepts the current operational reason catalog while keeping older legacy codes valid.
- This is a DB-only hotfix for both the new dedicated baja workflow and the older generic enrollment-end path.

## 2026-04-06 (session 45)

### Baja / Dropout Revamp + Archive Player Profile v1

- Replaced the weak generic dropout path with a dedicated `Dar de baja` flow for active enrollments.
- The new baja workflow now has its own route and focused form:
  - effective dropout date
  - required dropout reason
  - optional dropout notes
- Normal dropout now writes a standard ended enrollment, clears active collections follow-up state, and returns staff to the player profile with a clear success state.
- The player profile now behaves in two distinct modes:
  - active player hub with current account, payments, incidents, and uniforms
  - archive player hub for players without an active enrollment
- Active player profiles no longer show `Historial de inscripciones`.
- Archive player profiles now show:
  - latest dropout summary
  - pending balance status
  - deep link to the previous account
  - direct `Nueva inscripcion` return path
  - handoff to `Bajas y saldos pendientes` when debt remains
- `Jugadores > bajas` now gives stronger archive context at a glance, including campus and pending-balance state, while still linking into the archive player profile.
- The old enrollment edit page remains available for generic edits, but the normal operational path for ending enrollment is now the dedicated baja route.
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-04-05 (session 44)

### Player Profile Consolidation / Single-Player Hub v1

- Reworked the player profile into the default single-player operational hub instead of a thin summary page.
- The player page now brings the active enrollment account inline, so staff can handle most normal single-player work without leaving the profile:
  - account summary cards
  - payment posting
  - incident management
  - charges table
  - payments table
- Reorganized the page into clearer operational sections:
  - top identity and status summary
  - quick actions
  - player basics
  - guardians / contact
  - current enrollment + account
  - uniforms
  - compact enrollment history
- Added stronger chips / tags for high-signal operational state, including:
  - active / inactive enrollment state
  - campus
  - team / level
  - goalkeeper
  - active incident
  - uniform state
  - balance state
- Historical enrollments now stay compact by default and expand only when staff wants more detail, keeping the current enrollment visually dominant.
- The dedicated enrollment account page remains available as a deep-detail / fallback route, but the player profile is now the main single-player workspace.
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-04-05 (session 43)

### App Health / Hardening Track Added

- Added a dedicated app-health / hardening priority to the roadmap so long-term stability is treated as planned work, not just a vague worry about AI-built software.
- Locked the framing for this track:
  - the app is already real operational software, not a throwaway demo
  - the main risk is unmanaged technical debt or inconsistent business rules, not "AI code" by itself
  - hardening should happen as recurring passes between feature waves, especially around finance, permissions, reporting, and performance
- The new roadmap track now explicitly calls out:
  - architecture / data-ownership review
  - permissions audit refresh
  - finance/payment/report regression checklist
  - performance hotspot review
  - backup / recovery / rollback confidence
  - migration / preview / prod deployment verification discipline
- This is intentionally framed as an operational maturity lane, not a panic rewrite or anti-feature freeze.

## 2026-04-05 (session 42)

### Pendientes Call-Center Mode v1

- Replaced the old `Contactado` checkbox workflow in `/pending` with a light CRM-style current follow-up state on each enrollment:
  - `No contactado`
  - `No contesta`
  - `Contactado`
  - `Promesa de pago`
  - `No regresará`
- Added structured follow-up fields on `enrollments` and migrated the old `contactado_*` values forward into the new model.
- `Promesa de pago` now stores a required promised date plus an optional note.
- `No regresará` now acts as a handoff state in `Pendientes` and adds a direct `Ir a baja` route into the existing enrollment edit / baja flow instead of ending the enrollment silently.
- `Pendientes` rows/cards now work as an inline follow-up workspace:
  - choose status
  - write/update note
  - capture promised payment date when applicable
  - save inline without leaving the collections view
- Added row/card styling so current collection status is visible at a glance.
- The pending enrollments RPC and TS adapter now return the new follow-up fields instead of the old checkbox fields.
- Payment settlement now clears follow-up state automatically when the enrollment balance reaches zero, and ending/cancelling an enrollment also clears the stored follow-up state.
- Added audit visibility for follow-up changes through `pending_follow_up.updated`, surfaced in both `Actividad` and admin `Auditoría`.
- Hotfix after the first preview push:
  - updated the pending follow-up migration to drop and recreate `list_pending_enrollments_full(uuid)` before changing its return shape, which unblocks preview DB application cleanly
- UI polish follow-up:
  - widened `/pending` to the local wide page shell
  - replaced the cramped desktop pending table with full-width grouped cards
  - expanded the filter bar into a wider two-row layout with a direct `Limpiar` action
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-04-04 (session 41)

### Release + Versioning Policy

- Locked a standing release rule for all ongoing work:
  - every repo-tracked implementation change must bump the app version in `package.json`
  - every pushed change must also update `docs/devlog.md`
- Versioning default:
  - patch bump for hotfixes, polish, performance work, and small operational follow-ups
  - minor bump for meaningful feature/workflow additions
- This session applies that rule immediately by advancing the app version to `v1.5.1`, even though the repo change is documentation/process only, so version movement stays consistent and visible.

## 2026-04-02 (session 40)

### Uniformes Dashboard v1

- Promoted uniforms from a scattered player-profile helper into a real campus-scoped operational page at `/uniforms`.
- Reworked the underlying lifecycle so `uniform_orders` now behaves like a fulfillment queue:
  - `pending_order`
  - `ordered`
  - `delivered`
- Added `sold_at` to `uniform_orders`, made `ordered_at` represent supplier ordering specifically, and now use `charge_id` as the real financial link to the uniform sale.
- Added a charge-level fulfillment preference for Caja uniform sales so the explicit front-desk choice survives until the charge is fully paid:
  - `Entregar ahora`
  - `Dejar pendiente`
- Uniform fulfillment rows are now auto-created only when the related uniform charge becomes fully paid:
  - immediate in-stock handoff creates a delivered row
  - deferred fulfillment creates a `pending_order` row
  - older unpaid uniform charges that are settled later also enter the queue automatically
- The new `/uniforms` dashboard is queue-first and campus-scoped:
  - `Vendidos esta semana`
  - `Pendientes por pedir`
  - `Pedidos al proveedor`
  - `Pendientes por entregar`
  - `Entregados esta semana`
- Added direct workflow actions from the new dashboard:
  - one-click `Marcar como pedido`
  - one-click `Marcar como entregado`
  - bulk mark-as-ordered for the weekly supplier pass
- Caja now captures fulfillment intent on uniform items before checkout, without changing the rest of the payment flow.
- Player profile uniforms section was simplified into a secondary fulfillment view:
  - it no longer manually creates new rows
  - it now reflects the same paid-sale-driven lifecycle as the main dashboard
- Player-list uniform tags now treat any non-delivered uniform row as pending, while delivered-only history remains `OK`.
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-04-02 (session 39)

### Final Front Desk Polish Sweep Before Uniformes

- Reworked the protected app shell for mobile-first use:
  - mobile now uses a collapsible menu instead of the fixed desktop sidebar
  - the top bar no longer assumes one desktop row for identity, debug tools, printer tools, and logout
  - content no longer depends on the desktop sidebar offset on small screens
- Applied a bounded responsive pass to the main daily-use pages:
  - `/caja`
  - `/players`
  - `/pending`
  - `/reports/corte-diario`
  - `/receipts`
- High-density tables on those pages now fall back to mobile cards or stacked layouts where needed instead of forcing awkward phone overflow.
- Caja polish:
  - `Cobro actual` now shows more useful pending-charge context for selected existing charges, including their tuition month / type and due date when present
  - mobile header/actions were tightened so the front-desk entry flow is usable on smaller screens
- Actividad polish:
  - `/activity` now shows clearer payment lookup actions so payment-related log rows can jump directly to the receipt or enrollment account
  - payment-post audit rows now persist folio in `after_data` for newer entries
- Small shared UI cleanup:
  - tighter page-shell spacing on mobile
  - responsive pagination/action bars on touched pages
- Roadmap update:
  - this is the last bounded polish sweep before the next major operational build
  - `#17 Uniformes tab` is now the explicit next major implementation target
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-04-01 (session 38)

### Attendance Export + Jugadores Filters + Corte Detail Polish

- Fixed the attendance workbook so active players are no longer dropped just because their level is outside the original hardcoded section list.
  - known sections still prioritize `B2`, `B1`, `B3`, and `Selectivo`
  - any extra level values now render instead of disappearing silently
- Attendance export now treats missing gender as a data-cleanup issue instead of exporting fallback `Sin genero` sheets.
  - those players are excluded from the workbook
  - `/players` now shows a visible warning count and campus/category breakdown for the excluded rows
- Expanded the existing `Jugadores` page with the first advanced filter wave:
  - `Sin genero`
  - `Sin nivel`
  - `Sin equipo`
  - `Mensualidad pendiente por mes`
- The month-specific pending filter is based on real pending `monthly_tuition` charges and remaining allocated amount, not just aggregate balance.
- Corte Diario ledger now shows `Conceptos pagados` per payment by resolving `payment_allocations -> charges.description`.
- Added a separate detailed Corte report page at `/reports/corte-diario/detalle`:
  - browser/A4 print oriented
  - uses the same current campus checkpoint window
  - includes folio, notes, cross-campus markers, and paid item descriptions
  - does **not** close or roll the checkpoint
- Kept the existing thermal `Imprimir y cerrar corte` flow unchanged.
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-04-01 (session 37)

### Debug Tool UX Pass

- Reworked the preview-only debug tool so it is easier to use visually:
  - replaced the free-text top-bar input with a real user dropdown
  - added recent-user chips for quick switching
  - added stronger `Solo lectura` badges in the header and debug banner
  - added a dedicated superadmin page at `/admin/debug-view`
- The new debug page shows:
  - actor user vs active viewed user
  - recent targets
  - searchable user list with role/campus summary
  - one-click `Ver como` and reset actions
- Shared debug user summaries now come from one helper, reused by the top bar and debug page.
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-04-01 (session 36)

### Preview-Only View-As Debug Tool

- Added a preview-only `Ver como` tool for superadmin so role and campus scope can be tested against a real target user without swapping Supabase sessions.
- The protected layout now resolves:
  - actor user = the real logged-in superadmin
  - effective user = the selected target user when debug mode is active
- While view-as mode is active:
  - nav visibility, role checks, and campus-scoped app access follow the effective user
  - the app shows a persistent amber banner with the target user, role/campus summary, quick links, and reset
  - write actions are blocked across the main operational/admin server actions with a shared read-only guard
- Tightened emulator fidelity on key operational reads so preview behaves closer to the target user:
  - players and birth-year filters
  - pending list
  - receipts search
  - Caja drilldown/search access checks
- Safety:
  - hard-disabled in production
  - enabled only in preview or local development
  - no DB schema changes or auth-session impersonation
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-04-01 (session 35)

### Roles + Campus Scope Hotfix

- Added a shared role-scope formatter so role labels render consistently across the app.
- The fixed top bar now shows the signed-in user's roles plus campus scope next to the email:
  - campus-specific roles show the assigned campus
  - multi-campus/global scope collapses to `Todos`
- Updated `Usuarios y Permisos` so assigned role badges also show their campus scope instead of only the raw role label.
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-04-01 (session 34)

### Simplified Corte Diario + Automatic Campus Checkpoints

- Replaced the front-desk-facing "cash session + daily corte" mental model with a checkpoint-based Corte flow.
- Added persistent `corte_checkpoints` per campus:
  - one open checkpoint per campus
  - printing a corte now closes the current checkpoint and opens the next one automatically
- Corte Diario is no longer anchored to calendar date filters or cash-session windows.
- The page is now campus-first and shows:
  - current open checkpoint start time
  - counted totals for `cash`, `card`, `transfer`, and `other`
  - visible-but-excluded `360Player` rows
  - cross-campus markers based on `operator_campus_id`
- Printing now runs through a server action instead of a client-only print:
  - prepares the just-closed checkpoint payload
  - rolls the next checkpoint automatically
  - keeps retryable print state in the client if QZ fails after close
- Simplified Caja for front desk:
  - removed the session-status warning clutter from the main Caja page
  - left `Sesion de Caja` as a director-only fallback/admin tool
- Added optional backdated `paid_at` support in both payment entry paths:
  - Caja checkout
  - enrollment ledger payment form
- Backdated posting now affects:
  - receipt timestamp
  - corte inclusion window
  - downstream finance surfaces that already key off `payments.paid_at`
- Audit logging for posted payments now records:
  - `paid_at`
  - `recorded_at`
  - `backdated`
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-04-01 (session 33)

### Attendance Export Workbook

- Added a first operational Excel export for front desk on `/players` through a direct `Exportar Excel` download.
- New export route generates a single `.xlsx` workbook with many sheets:
  - one sheet per campus + category + gender
  - level sections inside each sheet (`B2`, `B1`, `Selectivo`, `Sin nivel`)
  - alphabetical player rows within each level section
- Each row includes the attendance roster fields needed for tomorrow's manual use:
  - number
  - player name
  - category
  - level
  - team
  - tutor phone
  - 20 blank attendance columns
- Export respects the campus-scoped `front_desk` model:
  - Contry-only users export only Contry sheets
  - Linda Vista multi-campus users export all assigned campuses
  - directors/superadmins export all accessible campuses
- Added `exceljs` to generate formatted workbooks with:
  - frozen title row
  - sheet titles
  - bordered attendance grid
  - readable column widths
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-04-01 (session 32)

### Cross-Campus Payment Ownership + Campus-Scoped Front Desk

- Added `operator_campus_id` to `payments` and backfilled historical rows from the enrollment campus so legacy reporting keeps working safely.
- Caja and enrollment-ledger payment posting now record the campus that physically received the payment, while the player ledger and allocations stay attached to the player's enrollment campus.
- Cross-campus handling is now explicit in operational views:
  - Corte Diario filters by receiving campus (`operator_campus_id`)
  - payment rows expose both player campus and receiving campus
  - cross-campus payments are visibly tagged instead of being hidden as normal same-campus activity
- Preserved the existing money-handling split:
  - `cash` still links into cash sessions
  - `card` now follows receiving-campus ownership in Corte Diario but does not enter cash-session expected-cash math
  - `360Player` still shows in transaction rows but stays excluded from corte totals
- Introduced campus-aware operational access helpers and applied them across the main front-desk surfaces:
  - Caja
  - player lists/details used operationally
  - pending views
  - receipts search
  - cash-session pages
  - Corte Diario
- Superadmin can now grant `front_desk` roles with explicit campus assignment, including multiple campus rows for Linda Vista hub staff.
- Resulting model:
  - Contry staff can stay scoped to Contry
  - Linda Vista power front desk can operate Linda Vista and Contry without needing `director_admin`
  - broader permissions hardening still remains tracked separately under issue `#18`
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed
- Versioning note:
  - bumped from `1.1.24` planning target to `1.2.0` because the cross-campus ownership + campus-scoped front-desk pass is a larger operational release and a clearer rollback marker

## 2026-04-01 (session 31)

### Issue 33 Rollback for Replan

- Reverted the first manual-heavy `360Player / Stripe` reconciliation UI pass from `preview`.
- Reason:
  - the front-desk workflow was too heavy to be practical
  - it required too much manual data entry to be viable in daily operations
- Added a cleanup migration to remove the temporary reconciliation table/enum from preview DB so the branch returns to the pre-issue-33 state cleanly.
- Decision locked for the replan:
  - do **not** depend on daily manual 360Player CSV export as the primary workflow
  - re-evaluate issue `#33` around stronger automation paths before rebuilding it

## 2026-04-01 (session 30)

### Roadmap Refresh After Final Testing

- Consolidated the post-testing backlog into 3 operational tracks instead of treating every request as an isolated feature:
  - **Finance Ops Stabilization**
  - **Permissions + Campus Operations**
  - **Sports Ops / Director Deportivo**
- Locked the next execution focus as **Finance Ops**, based on the current risk profile of real usage.
- Reframed Stripe / 360Player as:
  - manual reconciliation first
  - future import / webhook automation later
- Locked the long-term permissions direction:
  - expand `front_desk` to cover real daily work
  - stop relying on `director_admin` as an operational workaround
- Locked Director Deportivo as a **sports-only** track:
  - payment-status/readiness visibility allowed
  - no finance totals, cash sessions, or broad money modules
- Added/clarified backlog items for:
  - refunds
  - Corte Diario / cash-session revamp
  - campus workflow polish
  - Director Deportivo dashboard
  - team-building workflow
  - pending-by-month filters
  - specialist appointment products
  - Excel/list exports
  - attendance-sheet export
- Folded front-desk notes like repeated uniform quantity into the existing Uniformes track instead of creating a disconnected feature.

## 2026-04-01 (session 29)

### April 11 Tuition Repricing Safety Patch

- Audited the live April 1 monthly-tuition cron run in prod after midnight:
  - `generate-monthly-charges` succeeded at `2026-04-01 00:00` Monterrey
  - April `monthly_tuition` charges reached the expected total and all generated at `$600`
  - no live `early_bird_discount` charges reappeared
- Found a real future risk for the April 11 repricing job:
  - some April tuition rows were already allocated but still had `status = pending`
  - the installed repricing function would have repriced those allocated charges too
- Added a DB migration that patches `reprice_pending_monthly_tuition()` so it now skips any tuition charge that already has a row in `payment_allocations`.
- Result:
  - April 11 repricing will only affect truly unpaid/unallocated pending tuition
  - paid history and partially/fully allocated tuition rows stay untouched

## 2026-03-31 (session 28)

### One-Page Enrollment Intake

- Replaced the front-desk `/players/new` flow with one composite intake form that captures:
  - player data
  - one primary guardian
  - enrollment setup
  - pricing preview
  - `Regreso` mode
- The new intake now submits once and reuses the existing server-side enrollment logic instead of chaining multiple UI screens.
- Added a dedicated intake server action that:
  - creates guardian
  - creates player
  - links them
  - creates the enrollment
  - creates the initial inscription + tuition charges
  - auto-assigns B2 when applicable
  - redirects directly into Caja
- Added a lightweight duplicate/return warning on the intake screen:
  - checks likely player matches by name + birth year
  - links staff to the possible existing player record
  - does not block continuing with the new record
- Preserved the existing front-desk UX improvements inside the single-page flow:
  - masked `DD/MM/YYYY` date inputs
  - calendar buttons
  - campus buttons
  - `Regreso` inscription options
  - automatic tuition preview and carryover rules
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-03-31 (session 27)

### Caja Advance Tuition Checkout Hotfix

- Fixed a production checkout bug in the POS cart flow where staged advance tuition items could fail with `Producto no encontrado o inactivo`.
- Root cause: the cart checkout path was trying to recreate staged tuition by looking for an active tuition product in the POS catalog, even though the dedicated advance-tuition card already stages tuition by period directly from the pricing engine.
- The checkout path now creates staged tuition charges directly through the canonical monthly-tuition helper instead of depending on a catalog product row existing.
- Result:
  - mixed carts like `Mensualidad adelantada + Rosa Power Cup` now materialize correctly at checkout
  - fixed-price products still use the product catalog path
  - tuition keeps using the versioned pricing/arrears logic
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-03-31 (session 26)

### Regreso Enrollment Workflow

- Extended the player-to-enrollment handoff so `Nuevo jugador` can explicitly mark a new record as `Regreso` before submit.
- Carried that workflow state into `Nueva inscripcion` through the redirect instead of hiding it in notes or asking staff to remember it manually.
- Added a return-aware branch on the enrollment form:
  - normal enrollment keeps the standard plan inscription amount
  - `Regreso` now offers explicit inscription buttons:
    - `Inscripcion completa` = 1800
    - `Solo inscripcion` = 600
    - `Exento de inscripcion` = 0
  - monthly tuition remains driven by the same automatic date-window rules as the standard enrollment flow
- Added explicit enrollment persistence for return handling:
  - `enrollments.is_returning`
  - `enrollments.return_inscription_mode`
- Relaxed the old `charges_amount_nonzero` DB constraint so the system can store a real zero-amount inscription charge for waived-return cases without hacks; Caja still stays clean because it only surfaces charges with `pendingAmount > 0`.
- Enrollment creation audit payloads now include whether the enrollment was a return and which return inscription mode was chosen.
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-03-31 (session 25)

### Caja Width Hotfix

- Fixed the real Caja layout bottleneck at the page level: `/caja` was still wrapped in `max-w-2xl`, which kept the entire POS flow cramped even after the internal POS cards were widened.
- Expanded the route container to a desktop-wide layout so the existing POS grid can finally use the available screen width.
- No payment, cart, pricing, or receipt behavior changed in this hotfix.
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-03-31 (session 24)

### Caja POS Hotfix Pass

- Expanded Caja's local desktop width so the POS flow can use more screen space without touching the global app shell.
- Rebalanced the POS layout to give more room to:
  - `Cargos pendientes`
  - the POS tile area
  - the current checkout summary
- Replaced `Carrito` wording with `Cobro actual` to make the front-desk intent clearer.
- Made the full pending-charge row clickable for add/remove selection, while keeping the chevron reserved for expanding details.
- Restored advance tuition as a dedicated visible card inside the POS area instead of relying on the old buried configurator path.
- Tightened product guidance:
  - uniform items now require `Talla` before they can be added
  - only special/manual charges keep open-amount capture
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-03-31 (session 23)

### Caja POS Cart Redesign

- Reworked Caja around a true transient POS cart instead of the old split between pending-charge selection, separate product screen, and payment screen.
- Once an enrollment is loaded, Caja now shows one unified checkout view with:
  - pending charges that can be added or removed from cart inline
  - POS product tiles by category
  - staged cart items for products and advance tuition
  - a running cart summary
  - one checkout/payment panel for the cart or for quick `Cobrar todo`
- Added a cart-oriented server action so the client can stage new items, create them only at checkout time, and then post one payment flow across the selected existing charges plus staged items.
- Locked normal catalog pricing in Caja:
  - fixed-price products add directly from the tile menu
  - tuition resolves from the selected future month/version
  - size/goalkeeper products require configuration first
  - only special/manual charges keep open-amount input
- Preserved the existing payment engine behavior:
  - targeted charges still get paid first
  - excess still allocates FIFO
  - split payment still works
  - receipt/folio/session behavior stays in the existing payment path
- Added staged-charge audit suppression during cart checkout so failed checkout rollback does not leave orphan `charge.created` audit entries behind.
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-03-31 (session 22)

### Player Date Input Hotfix

- Applied the same masked date-entry pattern from `Nueva Inscripcion` to player birth-date fields.
- `Nuevo jugador` now supports:
  - typing `01012020` and auto-formatting to `01/01/2020`
  - a `Calendario` button that opens the native picker
- Reused the same input in `Editar jugador` so create/edit stay aligned.
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-03-31 (session 21)

### Enrollment Form UX Hotfix

- Updated the new-enrollment start-date field to behave like a masked front-desk input:
  - typing `01012020` now auto-formats to `01/01/2020`
  - the field still stores canonical `YYYY-MM-DD` on submit
  - a `Calendario` button now opens the native date picker for staff who prefer tapping instead of typing
- Replaced the new-enrollment campus dropdown with direct button choices for the two campuses.
- Kept server-side enrollment date parsing tolerant so the action accepts both the masked `DD/MM/YYYY` text entry and ISO values from the native picker.
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-03-31 (session 20)

### Enrollment Handoff + Date Input Cleanup

- New enrollment creation now redirects straight into Caja with `?enrollmentId=...` instead of dropping staff into the ledger/cargos page first.
- This keeps the front-desk flow tighter: create the enrollment, land in Caja with that new account loaded, then take payment immediately.
- Replaced the browser-native player birth-date control on both create and edit flows with explicit `DD/MM/YYYY` text entry:
  - `Nuevo jugador`
  - `Editar jugador`
- Added shared date-only parsing/formatting helpers so birth dates are stored as canonical `YYYY-MM-DD` while staff enters `DD/MM/YYYY`.
- The parser accepts only valid calendar dates and avoids UTC-shift bugs from native date parsing.
- Fixed the regular `/activity` page to use Monterrey-local display time and Monterrey day bounds for `Desde/Hasta` filters instead of UTC.
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-03-31 (session 19)

### May 2026 Tuition Pricing Rollout

- Added additive pricing-plan versioning groundwork for tuition changes:
  - `pricing_plans` now support effective-date resolution by plan family/code.
  - seeded a May 2026 standard tuition version in a new rollout migration instead of mutating historical plans in place.
- Added `pricing_plan_enrollment_tuition_rules` so new-enrollment first-month tuition can be versioned separately from active-player monthly tuition.
- Seeded canonical tuition behavior:
  - pre-May active players: 600 days 1-10, 750 day 11+
  - May+ active players: 700 days 1-10, 900 day 11+
  - pre-May new enrollments: 600 days 1-10, 300 days 11-20, 600 next-month carryover on day 21+
  - May+ new enrollments: 700 days 1-10, 350 days 11-20, 700 next-month carryover on day 21+
- Replaced the remaining free-form enrollment tuition flow:
  - the enrollment form now shows system-selected pricing instead of free-number amount inputs
  - the server action computes inscription + first tuition from the versioned rule set
  - day 21+ enrollments now create only the next-month tuition charge
- Hardened Caja advance tuition:
  - advance-month amounts now resolve by the selected future `period_month`, not the current month
  - selectable range is now current month + next 3 months
  - pending future tuition repricing migration updates only charges with `status = pending`, `period_month >= 2026-05-01`, and no allocations
- Replaced the monthly tuition automation model in SQL:
  - `generate_monthly_charges()` now creates day-1 charges at the early tier for the target month/version
  - new `reprice_pending_monthly_tuition()` bumps still-pending charges to the regular tier on day 11
  - both jobs are scheduled in `pg_cron`
- Manual admin monthly-generation action now calls the DB function directly so manual runs and cron runs share one source of truth.
- Advance tuition and enrollment pricing now resolve through shared helpers in `src/lib/pricing/plans.ts`, reducing the chance of app-vs-DB pricing drift.
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-03-30 (session 18)

### Patch 1 Migration Blocker Audit

- Investigated why `supabase db push` and the prod migration workflow were not applying newer migrations.
- Root cause was not auth or CLI wiring: prod migration history is blocked on `20260330120000_patch1_data_corrections.sql`.
- Direct prod audit showed Patch 1 is only partially reflected:
  - Section 1 player corrections: 5 already match, 6 still pending.
  - Section 2 duplicate cleanup: all 3 duplicate player rows still exist; 2 already have allocated payments and cannot be deleted blindly.
  - Section 3 bajas: all 4 intended enrollment endings are still pending.
  - Section 4 Mitre inserts: neither player exists in prod.
- Section 5 payment backfill: the player/enrollment references are valid in prod, but none of the 45 expected payments match exactly; only 4 target charges already have some allocated payment, and those do not match the migration cleanly.
- Conclusion: Patch 1 cannot be safely replayed as-is and also cannot be marked applied honestly.
- Operational direction set: replace blind replay with a Patch 1 recovery pass that separates safe corrections from risky duplicate/payment handling, then unblock later migrations.
- Reworked `20260330120000_patch1_data_corrections.sql` into an idempotent recovery-safe migration:
  - 11 player corrections now update only when still missing.
  - 3 duplicate-player deletions now use guarded duplicate cleanup against the intended master records and preserve guardians before deleting the duplicate history.
  - 4 bajas now use the valid enum code `other`.
  - 2 Mitre inserts are safe to rerun.
- Ran `supabase db push` successfully against prod. Applied and recorded:
  - `20260330120000_patch1_data_corrections.sql`
  - `20260330193000_receipts_search_and_finance_indexes.sql`
  - `20260331041000_receipts_partial_folio_search.sql`
- Post-apply verification:
  - duplicate Patch 1 players are gone
  - all 4 bajas are ended with `dropout_reason = 'other'`
  - both Mitre players now exist
  - `search_receipts('202603', ...)` works in prod
- Result: the prod migration chain is unblocked again and future migrations can move normally.

### GitHub Actions Migration Verification

- Verified with GitHub CLI that `.github/workflows/migrate-production.yml` was triggering correctly on `main` pushes touching `supabase/migrations/**`.
- Recent prod migration runs failed for the expected reason: they were all blocked on the old Patch 1 migration until the recovery push.
- Confirmed the latest prod migration workflow run completed successfully immediately after the Patch 1 recovery commit.
- Added `.github/workflows/migrate-preview.yml` so the `preview` branch can have its own isolated Supabase migration automation.
- Preview workflow uses separate secrets:
  - `SUPABASE_PREVIEW_PROJECT_REF`
  - `SUPABASE_PREVIEW_DB_PASSWORD`
  - shared `SUPABASE_ACCESS_TOKEN`
- This keeps preview DB automation separate from production and avoids repeating the manual drift incident.

### Receipts Partial Folio Search (v1.1.11)

- Added a follow-up migration so `search_receipts(...)` matches partial folio fragments as well as player-name fragments.
- Example: searching `202603` now matches folios like `LINDA_VISTA-202603-00032` instead of requiring the full exact folio.

### Prod Follow-up Fixes (v1.1.10)

- Fixed prod `Actividad` crash: the superadmin audit page had a server-component `<button onClick=...>` confirm handler, which Next.js rejects at runtime.
- Generalized the receipts RPC error copy so it no longer incorrectly refers to "preview" when the same failure happens in production.
- Fixed folio search classification in `search_receipts(...)` so folios with underscore campus codes like `LINDA_VISTA-202603-00032` are treated as folios instead of player-name queries.

### Preview Receipts Recovery + Preview DB Safety (v1.1.9)

- Diagnosed the preview `/receipts` outage correctly: preview had posted payments, but the preview DB was missing the `search_receipts(...)` migration entirely.
- Production stayed untouched and continued working, which confirmed the issue was preview schema drift rather than missing payment data.
- Compared applied migration history between preview and prod: preview had stopped at `20260321000000`, while prod continued through `20260326010000`.
- Root cause was not one bad receipts migration but a missing March 24-26 migration block in preview, including `payments.folio` and folio-trigger work.
- Preview was manually reconciled with the missing non-seed migrations plus receipts search, and old preview payments were backfilled with folios for testing.
- `src/lib/queries/receipts.ts` no longer hides RPC failures as fake zero-result states.
- `src/app/(protected)/receipts/page.tsx` now shows a clear operational error when the receipts RPC is missing or failing, including the exact preview SQL checks to run.
- Operational rule documented: Vercel preview deploys do **not** imply preview DB migrations were applied; preview schema-dependent work must be validated separately.

### Financial Hardening + Receipts Scalability (v1.1.8)

- Retired post-payment charge mutation from the live payment model: posted payments no longer change charge amounts after the fact.
- Ledger/Caja payment success payloads now compute remaining balance from a fresh ledger reload instead of trusting the pre-payment snapshot.
- Added `src/lib/time.ts` and started standardizing finance/reporting surfaces on Monterrey-local business time with `DD/MM/YYYY` rendering.
- Added migration `20260330193000_receipts_search_and_finance_indexes.sql` with a DB-backed `search_receipts(...)` RPC plus finance indexes for posted payments, charge period month, and player-name search.
- `/receipts` now loads recent posted receipts by default and filters/paginates from SQL instead of app memory.
- `Resumen Mensual` now keeps collections on `paid_at` while monthly tuition obligation logic uses `period_month` where present.
- Historical payments, allocations, folios, and receipts were not rewritten.

### Receipts Filtering Hotfix (v1.1.7)

- Reworked `src/lib/queries/receipts.ts` again after the first receipts patch was still returning zero rows in preview.
- The search now loads posted payments directly, resolves enrollment/player/campus labels in a second pass, and applies campus/name filtering in memory before pagination.
- This avoids the DB-side prefilter path that was still excluding valid receipt rows.

### Receipts Search Regression Fix (v1.1.6)

- Fixed the `/receipts` page returning an empty table even when posted payments existed.
- Root cause: the page depended on a nested `payments -> enrollments -> players/campuses` select and then discarded rows when the nested relation came back null.
- `src/lib/queries/receipts.ts` now fetches posted payments first, then resolves enrollment/player/campus display data in a second query keyed by `enrollment_id`, so receipt rows render reliably.

### Preview Build Hotfix (v1.1.5)

- Fixed Vercel preview build failure caused by exporting a non-async function from `src/server/actions/payment-posting.ts` under a `"use server"` module.
- `revalidatePaymentSurfaces()` is now async, and both ledger/Caja payment actions now `await` it.
- Result: the shared payment helper keeps the same behavior, but the app now satisfies Next.js server action export rules during `npm run build`.

### Preview Demo Seed + Enrollment Ledger Payment Wiring Fix (v1.1.4)

**Preview-only demo SQL seed**
- Added `docs/preview-demo-seed.sql`: paste-ready SQL for the Supabase editor, intentionally **not** a migration.
- Scope: 20 clearly fake players across both campuses, guardians, active enrollments, mixed tuition/inscription charges, mixed payments, and coherent allocations for UI/testing.
- Additive only: does not alter schema and does not auto-run on push because it lives in `docs/`, not `supabase/migrations/`.

**Enrollment ledger payments now align with Caja operationally**
- Root issue: payments posted from `/enrollments/[enrollmentId]/charges` were not fully behaving like Caja payments. Insert path existed, but cash-session linking and downstream visibility were inconsistent.
- Added shared helper module `src/server/actions/payment-posting.ts` for payment-side effects shared by ledger and Caja:
  - fetch folio
  - link cash payments into open cash session
  - write normalized `payment.posted` audit log
  - revalidate all payment surfaces (`/receipts`, ledger, Caja, Corte Diario, player page)
- `src/server/actions/payments.ts`: ledger payment flow now uses the shared helpers, includes `sessionWarning` in the receipt payload, and revalidates `/receipts`.
- `src/server/actions/caja.ts`: switched the overlapping post-payment side effects to the same shared helper path.
- `src/components/billing/payment-post-form.tsx`: shows warning when a ledger cash payment posts without an open cash session.

**Receipts lookup consistency**
- `src/lib/queries/receipts.ts`: added optional direct `paymentId` filter.
- `src/app/(protected)/receipts/page.tsx`: supports `?payment=...`, so links from Auditoría now resolve correctly.
- Result: a payment posted from the enrollment ledger should now appear in `/receipts` consistently and be directly reachable by payment ID.

---

## 2026-03-30 (session 17)

### Receipt Reprint + Caja Multi-Month Tuition Selection (v1.1.3)

**Reprint receipt from old sales**
- New server action `src/server/actions/receipts.ts`: rebuilds printable receipt data from an existing posted payment, its folio, payment allocations, and enrollment/player/campus context.
- New client component `src/components/receipts/reprint-receipt-button.tsx`: fetches receipt payload on demand and sends it through `printReceipt()` / QZ Tray.
- `src/app/(protected)/receipts/page.tsx`: added `Reimprimir` button per receipt row.
- Reprint uses stored transaction data rather than creating a new payment or synthetic folio.

**Caja — multi-month tuition selection in one payment**
- Previous behavior: creating an advance tuition charge immediately redirected the cashier into a targeted payment flow for that one new charge.
- New behavior in `src/components/caja/caja-client.tsx`: creating an advance tuition charge reloads the enrollment panel, auto-selects the newly created charge, and leaves the cashier in selection mode.
- Staff can now add another mensualidad, keep multiple tuition charges selected, and use `Cobrar selección` once.
- Scope intentionally limited: this improves the tuition use case without introducing a full ad-hoc product cart or changing existing payment allocation rules.

---

## 2026-03-30 (session 16)

### Cat. column, Versioning Rules, Caja Shortcuts, Patch 1 Data Migration (v1.0.5–v1.1.1)

**Categoría column in Corte Diario (v1.0.5)**
- Added "Cat." column to the Corte Diario payments table showing birth year next to player name.
- Also added `birthYear` to `PendingRow` type and Cat. column to `pending-table.tsx` (completing P1 #26 for Pendientes).
- `players/page.tsx` updated with Nivel column (completing P1 #27).
- Versioning rules updated in `CLAUDE.md`: patch for bug fixes, minor for features, major for milestones; can exceed 9 (e.g. 1.21.0).

**Corte Diario quick-access shortcuts in Caja header (v1.1.0)**
- `src/app/(protected)/caja/page.tsx`: added `is_director_admin` check; director-only "Corte {campusName}" link buttons rendered from `statuses` (no extra DB query). Links to `/reports/corte-diario?campus={id}` pre-filtered for today.
- P1 items #25–28 marked done in roadmap.

**Patch 1 data migration (v1.1.1)**
- Migration `supabase/migrations/20260330120000_patch1_data_corrections.sql` — 69 total DB actions:
  - **Section 1** (11): player name/birthdate corrections — typos, abbreviated surnames, wrong birth years (1977→2013, 2010→2012)
  - **Section 2** (3): duplicate player deletions — DF-0170 (double-H), DF-0574 (wrong last name), DF-0527 (wrong birth year). Each guarded by `RAISE EXCEPTION` if unexpected payments exist.
  - **Section 3** (4): enrollment bajas — status=ended, dropout_reason=otro, end_date=2026-03-30. Three by UUID, one by name search (Gerardo Selva Rocha).
  - **Section 4** (2): new player inserts — Alessandro and Leonardo Mitre Gomez (Contry, March 27). Includes enrollment + inscription ($1,800) + first-month tuition ($600) charges. 4 other new players deferred pending reception confirmation.
  - **Section 5** (45): March 2026 payment backfill — 19 cash + 26 stripe_360player. Each: find/create tuition charge → early bird update (charge.amount=600 for day 1–10) → idempotent insert. DF-0435 gets Feb + Mar payments. DF-0246 method updated to cash if stripe exists.
- All `created_by = NULL` (nullable per migration 20260311130000).

---

## 2026-03-26 (session 15)

### RBAC Overhaul, P0 Bug Fixes, P1 UX Pass (v1.0.2–v1.0.4)

**RBAC overhaul — front_desk expansion (v1.0.2)**
- Migration `20260326000000_rbac_front_desk_expansion.sql`: 13 new RLS policies giving front_desk read/write access to all operational tables (charges, payments, allocations, enrollments, players, guardians, teams, etc.).
- `admin_restricted` role deleted — consolidated into front_desk.
- Nav restructure: all operational sections visible to front_desk; Reportes and Admin sections gated to director+.
- App-layer guards relaxed: front_desk can now void payments, edit players, open/close sessions.
- `src/lib/auth/permissions.ts` deleted — inline role checks throughout.

**P0 fixes (v1.0.3)**
- **#23 Charge status display**: `getEffectiveStatus(status, pendingAmount)` in `charges-ledger-table.tsx`. Status badge shows "Pagado" (emerald) when `pendingAmount ≤ 0`, regardless of `charges.status` DB field.
- **#24 Corte Diario midnight**: `getSessionForDate(campusId, dateStr)` helper in `cash-sessions.ts` finds any session (open or closed) by campus + calendar date. `getCorteDiarioData()` now accepts `sessionOpenedAt` + `sessionClosedAt`; extends `queryEnd` past midnight when session closed after calendar day boundary. `isToday` guard removed.

**P1 UX pass (v1.0.4)**
- Migration `20260326010000_p1_sort_first_name_birth_year_level.sql`: fixes ORDER BY in 3 RPCs (`search_players_for_caja`, `list_caja_players_by_campus_year`, `list_pending_enrollments_full`) to use `first_name, last_name`. Adds `team_level` to caja RPC and `birth_date` to pending RPC (required DROP + recreate for return type change).
- `src/lib/queries/players.ts`: ORDER BY `first_name` then `last_name`; added `teams(type, level)` to join; `birthYear` and `level` fields on returned rows.
- `src/lib/queries/enrollments.ts`: `PendingRpcRow` updated with `birth_date`; `birthYear` added to mapped row.
- `src/components/pending/pending-table.tsx`: `birthYear` added to `PendingRow` type; Cat. column added.
- `src/app/(protected)/players/page.tsx`: Nivel column added; Categoría already showed birth year.

---

## 2026-03-24 (session 13–14)

### Data Wipe, Clean Reseed, Auth Fixes, Printer Button (v0.8.1)

**Mes P misclassification — full data wipe + reseed**
- Root cause: "Mes P" in the original Excel seed was interpreted as "Mes Pendiente" (unpaid). It actually means "Mes Pagado en Plataforma" (paid via 360Player/Stripe). ~150–165 payments per month were missing × 3 months = ~450 missing platform payments, compounding into wrong ledger balances across the board.
- Decision: wipe all transactional tables and reseed from corrected Excel. Cleaner than patching with migrations.
- Migration `20260321000000_wipe_transactional_data.sql`: single `TRUNCATE ... RESTART IDENTITY CASCADE` across 18 tables. Preserves all reference/config data (campuses, pricing plans, charge types, products, roles, settings).
- Previous fix migration `20260319090000` superseded and replaced with no-op `SELECT 1`.
- `scripts/generate_seed_v2.py`: reads corrected CSV, outputs `scripts/seed_v2.sql`. Column indices cover mom/dad guardian pairs, jan/feb/mar method+date+amount. Key logic: `absent`/`beca` = no charge, no payment; first month = flat $600; early-bird = payment date ≤ day 10 of period month AND amount = $600 → charge $750 + discount credit -$150; standard = $750 charge + $750 payment; unpaid = charge only, no payment.
- Applied as migration `20260324000000_seed_v2.sql` via `npx supabase db push --linked` (GitHub auto-apply did not trigger).
- Final counts: 687 players, 811 guardians, 687 enrollments, 2,958 charges (1,815 tuition + 1,143 early-bird credits), 1,585 payments, 1,585 allocations.

**Auth: x-forwarded-host for OAuth origin detection**
- `request.url` in Next.js Route Handlers returns Vercel's internal deployment URL (e.g. `dragon-force-ops-[hash]-steamsodas-projects.vercel.app`), not the public alias users access.
- Fix applied to both `src/app/api/auth/azure/route.ts` and `src/app/auth/callback/route.ts`: read `x-forwarded-host` header for hostname, `x-forwarded-proto` for scheme. Falls back to `host` header then `request.url` hostname.
- Fixes login redirect loop where `redirectTo` pointed to internal URL → Supabase rejected or redirected to wrong domain.

**Preview branch login fix**
- Preview URL (`dragon-force-ops-git-preview-steamsodas-projects.vercel.app`) was not in Supabase allowed redirect list.
- Supabase fell back to Site URL and appended `?code=...` to root path instead of hitting `/auth/callback`.
- Fix: added `https://dragon-force-ops-git-preview-steamsodas-projects.vercel.app/**` to preview Supabase project → Auth → URL Configuration → Redirect URLs.
- Callback route also fixed to use `x-forwarded-host` so post-login redirect stays on the correct domain.

**Printer test button**
- `src/components/ui/printer-test-button.tsx`: client component with idle/printing/ok/error states. Calls `printTestPage(printerName)`.
- `printTestPage()` added as a named export in `src/lib/printer.ts` — `sendToQZ` was always internal/private, not exported.
- Rendered in `src/app/(protected)/layout.tsx` header for all users, between ThemeToggle and logout. Always visible (printer name always has a fallback default).
- Version bumped to v0.8.1.

---

## 2026-03-19 (session 12)

### Bug Fixes, Performance, Player Merge, Tuition Data Fix

**Build failures — Next.js 16 proxy convention**
- `src/middleware.ts` and `src/proxy.ts` can't coexist — Next.js 16 deprecated `middleware` in favor of `proxy`. Deleted `proxy.ts` from session 11, renamed `middleware.ts` → `proxy.ts`, export renamed `middleware` → `proxy`. Added explicit `CookieOptions` type to `setAll` (TS strict mode requires it). Same fix re-applied to `src/app/auth/callback/route.ts`.

**Login redirect loop fix — auth callback cookie propagation**
- Root cause: `exchangeCodeForSession()` was called via `createClient()` which writes session cookies to Next.js `cookieStore`. The handler then returned a new `NextResponse.redirect()` — a separate object that never included those cookies. Browser never received the session; `/dashboard` saw no auth and redirected back to `/`.
- Fix: pre-build the `redirectTo` response first; pass a Supabase client whose `setAll()` writes directly onto that response. Session cookies now travel with the redirect on the first attempt.
- File: `src/app/auth/callback/route.ts`

**Player edit page — name + birth date fields**
- Edit page previously only exposed gender, goalkeeper flag, uniform size, medical notes. Added first name, last name, birth date (all required).
- `getPlayerDetail` now exposes `firstName` / `lastName` separately in addition to `fullName`.
- `updatePlayerAction` gated to `is_director_admin()` on both page and action.
- File: `src/app/(protected)/players/[playerId]/edit/page.tsx`, `src/server/actions/players.ts`, `src/lib/queries/players.ts`

**Performance — covering indexes**
- Migration `20260319050000`: added partial covering indexes on `charges(enrollment_id, status) INCLUDE(amount) WHERE status <> 'void'` and `payments(enrollment_id, status) INCLUDE(amount) WHERE status = 'posted'`. Enables index-only scans for all balance aggregation — eliminates heap fetches. Also added partial index on `enrollments(campus_id, player_id) WHERE status = 'active'` for player list count.
- `list_pending_enrollments_full` RPC rewritten (migration `20260319030000`): replaced `v_enrollment_balances` correlated subqueries with a single `GROUP BY` CTE. Previous approach ran N×2 sub-queries per RPC call (~1000+ with 500 active enrollments). New version does one pass over charges + payments.
- `applyEarlyBirdDiscountIfEligible`: cut from 5 sequential round trips to 3 using `Promise.all` for discountType + enrollment fetch, then existingDiscount check + rules fetch in parallel. Removed redundant `tuitionType` fetch (was fetched but never used).
- Added `loading.tsx` skeleton screens on Players, Pending, Dashboard, Caja — immediate animated placeholder on navigation instead of blank screen.

**Duplicate player merge — `/admin/merge-players`**
- New `merge_players(p_master_id, p_duplicate_id, p_actor_id, p_reason)` DB function (migration `20260319040000`): atomic transaction re-points all FK references (enrollments, player_guardians with ON CONFLICT skip, uniform_orders), writes audit log, deletes duplicate. Blocks if both players have active enrollments simultaneously.
- Director-only UI at `/admin/merge-players`: two-step server-rendered search using URL params for state. Search → select master → search → select duplicate → comparison view → confirm. Added to Admin nav. Success redirects to master player page with confirmation banner.

**Tuition data fix — seeded charges corrected $600 → $750**
- Seed script had `TUITION_AMOUNT = 600.00` hardcoded — all 1,860 charges were created at $600. The system rule is: monthly_tuition charges created at $750 (regular rate); early-bird -$150 credit applied at payment time on days 1–10.
- Paid charges left at $600 (self-consistent with $600 payments, balance = $0).
- Migration `20260319050000`: UPDATE all pending monthly_tuition charges from $600 → $750, EXCEPT the minimum period_month per enrollment (first month at enrollment, legitimately $600).
- Discount flow confirmed unaffected: pg_cron creates new charges at $750; applyEarlyBirdDiscountIfEligible only runs against current period month charges.

---

## 2026-03-19 (session 11)

### Production Hardening + DB Seed (v0.8 release)

**OAuth first-login fix — `src/middleware.ts` (new)**
- Root cause: PKCE code verifier cookie was not propagating through the OAuth redirect chain because Supabase SSR middleware was missing entirely.
- Added standard Supabase SSR middleware that calls `supabase.auth.getUser()` on every request to keep session cookies in sync.
- Error was: `oauth_exchange_failed` on first login, redirect loop back to login page.

**Login flow consolidation**
- Merged landing page + login into a single server component at `/` — checks auth, redirects logged-in users to `/dashboard`, otherwise renders branded login UI with `AzureSignInButton`.
- Auth callback error redirects updated to `/?error=xxx` (was `/login?error=xxx`).
- `/login` now just `redirect("/")` for backwards compatibility.

**User admin panel — `/admin/users`**
- Superadmin-only panel. Two sections: "Esperando acceso" (pending, amber) and "Personal con acceso" (active).
- Uses `supabase.rpc("list_auth_users")` — a `SECURITY DEFINER` postgres function to read `auth.users` without service role key.
- Grant role: dropdown + button form → `grantRoleAction` server action.
- Revoke role: click badge → `revokeRoleAction` server action.
- Both actions call `assertSuperAdmin()` which returns `{ supabase, user }` to avoid scope bug.
- Migration `20260319000000_fn_list_auth_users.sql`: `list_auth_users()` SECURITY DEFINER function.
- Migration `20260319010000_superadmin_user_roles_policy.sql`: RLS policies for `superadmin_manage_user_roles` and `superadmin_read_app_roles`.

**Production migration gap fix**
- Production had only 2 migrations (from Feb 24). Applied all 36 pending migrations via Supabase CLI binary (`/tmp/supabase.exe db push --db-url ...`).
- Supabase CLI npm install failed on Windows (postinstall script error) — fixed by downloading Windows binary from GitHub releases via curl + tar.
- DB URL: password with brackets `[...]` required literal brackets (URL-encoding failed).
- GitHub Actions workflow `.github/workflows/migrate-production.yml` created — auto-applies migrations on push to `main` when migration files change.

**Pricing plan migration — `20260319020000_seed_prod_reference_data.sql`**
- Production DB had no pricing plan → all enrollment inserts would fail silently.
- Idempotent migration: creates `Plan Mensual` (MXN, active), 2-tier tuition rules (days 1–10 = $600, days 11+ = $750), pricing plan items (inscription = $1,800, uniform_training = $600, uniform_game = $600).
- Applied to production: `Plan Mensual` id `f89c4e66-641f-4a9f-b617-5608e9c14b5f`.

**Production data seed — 687 players**
- `scripts/generate_production_seed.py`: reads `DragonForce_Prod_Contactos_Review.xlsx - Jugadores.csv`, outputs `scripts/seed_production.sql`.
- Produces: 687 players, 687 enrollments (10 beca/scholarship), 473 guardians, 31 teams, 1,860 charges, 1,080 payments, 1,080 allocations. Total: 7,045 INSERT statements in `BEGIN/COMMIT`.
- Payment column logic: date value = charge + posted payment + allocation; `MES P` / `A` (Ausente) = pending charge only; `BECA` = `has_scholarship=true`, skip all charges; blank / junk date = skip.
- Enrollment-date logic: only create charges for months ≥ player's INSC date (default `2025-08-01` for blank INSC). This correctly skips 168 `A` values for players not yet enrolled.
- `seed_production.sql` ready to run in Supabase SQL editor (runs as postgres, bypasses RLS).

**Merged preview → main** — all session work merged and pushed.

## 2026-03-18 (session 10)

### QZ Tray Thermal Printer Integration (v0.8 continued)

**ESC/POS receipt printing — silent, no browser dialog**
- `src/lib/printer.ts`: loads `/public/qz-tray.js` dynamically via script injection, `connectQZ()` sets up signed mode or unsigned fallback, `buildReceipt()` + `buildCorte()` generate ESC/POS byte sequences.
- Two-copy receipt: COPIA CLIENTE (partial cut `GS V 41 03`) + COPIA ACADEMIA (full cut `GS V 00`). Each copy prints header, line items, total, remaining balance (or "Cuenta al corriente ✓" / "Crédito: $X").
- Auto-print on payment success: `ReceiptPanel` `useEffect` fires `printReceipt()` on mount, errors caught silently. Manual "Imprimir Recibo" (`PrintReceiptButton`) surfaces errors with user-friendly messages.
- Corte Diario: `window.print()` replaced with `PrintButton` calling `printCorte()` via QZ Tray.
- Printer name configurable in Admin → Configuración (`app_settings.printer_name`, defaults to "EPSON TM-T20IV").

**Certificate signing — `/api/sign-qz` API route**
- POST endpoint: authenticates user, normalizes `QZ_PRIVATE_KEY` (`\\n` → actual newlines, adds `-----BEGIN PRIVATE KEY-----` headers if stripped by Vercel), signs with RSA-SHA512, returns base64 signature.
- `NEXT_PUBLIC_QZ_CERTIFICATE`: same `\\n` normalization applied client-side before passing to `setCertificatePromise`.
- QZ Tray Site Manager: demo cert (QZ Industries LLC) added as permanently allowed.

**Key bug fixed during debugging**
- `setSignaturePromise` must return `(resolve, reject) => void`, NOT a Promise. This version of `qz-tray.js` wraps the result in `new Promise(result)`, so returning a Promise caused `TypeError: Promise resolver #<Promise> is not a function` on every print job. Connection succeeded but each print request failed.
- Unsigned fallback fixed to use the same `(resolve) => resolve("")` pattern.

**Physical printer**: Epson TM-T20IV arrives in office. Ethernet setup pending (tomorrow). QZ Tray installed and verified on front desk machine — signing flow confirmed end-to-end. Physical print test scheduled for 2026-03-19.

## 2026-03-17 (session 9)

### Team Assignment UX — Full Build (v0.8 continued)

**Performance fixes (applied in this session)**
- `v_enrollment_balances` view: replaced CTE with correlated subqueries to eliminate the PostgreSQL optimization fence — filters now push through to `enrollment_id IN (...)`.
- `listPlayers`: parallelized guardian + balance + team queries into a single `Promise.all` (was sequential — 3 roundtrips).
- `getEnrollmentLedger`: parallelized enrollment + balance + charges + payments into one `Promise.all`.
- New partial indexes: `idx_team_assignments_primary_active` (`is_primary = true AND end_date IS NULL`) and `idx_team_assignments_new_arrivals` (`is_new_arrival = true AND end_date IS NULL`).

**Caja drill-down by category**
- New panel alongside the existing player search: Campus → Birth Year → Player tiles.
- Drill-down meta (campuses + birth years) preloaded on component mount via `getCajaDrilldownMetaAction()` — click is instant.
- `list_active_birth_years_by_campus()` + `list_caja_players_by_campus_year(p_campus_id, p_birth_year)` RPCs added.
- Optimistic player header: selecting a player from search shows name + balance immediately while ledger loads.
- Fixed: cancel button was a no-op in some states; "Seleccionar por categoría" button was misaligned with the divider.

**Player tags + admin settings panel**
- `app_settings` table (key/value + jsonb, director_admin write, authenticated read).
- Default tag settings: `tag_payment`, `tag_team_type`, `tag_goalkeeper` = true; `tag_uniform` = false.
- `/admin/configuracion`: toggle switches per tag, stored in DB, revalidates player list on save.
- Player list badges: Al corriente/Pendiente (no amount), Selectivo/Clases, Portero, Uniforme pedido/entregado.
- All badges conditional on their toggle; uniform badge skips its query entirely when disabled.

**Goalkeeper flag**
- `players.is_goalkeeper boolean not null default false`.
- Editable from player edit page (checkbox).
- Portero badge shown in player detail info grid.

**Uniform orders**
- `uniform_orders` table: `ordered → delivered` lifecycle, linked to enrollment, independent of charges.
- `UniformOrdersSection` client component on player detail page: create order form + table + "Marcar entregado".
- `getUniformOrdersAction`, `createUniformOrderAction`, `markUniformDeliveredAction` server actions.

**Teams — full feature build**
- Migrations: `20260317140000` — adds `is_new_arrival` + `role` ('regular'|'refuerzo') columns to `team_assignments`; `list_teams_with_counts()` RPC.
- `src/lib/queries/teams.ts`: `listTeams`, `getTeamDetail`, `listCoaches`, `findB2TeamForAutoAssign`, `generateTeamName`.
- Team name auto-generation: `{campusCode} {birthYear} {genderLabel} {level}` (e.g. "LV 2015 Varonil B1"). Class teams: `{campusCode} {birthYear} Clases`.
- `/teams` — list grouped by campus → birth year with summary stats (active teams, players assigned, new arrivals pending).
- `/teams/new` — director-only create form; auto-generates team name from attributes.
- `/teams/[teamId]` — team detail: meta grid, roster via `TeamRosterClient`, history of ended assignments.
- `/teams/[teamId]/edit` — director-only: edit coach, season label, active status.
- `TeamRosterClient`: interactive roster table with inline transfer form + refuerzo form; Confirmar (clears new arrival), Transferir (moves primary), + Refuerzo (secondary non-primary assignment), Quitar (removes refuerzo).
- Server actions: `createTeamAction`, `editTeamAction`, `assignPlayerToTeamAction`, `transferPlayerAction`, `addRefuerzoAction`, `removeRefuerzoAction`, `clearNewArrivalAction`.
- Auto-assign B2 on new enrollment: `createEnrollmentAction` now calls `findB2TeamForAutoAssign` after charges are created; if a matching active B2 team exists for the campus + birth year + gender, creates `team_assignment` with `is_new_arrival = true` and syncs `players.level = 'B2'`.
- Player detail page: shows active team name (linked) + coach; amber warning banner when active enrollment has no team assigned.
- "Equipos" nav link added to Diario section (visible to all staff).

## 2026-03-16 (session 8)

### Phase 1B Completion + Phase 2 Kickoff (v0.8)

**Corte Diario — inline cash session controls (Option A)**
- Directors can close a cash session directly from Corte Diario without leaving the report.
- `closeCashSessionAction` now accepts a `redirect_to` hidden field (defaults to `/caja/sesion`).
- Corte Diario passes back its own URL (preserving date + campus params) so the page reloads in place after close.
- Per-campus session cards show apertura timestamp, totals, and an inline `<details>` close form (zero JS).

**Caja — prominent no-session banner**
- Replaced subtle amber pill with a full-width bordered card when no cash session is open.
- Includes explanation text and direct "Abrir sesión →" CTA.
- Happy path (session open): subtle pills remain unchanged.

**Porto Mensual — Equipos + Clases sections wired**
- New `getPortoTeamsData()` query joins teams → campuses + coaches, counts active players via `team_assignments`.
- Sections 5 (Equipos de Competición) and 6 (Clases) replaced with real tables: campus, birth year, gender, level, coach, player count.
- Section headers show aggregate totals (N equipos · N jugadores).

**Activity log filters**
- Date range (from/to), action type dropdown, actor email partial match.
- All filters applied server-side via search params. Limpiar button clears all. Result count shown when active.

**Dropout reason expansion**
- Full 34-reason Porto taxonomy was already in validation + enrollment-edit-form.
- Porto Mensual `DROPOUT_LABELS` map was stale (7 codes) — synced to full taxonomy.

**Batch baja write-off (`/pending/bajas`)**
- New director-only page listing ended/cancelled enrollments with outstanding balances.
- Checkbox-select any combination, provide a reason, void all pending charges in one action.
- Server action validates director role, only targets ended/cancelled, writes one audit log entry per voided charge.
- "Castigo de bajas →" link added to pending payments page.
- New query: `listBajaEnrollmentsWithBalance()`.

**Printer strategy (Phase 2)**
- Epson TM-T20IV arriving 2026-03-17. Will connect via Ethernet for multi-machine sharing.
- QZ Tray chosen over ePOS SDK: handles HTTPS→HTTP bridge for Vercel-hosted app, works from any machine once installed.
- Phase 2a (tonight): polish `window.print()` receipt + build Corte Diario print layout.
- Phase 2b: QZ Tray one-click integration. Corte Diario physical printout replaces CSV/PDF export for that report.

## 2026-03-15 (session 7)

### Products Catalog + Caja POS Grid (v0.6)
- Replaced "Agregar Cargo Adicional" dropdown in Caja with a McDonald's-style product tile grid (`ProductGridPanel`).
- New tables: `products`. `product_id` + `size` + `is_goalkeeper` columns added to `charges` as nullable — fully non-breaking, all existing reports unaffected.
- Migrations: `20260314120000` (products catalog + initial seed), `20260314130000` (Kit→Uniforme rename), `20260314140000` (`charges.is_goalkeeper boolean null`), `20260315000000` (drop product_categories).
- Seeded 4 initial products: Uniforme Entrenamiento ($600, hasSizes), Uniforme Partido ($600, hasSizes), Superliga Regia ($350), Rosa Power Cup ($350).
- Sizes: XCH JR · CH JR · M JR · G JR · XL JR · CH · M · G · XL. Portero toggle (violet) on uniform charges. `is_goalkeeper = null` on non-uniform charges; `false` = campo; `true` = portero. Enables clean `GROUP BY size, is_goalkeeper` for future order reports.
- Products admin page (`/products`): catalog grouped by display group, per-product KPIs (units sold, revenue, this month), size×goalkeeper breakdown table, recent 25 sales, inline create/edit forms. Only ad-hoc charge types assignable to products.

### Refactor: Drop product_categories — use PRODUCT_GROUPS constant
- Removed `product_categories` DB table (migration `20260315000000`). Having both "product categories" and "charge types" was redundant and confusing.
- Replaced with `src/lib/product-groups.ts` — 10-line frontend constant mapping display group keys to charge type code arrays.
- Create-product form auto-filters charge type options per group; single-type groups skip the dropdown.
- Mensualidades pseudo-category removed — monthly tuition is auto-generated by pg_cron, never a product.

### Branding
- App internally named **INVICTA** (Os Invictas). Site title updated. Header uses Aoboshi One (Google Font).
- Version bumped `v0.5 → v0.6`.

## 2026-03-12 (session 6)

### Caja — POS Quick Action Panel (v0.5)
- New `/caja` route: dedicated payment collection tab for front desk staff.
- Real-time debounced player search (200ms, `ilike` on name) backed by a single `search_players_for_caja()` RPC — replaces 3 sequential Supabase queries with 1 roundtrip.
- Shows all pending charges oldest-first with auto-filled balance amount.
- Fast cashier mode: panel resets to search after each payment posted.
- Phase 1 receipt: `window.print()` styled for 80mm thermal paper (`@media print`).
- `postCajaPaymentAction`: same allocation + early-bird logic as enrollment ledger, returns result instead of redirecting.

### Role System — superadmin + front_desk
- Added `superadmin` and `front_desk` to `app_roles` (migration `20260311150000`).
- Updated `is_director_admin()` to include `superadmin` — all existing policies apply automatically.
- New `is_front_desk()` and `has_operational_access()` helper functions.
- `front_desk` RLS: SELECT on all operational tables, INSERT on payments/payment_allocations/cash_session_entries. No access to audit_logs or financial aggregates.
- Role-aware nav: `front_desk` sees Caja + Jugadores only; directors see full nav.
- `layout.tsx`: canAccess now includes `superadmin` and `front_desk`.
- `roles.ts`: added `SUPERADMIN`, `FRONT_DESK`, `DIRECTOR_OR_ABOVE` constants.
- Version bumped `v0.4 → v0.5`.

### Performance
- `search_players_for_caja` RPC (migration `20260311160000`): joins players → enrollments → campuses → v_enrollment_balances in one query. Eliminates 2 extra Supabase roundtrips per keystroke.

## 2026-03-11 (session 5)

### Real Data Seed — Schema Fixes + Load
- Moved `seed_real_data.sql` out of migrations into `scripts/` to avoid Supabase CI timeout on large seed files (session 4 partial).
- Hit three NOT NULL constraint violations when running seed against preview DB:
  - `guardians.first_name` / `last_name` / `phone_primary` — real data has contacts identified by phone-only or email-only, name unknown.
  - `payments.created_by` / `charges.created_by` — historical records predate the app, no auth user attached.
- Created two migrations to relax constraints:
  - `20260311120000_guardians_nullable_name.sql`: drops NOT NULL on `first_name`, `last_name`, `phone_primary`.
  - `20260311130000_nullable_created_by.sql`: drops NOT NULL on `charges.created_by` and `payments.created_by`.
- Seed landed clean: 672 players, 694 guardians, 672 enrollments, 2678 charges, 1298 payments.

### Players List — Fix Empty List with Real Data
- Root cause: `listPlayers` was fetching all 672 active-enrollment player IDs then passing them as `.in("id", [...672 ids])`. PostgREST encodes this as a URL query parameter — with 672 UUIDs (~25KB) it exceeds URL length limits and the query silently returned empty.
- Fix: restructured query to use `enrollments!inner` in the select string, letting PostgREST generate a SQL JOIN instead of a URL-parameter filter. No large `.in()` needed for the main query.
- Phone filter still pre-resolves player IDs but the result set is always small (few guardians match a phone search).
- `EnrollmentRow` type removed from `listPlayers` path; replaced with `PlayerWithEnrollmentRow` that embeds the enrollment data.

## 2026-03-05 (session 4)

### Reports — Corte Diario + Resumen Mensual
- `src/lib/queries/reports.ts` — two query functions replacing the empty placeholder file:
  - `getCorteDiarioData({ date, campusId })`: payments posted on a given day grouped by method; returns summary tiles + detail rows (player name linked to ledger, time, method, amount, notes). Defaults to today UTC.
  - `getResumenMensualData({ month, campusId })`: charges by type + payments by method for a month; also returns active enrollment count and pending balance across active enrollments.
- `PAYMENT_METHOD_LABELS` map: Efectivo / Transferencia / Tarjeta / 360Player/Stripe / Otro.
- Corte Diario page: date + campus filter form, summary tiles (total + one tile per method), payments table with footer total row. Note in footer: times shown in UTC.
- Resumen Mensual page: month + campus filter, 4 KPI tiles, net balance line (cobrado − cargos), side-by-side tables (Cargos por tipo | Cobros por método) each with count + total + footer.

### Cargo por Equipo (Bulk Charge Admin)
- `src/lib/queries/teams.ts` — two query functions:
  - `listTeamsWithCampus()`: active teams with campus name, birth_year, gender, level for the grouped selector.
  - `listBulkChargeTypes()`: active charge types excluding auto-managed codes (`monthly_tuition`, `inscription`, `early_bird_discount`).
- `bulkChargeTeamAction` server action: validates inputs → gets active enrollments via `team_assignments` (end_date IS NULL + enrollment.status = active) → inserts one charge per enrollment. Not idempotent by design (multiple tournament charges are valid).
- `/admin/cargos-equipo` page: team selector grouped by campus (with birth year / gender / level in label), charge type selector, amount (accepts negative for credits/discounts), description. Success shows count of charges created. Warning note: not idempotent.
- Nav link added: "Cargo Equipo". Version bumped `v0.3 → v0.4`.

### Audit Log Wiring
- `src/lib/audit.ts` — `writeAuditLog(supabase, entry)` helper: inserts to `audit_logs` table, wraps in try/catch and swallows errors so audit failures never block operations.
- Wired into 5 action points (all with `after_data`, no `before_data` for Phase 1):
  - `enrollment.created` — after enrollment + initial charges inserted
  - `enrollment.ended` / `enrollment.reactivated` / `enrollment.updated` — after status change, with `dropout_reason`
  - `payment.posted` — after payment + allocations inserted, with amount + method
  - `charge.created` — after ad-hoc charge inserted
  - `charges.bulk_created` — after team bulk charge, with team_id + count

## 2026-03-04 (session 3)

### Bajas List
- `listBajas` query: fetches all ended/cancelled enrollments, deduplicates to most recent per player, excludes players with an active enrollment. Supports campus + name filters. In-memory pagination (total dataset is small).
- Players list now has **Activos / Bajas tabs** (`?view=bajas`). Bajas table: name (link), fecha inscripcion, fecha baja, dias inscrito, motivo.
- Active view unchanged; "Nuevo jugador" button hidden in bajas view.

### Inactive Player Profile
- `getPlayerDetail` now fetches `dropout_reason` and `dropout_notes` on all enrollment rows.
- Player detail page: inactive players (no active enrollment) now show a "Ultima inscripcion (baja)" card with campus, start date, dropout date, days enrolled, dropout reason + notes.
- Generic amber notice now only shows for players who have never been enrolled.

### Clickable Names in Pendientes
- `listPendingEnrollments` now includes `playerId` in each returned row.
- `PendingTable` `PendingRow` type updated; player name is now a `Link` to `/players/${playerId}`.

### Post-Signup Redirect
- `createPlayerAction` now redirects to `/players/${player.id}/enrollments/new` instead of the player detail page, enforcing the rule that all new players are immediately enrolled.

### Monthly Charge Generation (Manual + Automated)
- `src/lib/billing/generate-monthly-charges.ts` — shared core logic extracted: fetches active enrollments, looks up tuition rates (prefers open-ended `day_to IS NULL` rule, falls back to highest-amount rule), skips already-charged enrollments (idempotent), inserts charges with `NULL` created_by for system jobs.
- `src/server/actions/billing.ts` — thin server action wrapper; takes month form input, calls core, redirects with result.
- `src/app/(protected)/admin/mensualidades/page.tsx` — manual generation UI: month picker + submit button; shows `creados`/`omitidos` result or error in Spanish. Notes that pg_cron runs automatically on day 1 at 06:00 UTC.
- Migrations: `20260304000000` seeds correct tuition rules (idempotent, handles both old/new plan name); `20260304010000` adds `early_bird_discount` charge type.
- Root cause of earlier "no_rate_found" error: the original pricing migration searched for `Plan Mensual Basico` (which may not exist in some environments), silently skipping rule inserts. Fixed by the idempotent reseed migration.

### Early Bird Discount Automation
- When a payment is posted on days 1–10 of the month and it touches a `monthly_tuition` charge for the current period, `applyEarlyBirdDiscountIfEligible()` automatically inserts a **negative credit line** (`early_bird_discount` charge, `status = 'posted'`, amount = -(regular − early_bird), e.g. -$150).
- Uses a separate charge type so it doesn't conflict with the unique partial index on `(enrollment_id, charge_type_id, period_month)`.
- Idempotent: checks for existing discount before inserting. Silently no-ops on any error — discount is a bonus, never fails the whole payment.
- Ledger math: `v_enrollment_balances` sums all non-void charges including negatives, so a $750 tuition + -$150 discount + $600 payment = $0 balance correctly.

### pg_cron Automation
- Migration `20260304020000`: enables `pg_cron`, creates `public.generate_monthly_charges(p_period_month date)` as a `SECURITY DEFINER` function (bypasses RLS, runs as the defining role), schedules it at `0 6 1 * *` (day 1 of each month, 06:00 UTC).
- `charges.created_by` made nullable — pg_cron has no auth user; system-generated charges have `NULL` created_by.
- Unschedule-then-reschedule pattern with exception handling makes the migration safe to re-run.
- Replaced Vercel Cron approach (which required a cron secret env var + service role key on both Vercel and Supabase). pg_cron runs entirely inside Supabase — no HTTP, no secrets.
- Confirmed active in Supabase dashboard (`cron.job` table: `generate-monthly-charges | 0 6 1 * * | select public.generate_monthly_charges() | active: true`).

### Version Bump
- `v0.2 → v0.3`

## 2026-03-03 (session 2)

### Player List UX Overhaul
- Players list now shows **only actively enrolled players** — `listPlayers` always starts by fetching player IDs with `enrollments.status = active`, using them as the base constraint. Removed `status` player filter from UI (redundant now).
- Removed campus + status columns from player table; kept name, campus, phone, actions.
- Added **"+ Nuevo jugador"** button to players list → `/players/new`.

### New Player Creation Flow
- `src/lib/validations/player.ts` — `parsePlayerFormData`: validates player fields (firstName, lastName, birthDate, gender) + guardian fields (firstName, lastName, phone required).
- `src/server/actions/players.ts` — `createPlayerAction`: creates guardian first, then player, then `player_guardians` link (is_primary = true). Redirects to player detail page.
- `src/components/players/player-form.tsx` — `PlayerCreateForm`: two sections (jugador + tutor principal), pure server component.
- `src/app/(protected)/players/new/page.tsx` — new player creation page with error handling.

### Player Detail Page Simplified
- Removed full enrollment history table.
- Now shows: player info card, guardians table, and a **single enrollment card** for the active enrollment.
- Enrollment card: campus, plan, start date, **days since enrollment**, total charges/payments, balance (colored), links to "Ver cuenta" and "Editar inscripcion".
- If no active enrollment: amber notice + "Nueva inscripcion" button.
- Balance shown in rose (positive = owes) or emerald (zero/credit).

### Breadcrumbs
- `PageShell` updated to accept `breadcrumbs?: { label: string; href?: string }[]` prop.
- Breadcrumbs added to: players list, player detail, new player, new enrollment, edit enrollment pages.

### Version Bump
- `v0.1 → v0.2` in layout header.

## 2026-03-02 / 2026-03-03

### Business Rules Confirmed
- Full Q&A session to nail down all SDD TBDs.
- Confirmed pricing: inscription $1,800 (includes 2 training kits), tuition 2 tiers ($600 early bird days 1–10 / $750 regular days 11+), extra kit + game uniform $600 each. No penalty surcharge tier.
- Confirmed enrollment creates 2 charges (inscription + first month at $600 flat), not 3.
- Confirmed player org hierarchy: Categoría = year of birth (primary), Campus → Gender → Level (B1/B2/B3) → Team.
- SDD updated throughout to reflect all confirmed rules.

### Schema Alignment (4 migrations)
- `20260302120000` — added `players.level`, renamed `teams.age_group → birth_year int`, added `teams.level + gender`, deactivated `uniform` charge type, added `uniform_training` + `uniform_game`.
- `20260302130000` — dropped legacy `charges_amount_check` constraint (was `> 0`; replacement `charges_amount_nonzero` is `<> 0` to allow discount credit lines).
- `20260302140000` — added `pricing_plan_items` table: fixed-price catalog per plan (inscription, uniform_training, uniform_game). Indexed via unique constraint on `(pricing_plan_id, charge_type_id)`.
- `20260302150000` — corrected all placeholder pricing data: renamed plan to "Plan Mensual", deactivated "Plan Avanzado", replaced 3-tier tuition rules with 2-tier ($600/$750), set correct item amounts.

### Enrollment Creation Flow
- `getEnrollmentCreateFormContext` query: loads player, campuses, active plan, and inscription default from `pricing_plan_items`.
- `parseEnrollmentFormData` validation: campusId, planId, startDate, inscriptionAmount, firstMonthAmount, notes.
- `createEnrollmentAction` server action: verifies no active enrollment exists, inserts enrollment + 2 charges atomically, redirects to ledger.
- `EnrollmentCreateForm` component: campus dropdown, date picker, editable amounts pre-filled from DB.
- `EnrollmentCreatePage`: replaced stub at `/players/[id]/enrollments/new`, handles errors + active-enrollment guard.

## 2026-02-26

### Infrastructure and Auth
- Re-established `preview` branch flow in GitHub/Vercel/Supabase.
- Fixed OAuth callback origin logic to use current deployment origin.
- Added visible sign-in error messaging for OAuth failures.
- Diagnosed and resolved Azure provider issues in Supabase preview project:
  - provider enablement
  - secret mismatch
  - callback and redirect URL mismatches
- Confirmed preview login reaches protected routes successfully.

### Process and Planning
- Added `docs/branching-workflow.md` to standardize preview-first delivery.
- Added `docs/roadmap-execution.md` with phase priorities and delivery criteria.

### Product
- Replaced dashboard placeholder with live KPI cards:
  - active enrollments
  - pending balance
  - payments today
  - payments this month

### Product Iteration
- Refactored dashboard into modular units to avoid page bloat:
  - `dashboard-filters` component
  - `kpi-card` component
  - `trend-card` component
  - dedicated dashboard query module
- Added dashboard filters:
  - campus selector
  - month selector
- Added month-over-month trend cards:
  - payments (selected month vs previous month)
  - charges (selected month vs previous month)

### Security and Performance Guardrails
- Added `docs/security-performance-baseline.md` with mandatory PR gates.
- Hardened bootstrap admin fallback to never grant access in production runtime.

### Billing and Collections Milestone
- Implemented full enrollment ledger screen with live data:
  - summary totals (cargos/pagos/saldo)
  - detailed charges table
  - detailed payments table
- Implemented payment posting flow:
  - server-side validation
  - amount allocation to pending charges
  - success/error feedback in Spanish
- Implemented charge creation flow:
  - active charge type selection
  - server-side validation and insert
  - redirect back to ledger with confirmation
- Implemented pending payments workflow:
  - live list from active enrollments with positive balances
  - filters by campus/team/balance bucket/overdue status
  - quick `tel:` call action and direct link to enrollment ledger
- Added preview sample data seed script for realistic QA in preview database.
## 2026-04-01

### Preview Debug Personas
- Extended the preview-only `Ver como` tool with built-in debug personas so permission testing no longer depends on real Azure/Supabase users existing in preview.
- Added preset personas for:
  - Contry front desk
  - Linda Vista front desk
  - multi-campus hub front desk
  - director admin
- Wired personas into:
  - top-bar debug dropdown
  - recent debug chips
  - `/admin/debug-view`
- Kept the tool actor-safe:
  - the real superadmin actor still owns the controls
  - switching into a restricted persona does not hide `Ver como`
  - debug mode remains read-only
- Kept environment safety:
  - available only in preview/local
  - hard-disabled in production

### Permissions Hardening
- Added a shared permission helper layer for route/action gating:
  - director-only page enforcement via `requireDirectorContext()`
  - operational/campus-scoped record checks for players, guardians, and enrollments
- Hardened direct-URL access on director-only surfaces:
  - teams
  - products
  - configuracion
  - merge players
  - mensualidades
  - cargo por equipo
  - weekly/monthly/Porto reports
- Expanded app-layer campus checks for front desk record editing:
  - player edit
  - guardian edit
  - enrollment-linked actions
- Added campus-aware RLS helper functions and replaced broad `is_front_desk()` policies on core operational tables:
  - players / guardians / player_guardians
  - enrollments
  - teams / team_assignments
  - charges
  - payments / payment_allocations
  - cash sessions / cash session entries
  - corte checkpoints
- Tightened payment and billing actions so manual monthly generation, team bulk charges, and payment voiding remain director-only at the app layer.

### Caja / 360Player Recording
- Added `360Player` as a standard payment method in Caja and kept the normal posted-payment ledger flow intact.
- `360Player` payments now generate normal internal payments, allocations, folios, and remain searchable in `Recibos`.
- Disabled automatic receipt printing for `360Player` payments in Caja and the enrollment-ledger payment form; receipts remain available for manual reprint.

### Corte Diario
- `360Player` payments now remain visible in the Corte Diario transaction list, but are excluded from:
  - `totalCobrado`
  - method summary totals
  - charge-type totals
  - printed Corte Diario total output
- Added a visible external-payment tag/note so staff can distinguish recorded external payments from cash-session income.

### Front Desk Polish Follow-Up
- Cleaned up `/players` after first live usage:
  - kept the main campus/category/gender/name/phone filters inline
  - moved secondary data-quality + collections filters into `Filtros avanzados`
- Added a direct player-profile shortcut in Caja:
  - when a selected player has a real `playerId`, their name in the Caja header now links to `/players/[id]`
- Updated front-desk terminology:
  - `Regreso` -> `Reingreso`
  - `Uniforme Partido` / `Uniforme de Partido` -> `Uniformes de Juego`
- Reopened and fixed the live thermal-ticket accent bug properly:
  - replaced the corrupted `printer.ts` literals with a clean file
  - added shared printer-text normalization before CP1252 base64 encoding
  - this now covers standard receipts, Caja receipt printing, receipt reprints, and thermal Corte output
- Extended Corte Diario follow-up polish without changing the current close/print workflow:
  - added checkpoint-history browsing on the main Corte page
  - added historical summary access and historical `Reporte detallado`
  - expanded detailed-report KPIs with method totals plus clearly separated excluded `360Player` count/amount
  - added product-name detail lines for real product sales on the thermal Corte ticket while keeping the main category breakdown compact

### Front Desk Polish Mini-Pass
- Corrected the uniform terminology follow-up from plural to singular:
  - `Uniformes de Juego` -> `Uniforme de Juego`
  - added a tiny idempotent data migration so the DB-backed product and charge-type labels also resolve singular
- Extended `Reporte detallado` again without changing its existing KPI cards:
  - added a separate `Por tipo de cargo` summary block under the KPI area
  - it reuses the same checkpoint charge-type totals already shown in Corte Diario, so rows like `Mensualidad`, `Liga`, `Copa`, `Torneo`, and `Uniforme de Juego` appear when present
- Cleaned the remaining mojibake on the touched detailed Corte surface:
  - fixed the subtitle separator
  - fixed the `Conceptos pagados` join separator

### Contry Historical Regularization v1
- Added a dedicated `/regularizacion/contry` workflow so Linda Vista hub staff can regularize missing paper-era Contry payments inside the app without manual DB edits.
- The new flow is intentionally Contry-only and account-first:
  - search Contry players
  - open one enrollment/account at a time
  - review charges, balance, and existing payments
  - post a historical payment with required real `paid_at`
- Historical regularization entries are real posted payments, but with dedicated guardrails:
  - `operator_campus_id` is forced to Contry
  - `external_source` is tagged as `historical_catchup_contry`
  - cash regularization entries do not attach to the current open cash session
  - no thermal auto-print is triggered from the regularization screen
- Reused the existing payment/allocation engine instead of creating a fake migration record type, so balances, folios, receipts, and reporting continue to work off real payments and real historical dates.
- Extended `search_receipts(...)` and the app lookup surfaces so these historical Contry entries can be identified later in:
  - `Recibos`
  - `Actividad`
  - superadmin `Auditoría`
- Added a navigation entry for users who can operate Contry, so the hub workflow feels intentional rather than like a DB-side cleanup trick.

### SQL-Side Finance Report Hardening v1
- Moved the remaining finance aggregation for the main summary/reporting surfaces out of app-memory reducers and into SQL RPCs backed by reusable finance facts helpers.
- Added a canonical SQL finance layer for:
  - payment facts by `paid_at` + `operator_campus_id`
  - charge facts by enrollment campus for monthly emitted-charge summaries
  - access-aware month-window helpers so all touched reports use the same Monterrey-local buckets
- Hardened finance ownership semantics so the affected reports now agree on:
  - payment reporting by `operator_campus_id`
  - collection timing by real `paid_at`
  - Contry historical regularization entries counted in their real historical period
- Replaced the app-side aggregation paths behind:
  - `/dashboard`
  - `/reports/resumen-mensual`
  - `/reports/corte-semanal`
- Added visible finance separation on all three touched surfaces:
  - `360Player` amount/count shown separately while still included in broader finance reporting
  - `Regularización histórica Contry` amount/count shown separately while still counted by real `paid_at`
- Left `Recibos` unchanged because it was already the intended model:
  - SQL-backed
  - access-aware
  - thin TypeScript adapter only

### Preview Migration Chain Hotfix
- Fixed the preview migration chain for the Contry historical regularization release:
  - `20260404183000_contry_historical_regularization_v1.sql` now drops `search_receipts(...)` before recreating it with the added `external_source` column
- Reason:
  - Postgres does not allow `create or replace function` to change the returned OUT-column shape in place
  - preview `db push` was blocking on that older migration, which in turn blocked the new SQL finance hardening migration from applying
- Follow-up SQL hotfix:
  - renamed reserved-word CTEs inside `20260404223000_sql_finance_report_hardening.sql`
  - preview remote push was failing on `with window as (...)`, so the migration now uses safe names and can apply cleanly

### Local Dev + Dependency Maintenance
- Ran `npm audit fix` and cleared the previously reported vulnerabilities.
- Local dependency result:
  - Next.js resolved to `16.2.2`
  - lockfile/transitive vulnerable packages were updated to their patched versions
- Local dev workflow is now verified on this machine:
  - `.env.local` was reset to the linked preview Supabase project with valid local runtime keys
  - local dev server now starts successfully
  - `http://localhost:3000/login` responds correctly
- Note:
  - Vercel preview env pull returned blank Supabase keys for this project, so local dev was fixed by using the linked Supabase preview project directly instead of trusting the pulled Vercel preview env file

### Absence / Injury Incidents With Optional Monthly Omission (v1.8.0)
- Added `enrollment_incidents` as a new operational exception model for active enrollments.
  - incident types: `absence`, `injury`, `other`
  - incidents can be recorded with no billing effect
  - or can carry `omit_period_month` to intentionally skip a future/current monthly tuition charge
- Extended the enrollment account page (`/enrollments/[id]/charges`) with a new `Ausencias / lesiones` section.
  - front desk and directors can create incidents from the ledger
  - omission is now an explicit choice, not an automatic consequence of absence/injury
  - active rows can be cancelled or replaced
  - history keeps `Solo registro`, `Omisión activa`, `Usada`, and `Cancelada` states visible
- Patched the live DB `generate_monthly_charges(...)` function so it now:
  - still skips scholarship enrollments
  - also skips enrollments that have an active incident with `omit_period_month = p_period_month`
  - marks those omission incidents as used via `consumed_at`
  - returns split skip counts for existing-charge, scholarship, and incident-driven omissions
- Updated `/admin/mensualidades` to surface the new skip breakdown instead of collapsing all skipped rows into one generic message.
- Added audit events for the new workflow:
  - `enrollment_incident.created`
  - `enrollment_incident.cancelled`
  - `enrollment_incident.replaced`
- Future boundary kept explicit:
  - this is a full-month manual omission tool only
  - partial-month absences remain incident records only and do not introduce proration or attendance-based finance rules yet

### Incident Date-Range Follow-Up (v1.8.1)
- Extended `enrollment_incidents` with optional `starts_on` and `ends_on` dates so front desk can capture real absence / recovery windows like “10 days” or “2 weeks”.
- The incident form on the enrollment ledger now supports:
  - `Desde`
  - `Hasta`
  - optional omission month still remains separate
- Validation now blocks invalid ranges:
  - `Hasta` cannot be earlier than `Desde`
  - `Hasta` cannot be provided without `Desde`
- Activity and superadmin audit views now include the recorded date window when present.
- No billing behavior changed in this patch:
  - date ranges are informational/operational
  - only `omit_period_month` still affects monthly charge generation

### Active Incident Indicators (v1.8.2)
- Added a shared `activeIncident` status derived from enrollment incidents only when the recorded date window is active today.
- `Jugadores` now shows soft pills for `Lesión activa` and `Ausencia activa`.
- Player profile now shows a top-level status banner for active injuries or absences.
- `Caja` now shows a non-blocking warning banner on the selected player while keeping pending charges and payment actions unchanged.
- This patch is indicator-only:
  - no billing changes
  - no charging restrictions
  - incidents without a date range do not appear as active warnings
