# Post-Alpha Roadmap 🗺️ Dragon Force Ops (INVICTA)

Live testing started 2026-03-19. Session 2: 2026-03-26.
Updated continuously. Last updated: 2026-04-28.
Strategic architecture phases (schema separation, parent app, Stripe, multi-tenancy) added 2026-04-22 — see `Later Phases` section.

Current preview release line: `v1.16.76`

Current working note: after the `v1.16.68` production merge, new implementation should continue on `preview` until the next explicit production release.

Near-term UI/workflow planning note: operations has requested a larger UI pass; exact scope is pending, but it should be planned against the current live surfaces instead of mixing unrelated refactors into one release.

New 2026-04-28 planning items logged: navigation return-state UX, nutrition circunferencia + parent PDF reports, sports grouping shift from ambiguous `Nivel` toward explicit `Futbol Para Todos` / `Selectivos`, and attendance workflow simplification/automation.

---

## Current Operational Tracks

### Priority 0

0. Role permissions audit and stabilization
   - new audit doc:
     - `docs/role-permissions-audit.md`
   - current goal:
     - define exactly what every role can see and edit
     - align app routes, navigation, server actions, and Supabase RLS
     - stop preview debug from masking production-only role/RLS failures
   - active incidents under this lane: still under live verification
     - ✅ Linda Vista `director_deportivo` (Julio) empty Inscripciones Torneos — fixed by campus fallback
     - ✅ Linda Vista `nutritionist` (Denisse) empty player list — fixed by campus fallback
     - ✅ Caja front desk new-player intake pricing error — fixed after production Vercel env audit found a Supabase URL/service-role key project mismatch; `v1.16.54` adds a guard to fail fast on that mismatch in the future, and `v1.16.56` prevents local `.env*` files from being included in manual Vercel CLI deploys
     - ✅ Production-safe access diagnostic — `v1.16.57` adds `Super Admin > Auditoria accesos` plus `docs/production-access-runbook.md`
   - next required work:
     - confirm Julio and Denisse can access their data after deploy
     - confirm Julio's global sports scope shows both campuses without money amounts
     - use the new runbook after future Vercel env changes or Supabase secret rotations

1. Late-April May tuition pricing hotfix
   - `v1.16.62` fixes the new-enrollment pricing helper so day-21+ April enrollments carry May tuition at the May plan amount (`700`) instead of the April enrollment-start plan amount (`600`)
   - targeted repair migration is intentionally narrow:
     - May 2026 `monthly_tuition`
     - non-void charges at `600`
     - enrollment start dates from `2026-04-21` through `2026-04-30`
   - already-paid affected accounts are not grandfathered; correcting the charge to `700` can leave `100` pending, which matches the intended accounting result
   - cron note:
     - monthly tuition remains Supabase `pg_cron`, not Vercel Cron
     - May generation is expected to use `generate_monthly_charges('2026-05-01')`, resolving the May day-1 tuition plan at `700`

2. Historical regularization workspace hardening
   - `v1.16.67` replaces the old staff-facing `Regularización Contry` surface with a new superadmin-only workspace:
     - route: `/admin/regularizacion-historica`
     - legacy `/regularizacion/contry` now redirects only for superadmin and rejects everyone else
   - scope:
     - both Contry and Linda Vista
     - historical payment posting
     - historical monthly tuition create/reprice using explicit historical pricing datetime
     - exceptional product/additional charge creation
   - safety posture:
     - selected enrollment forces the campus context for repair postings
     - no Caja-session linking
     - no routine front-desk exposure in navigation or route access
     - new historical repair records use generic sources:
       - `historical_regularization_admin`
       - `historical_catchup_admin`
   - reporting follow-up included in the same pass:
     - dashboard / resumen mensual / corte semanal now treat both old and new historical payment sources as the same `Regularización histórica` bucket
   - `v1.16.68` adds direct charge voiding inside the same workspace:
     - pending charges can now be anulated from the historical ledger table
     - uses the same guarded void logic as the regular enrollment-account page
     - keeps the user inside `Regularizacion historica` after success/error instead of forcing a second workflow
   - remaining follow-up:
     - live-test Linda Vista historical repricing cases end-to-end
     - update remaining permission/reference docs that still mention the old staff-facing `Regularización Contry` wording

3. `Nuevas Inscripciones` intake lane
   - `v1` nutrition foundation is now implemented:
     - new campus-scoped `nutritionist` role
     - dedicated `Nutricion` menu lane with `Panel` + `Toma de medidas`
     - historical `player_measurement_sessions` model
     - derived intake queue based on missing first measurement for the active enrollment
   - `v1.16.60` adds the shared `/new-enrollments` board:
     - last-30-days default
     - campus-first/all-campus scope
     - sports and nutrition workflow status chips
     - role-specific quick links without finance data
   - remaining follow-up:
     - `v1.16.61` adds OMS growth curves to the nutrition-safe player profile:
       - BMI-for-age and height-for-age for 5-19 years
       - weight-for-age for the official OMS 5-10 year range
       - BMI/Z-score/percentile/classification derived from existing `player_measurement_sessions`
     - additional body metrics beyond `weight_kg` / `height_cm`
     - richer nutrition KPI/analytics and future workflow polish
     - inline assignment/capture actions if the link-first workflow proves too slow

4. Collections / pending-tuition board split
   - `v1.16.58` implemented the functional split:
     - `/llamadas` now owns the old balance/call follow-up workflow
     - `/pending` now owns the tuition-only board for unpaid monthly tuition
   - current `Pendientes` behavior:
     - campus-first and category-card overview modeled after `Inscripciones Torneos`
     - click into each `Cat` card for deeper review
     - optional `month=YYYY-MM` filter
     - chips for `1 mes`, `2 meses`, `3+ meses`, and overdue status
     - no money amounts, tutor contact info, phone, receipts, or Caja actions
   - `v1.16.59` polish:
     - campus cards remain visible while a single campus is selected
     - KPI cards drill into `1 mes`, `2 meses`, and `3+ meses` player lists
     - chip alignment and detail-row layout were tightened after live screenshots
   - `v1.16.66` critical data-completeness hotfix:
     - fixed `Pendientes` undercounting on large campuses caused by the tuition loader querying too many enrollment IDs in a single Supabase request
     - root cause:
       - very large `.in(enrollment_id, [...])` requests can exceed request/header limits
       - wide historical tuition reads can also hit the default `1000` PostgREST row cap
       - result: the board could render a partial pending-tuition dataset even while individual player profiles were correct
     - fix:
       - small enrollment-ID batches plus paged charge reads until each batch is exhausted
       - intended to restore complete pending-tuition counts for both campuses without changing account data or finance logic
   - follow-up:
     - live-test role access with front desk and directors
     - tune urgency colors/counts after a few days of production usage
     - cross-surface large-query audit:
       - `Pendientes` exposed a scaling bug caused by oversized `.in(...)` requests plus row-cap truncation on large enrollment/charge sets
       - `Panel` / monthly summary RPC surfaces look safe from this exact failure mode
       - `Corte Diario` does not currently show the same issue at present payment volumes
       - next hardening target is `Jugadores`, where all-campus / `pendingMonth` / enrollment-linked follow-up queries still use the same risky pattern and can fail at current prod scale
       - goal: chunk/paginate or move remaining high-risk aggregations into SQL/RPC before they become another operations incident

5. Product and competition rules rework follow-up
   - continue the pending rework for product and competition rules
   - `v1.16.75` adds the first scoped-product capability:
     - products can optionally be restricted to one or more training groups
     - unrestricted products keep current behavior
     - Caja filters restricted products by the selected player's active training-group assignment and server actions enforce the same rule
   - include rule cleanup needed for current operations, not only the longer sports rethink
   - likely areas:
     - product typing and competition linkage rules
     - signup / eligibility rules
     - cross-surface consistency between product setup, sports boards, and finance interpretation
   - planning note:
     - this should be shaped with the current operational surfaces in mind, especially `Inscripciones Torneos`, instead of reviving heavier abstractions prematurely

6. Attendance tracking v1
   - `v1.16.63` adds internal attendance tracking on preview:
     - campus-scoped `attendance_admin` role
     - top-level `Asistencia` lane with `Hoy`, `Horarios`, and `Reportes`
     - recurring class-team schedule templates and idempotent Supabase `pg_cron` session generation
     - touch-friendly attendance capture with incident prefill from active absence/injury incidents
     - cancellation flow that excludes sessions from attendance-rate calculations
     - player-profile attendance summary and director dashboard weekly attendance KPI
   - `v1.16.64` starts the `Training Groups` split on preview:
     - adds first-class `training_groups`, `training_group_coaches`, and `training_group_assignments`
     - adds `Asistencia > Grupos` for group catalog, coach linking, guided review, and safe bulk assignment of unambiguous matches
     - regular training attendance now resolves from training groups while match/special attendance stays on competition teams
     - `/new-enrollments` now treats sports-complete as active training-group assignment, not competition-team assignment
     - player profile now shows training group separately from competition team(s)
     - tournament flow remains on `teams`, `team_assignments`, `tournament_source_teams`, and `tournament_squads`
   - `v1.16.65` adds a bulk creator in `Asistencia > Horarios`:
     - choose campus + weekdays + effective start date
     - auto-create missing weekly templates for all active training groups with seeded time slots
     - skips projected/no-time groups and avoids duplicating active overlapping templates
   - continuation follow-up:
     - add an in-app `Generar sesiones` shortcut so staff can materialize `attendance_sessions` for the current/selected week without needing Supabase SQL
     - make the difference between weekly templates (`Horarios`) and concrete generated sessions (`Hoy`) explicit in the UI
     - keep Supabase `pg_cron` as the default weekly generator, but add a safe manual backfill/regeneration path for live operations
   - safety boundaries:
     - parent-facing attendance remains out of scope
     - coach login/workflows remain deferred
     - no automatic baja trigger
     - no backfill from the old Excel attendance export
     - no changes to Caja, finance, enrollment, nutrition, or existing sports signup workflows
   - follow-up before production hardening:
     - review whether attendance should be driven by `Nivel` instead of `teams`
     - see `docs/training-groups-model-analysis.md` for the recommended `Training Groups` vs `Teams` split
     - adjust schedule templates, session generation, roster resolution, reports, and UI copy if `Nivel` becomes the operational attendance grouping
     - preserve the current v1 preview implementation until the final field workflow is confirmed
     - avoid migrating production attendance data until the grouping model is locked

7. `Jugadores` spreadsheet-style roster view
   - `v1.16.69` adds the first app-native answer to the old Excel workbook workflow:
     - planning doc: `docs/jugadores-spreadsheet-view-plan.md`
     - route state: `/players?view=groups`
     - read-only, campus-scoped, training-group organized roster
     - permanent global public player IDs in `DF-0001` format
     - last 3 tuition months rendered as compact status/date shorthand
   - v1 intentionally excludes product/tournament shorthand columns:
     - SLR / CECAFF / uniform cells need cleaner product and competition semantics before they become app-level indicators
     - revisit after the product/competition rules rework
   - `v1.16.70` UI/performance polish:
     - campus selector changed from dropdown to large buttons
     - gender buttons added below campus selection
     - gender filter now trims the grouped roster query and rendered rows for snappier scanning
   - `v1.16.71` follow-up:
     - `/players` now defaults to the spreadsheet-style grouped roster
     - old active list remains available at `/players?view=active`
     - nutrition gets a parallel grouped roster in `Toma de medidas` with no finance/payment/tuition fields
   - `v1.16.72` adds category/YOB buttons below gender controls in both grouped roster views
   - `v1.16.73` orders `Jugadores` grouped sections by YOB from youngest to oldest and prefixes section titles with category/gender
   - hidden sports/WIP surface note:
     - old/hidden `Equipos`, tournament management, and competition/squad surfaces should stay untouched for now
     - future decision needed: promote, rebuild, or retire each surface after the rules pass
   - follow-up:
     - validate staff scanning comfort against the live Contry/Linda Vista workbooks
     - decide whether this view should later export to Excel using the same grouping/query source
     - keep the separate `Jugadores` query-hardening lane open for the existing list path

8. Navigation return-state UX pass
   - goal:
     - detail drilldowns should return users to the exact campus/filter/view context they came from
     - avoid resetting to default campus or default filters after using back links
   - first target:
     - `Pendientes` category and KPI drilldowns
     - preserve campus, month, bucket, category/YOB, and selected filter state when returning to the board
   - later targets:
     - `Jugadores` grouped roster and player profile returns
     - `Inscripciones Torneos` category/detail returns
     - `Nuevas Inscripciones` filtered board returns
     - nutrition grouped roster and nutrition profile returns
   - implementation guidance:
     - prefer explicit query params or `returnTo` URLs over fragile browser-only state
     - keep role/campus scoping enforced server-side even when restoring UI state

9. Nutrition v2 metrics and parent report exports
   - add `Circunferencia` measurement support after confirming exact fields:
     - likely waist, arm, or other nutritionist-specified circumference fields
     - store historically on measurement sessions, not as player-level overwrite fields
   - nutrition profile follow-up:
     - render new circumference metrics in latest summary and history
     - chart/trend where the data is meaningful
     - preserve the nutrition-safe boundary: no finance, Caja, payment, charge, or admin data
   - parent PDF report:
     - generated from nutrition-safe data only
     - include OMS curves, latest measurements, deltas/history, and nutritionist notes/recommendations
     - include a notes field at generation time so the nutritionist can personalize the report
     - require authorized nutrition/director access and campus scope checks
   - open decisions:
     - exact circumference fields and labels
     - report branding/layout
     - whether reports are generated on demand only or stored for later download

10. Sports grouping model simplification: program over `Nivel`
   - planning direction:
     - move away from ambiguous `Nivel` as the primary grouping concept
     - make `Futbol Para Todos` vs `Selectivos` an explicit sports program axis
     - keep training groups as the daily practice roster model
     - keep `teams` as the competition/tournament roster model
   - affected surfaces to audit before implementation:
     - `Jugadores` grouped roster
     - `Nuevas Inscripciones` sports completion
     - `Asistencia` schedules/sessions/rosters
     - `Inscripciones Torneos`
     - `/teams` and hidden sports WIP surfaces
     - products restricted by training group
   - migration posture:
     - do not remove `players.level` yet
     - treat existing level strings as display/fallback until the new program/group fields are proven
     - avoid repointing tournament objects to training groups

11. Attendance workflow simplification and automation
   - goal:
     - make attendance usable for normal field/admin users without exposing unnecessary schedule-template internals
   - UX follow-up:
     - make `Hoy` clearly show generated sessions and explain empty states
     - simplify the session capture path for regular users
     - keep advanced schedule/template controls for directors/superadmin
   - automation follow-up:
     - keep Supabase `pg_cron` as the default weekly generator
     - add an in-app manual `Generar sesiones` / regenerate-week action for authorized users
     - keep generation idempotent and safe for backfill
   - boundaries:
     - no automatic baja trigger yet
     - coach login remains deferred
     - no finance, Caja, nutrition, or tournament-payment changes in this lane

### Immediate Sequence

1. Finance drift monitoring + anomaly logging
   - add a dedicated monitoring lane for ledger/account drift discovered through the new `Diagnóstico financiero` panel
   - focus first on anomaly visibility, not silent auto-repair:
     - canonical balance vs derived ledger balance mismatches
     - posted payments with zero allocations
     - duplicate same-period tuition rows
     - overapplied charge math
     - suspicious void/refund/reassignment side effects
   - session 95 follow-up:
     - added a read-only finance diagnostic exporter so prod accounts can be analyzed locally without exposing prod credentials in chat
     - use the exporter output to separate safe bulk-repair candidates from manual-review accounts before any prod write path is introduced
   - session 96 follow-up:
     - refined exporter classification so `payment_reassign_delicate` by itself lands in `warning_only` instead of the auto-repair bucket
     - added a finance repair-planning script that simulates the cleanup pass and emits exact constrained-repair payloads only for RPC-ready accounts
     - latest prod read-only planning split:
       - 20 `warning_only`
       - 23 `manual_review`
       - 8 targeted repair candidates
       - only 5 of those 8 are currently safe for the first bulk `repair_payment_allocations` pass
       - keep the remaining 3 in manual toolkit review because they still leave residual credit after the simulated rewrite
   - session 97 follow-up:
     - added the controlled finance repair apply script for the preplanned allocation rewrites
     - executed the first prod cleanup pass on the 5 RPC-ready accounts after a matching-state dry-run
     - stable post-pass prod snapshot:
       - anomalous accounts: `50`
       - `auto_repair_candidate`: `3`
       - `manual_review`: `23`
       - `warning_only`: `24`
     - next decision for this lane:
       - inspect the remaining 3 actionable accounts separately
       - decide whether the 24 warnings should stay triage-only or be further reduced on purpose
   - session 98 follow-up:
     - added `Escaneo profundo` to `Sanidad financiera` so the page can widen its candidate universe without making the default load always pay that cost
     - blocked voiding/refersing payments that already have refunds, closing another mutation path that can leave contradictory finance history
     - manually reduced the remaining hard void-allocation corruption on `Ignacio F. Belmares Briones` and `Marcelo Rodríguez Pedraza`
     - residual-credit-only states are now treated as warnings by the exporter instead of auto-repair candidates
     - only one truly unresolved manual prod account remains:
       - `Iker Alejandro Arenas Garza`
     - next product/ops question for this lane:
       - decide whether `payment_reassign_delicate` and pure carry-forward credit should remain top-level warnings or be demoted to lower-level account notes only
   - session 99 follow-up:
     - added scheduled finance reconciliation snapshots so global drift can be monitored in the background without turning every admin page load into a heavy deep scan
     - `/admin/finance-sanity` now exposes the latest automatic snapshot timestamp plus the stored drift summary
     - page-side snapshot reads degrade safely if the migration has not been applied yet
     - next cleanup question remains the same:
       - define which warning-only historical shapes should count as true anomalies versus acceptable review-only operational noise
   - session 100 follow-up:
     - deep scan now expands to the full active enrollment candidate set so warning-only delicate accounts are visible during intentional review
     - the sanity-page hero state now separates warning-only review items from real correction-grade drift
     - after `Iker Alejandro Arenas Garza` was corrected, the remaining prod queue is now entirely manual-review plus warning-only work
   - session 101 follow-up:
     - confirmed the remaining `manual_review` queue was not actually broken-money work; it was one repeated combo of:
       - `payment_reassign_delicate`
       - `repricing_unsafe_monthly_tuition`
     - exporter classification now treats that shape as `warning_only`
     - remaining cleanup lane is therefore warning/advisory review, not true correction backlog
   - session 102 follow-up:
     - added a safe warning-normalization mode to the repair planner for tuition-first cleanup of mixed future-monthly repricing cases
     - executed that batch on prod only for accounts that simulated fully clean after the rewrite
     - result:
       - `20` warning-only accounts cleared
       - prod anomaly queue reduced from `49` to `29`
       - remaining queue is now:
         - `24` `payment_reassign_delicate`
         - `3` `payment_reassign_delicate + repricing_unsafe_monthly_tuition`
         - `2` `payment_partial_allocation + unapplied_credit`
     - next cleanup question for this lane:
       - decide the operational rule for true zero-warning cleanup on the remaining delicate/shared-source histories
     - explicit deferred cleanup note:
       - the `24` remaining `payment_reassign_delicate` accounts should stay on the roadmap as unfinished cleanup debt
       - they are not currently showing canonical/derived drift, but they still represent fragile historical allocation structure
       - revisit them in a later dedicated pass instead of treating the reduced queue as a finished state
   - session 94 follow-up:
     - payment void now rebalances remaining posted credit automatically after releasing the voided payment allocations
     - keep the cleanup pass open for legacy damaged accounts that were already corrupted before the fix landed
   - goal: catch problematic accounts early and give `superadmin` a system-level way to review new drift instead of only discovering it manually profile by profile
2. Year-of-birth + account-navigation regression pass
   - reopen the old "year of birth visible everywhere" goal as a targeted follow-up on the surfaces still missing it:
     - enrollment `Cargos y Cuentas`
     - `Regularización Contry` player/account workspace
   - also fix account-page navigation polish:
     - player name should link back to the player profile
     - breadcrumbs on account/detail pages should behave as real links wherever the route context supports it
3. Sports lane rethink based on live usage
   - keep the temporary `Inscripciones Torneos` board as the currently successful operational surface
   - treat the heavier hidden competitions implementation as a discovery branch, not the final product shape
   - next sports planning pass should pivot toward what operations will actually need next:
     - match schedules
     - results
     - calendars
     - lighter competition management that matches the working signup board instead of fighting it
4. Attendance planning lane
   - bump attendance up as the next major discovery/build candidate after the current urgent fixes
   - planning should cover:
     - daily operational attendance capture
     - coach-facing workflow
     - reporting / follow-up visibility
     - how it should coexist with the current export-only attendance workbook
5. `#58` Director Deportivo dashboard
   - v3 now in progress on preview:
     - new `director_deportivo` role
     - sports-only dashboard
     - competition signups recognized from paid linked products
     - squad-building on top of secondary team assignments
     - `/teams` is being rebuilt into the actual `Equipos Base` workflow instead of introducing a second roster model
     - competition gender is now explicit (`Varonil`, `Femenil`, `Mixto`)
   - Julio discovery update:
     - `Equipos Base` are the real operational starting point
     - for a normal competition, the default roster should be `Equipo Base` filtered by fully paid signups
     - the main dashboard should prioritize category/team signup progress, not giant competition-wide team lists
     - keep open for a significant simplification pass before more sports build-out
6. `#38` Copas / Torneos management
   - absorbed into the same preview sports lane so competitions, source teams, and squads are manageable from one surface
   - source-team attachment now needs to stay aligned with campus + gender + birth-year rules
7. `#59` team-building / assign available players
   - first pass also absorbed into the sports lane:
     - signed players awaiting squad assignment
     - regular vs refuerzo assignment
     - per-squad target and refuerzo-cap tracking
     - base-team placement remains the prerequisite source of truth
8. Panel KPI + dashboard follow-up
   - add drill-downs for pending tuition by category/campus plus trend charts for payments and altas/bajas
9. then return to medium-priority operational polish items such as attendance export follow-up, player-profile date cleanup, and uniforms/admin utility passes

Time-sensitive reminders:

- After the April 16, 2026 special tuition window, restore the monthly repricing cron from `1 6 16 * *` back to the normal `0 6 11 * *`.
- Do not let this temporary schedule drift into May 2026 unnoticed.

Notes:

- finance drift monitoring is now active as a real hardening lane:
  - shared anomaly snapshots drive the enrollment diagnostic panel, mutation-triggered anomaly auditing, and `/admin/finance-sanity`
  - anomaly state changes now write `finance.anomaly_detected` / `finance.anomaly_resolved` into `audit_logs`
  - `/admin/finance-sanity` now includes active anomaly review plus recent anomaly events
  - v1 remains superadmin-facing and diagnostic only
  - first live triage follow-up now landed:
    - charge voids now release allocations before marking the charge `void`
    - global anomaly review is now stricter about what counts as a real active anomaly, so normal carry-forward credit states stop flooding the queue
  - next step for this lane:
    - inspect the remaining post-hotfix anomaly queue and decide which legacy accounts need toolkit repair vs targeted one-off cleanup
- year-of-birth + account navigation polish has started landing:
  - dedicated enrollment account page now shows linked player context and functional breadcrumbs
  - `RegularizaciÃ³n Contry` selected-account header now keeps birth year visible
- player-account ledger visibility polish is now active:
  - shared charges/payments tables are being compressed into stacked cells so actions stay visible without normal horizontal scrolling
  - player profile active-account ledger now stacks vertically instead of forcing charges/payments into a cramped side-by-side layout
  - keep one follow-up polish pass open if smaller laptop widths still crowd these surfaces in live use

- front desk payment-control feedback has already landed:
  - `Método` selection is explicit button-based in Caja and `Regularización Contry`
  - normal live payments now route through `Caja` only
  - `Panel` campus filters now react immediately without extra apply/clear buttons
- auth/navigation guardrail now in place:
  - logged-in staff land on `/inicio` instead of the financial dashboard by default
  - sports-only users are blocked from `/dashboard` and redirected to `/inicio`
- sports access/admin follow-up:
  - `director_deportivo` now supports both campus-specific scope and `Todos`
  - accidental duplicate player creation during slow intake submits now has a client-side submit lock, but keep a stronger idempotency/back-end duplicate-prevention pass on the backlog if real-world repeats continue
  - immediate auth follow-up now landed:
    - `director_deportivo` users also need self-read access to their own role/campus reference data during protected-layout bootstrap
    - otherwise login can succeed while the app still resolves them as role-less and blocks entry
  - session 103 hardening:
    - protected-app role bootstrap now resolves `user_roles` and active campuses through the trusted server admin client instead of depending on user-scoped RLS for those reference reads
    - this keeps campus-scoped specialist roles from getting locked out by drift in self-read reference policies
  - session 104 emergency fallback:
    - auth bootstrap now prefers the original session-scoped role/campus reads and uses the admin client only as a fallback recovery path
    - goal: prevent a production-wide lockout if the trusted bootstrap path returns empty reference data
- front-desk intake hardening follow-up:
  - the one-page `Nuevo jugador` intake now performs its multi-step insert/rollback sequence through the trusted server admin client after normal auth + campus checks pass
  - goal:
    - stop Caja/front-desk enrollment intake from failing on tutor/player/link creation because of brittle intermediate RLS edges during the staged create flow
- the `Deportivo` sidebar section is intentionally hidden for now while the sports workflow is being simplified
  - the sports routes still exist for direct testing/admin access
  - this is a navigation hide, not a rollback of the sports lane
- sports operations are now the top product priority because tournament organization is becoming operationally urgent
- live usage update:
  - the temporary `Inscripciones Torneos` flow has matched real front-desk operations better than the heavier hidden competition-management surfaces
  - do not assume the current hidden sports-management implementation is the final product direction
  - the next sports planning pass should start from the successful paid-signups board and extend outward toward schedules/results/calendars, instead of forcing operations into the older heavier model
- sports implementation should pause for a rules-discovery pass with Julio before more structural work lands:
  - not all categorias need all equipos base
  - some equipos base are mixed-year groups
  - current Julio clarification: most competitions are still handled on an individual team basis, not as a single fixed `all invited` global mode
  - the real exception set is narrower:
    - players occasionally play one year up/down
    - younger girls still play mixed until the academy split point
    - some older girls teams are mixed-category
    - some teams merge across levels/categories only when signup counts are too low
- the next admin/front-desk follow-up bucket now includes:
  - new top-priority finance correction lane, to execute in this order:
    - `Urgent`: Contry historical tuition workflow
    - `Urgent`: enrollment/account finance diagnostic panel for `superadmin`
    - `After that`: constrained correction toolkit
    - `Only later`: broader cleanup of front-desk correction UX
  - concrete product rules now locked for that lane:
    - Contry historical tuition stays a two-step historical workflow:
      - first create or reprice the monthly tuition charge
      - then post the historical payment
    - the Contry tuition amount must resolve from the real historical datetime, not from today's pricing window
    - if the target month already exists and has no allocations, reprice that same row instead of creating a duplicate
    - if the target month already has allocations or multiple active monthly rows, block and send it to the later diagnostic/correction lane
    - superadmin repair tools should prefer:
      - `Cargo correctivo`
      - `Ajuste de saldo`
      - `Reparar asignaciones`
    - write-offs should be modeled as explicit balance adjustments, not fake posted payments
    - unknown historical payment facts should not become invented posted payments
    - if the real payment facts are missing, use a non-cash adjustment instead
  - enrollment/account finance diagnostic panel is now in progress on preview:
    - superadmin-only and read-only
    - mounted on both the enrollment account page and the active-account block in player profile
    - collapsed by default
    - explains canonical balance, unapplied credit, duplicate monthly tuition rows, suspicious refunds/allocations, and correction-relevant anomaly flags before the repair toolkit exists
  - constrained correction toolkit is now in progress on preview as the next step under that same diagnostic surface:
    - superadmin-only
    - single-enrollment scoped
    - no fake posted payments
    - three explicit tools only:
      - `Cargo correctivo`
      - `Ajuste de saldo`
      - `Reparar asignaciones`
    - repair artifacts stay visible in the normal ledger with corrective / no-caja labeling
    - allocation repair uses an explicit payment-to-charge matrix and runs atomically
  - immediate follow-up hotfix now landed for the new toolkit diagnostics:
    - negative `Ajuste de saldo` rows must count as non-cash balance reducers in derived-account diagnostics
    - they should not trigger fake `Cargo sobreaplicado` or fake drift alerts by themselves
  - scholarship workflow is now in progress on preview:
    - enrollment-level `Sin beca / Media beca / Beca completa`
    - director-only control from `Editar inscripción`
    - only pending current/future monthly tuition is touched
    - `Media beca` = 50% mensualidad
    - `Beca completa` = sin mensualidad
    - scholarship changes block if affected pending tuition already has allocations
    - `v1.16.76` refines that blocker to use actual pending amount after allocations, so fully paid rows with stale `pending` status no longer block scholarship assignment
    - Porto mensual reporting will track `Beca completa` and `Media beca` separately
  - attendance export fixes and workflow cleanup
  - compact local date/time formatting in player-facing admin views
  - uniform-size auto-sync into `Ficha técnica`
  - nutrition tracking workflow discovery
  - product KPI clarity so `cargos registrados` vs `pagados completos` cannot be confused on product/admin surfaces
  - product detail admin utility pass now landed on preview:
    - `Ultimas ventas` supports simple `Anterior / Siguiente` paging
    - count KPI cards now drill into dedicated per-product detail pages
    - money-total KPI cards remain summary-only in v1
  - stronger `Regularización Contry` guardrails for competition products so staff do not leave orphaned tournament charges behind without the corresponding historical payment
  - player-based tournament-signups CSV export is now live from `Inscripciones Torneos` for quick Excel reconciliation against external tracking sheets
  - `Inscripciones Torneos` desktop layout is now widened so the board uses more of the available window instead of leaving a large empty right-side gutter
  - tournament-signups CSV export is intentionally restricted to `superadmin` only
  - `Inscripciones Torneos` now supports category-card drilldown into a separate `Nivel`-grouped view, and the top competition selector is shifting toward actual competition products instead of only the original three hardcoded family buckets
  - temporary `perf=1` diagnostics now exist on both the main `Inscripciones Torneos` board and the category-detail route for `superadmin`, so we can measure whether slowness lives in DB fetches or app-side aggregation before making deeper query/index changes
  - the first board-optimization pass is now in: the main `Inscripciones Torneos` view loads competition-relevant charges first instead of starting from all positive charges and filtering most of them away in app code
  - broader performance/indexing pass remains open as a separate hardening lane:
    - review the slowest operational pages across the app, not just `Inscripciones Torneos`
    - use measured timings first, then add only minimal justified indexes
    - prefer query-shape cleanup before adding write-cost-heavy DB indexes
    - keep index creation production-safe and targeted
  - future hardening item: build a small app-wide superadmin performance monitor so one-off route diagnostics do not remain scattered forever
  - the category drilldown now also shows the not-paid side of the same category roster, grouped by `Nivel`, so front desk can compare paid vs pending players in one place
  - the category detail route has now been narrowed to selected campus/competition data only so opening a `CAT` card does not pay the cost of the full multi-campus sports-signups dataset
  - temporary `perf=1` diagnostics are now available on the category detail route so remaining latency can be measured step-by-step before further optimization work
  - current `perf=1` diagnostics should remain superadmin-only while they are temporary
  - `Inscripciones Torneos` category cards now show the full paid roster directly on the main board instead of truncating at 12 names
  - each category card now includes quick operational export actions for all page users:
    - `Exportar PNG`
    - `Copiar texto`
  - quick-export output was immediately tightened after first front-desk review:
    - copied text now omits the `pagados / activos` ratio line
    - PNG export now shows only the paid-player count as `N Jugadores`
  - the existing superadmin-only CSV export remains unchanged as the broader reconciliation/export path
- stock control and supplier batch entities remain intentionally out of v1
- do not mix tournaments or broader sports-management work into the uniforms rollout pass
- Release policy:
  - every repo-tracked implementation change bumps `package.json`
  - every push updates `docs/devlog.md`
  - every repo-tracked implementation change goes to `preview` directly by default
  - docs-only reference updates may remain local until the next implementation pass when appropriate
  - every implementation pass updates both `docs/devlog.md` and `docs/roadmap-post-alpha.md`
  - patch = fixes/polish/perf, minor = meaningful feature/workflow additions

### 0. App Health / Hardening Passes

Run these as explicit periodic passes between feature waves so the app keeps maturing safely as real operations expand:

- architecture / data-ownership review
  - keep one clear source of truth per business rule and reduce overlapping logic between pages
- permissions audit refresh
  - recheck route guards, campus scope, action guards, and RLS-sensitive surfaces after major workflow additions
- finance / payment / reporting regression checklist
  - verify receipts, allocations, operator-campus ownership, `paid_at` semantics, corte outputs, and monthly/weekly summaries still agree
- finance drift guardrail now includes `/admin/finance-sanity` plus SQL reconciliation helpers so pending collections, dashboard KPIs, and canonical balance math can be checked against each other intentionally
  - next follow-up: convert this from mostly manual/superadmin investigation into a more explicit anomaly-monitoring lane so drift is surfaced proactively when ledger states go weird after voids/refunds/allocation mistakes
- performance hotspot review
  - identify slow pages, heavy queries, unnecessary refreshes, and wide payloads before they become daily friction
  - future tooling follow-up: build a small superadmin-only app performance monitor / timing console so route timing and slow-path diagnostics do not depend on one-off temporary route instrumentation
- backup / recovery / rollback confidence
  - confirm migration safety, reversible finance actions where applicable, and practical rollback paths for preview/prod incidents
- migration / deployment verification discipline
  - keep preview/prod DB parity visible, confirm migrations actually apply, and avoid schema drift between code and remote environments
- security scanning + env/RLS review
  - first pass now starts as one explicit lane: advisory TruffleHog in CI, advisory dependency audit, and a short repo-specific findings memo covering service-role usage, public env usage, API/CORS review, and follow-up hardening items
  - second pass now includes GitHub Actions runtime maintenance plus a repo/app sweep of service-role usage, public envs, auth/API routes, sensitive server actions, and high-risk RLS-backed finance/admin paths

Notes:

- This is not a panic rewrite track.
- The goal is controlled evolution, not perfection.
- Treat this as an operational maturity lane that should recur after major feature waves like Uniformes, refunds, and future sports modules.

### 1. Finance Ops Stabilization 💳

Next implementation priority. Group these together as one operational wave:

- `#33` lightweight 360Player recording is live in Caja; future automation/webhook work stays open separately
- `#34` cross-campus payment ownership is now in phase-one implementation on preview, especially for Linda Vista covering Contry workflows
- `#48` SQL-side finance/report aggregation hardening is now complete on preview for dashboard, Resumen Mensual, and Corte Semanal
- `#56` refunds workflow
- `#57` Corte Diario checkpoint history, detailed report KPIs, and compact thermal-product detail follow-up
- refund drift follow-up:
  - pending-collections RPCs now also need to stay aligned with refund-aware balance semantics, not just dashboard/report SQL, to avoid silent debt undercounting after refunds

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
| 3 | **Garbled ñ / accents on printed receipts** | ✅ Done | Reworked the thermal printing path again after live front-desk feedback: ticket payloads now go through a shared printer-text normalization pass before CP1252 base64 encoding, covering standard receipts, Caja prints, reprints, and thermal Corte output. |
| 4 | **Corte Diario UTC offset** | ✅ Done | Date queries now use Monterrey midnight (UTC+6h); display uses `timeZone: "America/Monterrey"` |
| 5 | **Date format MM/DD/YYYY → DD/MM/YYYY** | ✅ Done | Manual `DD/MM/YYYY` formatting applied across date displays, and both player birth-date and enrollment start-date entry now use guided `DD/MM/YYYY` inputs instead of locale-dependent browser date widgets. |
| 23 | **Charge status stuck on "Pendiente" when fully paid** | ✅ Done | `getEffectiveStatus(status, pendingAmount)` in `charges-ledger-table.tsx` — shows "Pagado" when `pendingAmount ≤ 0` |
| 24 | **Cash session panel shows $0 MXN after midnight** | ✅ Done | `getSessionForDate()` helper in `cash-sessions.ts`; `sessionOpenedAt` + `sessionClosedAt` passed to `getCorteDiarioData()`, extending query window beyond midnight |
| 41 | **Enrollment payment does not auto-print receipt / wire into receipts correctly** | ✅ Done | Ledger payment flow now shares payment side-effect helpers with Caja: cash payments link into open sessions, `/receipts` is revalidated, and direct `?payment=` lookup works from Auditoría. |
| 44 | **Freeze historical data + retire post-payment charge mutation** | ✅ Done | Live payment flows no longer mutate charge amounts after posting. Historical payments, allocations, folios, and receipts remain untouched. |
| 45 | **Canonical financial definitions (`paid_at` vs `period_month`)** | ✅ Done | Collections remain tied to `payments.paid_at`; tuition-period reporting uses `charges.period_month` where present. |
| 46 | **Monterrey-local finance/reporting time standardization** | ✅ Done | Shared Monterrey time helpers are now used on key finance/reporting surfaces with `DD/MM/YYYY` display. The regular `/activity` page now also renders/filter bounds in Monterrey time instead of UTC. |
| 47 | **Scalable receipts search / recent receipts default** | ✅ Done | New SQL `search_receipts(...)` RPC + finance indexes; `/receipts` now defaults to recent posted receipts and paginates/filter in SQL. |
| 48 | **SQL-side aggregation hardening for financial reports** | ✅ Done | Dashboard, `Resumen Mensual`, and `Corte Semanal` now read from SQL-backed finance summary RPCs built on canonical payment/charge facts. These summaries use `operator_campus_id` for payment ownership, keep `paid_at` as the collection date source of truth, and surface `360Player` plus Contry historical regularization as visible separated summaries instead of hiding them in app-side reductions. |
| 53 | **Upcoming tuition pricing/versioning rollout for advance payments** | ✅ Done | Added effective-date pricing-plan versioning for standard tuition, seeded a May 2026 plan version (700/900 active-player tuition, 700/350/next-month carryover for new enrollments), and repriced only pending future tuition charges with `period_month >= 2026-05-01` when they had no payment allocations. Historical posted payments/receipts stay untouched. Session 29 follow-up: patched the April 11 repricing function so it also skips any monthly tuition charge that already has payment allocations, protecting allocated April rows from being rewritten mid-month. |
| 49 | **Preview DB schema drift visibility for receipts/RPC features** | ✅ Done | `/receipts` now shows an explicit operational error when `search_receipts(...)` is missing instead of fake zero results. Preview policy: deploy validation must include confirming preview DB migrations/functions exist. Session 18 found preview DB had stopped at `20260321000000`; missing March 24-26 migrations were applied manually in preview to restore parity. |
| 50 | **Prod post-merge receipts/activity follow-up** | ✅ Done | Fixed the `Actividad` server-component `onClick` crash and corrected folio-search classification for underscore campus codes in `search_receipts(...)`. |
| 51 | **Receipts partial folio fragment search** | ✅ Done | `search_receipts(...)` now matches partial folio fragments like `202603` in addition to full folios and player names. |
| 52 | **Unblock prod migration chain blocked by Patch 1** | ✅ Done | Reworked `20260330120000_patch1_data_corrections.sql` into a recovery-safe, idempotent migration and pushed prod successfully. Patch 1 duplicates were removed, bajas and Mitre inserts were applied, and the blocked prod chain now records `20260330120000`, `20260330193000`, and `20260331041000`. |

---

## P1 🟠 High Priority (this week)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 58 | **Director Deportivo dashboard** | 🟡 In progress | `v4` is now implemented locally: the sports lane is category-first instead of competition-first, with campus + competition selectors and compact category cards that break down into base-team signup progress. Keep open for production validation and any remaining UX simplification once Julio works with real data. |
| 38 | **League/tournament tag + management tab** | 🟡 In progress | The competition tab now works as configuration + team drilldown on top of the existing product-linked payment model. It supports campus/gender scope, paid-confirmed signups, team participation mode (`competitive` / `invited`), and manual `interested` planning state. Keep open for deeper competition-specific rules and better handling of mixed-year realities if sports ops needs them. |
| 59 | **Team-building / assign available players workflow** | 🟡 In progress | The default workflow is now much lighter: `roster final` starts from the base team's confirmed signups and can be approved as a stable snapshot. Advanced squads still exist only as exception tools. Keep this item open for future manual override polish (year-up/year-down cases, low-signup merges, more deliberate final-roster editing). |
| NEW | **Urgency 0: autopopulate equipos base from current `Nivel`** | 🔴 Open | Next sports cleanup task. Add a guided seeding/backfill flow that assigns players into matching base teams from their current `Nivel` only when the match is unambiguous (campus + birth year + gender + level), and leaves ambiguous cases for manual review. This should be a controlled backfill tool, not a background auto-reassignment system. |
| NEW | **Temporary competition-signup visualizer for front desk** | ✅ Done | Added `/sports-signups` as a lightweight operational dashboard for confirmed signups grouped into `Superliga Regia`, `Rosa Power Cup`, and `CECAFF`, with drilldown by campus and birth year/category. It is intentionally read-only and non-financial. |
| NEW | **Product KPI charged-vs-paid clarity** | 🔴 Open | Tighten product/admin KPI language and breakdowns so staff cannot read raw charge volume as fully paid player count. Extend the reconciliation pattern from the tournament-product troubleshooting pass into the broader product surfaces where `vendido`/`pagado` ambiguity can still create operational mistakes. |
| NEW | **Regularización Contry competition-charge guardrails** | 🔴 Open | Reduce the chance that front desk creates competition charges in `Regularización Contry` without posting the matching historical payment. Scope should focus on operational guardrails and clearer workflow shaping, not on changing the underlying finance model. |
| NEW | **Panel KPI drill-downs + trend charts** | 🔴 Open | Add interactive pending-tuition breakdowns by category/campus plus trend charts for payments and altas/bajas. Keep this paired with canonical finance-source checks so new dashboard surfaces do not introduce drift. |
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
| 54 | **Single-page new enrollment intake + streamlined initial charge/payment flow** | ✅ Done | `/players/new` is now a one-page front-desk intake that captures player data, one primary guardian, enrollment setup, pricing preview, `Regreso` mode, and now the first `Uniformes` decision in one submit. It creates guardian + player + enrollment + initial charges atomically, then redirects directly into Caja. The intake also includes a lightweight duplicate/return warning by name + birth year that links to likely existing players without blocking the new record flow. |

---

## P2 🟡 Near Term (next 1–2 weeks)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 12 | **Jersey number on player profile** | ✅ Done | Migration + `jersey_number` shown on profile, editable in player edit form |
| 13 | **Coach on player profile** | ✅ Done | `coaches` join in `getPlayerDetail`, displayed in profile info grid |
| 14 | **Past receipt / ticket search** | ✅ Done | `/receipts` page with folio/name search, campus filter, links to enrollment account |
| 15 | **Advance month payment** | ✅ Done | Month picker appears when creating a tuition charge; defaults to next month |
| 16 | **Pendientes — call center mode** | 🟡 In progress | `/pending` now uses a lightweight follow-up workflow instead of the old `Contactado` checkbox: `No contactado`, `No contesta`, `Contactado`, `Promesa de pago`, and `No regresará`, with inline note editing, required promise-date capture, and direct baja handoff for `No regresará`. Follow-up state also clears automatically when balance reaches zero or the enrollment is formally ended. |
| NEW | **Nutrition tracking / body measurements tab** | 🟡 In progress | `v1` is now implemented on preview: new `nutritionist` role, dedicated `Nutricion` menu section, nutrition-only player profile, historical `player_measurement_sessions`, first-take pending queue, monthly panel KPIs, recent activity, append-only weight/height capture, and OMS growth curves for IMC/Peso/Estatura on the nutrition profile. Keep this open for circumference metrics, parent PDF nutrition reports with OMS curves/notes, richer comparisons, intake workflow polish, and future nutrition-specific dashboard/reporting asks. |
| 30 | **New-enrollment tuition tiers (3 tiers)** | ✅ Done | Enrollment creation no longer trusts free-text tuition amounts. The server now resolves the correct tier by start date and pricing version: days 1-10 = full month, days 11-20 = mid-month tier, days 21+ = next-month-only tuition. This now rolls into the May 2026 price version automatically. |
| 31 | **Re-enrollment "Retorno" pricing plan** | 🔴 Open | A practical `Regreso` workflow now exists operationally inside issue #54 without creating a separate plan family: staff can flag the player as returning and choose full / inscription-only / waived inscription while monthly tuition keeps using standard rules. Keep this item open only if future business rules require a truly separate `retorno` pricing-plan family with different recurring tuition behavior. |
| 32 | **Absence/injury incident + optional monthly omission** | 🟡 In progress | Active enrollments can now record an operational incident (`absence`, `injury`, `other`) from the enrollment ledger, with an explicit choice to either just log it or also omit a selected tuition month. Incidents also carry optional `starts_on` / `ends_on` dates for real absence/recovery windows, and active-today `absence` / `injury` incidents now surface as soft indicators in `Jugadores`, player profile, and `Caja`. The monthly generator respects only incidents carrying `omit_period_month`, and the ledger keeps active plus historical incident visibility. Partial-month attendance/proration remains out of scope for this v1. |
| 33 | **Stripe payment recording + reconciliation** | 🟡 In progress | Lightweight Phase A is now live: Caja can register `360Player` payments as normal posted ledger payments, receipts remain searchable, and Corte Diario shows them in the transaction list while excluding them from corte totals. Future work stays focused on true automation/webhook ingestion once a practical external-matching path exists. |
| 34 | **Cross-campus payment ownership + campus-scoped front desk** | 🟡 In progress | Phase one is now implemented on preview: payments store `operator_campus_id`, Caja and enrollment-ledger posting can record the receiving campus, Corte Diario is operator-campus based with visible cross-campus markers, and `front_desk` access is now campus-scoped across the main operational surfaces. Keep issue `#18` open for broader permission hardening outside the first operational pass. |
| 42 | **Reprint receipt from app** | ✅ Done | `/receipts` now has a `Reimprimir` action per payment row. Rebuilds the receipt from stored payment, folio, allocation, and enrollment context, then prints through QZ Tray. |
| 43 | **Pricing change rollout (non-breaking)** | ✅ Done | Pricing now resolves through effective-date plan versions instead of mutating historical financial rows. Existing enrollments can continue using their original plan link while monthly generation and advance tuition resolve the correct version for the target month. |
| 55 | **Replace free-number financial inputs with guided button choices** | ✅ Done | New enrollment no longer uses free-number tuition inputs, advance tuition in Caja resolves automatically from the selected month/version, the POS checkout stages fixed-price product tiles with locked catalog amounts, uniform items now require `Talla` before they can be added, and only explicit special/manual charges keep open-amount entry. Date/campus entry for front desk also moved to guided controls (`DD/MM/YYYY` masked inputs, calendar access, direct campus buttons). |
| 56 | **Refund workflow** | 🟡 In progress | `v1` is working on preview: `Cambiar concepto` can move a full posted payment onto new destination charges and auto-void its exclusive original source charges, while `Reembolsar` records a separate refund movement on the refund date, reopens the underlying balance, and surfaces refund state in receipts/activity/reporting. Follow-up hotfixes corrected refund form copy/required cues, resolved preview DB ambiguity bugs in both `payment_refunds` RLS and the underlying payment refund/reassignment functions, and the latest front-desk polish pass added clearer pending states, cleaner effect messaging, and reduced extra client refresh churn. Keep open for future partial refunds, finance-op guardrails, and deeper refund performance optimization after more live usage. |
| 57 | **Corte Diario + cash session revamp** | ✅ Done | Front desk now works against automatic campus corte checkpoints instead of manually opening/closing sessions. Corte Diario is campus-first, based on payments since the last printed corte for that campus, printing closes and rolls the next checkpoint automatically, `360Player` remains visible-but-excluded, and `paid_at` can now be backdated from Caja and the enrollment ledger when staff recovers a missed payment. Follow-up polish now adds row-level `Conceptos pagados`, historical checkpoint browsing, historical detailed reports, richer detailed-report KPIs, a dedicated `Por tipo de cargo` block inside `Reporte detallado`, and thermal Corte product-name detail for real product sales without changing the close/print flow. |

---

## P3 ⚪ Backlog

| # | Item | Status | Notes |
|---|------|--------|-------|
| 17 | **Uniformes tab** | 🟡 In progress | `v1` now exists on preview as a campus-scoped `/uniforms` dashboard with weekly sales/delivery lists, `pending_order → ordered → delivered` fulfillment flow, bulk weekly order marking, and paid-sale-driven row creation from uniform charges. The latest intake pass also brings a first `Uniformes` card directly into `/players/new`, including size-button polish and explicit `Portero` tagging so front desk can capture uniform intent earlier in the workflow. Follow-up feedback now includes a more compact Uniformes menu plus auto-syncing the purchased uniform size into the player's `Ficha técnica` when a size is captured through sales. Keep future stock control and supplier batch management separate from this issue. |
| 18 | **Server-side route blocking** | ✅ Done | Added shared app-layer permission helpers, hardened direct-URL route gates for director-only pages, expanded front-desk record-level campus checks, and replaced broad front-desk RLS policies on core operational tables with campus-aware predicates driven by `current_user_allowed_campuses()`. |
| 19 | **Dashboard KPI verification** | 🔴 Open | Keep this as the data-correctness companion to the new Panel work: verify pending-balance totals against canonical sources, then support the upcoming drill-downs by category/campus and other interactive KPI surfaces without introducing drift. |
| NEW | **Finance drift monitoring + anomaly logging** | 🔴 Open | Build on top of `/admin/finance-sanity` and the enrollment-level `Diagnóstico financiero` panel so suspicious account states are surfaced proactively instead of only being found manually. First targets: canonical-vs-derived drift, posted payments without allocations, duplicate monthly tuition rows, overapplied charge math, and suspicious refund/void/reassignment side effects. |
| 21 | **Caja pending charge detail** | 🔴 Open | Expandable rows showing period month + charge type before paying |
| 22 | **Folio → payment lookup in Actividad** | 🔴 Open | Surface payment ID in audit log so staff can look up transactions by folio |
| 35 | **Player profile consolidation** | 🟡 In progress | The player profile is now being promoted into the single-player hub: active account detail (summary, charges, payments, incidents), guardians, uniforms, and compact expandable enrollment history live directly on `/players/[id]`, while the enrollment account page remains as the fallback deep-detail route. Follow-up polish now includes compact local date/time formatting instead of verbose UTC-style strings in profile/admin views. |
| NEW | **Account-page YOB + breadcrumb/navigation polish** | 🔴 Open | Restore year-of-birth visibility on the remaining finance/account surfaces, especially enrollment `Cargos y Cuentas` and `Regularización Contry`. Also make account headers and breadcrumbs behave like true navigation back to player/profile context where available. |
| 36 | **Document uploads per player** | 🔴 Open | Supabase Storage: photo ID, passport, birth certificate, medical forms. `player_documents` table + Storage bucket with RLS (director_admin+ only). |
| 37 | **Player dropout historical record / bajas revamp** | ✅ Done | Baja now uses a dedicated dropout workflow instead of the generic enrollment edit path, dropped players render as archive/read-only profiles with clearer balance handoff and re-enrollment CTA, active player profiles no longer show historical-enrollment clutter, and `Jugadores > bajas` acts as the main archive discovery surface. Keep a small visual polish pass for the `Bajas` tab in the backlog, not as a finance rewrite. |
| 39 | **Input fields → button toggles (UX pass)** | 🔴 Open | Replace 2-option dropdowns with toggle buttons in Caja and elsewhere: payment method (Efectivo/Tarjeta), campus selector, gender, tuition tier selection. |
| 40 | **Custom receipt tickets** | ⚠️ Needs spec | Some products need a different ticket format. **Spec not provided — ask director which products and what the ticket should show before implementing.** |
| 60 | **Filter players pending a specific tuition month** | 🟡 In progress | First pass now lives on `/players` as an advanced filter by tuition month, driven by real pending `monthly_tuition` charges rather than aggregate balance only. Keep open for any dedicated sports-ops or call-center views beyond the current Jugadores implementation. |
| 61 | **Specialist appointments products/categories** | 🔴 Open | Add new catalog products/categories for physiotherapy, psychology, and nutrition appointments for players. Keep this as a straightforward product-catalog/admin pass, not a new architecture track. |
| 62 | **Excel/list export tools** | 🟡 In progress | First Excel export is live on `/players` and now includes the first correctness pass: dynamic level sections so non-hardcoded levels like `B3` are not dropped, visible warning counts for active players excluded because they are missing gender, and the surrounding Jugadores filter bar has been cleaned up with a dedicated advanced-filters section. Keep this item open for broader list/export tooling beyond attendance rosters. |
| 63 | **Attendance-sheet export** | 🟡 In progress | `/players` exports a formatted `.xlsx` workbook for manual attendance use. Sheets now use a fixed set of 16 predefined groups per campus (Little Dragons all-gender, FEM ranges, VAR by year) instead of one tab per birth year/gender. Multi-gender sheets show VARONIL/FEMENIL section headers; single-gender sheets go straight to level sections. Missing-gender players are excluded. Front-desk/admin follow-up now calls for another pass of fixes and workflow changes before closing this lane fully. |
| 64 | **Campus workflow polish (Linda Vista as hub)** | 🟡 In progress | Added `Regularización Contry` as the first intentional hub workflow: Linda Vista staff with Contry access can now post historical Contry paper payments as real backdated payments without manual DB edits, with Contry-owned operational attribution and no live cash-session/auto-print side effects. Follow-up polish aligned the player picker with Caja-style search plus `Buscar por categoría`, the right-side workspace now supports targeted historical payments plus Caja-lite charge creation without leaving the Contry regularization screen, and the latest front-desk pass tightened mutation-state feedback, reduced workspace churn, and cleaned the main user-facing Contry copy. Keep open for broader hub workflow polish beyond the historical catch-up pass. |
| NEW | **Sports lane rethink after live signup-board usage** | 🔴 Open | Use the success of `Inscripciones Torneos` as the new planning anchor. Revisit the heavier hidden competitions implementation before adding more sports complexity, and steer the next discovery/build pass toward actual operational needs like schedules, results, and calendars instead of premature roster-management weight. |
| NEW | **Receipt encoding artifact cleanup** | 🔴 Open | Printed receipts are much better, but keep a low-priority follow-up pass for remaining accent / `Ñ` artifacts that still show up in edge cases. |
| NEW | **Bajas tab UI polish** | 🔴 Open | Keep a small visual cleanup pass for the archive / `Bajas` surfaces now that the operational workflow is stable. |

---

## Later Phases

This long-term plan is subject to change as the app continues to develop; these phases are strategic direction, not locked implementation commitments.

### Phase A — Database Architecture & Security Hardening

**Must be completed before any parent-facing app goes live.**

1. **Schema separation in current Supabase DB**
   - Split current `public` schema into `public` + `operations`
   - `public` schema (safe for external access): `players`, `guardians`, `player_guardians`, `teams`, `team_assignments`, `coaches`, `campuses`, `who_growth_reference`, `player_measurement_sessions`, `app_settings` (filtered keys only)
   - `operations` schema (staff only, never exposed via Supabase client API): `payments`, `payment_allocations`, `payment_refunds`, `charges`, `charge_types`, `pricing_plans`, `pricing_plan_items`, `pricing_plan_tuition_rules`, `pricing_plan_enrollment_tuition_rules`, `products`, `cash_sessions`, `cash_session_entries`, `campus_folio_counters`, `corte_checkpoints`, `finance_reconciliation_snapshots`, `uniform_orders`, `enrollment_incidents`, `area_map_entries`, `academy_events`, `audit_logs`, `app_roles`, `user_roles`, `tournament_team_entries`, `tournament_source_teams`, `tournament_squads`
   - `REVOKE ALL ON SCHEMA operations FROM anon, authenticated` — parent-facing clients physically cannot see operations tables
   - Staff admin app accesses `operations` through server-side code (Edge Functions or service role key), never through client SDK

2. **Views for mixed-sensitivity tables**
   - `v_parent_enrollments` — exposes `id`, `player_id`, `campus_id`, `status`, `start_date`. Excludes: `has_scholarship`, `scholarship_status`, `dropout_reason`, `dropout_notes`, `contactado_*`, `follow_up_*`, `promise_date`, `pricing_plan_id`
   - `v_parent_tournaments` — exposes name, dates, eligibility, signup deadline. Excludes: `charge_amount`
   - `v_parent_tournament_entries` — exposes sign-up status. Excludes: `charge_created`, `charge_id`

3. **Add `tenant_id` to all tables**
   - Add `tenant_id UUID` column to every table now, even as the only tenant
   - Create a `tenants` table: `id`, `name`, `code`, `logo_url`, `primary_color`, `config (jsonb)`, `stripe_connect_account_id`, `created_at`
   - Default all existing rows to a "Dragon Force Monterrey" tenant UUID
   - Much easier to add now than to retrofit later when multi-tenancy is needed

### Phase B — Parent-Facing Database (Separate Supabase Project)

**Needed when parent app development begins. The core security principle: the parent app connects to a database that has zero financial data in it. Not restricted access — the data simply doesn't exist there.**

1. **Create a second Supabase project** as the parent-facing data store
   - Completely separate DB, separate credentials, separate network
   - Even a fully compromised parent app cannot reach financial data because there is no path

2. **Parent DB tables** (minimal, curated):
   - `players` (synced subset)
   - `guardians` (synced subset)
   - `player_guardians`
   - `enrollments_safe` (safe columns only via sync)
   - `teams`, `team_assignments`, `coaches` (name only), `campuses`
   - `my_charges` — flattened: `description`, `amount_due`, `status`, `due_date`, `payment_url`. No internal IDs, no allocation breakdowns, no pricing rule references
   - `announcements` (NEW — admin → parent one-way)
   - `messages` (NEW — parent ↔ admin simple inbox)
   - `notification_preferences` (NEW)

3. **One-way sync pipe** from operations DB → parent DB
   - Sync via Edge Functions triggered by DB changes, or cron batch
   - Parent DB is a projection, not a source of truth
   - Only unique data in parent DB is messages/announcements

### Phase C — Parent Mobile App (Expo / React Native)

**After parent DB is set up.**

1. **Tech stack**: Expo / React Native (not PWA)
   - Reliable iOS push notifications, native app store presence, React knowledge transfers from Next.js
   - One codebase → Android + iOS

2. **Developer accounts**: Google Play $25 one-time, Apple App Store $99/year

3. **MVP screens**:
   - Login (Supabase Auth)
   - My kids' profiles, team, schedule
   - Announcements feed
   - Payment status + Pay button (Stripe integration)
   - Simple messaging (parent → admin inbox)
   - Push notifications (Expo push service)

4. **Multi-tenant skinning**: app reads tenant config (logo, name, colors) at login. One published app serves all Dragon Force academies worldwide. Parent logs in → `tenant_id` routes to their academy's data.

5. **Security model**: parent app connects ONLY to parent DB. No knowledge of, credentials for, or code referencing the operations DB.

### Phase D — Stripe Integration (replaces 360Player invoice workflow)

**Can begin in parallel with Phase B.**

1. **In-app payment flow**:
   - Parent taps Pay → app calls Edge Function on operations side
   - Edge Function resolves correct price from `pricing_plan_tuition_rules` based on current date (early bird $700 / standard $850 / late $1,000)
   - Creates Stripe PaymentIntent → returns `client_secret` to app
   - App opens Stripe payment sheet (React Native SDK) — card, Apple Pay, Google Pay
   - Stripe webhook → operations DB records payment + allocation → sync pipe updates parent DB

2. **Dynamic pricing resolution** (eliminates manual invoice swapping):
   - One charge per enrollment per month, amount resolves dynamically at display and payment time
   - Day 1–10: $700 / Day 11–20: $850 / Day 21+: $1,000
   - Uses existing `pricing_plan_tuition_rules` — no new data model needed
   - No manual invoice recall, no resending, system handles it automatically

3. **Stripe Connect** (for multi-tenant expansion):
   - Each academy gets a Connected Account under our Stripe platform
   - Parent payments route to correct academy's bank account
   - Optional platform fee per transaction as SaaS revenue

4. **Payment Links fallback**: generate Stripe Payment Links for parents without the app — sendable via SMS, email, or push notification

### Phase E — WATI / WhatsApp Comms

**Status: RECONSIDERING — may be replaced by parent app push notifications.**

Options under consideration:
- Drop WATI entirely — rely on parent app + SMS/email fallback
- Keep WATI as transitional — use WhatsApp while parent app adoption grows, then phase out
- Keep WhatsApp Business API without WATI — cheaper, critical reminders only, no WATI subscription

Decision pending — revisit once parent app scope is finalized.

### Phase F — Multi-Tenancy & Expansion

**Foundational work (tenant_id) is in Phase A. Full expansion architecture deferred until needed.**

1. **Operations DB: domain-based schemas with tenant_id**
   ```
   operations-db
   ├── core       → players, guardians, enrollments, teams, campuses, coaches
   ├── finance    → payments, charges, cash_sessions, pricing_plans, reconciliation
   ├── tournaments → tournaments, squads, team_entries, player_entries
   └── admin      → audit_logs, user_roles, app_roles, app_settings
   ```
   All tables have `tenant_id`. RLS + schema-level GRANT controls access by role AND tenant.

2. **Parent DB**: single schema with `tenant_id` + RLS. Scale to schema-per-tenant only if needed (unlikely at projected scale).

3. **Onboarding a new academy**: create tenant record → Stripe Connected Account → branding config → import data → app auto-skins. Configuration task, not a rebuild.

### Strategic Build Order (Later Phases)

1. Add `tenant_id` to all existing tables (do now, even as only tenant)
2. Schema separation in current DB (`public` + `operations`) — before any parent-facing work
3. Stripe integration — Edge Functions + webhooks + dynamic pricing
4. Parent DB — second Supabase project with curated sync
5. Parent mobile app — Expo/React Native MVP
6. Push notifications — Expo push service
7. WATI decision — keep, transition, or drop based on app adoption
8. Multi-tenant domain schemas — when expansion is imminent
9. Stripe Connect — when first external academy onboards

### Architectural Decisions Log

| Decision | Chosen | Rationale |
|---|---|---|
| Parent app tech | Expo / React Native | Reliable iOS push, app store presence, React knowledge transfers |
| Parent data isolation | Separate Supabase project | Parent app physically cannot reach financial data — no path exists |
| Internal data isolation | Postgres schema separation | `operations` schema invisible to Supabase client API |
| Multi-tenancy model | `tenant_id` column + RLS | Single DB handles dozens of academies; schema-per-tenant unnecessary at projected scale |
| Payment processor | Stripe (existing 360Player account) | Already verified, Connect for multi-tenant, React Native SDK |
| Pricing resolution | Dynamic at display/payment time | Eliminates manual invoice swapping; uses existing `pricing_plan_tuition_rules` |
| WATI | Under reconsideration | Parent app push notifications may replace WhatsApp comms layer |
| Clip | Dropped | Stripe covers both in-person and remote payments |

### Existing Later Phase Items (preserved)

| Item | Notes |
|------|-------|
| Coach role + coach module | Coach logs in, takes attendance per training session |
| Attendance tracking | Per-session records, attendance-based baja detection (3 consecutive missed months) |
| Director Deportivo role + dashboard | Moved up into active backlog as #58, sports-ops focus only |
| Campus-scoped access (Contry cashier role) | `front_desk` sees only their campus data |
| Stripe webhook automation | → absorbed into Phase D |
| Uniform stock control | Count-based inventory, dashboard widget |
| Jersey number assignment | Business rules TBD |
| WhatsApp/SMS automated reminders | → absorbed into Phase E |

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
