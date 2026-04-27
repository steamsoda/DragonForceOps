# Devlog

## 2026-04-26 (session 122)

### Preview Planning Checkpoint After v1.16.68

- Confirmed `v1.16.68` is the current production release after merging the `Regularizacion historica` charge-voiding controls to `main`.
- Next implementation work should continue from the `preview` branch before any further production merge.
- Immediate open lanes to keep visible before the next UI pass:
  - larger UI/workflow changes requested by operations, pending exact scope from live feedback
  - `Jugadores` query hardening after the `Pendientes` large-query incident
  - attendance continuation: in-app session generation, clearer `Horarios` vs `Hoy` wording, and field validation of training-group based attendance
  - live-test Linda Vista historical repricing and charge voiding inside the new superadmin workspace

## 2026-04-25 (session 121)

### Historical Regularization Charge Voiding (v1.16.68)

- Extended `Regularizacion historica` so it can now void pending charges directly from the same player workspace instead of forcing a detour into the full enrollment account page.
- Reused the existing charge-void safety model instead of creating a looser delete path:
  - pending charges only
  - superadmin-only route/action guard
  - required void reason
  - released allocations are removed and logged
  - anomaly audit trail still runs
  - tournament/signup revalidation still runs
- Added a regularization-specific server action that redirects back into `/admin/regularizacion-historica` with the same enrollment/campus context and explicit success/error feedback.
- This turns the historical workspace into a more complete repair desk for exceptional account cleanup without reopening the old front-desk-facing `Regularizacion Contry` workflow.

## 2026-04-24 (session 120)

### Historical Regularization Workspace v1 (v1.16.67)

- Replaced the old Contry-only historical repair flow with a new superadmin-only workspace at `/admin/regularizacion-historica`.
- The old `/regularizacion/contry` route now works only as a compatibility alias:
  - superadmin users are redirected to the new generic page
  - all other roles are rejected at the route guard level
- Converted the existing repair workflow into a campus-aware tool for both Contry and Linda Vista:
  - campus-first player/enrollment picker
  - selected enrollment now drives the effective campus automatically
  - historical payment posting, product charges, and monthly tuition create/reprice remain in one workspace
- Historical repair payments now write new generic sources for future records:
  - audit source: `historical_regularization_admin`
  - payment external source: `historical_catchup_admin`
- Preserved old `historical_catchup_contry` records as-is, but reporting/activity/receipts now render both old and new sources as `Regularización histórica`.
- Added a reporting migration so finance summaries count both historical source variants through the shared `finance_payment_facts(...)` function.
- Why this change was necessary:
  - `Regularización Contry` started as an operational catch-up tool while Contry was still outside the normal live workflow
  - once both campuses were using the app directly, leaving a sensitive historical-repair surface in staff navigation created unnecessary operational risk
  - the safer model is a single superadmin repair desk for exceptional backdated posting and repricing, not a campus cashier tool

### Pendientes Data Completeness Hotfix (v1.16.66)

- Fixed a critical `Pendientes` scaling bug that could hide valid pending-tuition players from the board even though the player profile and charge ledger were correct.
- Root cause:
  - `src/lib/queries/tuition-pending.ts` loaded monthly tuition charges with a single large `.in(enrollment_id, [...])` request per chunk.
  - As campus size and monthly-charge history grew, that query hit two Supabase/PostgREST limits:
    - oversized request URL/header limits from very large enrollment-ID lists
    - the default `1000` row cap on wide result sets
  - operational effect:
    - `Pendientes` could render a partial tuition dataset for large campuses
    - front desk would see an undercounted pending list while the affected player profile still showed the correct pending charge
- Fix:
  - reduced enrollment-ID batch size
  - added paged charge reads for each batch until all tuition rows are exhausted
  - no account balances, charges, allocations, or finance records were rewritten; this is a read-path correctness fix only
- Example live prod symptom behind this incident:
  - `Iván Marcelo Mendoza Coronado` had a valid pending April 2026 monthly tuition charge in profile, but was omitted from `Pendientes` because the board query was under-returning charge rows at campus scale
- Operational note:
  - this issue is business-critical because `Pendientes` is an action board for collections/front desk; incomplete pending lists are not acceptable and must be treated as a production correctness failure, not a cosmetic bug

### Bulk Training Schedule Creator (v1.16.65)

- Added a bulk schedule creator to `Asistencia > Horarios`.
- Directors and `director_deportivo` can now choose:
  - campus
  - effective start date
  - one or more weekdays
- The bulk action creates missing weekly attendance templates for every active training group in that campus that already has seeded start/end times.
- Safety behavior:
  - skips projected groups and groups without times
  - skips group/day combinations that already have an active overlapping template
  - leaves manual match/special sessions unchanged
- Kept the single-template creation form available for exceptions and one-off adjustments.

## 2026-04-23 (session 119)

### Training Groups Rollout v1.0 (v1.16.64)

- Added first-class `training_groups`, `training_group_coaches`, and `training_group_assignments` so daily sports and attendance grouping no longer depend on `teams(type='class')`.
- Seeded the confirmed Linda Vista and Contry training-group catalog plus linked coach assignments inside an additive migration.
- Added `Asistencia > Grupos`:
  - group catalog and metadata editor
  - coach linking
  - guided assignment review for active enrollments
  - safe bulk apply for unambiguous training-group suggestions
- Migrated attendance preview toward training groups for regular training:
  - schedule templates now create from `training_groups`
  - generated training sessions resolve rosters from `training_group_assignments`
  - reports and session detail now show training-group sources while keeping match/special sessions team-based
  - legacy class-team preview sessions remain readable as fallback
- Updated `/new-enrollments` so sports completion now means active enrollment + active training-group assignment, not competition-team assignment.
- Updated the player profile to show training group separately from competition team(s).
- Kept tournament and competition workflow unchanged on `teams`, `team_assignments`, `tournament_source_teams`, and `tournament_squads`.

## 2026-04-22 (session 118)

### Training Groups Model Analysis

- Added `docs/training-groups-model-analysis.md` after reviewing the current player/team/nivel model and Julio's training-group guide.
- Recommended separating `Training Groups` from competition `Teams` instead of hardening attendance around `teams(type = 'class')`.
- Noted that Attendance v1 should remain preview-only until the roster source is confirmed and the training-group model is decided.

## 2026-04-22 (session 117)

### Attendance Tracking v1 (v1.16.63)

- Added the campus-scoped `attendance_admin` role (`Admin de Campo`) plus a new top-level `Asistencia` menu.
- Added additive attendance tables for weekly schedule templates, concrete sessions, per-player attendance records, and correction audit rows.
- Added Supabase `pg_cron` generation for next-week training sessions from active class-team schedule templates; the generator is idempotent and does not touch existing player, enrollment, team, or finance rows.
- Built `Asistencia > Hoy` for daily session review, manual match/special session creation by directors/sports staff, touch-friendly attendance capture, incident prefill, and cancellation.
- Built `Asistencia > Horarios` for recurring training schedule templates and `Asistencia > Reportes` for inactive-player and team/coach attendance reporting.
- Added player-profile attendance summary widgets and a director dashboard weekly attendance KPI.
- Kept parent-facing attendance, coach login workflows, automatic baja triggers, and old Excel attendance backfill out of scope.

## 2026-04-21 (session 116)

### Late-April May Tuition Pricing Hotfix (v1.16.62)

- Fixed `quoteEnrollmentPricingFromVersions()` so day-21+ enrollments price the carried monthly tuition from the target tuition period's active plan instead of reusing the enrollment start-date plan amount.
- Day-21+ enrollment charge creation now also stores the resolved target-period tuition `pricing_rule_id` for the carried monthly tuition row.
- Preserved existing enrollment rules:
  - days 1-10 charge current-month full tuition
  - days 11-20 charge current-month half tuition
  - days 21+ charge next-month full tuition using the next month's effective pricing version
- Added a focused pricing assertion script covering April 20, April 21, May 1, May 11, and May 21 enrollment start dates.
- Added a narrow data correction migration for May 2026 monthly-tuition charges at `600` created from enrollments starting `2026-04-21` through `2026-04-30`; the repair updates them to `700` and intentionally leaves already-paid `600` accounts with `100` pending.
- Confirmed this lane should stay on Supabase `pg_cron`, not Vercel Cron:
  - `generate-monthly-charges` runs day 1 at `06:00 UTC`
  - `reprice-pending-monthly-tuition` runs day 11 at `06:00 UTC`
  - May generation should call `generate_monthly_charges('2026-05-01')` and resolve the May `700` plan by period month.

## 2026-04-21 (session 115)

### OMS Growth Curves for Nutrition Profile (v1.16.61)

- Added static WHO/OMS LMS reference data for nutrition growth charts:
  - BMI-for-age and height-for-age for 5-19 years
  - weight-for-age for the official WHO 5-10 year range
- Kept `player_measurement_sessions` as the source of truth; no parallel measurement table was added.
- Added server-side growth helpers that derive age-in-months, BMI, Z-score, percentile, and BMI classification from existing weight/height sessions plus player birth date and gender.
- Replaced the simple nutrition profile trend chart with OMS chart tabs for `IMC`, `Peso`, and `Estatura`.
- Updated `Resumen actual` on the nutrition-safe player profile with latest BMI, BMI percentile, Z-score, and classification when the player is inside OMS range.
- Added safe fallback messages for missing gender, missing birth date, no measurements, and players outside the available WHO reference range.

## 2026-04-21 (session 114)

### Nuevas Inscripciones Shared Intake Board (v1.16.60)

- Added shared `/new-enrollments` intake board for the last 30 days of enrollments, with date range, campus, category, and workflow-status filters.
- Added safe derived workflow chips for sports assignment and nutrition first-measurement status.
- Added role-specific quick links:
  - sports users open the filtered `Equipos Base` workflow
  - nutrition users open the nutrition-safe player profile
  - operational users open the player profile
- Added navigation entries under `Gestion`, `Competencias`, and `Nutricion` according to role access.
- Redirected legacy `/dashboard/new-enrollments` into the new shared page while preserving the selected month/campus context.
- Kept the page finance-safe: no balances, charges, payments, receipts, Caja actions, or tutor contact data.

## 2026-04-21 (session 113)

### Pendientes UI Polish + KPI Drilldowns (v1.16.59)

- Kept all accessible campus cards visible on `/pending` even when one campus is selected; the selected campus now only scopes totals, categories, and drilldowns.
- Made the `1 mes`, `2 meses`, and `3+ meses` KPI cards clickable, opening `/pending/detail` with a bucket filter that respects the current campus/month scope.
- Cleaned up the red KPI to mean `3+ meses pendientes` only, leaving overdue as a badge/chip instead of mixing it into the count.
- Standardized pending chips with centered text and visible borders across campus cards, category cards, month chips, and urgency badges.
- Improved `/pending/detail` row alignment so players with multiple pending months do not shift the visual columns.

## 2026-04-21 (session 112)

### Pendientes Tuition Board + Llamadas Split (v1.16.58)

- Moved the existing balance/call follow-up workflow from `/pending` to `/llamadas` and updated navigation labels for directors and front desk.
- Rebuilt `/pending` as a tuition-only board:
  - active players with unpaid `monthly_tuition` charges only
  - campus cards plus category/YOB cards modeled after `Inscripciones Torneos`
  - optional `month=YYYY-MM` filter
  - chips for `1 mes`, `2 meses`, `3+ meses`, and overdue state
- Added a category detail view under `/pending/detail` where rows link to the player profile and show only tuition-safe fields.
- Kept money amounts, tutor contact data, phone numbers, receipts, payment methods, and Caja actions out of the new `Pendientes` board.
- Updated cache invalidation so payment posting, corrections, enrollment changes, and call follow-up refresh the correct `Pendientes` and/or `Llamadas` surfaces.

## 2026-04-21 (session 111)

### Role Access Audit + Production Diagnostic (v1.16.57)

- Added `Super Admin > Auditoria accesos`, a production-safe read-only diagnostic page for:
  - Supabase URL/service-role project-ref match status
  - key live user role rows
  - resolved operational and nutrition campus scope
  - quick access indicators for Caja, sports, nutrition, and director surfaces
- Kept preview impersonation isolated in `Debug permisos`; the new page does not impersonate users and does not write data.
- Added `docs/production-access-runbook.md` for env checks, safe project-ref comparison, role bootstrap checks, safe log-sharing rules, and post-deploy smoke tests.
- Updated the role permissions audit to reflect the current post-incident state after the campus fallback and Supabase env guard fixes.
- Updated Julio's intended sports scope decision in docs: `julioc@dragonforcemty.com` should be global `director_deportivo` so he can see all sports signup boards without money amounts.

## 2026-04-21 (session 110)

### Supabase Production Env Guard (v1.16.54-v1.16.56)

- Root-caused the live Caja pricing outage to a Vercel production env mismatch:
  - `NEXT_PUBLIC_SUPABASE_URL` pointed at prod project `hjvytfaalnfcqfgbxsmj`
  - `SUPABASE_SERVICE_ROLE_KEY` belonged to project `eqefgwdsqabnmpnbpqbq`
  - Supabase rejected trusted admin reads with `Invalid API key`, which made pricing plans look empty at runtime.
- Confirmed prod pricing rows still existed and Caja recovered after replacing the Vercel production service-role key and redeploying.
- Added a Supabase admin-client guard that compares the project ref in the Supabase URL against the project ref embedded in the service-role JWT.
- Guard behavior:
  - throws with a clear safe diagnostic for proven URL/key project mismatches
  - logs a warning if the key format cannot be verified
  - never logs the secret value.
- Added `.vercelignore` so future manual Vercel CLI deployments do not package local `.env*` files from the workstation, including `.env.example`.
- Assessment: this was an availability/configuration failure, not evidence of pricing-table deletion or finance data corruption.

## 2026-04-21 (session 109)

### New Player Pricing Audit Follow-up (v1.16.53)

- Re-audited the live Caja new-player failure after every Caja user still saw `No se encontro una configuracion de precios valida para esa fecha` on the `Inscripcion y mensualidad` card.
- Vercel logs showed the actual server-side signal:
  - `[intake] no pricing plan versions returned from admin client { defaultStartDate: '2026-04-20' }`
  - this means the client card was not failing because `20/04/2026` lacked a rule; the production runtime was receiving zero pricing plan versions from its Supabase admin query.
- Added a safer pricing fallback:
  - first load the expected `standard` plan versions
  - if none are returned, load any active pricing plan versions so the form is not blocked by a plan-code mismatch
- Added stronger diagnostics when pricing is still empty:
  - safe Supabase runtime summary (`urlProjectRef`, service-role JWT project ref/role, no secrets)
  - visible pricing plan rows returned by the runtime query
  - query error message if Supabase rejects the pricing plan read
- Verification:
  - `npm run typecheck`
  - `npm run build`

## 2026-04-20 (session 108)

### Campus Access Fallback for Scoped Roles (v1.16.51)

- Root-cause investigation revealed that when the `campuses` nested join in `loadRoleRows` returns `null` (RLS policy evaluation timing), every scoped role (front_desk, director_deportivo, nutritionist) ends up with an empty campus list — silently breaking all downstream queries filtered by campus.
- Fixed in `getOperationalCampusAccess()` and `getNutritionCampusAccess()`: added a fallback that reconstructs the campus list from the `campus_id` column on `user_roles` (always returned, not a join) matched against the already-loaded `allCampuses` list.
- Added defensive migration `20260420180000_ensure_enrollment_tuition_rules.sql`: idempotent re-insert of enrollment tuition rules for any active standard plan that has none (addresses potential silent data gap causing the client-side pricing error).
- Added `console.warn` in `getEnrollmentIntakeContext()` when pricing versions are loaded but the quote is still null — will appear in Vercel logs for diagnosis if the data gap persists.
- Fixes: Caja front desk "No se encontró configuración de precios", Julio (director_deportivo) empty Inscripciones Torneos, Denisse (nutritionist) empty player list.

## 2026-04-20 (session 107)

### Caja Intake Config Fallback (v1.16.50)

- Follow-up for Caja Contry still seeing `/players/new?err=config_error` after the role-permission stabilization deploy.
- Moved the new-player and existing-player enrollment form-context pricing reads to the trusted server client so front-desk page hydration does not depend on pricing-table RLS.
- Added structured server logging when intake/enrollment config resolution fails, including plan code, start date, charge type codes present, and which required part is missing.
- Kept the action-side trusted pricing reads from `v1.16.49` and added a defensive `standard` fallback if the hidden plan code is unexpectedly blank.

## 2026-04-20 (session 106)

### Role Permission Stabilization (v1.16.49)

- Locked the owner's role/access decisions into `docs/role-permissions-audit.md`.
- Changed `Gestion > Panel` to director-only while keeping front desk on operational `Pendientes` and `Inscripciones Torneos`.
- Added a stabilization migration for:
  - nutritionist self-read access to role bootstrap rows
  - nutritionist read access to tutor links/contact rows for nutrition-safe profiles
  - front-desk read access to newer pricing tables used by intake quotes
- Moved `Inscripciones Torneos` data loading to a trusted server-side query after app-layer campus checks so `director_deportivo` can see sports status chips without raw money amounts.
- Hardened new-player / new-enrollment intake setup reads by resolving pricing and charge types with the trusted server client after campus validation.
- Updated nutrition surfaces to show gender, medical notes, and tutor contact information; `director_admin` remains read-only for nutrition measurements.

## 2026-04-20 (session 105)

### Role Permissions Audit Started

- Added `docs/role-permissions-audit.md` as the working source of truth for role access, route boundaries, RLS expectations, and known mismatches.
- Captured current production role assignment facts for:
  - `julioc@dragonforcemty.com` as Linda Vista `director_deportivo`
  - `sebastiang@dragonforcemty.com` as Contry `director_deportivo`
  - `denisseo@dragonforcemty.com` as Linda Vista `nutritionist`
  - current front-desk assignments
- Documented the likely live/preview mismatch:
  - preview debug mode can pass because the actor is superadmin while production users hit RLS as themselves
- Identified three active permission-boundary issues to resolve next:
  - nutritionist live bootstrap needs explicit self-read role policies
  - `Inscripciones Torneos` is app-allowed for sports users but still depends on raw tables that sports RLS does not expose
  - one-page front-desk intake crosses multiple staged inserts where some RLS checks require a campus relationship that does not exist until later in the flow

## 2026-04-20 (session 104)

### Emergency Auth Bootstrap Fallback Hotfix (v1.16.48)

- Fixed a production auth regression introduced in `v1.16.47`.
- Root issue:
  - protected-app role bootstrap had been switched to depend primarily on trusted admin-client reads for `user_roles` and active campuses
  - in production, that path could silently resolve empty role/campus reference data, which made authenticated users look role-less and redirected everyone to `Sin autorizacion`
- Hotfix behavior:
  - role bootstrap now tries the original signed-in user session read first
  - only falls back to the admin client if the session read is empty or errors
  - active-campus bootstrap now follows the same safe pattern
- Operational result:
  - restores access for normal users immediately
  - still preserves an admin-client recovery path for campus-scoped specialist roles if their self-read reference policies are incomplete
- Verification:
  - `npm run typecheck`

## 2026-04-20 (session 103)

### Role Bootstrap + Intake Hotfix (v1.16.47)

- Hardened protected-app role bootstrap for campus-scoped specialist users.
- Role resolution in the protected shell now reads `user_roles` through the trusted server admin client instead of depending on the signed-in user being able to self-read that reference data through RLS.
- Active campus catalog loading for permission bootstrap now also uses the trusted server admin client.
- This specifically protects access for roles like `director_deportivo` if self-read reference policies drift or are incomplete in production.
- Hardened the one-page enrollment intake action used by Caja/front desk:
  - the multi-step create flow now writes with the trusted server admin client after normal user authentication and campus validation succeed
  - rollback cleanup for partial failures now uses the same trusted path
  - added server-side error logging for guardian, player, guardian-link, enrollment, charge-seed, and auto-team-assignment failures so future intake failures are easier to diagnose
- Operational intent:
  - fix the reported `Tutor` creation failure during new player + new enrollment intake
  - remove the fragile dependency between specialist login access and user-scoped role-reference RLS
- Verification:
  - `npm run typecheck`
  - `npm run build`

## 2026-04-20 (session 102)

### Nutrition Role + Measurement Intake v1 (v1.16.46)

- Added a new campus-scoped `nutritionist` role through app code plus migration/RLS wiring:
  - separate nutrition campus access helper
  - separate app-layer nutrition guard
  - admin role assignment support
  - preview debug personas for Linda Vista and Contry nutrition staff
- Added a new top-level `Nutricion` lane in the protected app:
  - `/nutrition` panel
  - `/nutrition/measurements`
  - dedicated safe player route at `/nutrition/players/[playerId]`
- The nutrition lane is intentionally isolated from finance and general player-admin flows:
  - no Caja
  - no `Pendientes`
  - no `Competencias`
  - no full existing player profile
  - no enrollment editing or level editing
- Added historical measurement storage with `player_measurement_sessions`:
  - one row per visit
  - scoped to player + enrollment + campus
  - `source = initial_intake | follow_up`
  - v1 captures `weight_kg`, `height_cm`, and optional notes
- Intake queue logic is derived, not manually staged:
  - an active enrollment is pending nutrition until that enrollment has its first measurement session
  - re-enrolled players re-enter the queue automatically if the new enrollment has no session
- Added nutrition-facing UX:
  - first-take pending queue vs all active players
  - latest measurement snapshot on the list
  - nutrition-safe player profile with current summary, deltas vs prior session, history table, and trend chart
  - append-only measurement form for v1 safety
- Hardened route access so nutrition users cannot drift into operational player flows by URL:
  - `/players`
  - `/players/new`
  - `/players/[playerId]`
- Verification:
  - `npm run typecheck`
  - `npm run build`

### Finance Warning Normalization Batch Pass (v1.16.45)

- Extended `scripts/plan-finance-repair-pass.mjs` with an explicit warning-normalization mode:
  - `--warning-normalization tuition_first_future_monthly`
  - targets the mixed advisory shape:
    - `payment_reassign_delicate`
    - `repricing_unsafe_monthly_tuition`
  - reassigns money within the same posted payment from non-monthly extras back to the partially covered future monthly tuition
- Tightened the planner safety rules for warning-mode:
  - only accounts that simulate completely clean after the rewrite are emitted as `rpc_ready`
  - partially improved accounts stay in `manual_followup`
  - touched payments are now derived from the actual allocation diff, so zeroed rows stay inside verification scope
- Prod execution for this pass:
  - full warning-only queue before pass: `49`
  - normalized plan result:
    - `20` `rpc_ready`
    - `29` `manual_followup`
  - dry-run verification on prod:
    - `20/20` ok
  - applied on prod:
    - `20/20` ok
    - `0` failures
- Stable post-pass prod snapshot:
  - anomalous accounts: `29`
  - all remaining accounts are still `warning_only`
  - remaining warning shape:
    - `24` `payment_reassign_delicate`
    - `3` `payment_reassign_delicate + repricing_unsafe_monthly_tuition`
    - `2` `payment_partial_allocation + unapplied_credit`
- This pass did not introduce drift:
  - canonical/derived drift stayed at `0`
  - no new unapplied-credit states were created
- Follow-up decision recorded:
  - the `24` remaining `payment_reassign_delicate` accounts are being explicitly deferred, not accepted as resolved
  - current assessment is that they are structurally delicate but not presently drifting
  - cleanup is still desired because the current result is operationally unsatisfying and leaves historical payment structure noise in prod
  - keep that lane open for a later targeted pass once bandwidth returns
- Validation:
  - `npm run typecheck` passed
  - `npm run diagnose:finance -- --env-file .env.prod.local --out tmp/prod-finance-anomaly-report-post-warning-pass.json`

## 2026-04-20 (session 101)

### Finance Warning Classification Follow-Up (v1.16.44)

- Re-ran the live prod finance exporter after `Iker Alejandro Arenas Garza` was corrected.
- Current prod shape:
  - `49` anomalous accounts total
  - `0` auto-repair candidates
  - `23` accounts previously landing in `manual_review`
  - `26` `warning_only`
- Important finding:
  - all `23` remaining `manual_review` accounts shared the exact same combo:
    - `payment_reassign_delicate`
    - `repricing_unsafe_monthly_tuition`
  - in every sampled case, canonical and derived balances already match
  - this means the remaining queue is operationally delicate, but not financially broken
- Refined exporter classification again:
  - `repricing_unsafe_monthly_tuition` now counts as warning-grade operational caution for queue classification
  - combined with `payment_reassign_delicate`, those accounts now land in `warning_only` instead of `manual_review`
- This change does not silence the underlying account notes in diagnostics; it only makes the exported cleanup queue match the real severity of the remaining states.
- Validation:
  - `npm run typecheck` passed

## 2026-04-19 (session 100)

### Finance Sanity Warning Severity + True Deep Review Follow-Up (v1.16.43)

- Refined `/admin/finance-sanity` so the top state no longer treats all anomalies as equally severe.
- New behavior:
  - green when the system is clean
  - red only when there is true global drift or correction-grade account damage
  - amber when only warning-grade operational review items remain
- Added warning/correction counts to the active anomaly header so the queue is easier to interpret at a glance.
- Fixed the practical gap in `Escaneo profundo`:
  - before this pass, deep mode still depended on a bounded candidate queue built from drift rows, recent anomaly events, recent finance mutations, and nonzero-balance enrollments
  - this meant some zero-balance but still delicate accounts, especially `payment_reassign_delicate`, could remain invisible even during a deep review
  - deep mode now expands to the full active enrollment candidate set, so the page can surface those delicate accounts intentionally
- Production interpretation after `Iker Alejandro Arenas Garza` was corrected:
  - actionable auto-repair candidates are now down to `0`
  - remaining prod queue is:
    - `23` manual-review accounts
    - `26` warning-only accounts
  - the red top banner was therefore overstating the current state; most remaining issues are advisory/manual-review structures, not shared-source drift
- Validation:
  - `npm run typecheck` passed

## 2026-04-18 (session 99)

### Finance Reconciliation Snapshots + Sanity Monitoring Follow-Up (v1.16.42)

- Added a new DB migration to persist lightweight finance reconciliation snapshots on a schedule instead of forcing every review to depend on a full deep scan.
- New DB objects:
  - `public.finance_reconciliation_snapshots`
  - `public.capture_finance_reconciliation_snapshot(...)`
  - `public.get_latest_finance_reconciliation_snapshot(...)`
- The scheduled capture is intentionally narrow:
  - canonical pending balance
  - pending RPC balance
  - dashboard pending balance
  - count drift between those shared sources
  - total enrollment-level balance-drift row count
- This does **not** replace the account-level anomaly toolkit or the new `Escaneo profundo`; it complements them with a cheap background baseline.
- Added a new `Snapshot automatico global` card to `/admin/finance-sanity`:
  - shows the latest scheduled capture time
  - shows stored pending drift, panel drift, and drift-row count from that snapshot
  - page falls back safely if the DB migration has not been applied yet, so deploy order will not break the admin surface
- Operational interpretation after the latest finance cleanup:
  - true hard corruption is now down to the single unresolved manual account (`Iker Alejandro Arenas Garza`)
  - the rest of the current queue is mostly warning-grade historical complexity, especially `payment_reassign_delicate`
  - the right next decision is product/ops policy:
    - either keep those warnings visible as intentional review signals
    - or demote some of them from top-level anomaly noise if they do not represent broken money state
- Validation:
  - `npm run typecheck` passed

## 2026-04-18 (session 98)

### Finance Sanity Deep Mode + Refund/Void Guard + Residual Cleanup Follow-Up (v1.16.41)

- Added local-workspace hygiene to `.gitignore`:
  - `.vscode/`
  - `tmp/`
- Added a deeper manual review mode to `/admin/finance-sanity`.
- The page now supports:
  - `Escaneo reciente`
  - `Escaneo profundo`
- Deep mode remains intentionally heavier than the default page load, but it broadens the candidate window beyond the small recent-activity queue:
  - larger recent-audit slice
  - larger drift slice
  - adds balance-bearing enrollments into the candidate pool
- Tightened a real finance guardrail:
  - a payment that already has a row in `payment_refunds` can no longer be voided from the normal ledger action
  - the same protection was added to superadmin audit-log reversal of `payment.posted`
- This closes the specific contradictory-history path where a refunded payment could later become `void`, which leaves account state harder to reconcile.
- Refined anomaly-export classification again:
  - pure residual-credit states now classify as `warning_only` instead of staying in the auto-repair bucket
  - this especially affects accounts whose real corruption is already gone but still carry unapplied posted credit
- Production data follow-up:
  - manually cleaned the remaining void-allocation corruption on:
    - `Ignacio F. Belmares Briones`
    - `Marcelo Rodríguez Pedraza`
  - both accounts now reduce to residual-credit warnings instead of active drift / void-allocation corruption
  - one true hard manual case remains open:
    - `Iker Alejandro Arenas Garza`
  - current understanding:
    - `Ignacio` and `Marcelo` now have legitimate-looking leftover credit states, not the earlier broken void-allocation state
    - `Iker` still needs a transaction-history decision because the account mixes:
      - a refunded payment history
      - later voiding
      - a stale allocation on a voided charge
      - posted-credit drift that is not safely resolvable by allocation rewiring alone
- Validation:
  - `npm run typecheck` passed

## 2026-04-18 (session 97)

### Finance Repair Apply Script + Stable Full-Scan Verification (v1.16.40)

- Added a dedicated execution script at `scripts/apply-finance-repair-pass.mjs`.
- Goal:
  - apply only the preplanned constrained allocation repairs against the exact prod accounts already classified as RPC-ready
  - block writes if the live payment-allocation state no longer matches the saved repair plan
- The apply script now:
  - reads the prod env file locally
  - loads the generated repair-plan JSON
  - verifies current touched allocations still match the saved plan
  - validates payment totals and charge-cap math before any write
  - deletes and recreates only the selected payment allocations for the targeted payments
  - writes a local before/after execution log for the run
- Added a package shortcut:
  - `npm run apply:finance-repair -- --env-file <env-file> --plan <plan-file> --out <log-file> --apply`
- Hardened the read-only exporter full-scan path:
  - `payment_allocations` pagination now orders by stable unique `id`
  - this prevents false readback drift when scanning the full table after repairs
- Production cleanup pass executed:
  - dry-run verified all 5 planned accounts still matched the saved state
  - apply pass succeeded for all 5 targeted accounts
  - exact targeted verification outcome:
    - `Nicole Alejandra Huerta Jimenez` cleared completely
    - `Alan Mathias Guerrero Monroy`, `Danna Michelle Huerta Jimenez`, `Dominic André Cid de León Velez`, and `Mia Jacqueline Juárez Flores` dropped to `warning_only`
- Stable full prod scan after the pass:
  - anomalous accounts: `51 -> 50`
  - `auto_repair_candidate`: `8 -> 3`
  - `manual_review`: stayed `23`
  - `warning_only`: `20 -> 24`
- Interpretation:
  - the first bulk repair pass removed all 5 previously RPC-ready accounts from the actionable-repair bucket
  - only 3 true first-pass repair candidates remain
  - the remaining warning/manual population is still a separate lane and was not bulk-touched here
- Validation:
  - dry-run apply script passed on all 5 targeted accounts
  - live apply script passed on all 5 targeted accounts
  - stable full-scan exporter rerun completed successfully
  - `npm run typecheck` passed

## 2026-04-18 (session 96)

### Finance Cleanup Planner + Safer Auto-Repair Classification (v1.16.39)

- Tightened the read-only finance anomaly exporter so `payment_reassign_delicate` by itself no longer gets marked as an auto-repair candidate.
- The exporter now splits simple warning-only rows away from real first-pass repair candidates:
  - `warning_only`
  - `auto_repair_candidate`
  - `manual_review`
- Added a second standalone script at `scripts/plan-finance-repair-pass.mjs`.
- Goal:
  - turn the exported prod anomaly report into an actual cleanup plan
  - separate accounts that can close cleanly through `repair_payment_allocations` from accounts that still need manual toolkit review
- The planner now:
  - reads the JSON report from the diagnostic exporter
  - simulates the proposed allocation rewrite per account
  - computes exact `selectedPaymentIds`, `selectedChargeIds`, and `allocationPlan` payloads for RPC-safe rows
  - flags residual-credit cases that would still fail or remain dirty after a bulk allocation rewrite
- Added a package shortcut:
  - `npm run plan:finance-repair -- --report <json-file> --out <plan-file>`
- Prod cleanup planning result from the latest read-only scan:
  - 51 anomalous accounts total
  - 20 are now correctly treated as `warning_only`
  - 23 remain `manual_review`
  - 8 remain first-pass repair targets
  - of those 8, only 5 are currently RPC-ready for a bulk constrained allocation repair
  - the remaining 3 still leave residual posted credit after the simulated rewrite and must stay in the manual lane
- Validation:
  - exporter rerun against prod completed successfully after the classification refinement
  - planner ran successfully against the prod report and wrote a structured cleanup-plan JSON
  - `npm run typecheck` passed

## 2026-04-18 (session 95)

### Read-Only Finance Diagnostic Exporter for Prod Cleanup Planning (v1.16.38)

- Added a standalone read-only script at `scripts/export-finance-anomaly-report.mjs`.
- Goal:
  - let production finance anomalies be inspected safely without exposing prod credentials in chat
  - support the upcoming cleanup pass by exporting a structured JSON snapshot of suspicious accounts
- The exporter can:
  - read credentials from a local env file passed at runtime
  - scan all enrollments or a provided list of enrollment IDs
  - compute the same family of anomaly signals used in the finance-diagnostics work
  - classify accounts into:
    - `auto_repair_candidate`
    - `mixed_review`
    - `manual_review`
  - include a dry-run normalization preview for leftover credit / void-charge allocation states
- Added a package shortcut:
  - `npm run diagnose:finance -- --env-file <env-file> --out <json-file>`
- Validation:
  - ran successfully against preview and wrote a JSON report
  - `npm run typecheck` passed
- This tool is intentionally read-only:
  - it does not write allocations
  - it does not mutate charges or payments
  - it is only for diagnosis and cleanup planning

## 2026-04-18 (session 94)

### Payment Void Rebalance Follow-Up + Cleanup Planning (v1.16.37)

- Investigated a second real finance mutation bug reported after the charge-void fix:
  - annulling a payment released that payment's own `payment_allocations`
  - but any other posted credit still left on the same account was not immediately re-applied
  - result: some accounts could keep canonical balance correct while still showing operational anomalies like:
    - `Pago parcialmente asignado`
    - `Credito no aplicado`
    - charges feeling pending even though the account-level balance was already covered
- Added a shared post-void credit-normalization helper:
  - after a payment is voided, remaining posted non-refunded credit on the enrollment is swept back onto pending charges in FIFO order
  - the helper prefers the payment's previous source charges first when they are still eligible, then falls back to the normal pending-charge order
- Applied the same safeguard to both payment-void entry points:
  - normal `voidPaymentAction`
  - superadmin audit-log reversal of `payment.posted`
- Added audit metadata to both flows so finance cleanup can see how much allocation was automatically rebalanced after the void.
- Validation:
  - `npm run typecheck` passed
- Important limitation:
  - this patch prevents new payment-annulment cases from drifting the same way
  - it does not auto-repair older damaged accounts that were already left in a broken mixed-credit state before this fix
- Cleanup-planning note:
  - the local workspace credentials currently point to the preview Supabase project, not the production dataset that contains the 19 live anomaly accounts from the screenshot
  - those screenshot enrollment IDs do not exist in the DB accessible from this workspace, so the real cleanup pass still needs production data access or an exported target-account list from prod

## 2026-04-17 (session 93)

### Finance Sanity Triage: Charge-Void Fix + Monitoring Noise Reduction (v1.16.36)

- Investigated the first live wave of `Sanidad financiera` results after enabling anomaly monitoring.
- Confirmed one real bug in the ledger mutation path:
  - `voidChargeAction` was marking a charge as `void` without releasing its `payment_allocations`
  - this directly created the `Cargo anulado con pagos aplicados` state and could also cascade into derived-balance drift
- Fixed charge-void behavior so future voided charges now release their allocations before the charge is voided.
- Applied the same defensive release step to:
  - batch void of pending charges for bajas
  - reversing `charge.created` from audit/admin tools
- Added tournament-signup revalidation to charge-void handling, so voiding a competition charge does not leave sports signup state stale.
- Tightened the global anomaly monitor to reduce false alarm volume:
  - these states still appear inside the per-account diagnostic panel as operational warnings
  - but they no longer populate the top-level active-anomaly queue or anomaly audit events by themselves:
    - `Pago registrado sin asignaciones`
    - `Pago parcialmente asignado`
    - `Pago con estructura de asignacion delicada`
    - `Credito no aplicado`
- Updated `Sanidad financiera` banner copy so the page distinguishes:
  - real balance drift
  - broader financial anomalies
- Result:
  - future charge-void mistakes should stop creating the same corruption pattern
  - the global sanity page should now skew much more toward true correction-needed accounts instead of normal carry-forward credit situations
- Existing damaged accounts were not auto-repaired in this pass.
  - those still need either toolkit repair or a targeted cleanup pass once we inspect the remaining queue after this hotfix

## 2026-04-17 (session 92)

### Account Surfaces + Finance Drift Monitoring (v1.16.35)

- Extended the finance diagnostics work into a shared anomaly-monitoring lane.
- Added a machine-readable enrollment anomaly snapshot layer and reused it across:
  - enrollment `Diagnostico financiero`
  - mutation-triggered anomaly checks
  - `/admin/finance-sanity`
- Wired anomaly state-change auditing into the risky enrollment finance mutations:
  - charge void
  - payment void
  - refund
  - payment reassignment
  - Caja charge / advance tuition flows
  - Contry historical payment posting
  - superadmin correction-toolkit actions
- New audit events now record when anomaly state changes:
  - `finance.anomaly_detected`
  - `finance.anomaly_resolved`
- Expanded `/admin/finance-sanity` beyond pure balance drift:
  - active anomaly review by enrollment
  - recent anomaly event feed
  - filters for campus, anomaly code, and severity
- Kept the monitoring lane diagnostic-only:
  - no finance semantic change
  - `v_enrollment_balances` remains the live-balance truth
- Landed the bundled account-surface polish pass:
  - dedicated enrollment account page now shows linked player context and functional breadcrumbs
  - `Regularizacion Contry` selected-account header now keeps birth year visible
  - player profile active-account ledger now stacks vertically for usable width
  - shared charge/payment tables were compacted so core action buttons stay visible more often without side-scrolling

## 2026-04-17 (session 91)

### Roadmap Refresh: Drift Monitoring, Account Polish, Sports Rethink, Attendance Priority

- Logged the next planning/priority updates coming out of live front-desk and admin usage.
- Added a new finance hardening follow-up centered on proactive drift/anomaly monitoring.
  - this is the next layer above the existing diagnostic tools
  - goal: surface suspicious ledger states earlier instead of only finding them account by account
- Reopened a targeted UI polish pass for the remaining account surfaces that still lost the year-of-birth context.
  - first named gaps:
    - enrollment `Cargos y Cuentas`
    - `Regularización Contry`
  - same pass should also restore obvious navigation back to player profile from account views and make breadcrumbs more consistently actionable
- Logged a broader sports-product rethink note:
  - the temporary `Inscripciones Torneos` board has matched real operations better than the heavier hidden competition-management surfaces
  - future sports planning should extend from that successful paid-signups flow toward schedules, results, and calendar operations
- Bumped attendance discovery/build-up as the next major planning lane after the current urgent fixes, instead of leaving it as a distant later-phase item.

## 2026-04-17 (session 90)

### Product Detail Paging + KPI Drilldowns (v1.16.34)

- Extended the product detail page with real paging on `Ultimas ventas`.
  - the sales ledger is no longer hard-capped to the newest 25 rows only
  - it now supports `Anterior / Siguiente` paging in blocks of 25 using the product route query string
- Added a new product drilldown route for the count KPI cards.
- The following KPI cards are now clickable:
  - `Cargos registrados`
  - `Cargos este mes`
  - `Jugadores con cargo`
  - `Jugadores totalmente pagados`
  - `Cargos sin pagar`
  - `Brecha vs pagados`
- The money-total cards remain summary-only in this first pass:
  - `Monto cargado total`
  - `Monto cargado este mes`
- The new drilldown page stays director-only and uses paged tables scoped to one product.
- Metric semantics were kept aligned with the existing product page:
  - `Jugadores totalmente pagados` follows the same reconciliation logic already used on the product screen
  - `Brecha vs pagados` drills into the same reconciliation-issue rows instead of inventing a second gap definition
- No schema change or accounting change was introduced in this pass.

## 2026-04-17 (session 89)

### Inscripciones Torneos Quick Export Copy Cleanup (v1.16.33)

- Tightened the new `Inscripciones Torneos` quick-export formatting after first UI review.
- `Copiar texto` no longer includes the `pagados / activos` ratio line.
  - copied text now uses:
    - competition
    - campus
    - category
    - player list only
- `Exportar PNG` no longer shows the `pagados / activos` ratio block.
  - the right-side stat now shows only the confirmed paid-player count as:
    - `1 Jugador`
    - `10 Jugadores`
- No counting logic changed; this is output-format polish only.

## 2026-04-17 (session 88)

### Inscripciones Torneos Card Visibility + Quick Export (v1.16.32)

- Expanded the main `Inscripciones Torneos` category cards so they no longer cut the roster at 12 names.
- The board now shows the full paid-player list directly on each `CAT` card:
  - cards grow vertically as needed
  - larger categories split into two internal columns for easier scanning
  - no internal scroll area was added
- Reworked the category card interaction so it remains a fast path into the detail view without making the new actions misfire:
  - the card still opens the category detail route
  - local action buttons stop propagation correctly
- Added two new per-card operational tools for all users who can access the page:
  - `Exportar PNG`
  - `Copiar texto`
- `Copiar texto` now builds a plain-text roster payload with:
  - competition
  - campus
  - category
  - `pagados / activos`
  - one player per line
- `Exportar PNG` is client-side and card-scoped:
  - no new query path
  - no schema change
  - no change to competition counting logic
- Existing category drilldown and the superadmin-only CSV export remain unchanged.

## 2026-04-17 (session 87)

### Director Deportivo Self-Access Fix (v1.16.31)

- Fixed a real access hole affecting `director_deportivo` users at login/protected-layout bootstrap.
- Root cause:
  - sports directors could be assigned correctly in `user_roles`
  - but they were missing the self-read RLS needed to load:
    - their own `user_roles`
    - referenced `app_roles`
    - active `campuses`
  - result: the app could authenticate them, then still see zero effective roles and send them to `unauthorized`
- Added the missing DB policies so authenticated `director_deportivo` users can read the minimal auth/reference data needed to resolve their own campus scope.
- This is a narrow auth bootstrap fix only:
  - no finance changes
  - no sports workflow changes
  - no permission expansion into admin/finance surfaces

## 2026-04-17 (session 86)

### Correction Toolkit Diagnostics Hotfix (v1.16.30)

- Fixed a diagnostic false-positive exposed by live testing with `Ajuste de saldo`.
- Root cause:
  - the account diagnostic layer was deriving its operational balance from only visible pending charge amounts
  - a negative non-cash balance adjustment was therefore ignored in the derived balance
  - the same negative line could also be misread as a `Cargo sobreaplicado`
- The diagnostic query now:
  - derives operational balance from the full net visible charge exposure (`amount - allocated`) instead of only positive pending amounts
  - keeps unapplied posted payments as separate visible credit
  - stops flagging negative adjustment rows as overapplied just because their amount is below zero
  - adds a more precise safeguard instead: a negative adjustment with real payment allocations is now the anomaly
- Result:
  - a valid negative `Ajuste de saldo` that brings an account to zero should no longer create fake drift or fake overapplied-charge warnings
  - the canonical balance model remains unchanged
  - this was a read-path hotfix only, with no schema or accounting change

## 2026-04-17 (session 85)

### Constrained Correction Toolkit v1 (v1.16.29)

- Extended the superadmin-only `Diagnóstico financiero` panel into a real account-level repair surface on both:
  - the dedicated enrollment account page
  - the active-account block inside player profile
- Added a new `Toolkit de corrección` section under diagnostics with exactly 3 constrained tools:
  - `Cargo correctivo`
  - `Ajuste de saldo`
  - `Reparar asignaciones`
- Added dedicated repair-only charge categories backed by `charges` instead of fake payment history:
  - `corrective_charge`
  - `balance_adjustment`
- `Cargo correctivo` can now create one enrollment-scoped corrective line as either:
  - `Pendiente`
  - `Registrado no caja`
- `Ajuste de saldo` can now create one enrollment-scoped non-cash balance adjustment without creating:
  - payment rows
  - receipts
  - Caja / cash-session side effects
- Added an atomic SQL repair path for `Reparar asignaciones`:
  - one enrollment only
  - posted, non-refunded payments only
  - non-void destination charges only
  - explicit payment-to-charge amount matrix
  - payment totals must close exactly
  - destination charges cannot end overapplied
  - full before/after allocation map is returned for audit logging
- Tightened the repair lane to the intended authority model:
  - app layer is `superadmin` only
  - the SQL allocation-repair function now also enforces `superadmin` directly
  - function execute is granted only to `authenticated`
- Ledger/admin visibility follow-through:
  - corrective/non-cash charge rows now carry explicit labels in the normal charges ledger
  - new audit actions were added to both activity views:
    - `charge.corrective_created`
    - `balance_adjustment.created`
    - `payment_allocations.repaired`
- Guardrails:
  - no fake posted payments
  - no receipt generation
  - no Caja totals affected by non-cash repairs
  - no cross-enrollment repair path in this v1

## 2026-04-16 (session 84)

### Enrollment Finance Diagnostic Panel v1 (v1.16.28)

- Added a new superadmin-only, read-only `Diagnóstico financiero` panel on both account surfaces:
  - the dedicated enrollment account page
  - the active-account block inside player profile
- The panel is collapsed by default and explains one enrollment’s finance state without mutating anything.
- Added a new shared account-level diagnostic query layer that combines:
  - canonical live balance from `v_enrollment_balances`
  - ledger-visible charge/payment rows
  - allocation-derived credit math
  - refund context
- The panel now highlights the main account-level root causes we need before building correction tools:
  - posted payments with no allocations
  - partially allocated posted payments
  - suspicious refunded payments
  - duplicate same-period monthly tuition rows
  - overapplied or voided-yet-allocated charges
  - canonical-vs-operational balance drift
- This is intentionally diagnostic only:
  - no repair buttons
  - no schema change
  - no alternate finance truth
- `/admin/finance-sanity` remains the global drift page; this new panel is the enrollment-level root-cause view that the later constrained correction toolkit will work from.

## 2026-04-16 (session 83)

### Contry Historical Tuition Workflow: Clarification Pass (v1.16.27)

- Tightened the `Regularización Contry` UI after live testing exposed a workflow misunderstanding:
  - the generic `Registrar pago histórico` form still posts payments only
  - it does **not** recalculate an existing monthly tuition amount from the historical payment date
- Added an explicit warning when staff selects a monthly tuition charge in the historical payment form:
  - first use `Agregar nuevo cargo > Mensualidad` to create or reprice the monthly tuition with the real historical datetime
  - then post the historical payment
- Added a helper note on the `Mensualidad` selector clarifying that the final tuition amount is resolved when the monthly action is saved with the historical datetime, not from the generic payment form.

## 2026-04-16 (session 82)

### Contry Historical Tuition Workflow v1 (v1.16.26)

- Patched `Regularización Contry` so `Mensualidad` now uses the exact historical datetime captured by staff to resolve the tuition rate for the selected period.
- The Contry tuition action is no longer "always create a new row":
  - if the target period has no active tuition charge, it creates one
  - if the target period already has exactly one active tuition charge with no allocations, it reprices that same row in place
  - if the target period has allocations, it blocks instead of mutating money under posted history
  - if the target period already has multiple active tuition rows, it blocks and surfaces a correction-needed error
- The historical rate resolver is durable for any selected tuition period, not just the April cleanup:
  - it resolves the pricing-plan version from the captured historical datetime
  - then applies scholarship rules on top of that resolved tuition amount
  - `Media beca` uses 50% of the historical tuition amount
  - `Beca completa` blocks Contry tuition creation/repricing for that period
- Contry charge context now includes current/future monthly tuition periods that already exist, so staff can explicitly pick an existing period and reprice it when it is still clean.
- The immediate payment prompt stays intact, but now prefills the same historical datetime used to calculate the tuition charge and shows that context back to the operator.
- This pass keeps the Contry workflow as a small durable fix on top of the existing two-step process:
  - create/reprice tuition first
  - then post the historical payment
  - no accounting rewrite and no schema change

## 2026-04-16 (session 81)

### Roadmap Note: Finance Correction Lane

- Logged the new top-priority finance correction sequence in the roadmap so the work lands in the right order:
  - `Urgent`: Contry historical tuition workflow
  - `Urgent`: enrollment/account finance diagnostic panel for `superadmin`
  - `After that`: constrained correction toolkit
  - `Only later`: broader cleanup of front-desk correction UX
- Locked product guidance for that lane:
  - Contry historical tuition should become a one-step create+pay historical monthly tuition flow that resolves pricing from the real payment datetime
  - write-offs should use explicit balance adjustments, not fake posted payments
  - missing payment facts should use non-cash adjustment tools instead of invented payment history

## 2026-04-16 (session 80)

### Scholarship Workflow v1: Full + Half Tuition Scholarships (v1.16.25)

- Replaced the old backend-only `has_scholarship` path with a real enrollment scholarship workflow centered on `scholarship_status = none | half | full`.
- Added director-only scholarship control to `Editar inscripción` with the operational states:
  - `Sin beca`
  - `Media beca`
  - `Beca completa`
- Scholarship updates now sync only **pending monthly tuition from the current month forward**:
  - `Media beca` reprices eligible pending tuition to 50%
  - `Beca completa` voids eligible pending tuition rows instead of rewriting history
  - `Beca completa -> Sin beca / Media beca` can recreate the current month tuition if it is missing and not omitted by an incident
  - any current/future pending tuition row that already has payment allocations blocks the scholarship change with a clear operational error
  - current-month scholarship sync preserves the correct Monterrey day pricing window instead of forcing day-1 tuition after the repricing cutoff
- Updated runtime monthly tuition logic to use the new scholarship status:
  - SQL `generate_monthly_charges(...)`
  - SQL `reprice_pending_monthly_tuition(...)`
  - TS fallback `generateMonthlyChargesCore(...)`
- Kept `has_scholarship` mirrored for compatibility in this pass:
  - `full` -> `true`
  - `none` / `half` -> `false`
- Porto mensual reporting now separates:
  - `Beca completa`
  - `Media beca`
- Admin mensualidades wording was adjusted so operations text now matches the new rule: full scholarship is skipped; half scholarship still generates tuition at 50%.

## 2026-04-16 (session 79)

### Roadmap Note: App-Wide Performance / Indexing Pass

- Logged a separate roadmap follow-up for a broader app performance hardening pass.
- Current state:
  - `Inscripciones Torneos` improved materially after narrowing the board query
  - current performance is acceptable enough to move on to higher-priority product fixes
- Future rule recorded explicitly:
  - use measured timings first
  - prefer query narrowing before indexing
  - add only minimal, justified indexes in production-safe fashion

## 2026-04-16 (session 78)

### Inscripciones Torneos Board Query Narrowing (v1.16.24)

- Optimized the main `Inscripciones Torneos` board query without changing any finance/signup rules.
- The board no longer starts from all positive non-void charges across accessible campuses and filters them later in app code.
- It now:
  - loads competition products first
  - loads only competition-relevant charge rows for the board
  - keeps the legacy description fallback path for temporary buckets like `CECAFF`
  - computes allocation totals only for that reduced charge set
- This is a low-risk read-path optimization only:
  - no schema changes
  - no payment/reporting semantic changes
  - no change to the fully-paid source-of-truth rule

## 2026-04-16 (session 77)

### Inscripciones Torneos Main-Board Perf Debug (v1.16.23)

- Extended the temporary `perf=1` diagnostics to the main `Inscripciones Torneos` board, still gated to `superadmin` only.
- The top page now reports total server time plus the main board-load steps:
  - load products
  - load charges
  - load active enrollments
  - load allocation totals
  - group charges by campus
  - group active enrollments by campus
  - build campus boards
- This gives a direct measurement of the slow first page load before making DB/index changes, so the next performance pass can target the actual bottleneck instead of guessing.

## 2026-04-16 (session 76)

### Superadmin-Only Perf Debug Gate + Future Perf Monitor Note (v1.16.22)

- Restricted the temporary `perf=1` diagnostics path for `Inscripciones Torneos` to `superadmin` only.
- The query instrumentation was already server-side; this pass now also gates the UI path so non-superadmin users do not carry the perf flag through the category-card links or see the timing panel by accident.
- Logged a future follow-up to build a broader app-level performance monitor/debug surface instead of leaving route-by-route diagnostics as the long-term approach.

## 2026-04-16 (session 75)

### Inscripciones Torneos Detail Perf Debug Mode (v1.16.21)

- Added a temporary debug mode for the `Inscripciones Torneos` category detail route.
- Usage:
  - open `/sports-signups?perf=1`
  - click any `CAT` card
  - the detail page will show a server-side timing panel with step-by-step durations
- Current measured steps include:
  - load product
  - load charges
  - load active enrollments
  - load allocation totals
  - load team assignments
  - build level groups
- This is intended to make backend latency visible directly in the UI while diagnosing the remaining slowness on category-card navigation.

## 2026-04-16 (session 74)

### Inscripciones Torneos Detail Query Narrowing (v1.16.20)

- Optimized the `Inscripciones Torneos` category-detail route so it no longer loads the full multi-campus sports-signups base dataset before filtering.
- The detail screen now loads only what it actually needs:
  - the selected campus
  - the selected competition bucket
  - active enrollments for that campus
  - matching charges for that campus/competition
  - the relevant primary team assignments for the visible roster
- This keeps the visible behavior the same while reducing unnecessary query width and payload size when opening a category card.
- Also removed a wasteful export code path that was doing extra detail-query work before rebuilding the actual export rows anyway.

## 2026-04-16 (session 73)

### Inscripciones Torneos Detail View: Unpaid Players by Nivel (v1.16.19)

- Extended the category detail page in `Inscripciones Torneos` so it now shows both:
  - paid players
  - not-paid players
- The unpaid list is built from the same category/campus active roster minus the confirmed paid competition entries, so staff can compare both sides directly in one screen.
- Both sections are grouped by resolved `Nivel` using the same app rule:
  - primary team level first
  - player-level fallback second
- The detail page now shows a quick summary count for:
  - paid confirmed players
  - not-paid players

## 2026-04-16 (session 72)

### Inscripciones Torneos Product-Driven Selector + Nivel Drilldown (v1.16.18)

- Reworked `Inscripciones Torneos` so the top `Competencias` selector is no longer tied only to the older hardcoded three-family board.
- The board now reads competition entries from the actual competition-product layer first:
  - active/inactive competition products of type `tournament` / `cup` / `league` now appear as their own selector cards
  - paid counts are grouped by the specific product instead of only the older family buckets
  - a small legacy CECAFF fallback remains so older non-product charge cases do not disappear during the transition
- Added a category drilldown flow from the main board:
  - clicking a category card now opens a dedicated detail page
  - the detail page groups the paid players by resolved `Nivel`
  - `Nivel` follows the existing app rule: primary team level first, then player-level fallback
- Updated the tournament-signups CSV export to match the new product-driven flow:
  - export now follows the currently selected competition + campus
  - columns now focus on operational reconciliation:
    - `Jugador`
    - `Ano nacimiento`
    - `Campus`
    - `Nivel`
    - `Equipo base`
  - export remains `superadmin`-only

## 2026-04-16 (session 71)

### Inscripciones Torneos Width Pass + CSV Access Tightening (v1.16.17)

- Pushed the `Inscripciones Torneos` board to use more of the available desktop width instead of sitting inside an unnecessarily narrow content column.
- Applied the width change only to this page:
  - enabled the wider `PageShell` mode on `/sports-signups`
  - removed the extra max-width cap from the campus selector row
  - expanded the category-card grid so large screens can show more cards per row
- Tightened the CSV export to `superadmin` only:
  - the `Exportar CSV` button is now hidden for other roles
  - the export route also enforces the same permission server-side instead of relying on the button hide alone
- Operational release-note:
  - moving forward, any repo-tracked implementation change should go straight to `preview`
  - docs-only passes may stay as reference-only updates until the next implementation push if needed
  - `docs/devlog.md` and `docs/roadmap-post-alpha.md` should be updated on every implementation pass

## 2026-04-16 (session 70)

### Tournament Signups CSV Export (v1.16.15)

- Added a CSV export to `Inscripciones Torneos`.
- The export is player-centered instead of payment-ledger-centered so it is easier to compare against external Excel tracking sheets.
- Current CSV columns:
  - `Jugador`
  - `Año nacimiento`
  - `Campus`
  - `SLR`
  - `RPC`
  - `CECAFF`
- Status values per competition family:
  - `Pagado`
  - `Pendiente`
  - `Duplicado`
  - blank when no matching charge exists
- Source of truth matches the current tournament-signups board:
  - positive charge
  - not void
  - family detected from product/description tokens
  - `Pagado` only when allocations fully cover the charge amount
- The export is filtered by the currently selected campus on the page.

## 2026-04-15 (session 69)

### Sports Role Access + Intake Submit Guard + Contry Refresh Trim (v1.16.14)

- Fixed `director_deportivo` role assignment so it can now be granted either:
  - to a specific campus
  - or as `Todos` by leaving campus empty in `Usuarios y Permisos`
- Fixed campus resolution so a `director_deportivo` role without campus scope is treated as global sports access instead of ending up with an empty campus-access set.
- Added an immediate submit lock to the new-player intake form:
  - once staff submits `Crear registro y abrir Caja`, the button switches to `Creando...`
  - repeated clicks in the same submit attempt are blocked client-side to reduce accidental duplicate player creation during slow responses
- Trimmed one unnecessary post-payment Contry workspace reload:
  - historical-payment posting in `Regularización Contry` no longer refetches the charge-context payload when only the ledger needs to refresh
  - this is a small app-layer performance cleanup, not a full backend optimization pass

### Dashboard Auto-Filters + Neutral Login Landing (v1.16.13)

- Removed the extra `Aplicar` / `Limpiar` step from the `Panel` campus filters.
- `Todos`, `Linda Vista`, and `Contry` now change the dashboard immediately on click, and the month picker also updates the view directly on change.
- Added a neutral protected landing page at `/inicio` and changed auth redirects so logged-in staff no longer land on `Panel` by default.
- Added an operational-only route guard on:
  - `/dashboard`
  - `/dashboard/new-enrollments`
- Result:
  - sports-only users such as `director_deportivo` no longer see the financial dashboard by default
  - if they try to open those dashboard routes directly, they are sent to `/inicio`

### Panel Campus Buttons + Contry Charge-to-Payment Guardrail (v1.16.12)

- Hid the sidebar `Deportivo` section for all users while the sports workflow is being redesigned.
- Important:
  - the sports routes still exist
  - this is a navigation hide, not a feature deletion
  - the roadmap keeps the sports lane visible so it does not get forgotten
- Replaced the `Panel` campus dropdown with larger explicit campus buttons:
  - `Todos`
  - `Linda Vista`
  - `Contry`
- Tightened `Regularización Contry` so the add-charge path is less error-prone for front desk:
  - catalog charges now use the configured product amount only
  - the editable `Monto` field was removed from the Contry charge-creation card
  - after creating a charge or advance tuition, the screen now opens an immediate historical-payment prompt for that exact new charge
  - this keeps the finance model unchanged, but makes it much harder to leave a newly created Contry charge unpaid by accident

### Nuke Player Name-Match Fix (v1.16.11)

- Fixed the `Eliminar todo` safeguard for nuking players.
- Root cause:
  - the server action was comparing the typed confirmation against a hidden `expected_name` field from the page
  - the comparison was too strict and could fail on harmless formatting differences such as whitespace or Unicode/accent normalization
- The nuke action now:
  - fetches the current player name directly from the server
  - compares against that fresh value instead of trusting a hidden form field
  - normalizes whitespace, case, and accent composition before deciding whether the name matches

### Sports Signups Responsiveness + Panel KPI Drilldown (v1.16.10)

- Removed the sluggish full-page round-trip feel from `/sports-signups`.
- The tournament-signups page still loads its data from the server, but campus and competition-family switching now happens client-side from one preloaded payload instead of reloading the route on every click.
- This keeps the same payment-based source of truth while making the board feel much more immediate during front-desk use.
- Added a first drilldown path for the `Nuevas inscripciones` KPI on `Panel`.
  - the KPI is now clickable
  - it opens a dedicated detail page with the actual enrollments counted for the selected campus/month
  - the detail page includes player, campus, status, created timestamp, and enrollment date

### Inscripciones Torneos Board Redesign (v1.16.9)

- Reworked `/sports-signups` from the older stacked drilldown report into a campus-first control board.
- The page now follows the front-desk sketch more closely:
  - large campus buttons at the top
  - three competition-family summary cards that also act as selectors
  - one detailed competition board shown at a time underneath
  - category cards with visible `pagados / elegibles` progress and direct player-name lists
- The detailed board is now organized by category card instead of nested campus/category accordions.
- Added a first eligibility-aware denominator so category progress is no longer just a paid-count view:
  - `Superliga Regia`: mixed on 2015+ categories, varonil-only on older categories
  - `Rosa Power Cup`: femenil-only
  - `CECAFF`: temporarily treated as mixed until sports ops defines stricter eligibility
- This pass changes the page shape and progress math only:
  - still read-only
  - still product-payment based
  - still no finance amounts or tournament-config dependency

### Product KPI Clarity + Contry Guardrails Follow-Up Logged

- Added two explicit roadmap follow-ups after the tournament-payment reconciliation pass:
  - clarify product/admin KPI language so raw charge counts are not mistaken for fully paid player counts
  - harden `Regularización Contry` around competition products so staff are less likely to create orphaned tournament charges without the matching historical payment
- This is roadmap/documentation tracking only for now.
- No app behavior changed in this pass.

## 2026-04-10 (session 68)

### April 2026 Tuition Repricing Reminder

- Confirmed the temporary live production cron override for this month only:
  - job: `reprice-pending-monthly-tuition`
  - current schedule: `1 6 16 * *`
  - active: `true`
- Purpose: delay the normal day-11 pending-tuition repricing to the first minute of April 16, 2026.
- Follow-up required immediately after that run:
  - restore the normal monthly schedule to `0 6 11 * *`
  - do not let the April override carry into May or later months by accident

### Sports Lane Discovery Warning

- Captured new sports-domain feedback after the first preview pass of `Equipos Base`, `Director Deportivo`, and `Copas / Torneos`.
- Current conclusion:
  - the technical base is still useful
  - the operational model and UI assumptions are too rigid
- Discovery items to resolve with Julio before more sports build-out:
  - not all categorías need the full base-team ladder
  - some equipos base are intentionally mixed-year groups
  - some competitions are effectively `all invited` and should not be modeled as giant team-by-team selective boards
- The roadmap now records this dependency explicitly so the sports lane gets redesigned against the real academy workflow instead of hardening the wrong shape.

### Julio Discovery Follow-Up

- Reviewed the 2026 teams/competitions reference sheet and a direct workflow clarification from Julio.
- The CSV is structurally useful even though the export is noisy:
  - campuses
  - team/base-team names
  - birth-year or mixed-year category ranges
  - coach ownership
  - month-by-month competition participation
- Main clarified sports rule:
  - `Equipo Base` is the real operational starting point
  - for a normal competition, the default roster should just be `Equipo Base` filtered by fully paid signups
- This significantly simplifies the expected sports UX:
  - not giant competition-wide team registries by default
  - instead, compact progress by categoría/team/campus, then drill down into signed vs missing players
- Key exception patterns confirmed:
  - some players may play one year above or below their usual group
  - younger girls still play mixed until the academy split point
  - some girls teams are mixed-category
  - low signup counts can force merging across levels/categories
- Open planning items now revolve around:
  - a possible soft `interested` state
  - roster approval/finalization by Julio
  - rules for when signups are too many for one team but not enough for two comfortable teams

## 2026-04-09 (session 67)

### Director Deportivo + Competition Signups Dashboard v1

- Added the first real sports-ops lane around a new campus-scoped `director_deportivo` role.
- `director_deportivo` is now assignable from `Usuarios y Permisos`, behaves like a campus-scoped sports role, and has dedicated preview debug personas for:
  - Linda Vista hub sports view
  - Contry-only sports view
- Added a dedicated sports navigation area:
  - `Director Deportivo`
  - `Copas / Torneos`
- Extended the dormant tournament schema into the first operational competition model:
  - tournaments now carry linked competition product, signup cutoff, and eligible birth-year window
  - new `tournament_source_teams` table records the normal teams that define the eligible denominator
  - new `tournament_squads` table records the actual competition squads, each mapped to a real `teams` row for secondary assignments
  - `tournament_player_entries` now acts as the canonical paid-signup registry via linked `charge_id`
- Implemented payment-driven competition signup sync:
  - paying the linked product in `Caja` now marks the player as signed up
  - refunds, reassignment away from the competition charge, and voided payments now remove the signup again
  - if signup is removed, active competition-squad assignments for that tournament are also closed
- Added the first sports management UI:
  - `/tournaments`
    - create competitions
    - link product
    - set campus/date window/signup cutoff/birth-year window
    - review per-competition counts
  - `/tournaments/[id]`
    - edit competition settings
    - attach source teams
    - create multiple competition squads per source team with min/max + refuerzo limits
    - assign signed players into squads as regular or refuerzo
    - remove squad assignments
  - `/director-deportivo`
    - campus-scoped dashboard
    - competition overview cards
    - source-team progress like `10/25`
    - signed-without-squad counts
    - squad fill progress and refuerzo usage
- Sports surfaces intentionally stay non-financial:
  - they show signup/payment state signals only
  - they do not expose cash sessions, charge amounts, refunds, or finance totals
- Verification:
  - `npm run build` passed
  - `npm run typecheck` passed

## 2026-04-09 (session 66)

### Caja Handoff UI + Preload Polish

- Simplified the player-profile Caja handoff so it no longer uses the larger half-width `Cobro operativo` card.
- The player profile now shows a smaller `Abrir Caja` handoff with a short note that Caja will open with that player account already selected.
- Caja deep links now preload the enrollment on the server page before rendering the client workspace, removing the extra client-side round-trip that made the account feel slow to appear after navigation.

## 2026-04-08 (session 65)

### Caja-Only Normal Payment Entry

- Removed the last two non-Caja normal payment forms from the player hub and the dedicated enrollment account page.
- Normal live payments now route staff into `Caja` via `/caja?enrollmentId=...` instead of being posted inline from account screens.
- Kept refunds, concept reassignment, director-only voids, payment history, charges, and incidents on the account surfaces.
- Recorded the control rule in the finance source-of-truth doc so future finance work does not quietly reintroduce page-local payment posting.

## 2026-04-08 (session 64)

### Payment Method Button Wrap Fix

- Adjusted the new method-button groups in Caja and `Regularización Contry` to auto-fit based on available card width instead of forcing a fixed column count.
- This fixes the last clipping/wrapping issue where longer labels like `Transferencia` and `360Player` could overflow in narrower payment cards.

## 2026-04-08 (session 63)

### Payment Method Button Layout Polish

- Polished the new payment-method button UI in Caja and `Regularización Contry` after front-desk testing showed the first pass felt cramped.
- Moved method selection onto its own full-width row in Caja payment forms so the amount field no longer squeezes the method buttons.
- Stacked the Contry historical-payment inputs vertically for the same reason: less clipping, clearer scanning, and less accidental method mistakes.
- Added restrained method-specific button tones so each option is easier to distinguish at a glance without changing any payment semantics.

## 2026-04-08 (session 62)

### Payment Method Hardening

- Replaced the payment-method dropdowns in Caja and `Regularización Contry` with explicit button-based selection.
- `Método` now starts unselected by default, so front desk must intentionally choose the payment method before posting.
- Applied the same rule to Caja split payments: `Método 2` also starts unselected and blocks submit until chosen.
- Logged the separate Caja-only payment-entrypoint follow-up as the next operational payment-control audit.

## 2026-04-08 (session 61)

### Production Migration Workflow Hotfix

- Fixed the production/preview DB migration workflows after discovering that `supabase/setup-cli@v2` does not exist.
- Reverted both migration workflows to the valid `supabase/setup-cli@v1` action while keeping the newer pooled DB connection path and current CLI version.
- This was a CI/runtime wiring issue, not a schema or app-code issue, but it blocked the first production migration run for `v1.15.8`.

## 2026-04-07 (session 60)

### Finance Sanity Nav Link

- Added a superadmin-only sidebar/menu link to `/admin/finance-sanity`.
- The hidden finance sanity page is now reachable from the normal Super Admin section instead of requiring a manual URL.

## 2026-04-07 (session 59)

### Finance Source-of-Truth Guardrails

- Added an explicit finance source-of-truth doc so balance math and report math stop living as implicit team memory:
  - live balance must flow from `v_enrollment_balances`
  - reporting must flow from `finance_*_facts`
- Added SQL reconciliation helpers:
  - `get_finance_reconciliation_summary(...)`
  - `list_finance_reconciliation_drift(...)`
- Added a hidden superadmin-only sanity page at `/admin/finance-sanity` so drift can be checked intentionally instead of discovered late.
- This is meant to reduce future finance drift by turning “remember the rule” into:
  - a written rule
  - a shared SQL verification layer
  - a concrete admin validation surface

## 2026-04-07 (session 58)

### Finance Drift Audit

- Audited the main finance surfaces for drift risk after the refunds/reassignment rollout:
  - account ledger / player hub
  - `Jugadores` balance state
  - `Pendientes`
  - dashboard / monthly / weekly reports
- Confirmed the major finance reporting lane is already converging on shared refund-aware SQL facts and the refund-aware `v_enrollment_balances` view.
- Found one real mismatch: `list_pending_enrollments_full(...)` was still subtracting posted payments without adding refunded amounts back, which could understate debt on `Pendientes` and active-player debt chips after a refund.
- Added a SQL migration to realign that RPC with the same refund-aware balance semantics used by `v_enrollment_balances`.
- This was treated as a true drift fix, not just documentation, because it could silently weaken pending-collections visibility over time.

## 2026-04-07 (session 57)

### Refunds + Contry Front-Desk Polish Pass

- Ran a shared polish pass across the new refund/reassignment workflows and the `Regularización Contry` workspace.
- Refund and `Cambiar concepto` screens now behave more like operational tools instead of raw admin forms:
  - stronger pending/running states while long billing mutations are in flight
  - clearer effect summaries so staff can see what will happen before confirming
  - cleaner error banners without exposing raw debug details in normal use
  - removed the extra client-side `router.refresh()` after success redirects to reduce avoidable page churn
- Applied a lightweight performance improvement to posted-payment flows by removing an extra enrollment-ledger refetch from the shared payment-posting helper; receipt remaining-balance is now derived directly from the already-loaded ledger totals.
- `Regularización Contry` now feels more stable during day-to-day use:
  - player picker/search copy cleaned up
  - category drilldown/search states are clearer
  - account workspace now shows explicit pending banners during long mutations
  - charge/payment/add-charge actions disable more aggressively while running
  - historical payment capture can now prefill the current timestamp quickly without leaving the form
  - add-charge flows now keep newly created destination charges selected automatically when possible
- The Contry workspace refresh path is also narrower now:
  - ledger-only refresh after normal product-charge creation
  - ledger + charge-context refresh only when context can actually change (historical payment / advance tuition)
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-04-07 (session 56)

### Security Follow-Up v2

- Patched the GitHub Actions runtime warning by moving all repo workflows to the newer Node 24-compatible action majors:
  - `actions/checkout@v6`
  - `actions/setup-node@v6`
  - `actions/upload-artifact@v6`
  - `supabase/setup-cli@v2`
- Applied that runtime maintenance pass to:
  - preview DB migrations
  - production DB migrations
  - secret scanning
  - dependency audit
- Ran a second repo/app security sweep focused on real exposure surfaces rather than adding more scanners.
- Second-pass findings:
  - the service-role client helper still appears server-only and no active runtime callers were found during the repo-wide search
  - public env usage remains limited to intentionally public Supabase client config plus the public QZ certificate
  - `src/app/api/sign-qz/route.ts` still requires an authenticated user before signing
  - placeholder API routes are still returning `501` and are not currently active data endpoints
  - high-risk server action modules continue to use authenticated-user retrieval plus shared role/campus permission helpers for sensitive mutations
- Follow-up items recorded instead of treated as immediate bugs:
  - keep reviewing finance/admin/cross-campus mutation surfaces for role drift
  - add an explicit role gate to the attendance export route if that endpoint becomes a broader operational surface
  - keep placeholder API routes non-functional until they are implemented with explicit auth behavior

## 2026-04-07 (session 55)

### Dependency Audit Patch

- Investigated the new GitHub `npm audit` findings after the advisory workflow went live.
- Root cause: GitHub was correctly scanning the committed `package-lock.json`, while the local worktree already had an uncommitted dependency refresh that removed the reported advisories.
- Refreshed the lockfile so the committed dependency tree now picks up the safer package resolutions already implied by the current `package.json` ranges.
- The advisory findings reproduced against the older committed lockfile were:
  - `next`
  - `flatted`
  - `minimatch`
  - `picomatch`
  - `brace-expansion`
- After the lockfile refresh, local `npm audit --package-lock-only --json` returns zero vulnerabilities again.

## 2026-04-07 (session 54)

### Security Hardening Lane v1

- Started the first explicit security lane as a normal app-hardening pass rather than a panic rewrite.
- Added two advisory GitHub Actions workflows:
  - `.github/workflows/security-secrets.yml` for TruffleHog-based secret scanning on `preview`, `main`, and PRs targeting those branches
  - `.github/workflows/security-dependencies.yml` for lockfile-based `npm audit` reporting on the same branch/PR surfaces
- Kept both workflows advisory in `v1` so findings can be reviewed and tuned before becoming hard release gates.
- Extended `docs/security-performance-baseline.md` so the repo now documents:
  - public vs server-only env expectations
  - why public Supabase anon/publishable keys are not automatically a breach
  - scanner policy for advisory CI
- Added `docs/security-review-2026-04-07.md` as the first concrete findings memo for this repo.
- Current repo-specific findings from this pass:
  - no obvious client-side leak of `SUPABASE_SERVICE_ROLE_KEY`
  - `QZ_PRIVATE_KEY` remains server-side
  - no explicit custom CORS headers were found in the app routes during the first pass
  - `npm audit` is currently clean with zero reported vulnerabilities

## 2026-04-07 (session 53)

### Uniformes Card in New Enrollment Intake

- Extended the single-page `Nueva Inscripción` flow so front desk can capture the initial `Uniformes` decision without leaving the intake form.
- Added the first `Uniformes` card pass to the intake flow in `src/components/enrollments/enrollment-intake-form.tsx`, wiring the new selection data through `src/server/actions/intake.ts`.
- Follow-up polish corrected the intake-card interaction model so size selection is clearer and `Portero` tagging behaves correctly during the enrollment flow instead of relying on later correction.
- This keeps the one-page intake closer to the actual front-desk workflow by reducing one more post-enrollment detour into the separate uniforms surface.

## 2026-04-07 (session 52)

### Production Migration IPv6 Hotfix

- Diagnosed the failed `main` rollout after the preview promotion: production DB migrations were still using the direct Supabase host from `SUPABASE_PROD_DB_URL`, and GitHub Actions could not reach that IPv6 endpoint.
- Updated `.github/workflows/migrate-production.yml` to derive and use the pooled Supabase connection URL for the production project (`hjvytfaalnfcqfgbxsmj`) instead of the direct host path.
- Added a no-op migration to safely retrigger the production DB workflow after the connection fix so the pending refund/reassignment migrations can apply on prod.
- Follow-up hotfix: corrected the production workflow shell step so the derived pooled `DB_URL` is actually available to the same `supabase db push` command instead of being written only to `GITHUB_ENV`.

## 2026-04-06 (session 51)

### Refund Workflow Hotfix

- Fixed the `Reembolsar pago` form copy so refund screens stop rendering literal `\u00..` escape sequences in visible text.
- Marked the refund reason and refund datetime more explicitly as required and now prefill the refund datetime with the current local value to reduce front-desk friction.
- Hardened `refundPaymentAction(...)` so unknown backend failures normalize into stable refund error codes instead of collapsing into the generic banner.
- Hardened `record_payment_refund(...)` in SQL to fall back to the enrollment campus if an older payment is missing `operator_campus_id`, and to return stable `refund_insert_failed` / `refund_failed` codes instead of leaking raw DB exceptions.
- Added an explicit preview read-only guard for `Cambiar concepto` and `Reembolsar` so validations done through `Ver como` return `debug_read_only` cleanly instead of failing as a generic error.
- Added refund debug diagnostics on the server action and UI banner so preview validation can surface the raw failure code/message when a refund still fails.
- Added follow-up migration `20260407001500_fix_payment_refunds_policy_ambiguity.sql` after preview surfaced `column reference "payment_id" is ambiguous` during refund insert RLS checks.
- Added follow-up migration `20260407003000_fix_payment_function_ambiguity.sql` after tracing the real remaining cause to `RETURNS TABLE` output-variable ambiguity inside `record_payment_refund(...)` and `reassign_payment_to_charges(...)`.

## 2026-04-06 (session 50)

### Production Migration Workflow Hardening

- Hardened the production DB migration workflow after the preview migration failures exposed the old connection path as too brittle.
- `migrate-production.yml` now uses the repository `SUPABASE_PROD_DB_URL` secret directly instead of relying on the older `supabase link` + password flow.
- This keeps production migrations aligned with the more reliable direct DB connection approach and reduces the risk of future `main` migration runs failing for connection/setup reasons unrelated to the SQL itself.
- No app-code behavior changed in this pass.

## 2026-04-06 (session 49)

### Refunds + Payment Reassignment Workflow v1

- Added two explicit payment-side workflows to reduce front-desk confusion around the old "void charge and leave credit" workaround:
  - `Cambiar concepto`
  - `Reembolsar`
- `Cambiar concepto` now lets staff reuse an already-posted full payment on different charges without returning money:
  - destination charges can be selected from existing pending charges
  - or created inline through Caja-lite charge creation / advance tuition helpers
  - the original payment row keeps its original `paid_at`, method, campus ownership, and folio
  - allocations are moved to the new destination charges
  - original source charges are auto-voided when they are exclusively covered by that payment
- Added a new `payment_refunds` table plus SQL RPCs so true refunds are recorded as separate negative financial movements on the refund date instead of silently mutating history.
- Refunds now:
  - keep the original payment historically visible
  - remove its allocations so the underlying charges become due again
  - store refund method, refund date, reason, notes, actor, campus ownership, and a charge-breakdown snapshot
- Shared payment ledgers now expose the new actions directly on posted payments:
  - enrollment account
  - player hub current account
  - Contry regularization ledger
- Receipts, activity, admin audit, and finance summaries were extended so refund/reassignment state is visible and traceable.
- Daily/weekly/monthly/dashboard finance reporting now nets refunds on `refunded_at`, using the recorded refund method, while preserving the original collection event on its original payment date.
- `Corte Diario` now treats refunds as negative movements in the checkpoint window and marks them visually as `Reembolso`.
- Verification:
  - `npm run typecheck` passed
  - `npm run build` passed

## 2026-04-06 (session 48)

### Issue 37 Accepted / Closed

- Preview validation for the baja/archive pass is complete.
- Confirmed working in preview:
  - dedicated `Dar de baja` flow
  - archive/read-only player profile mode
  - stronger archive baja banner for staff
  - correct handoff for dropped players with pending balance
- Issue `#37` can now be treated as covered unless new live-ops feedback appears.

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

### Regularización Contry Search UX Refresh (v1.11.3)
- Reworked `/regularizacion/contry` player discovery so it no longer relies on the old server GET form with free-text name + tutor-phone inputs.
- The left-side picker now mirrors the Caja search/discovery style:
  - live autocomplete search
  - `Buscar por categoría`
  - modern empty/loading/no-results states
- Discovery remains intentionally hard-scoped to Contry:
  - only active Contry enrollments can appear
  - category drilldown opens directly to Contry birth years, with no campus step
  - selecting a player updates `?enrollment=` and keeps the right-side ledger plus historical payment capture flow unchanged
- This is a UX-only polish pass for the existing historical regularization workflow:
  - no payment semantics changed
  - no receipt/reporting behavior changed
  - Caja behavior remains untouched

### Regularización Contry Emergency Patch: Targeted Payments + Add Charge (v1.11.4)
- Extended `Regularización Contry` so staff can now target specific pending charges when posting a historical payment.
  - selected charges are paid first
  - any remaining amount continues FIFO across the rest of the pending balance
  - Contry historical-payment semantics stay unchanged (`paid_at` required, Contry ownership forced, no cash-session linking, no auto-print)
- Reworked the right-side Contry account panel into an inline client workspace:
  - pending-charge selection area for targeted payment
  - historical payment form with selected-total helper
  - Caja-lite add-charge section without full POS/cart behavior
- Added inline charge creation from the same Contry workflow:
  - catalog-based charges reuse Caja product rules
  - advance tuition creation is now available without leaving the regularization screen
  - successful charge creation refreshes the same ledger/payment panel immediately
- Caja itself keeps the same behavior; only shared allocation helpers and optional campus guards were reused under the hood.

### Jugadores Balance State Fix (v1.11.5)
- Fixed the `Estado` chip in `Jugadores` so active debtors are no longer incorrectly tagged as `Al corriente`.
- The active-player list now derives its pending-balance state from the same pending-enrollment aggregation used by `Pendientes`, instead of the stale list-balance source that was drifting from real outstanding debt.
- This patch only fixes player-list payment state rendering:
  - no financial data changed
  - no profile or Caja behavior changed
  - no migration was required

## 2026-04-06

## 2026-04-09

## 2026-04-14

### Competition Signup Dashboard Emergency Patch (v1.16.3)
- Added a temporary read-only page at `/sports-signups` for front desk and sports/admin staff to see confirmed competition signups at a glance.
- The page groups active competition records into exactly 3 temporary families in app code:
  - `Superliga Regia`
  - `Rosa Power Cup`
  - `CECAFF`
- Counts are based only on `tournament_player_entries.entry_status = 'confirmed'`.
- The dashboard stays intentionally non-financial:
  - no amounts
  - no receipts
  - no folios
  - no payment methods
- Drilldown is:
  - competition family
  - campus
  - birth year/category
  - player list
- Player rows show only operational fields:
  - player name
  - base team if available
  - linked tournament names when the same family has more than one active tournament row
- This was implemented as a lightweight visualizer only:
  - no schema change
  - no change to signup sync
  - no change to deeper sports/team-building flows

### Director Deportivo v4: Simplified Sports Ops Redesign (v1.16.2)
- Kept the sports DB foundation from the earlier work:
  - one `teams` model only
  - primary assignment = `Equipo Base`
  - secondary assignment = competition roster when needed
  - fully paid Caja competition products remain the confirmed-signup source of truth
- Rebuilt the sports query layer and screens around the real operational flow Julio described:
  - `Director Deportivo` is now category-first instead of competition-first
  - staff chooses campus + competition, then sees compact category progress with team breakdowns underneath
  - `Copas / Torneos` now acts more like configuration plus drilldown, not the main daily working surface
- Competition detail now defaults to the light workflow:
  - attach base teams
  - see confirmed / interested / missing players per selected team
  - approve a final roster directly from confirmed signups
  - keep late payments visible as candidates instead of silently rewriting an approved roster
- Added the first lightweight sports-planning states on top of the existing schema:
  - team participation mode = `competitive` or `invited`
  - player interest state = `interested` vs paid `confirmed`
  - roster approval state at the source-team link
  - default approved roster squad stored separately from optional advanced squads
- Preserved and repositioned the heavier squad mechanics:
  - advanced squad creation still exists for true exception cases
  - it no longer drives the default mental model for every competition
- Relaxed `/teams` so it no longer renders the full fixed ladder as if every block must always have every level:
  - the board now shows the real existing teams first
  - missing standard levels are only suggested create-actions, not implied mandatory structure
- This pass intentionally did **not** solve every sports-model edge case:
  - mixed-year team structure is still constrained by the current base-team schema
  - more nuanced final-roster exception flows can build on this simpler foundation later

### Director Deportivo v3: Equipos Base on `/teams` + Competition Gender (v1.16.1)
- Reworked the sports plan so the app no longer invents a second parallel base-team system.
- `/teams` is now the operational `Equipos Base` board:
  - choose campus, categoria, and genero
  - see the real base-team ladder (`Little Dragons`, `B3`, `B2`, `B1`, `Selectivo`)
  - create missing base teams on demand
  - batch assign or move selected players into the chosen base team
- The normal primary `team_assignment` remains the single roster truth for `Equipo Base`.
- Player `Nivel` continues to follow the assigned primary base team, so team placement and player level do not drift apart.
- Team pages were opened to the new sports role (`director_deportivo`) using the same app-layer permission model as the rest of the sports lane.
- Competitions now also carry explicit gender scope (`Varonil`, `Femenil`, `Mixto`).
- Tournament source-team attachment is now gender-aware, and sports views display competition/team gender explicitly.
- No finance semantics changed:
  - competition signups still come from fully paid linked Caja products
  - escuadras still use secondary assignments
  - base teams remain primary assignments


### Attendance Export — Logo Fix + Birth Year Dividers (v1.14.1)
- Fixed logo stretching: switched from `tl+br` cell-range approach to `tl+ext` with fixed 60×40px dimensions matching the actual 1.51:1 PNG aspect ratio.
- Multi-year sheets now group rows by birth year first with a `Categoría {year}` header row (medium blue) between each year group, then level sections within each year.
- Single-year sheets unchanged.

### Player Nivel — Editable + Profile Display (v1.14.0)
- Added `level` to `getPlayerDetail` query and returned object.
- Added `Nivel` select to player edit form: Little Dragons, B2, B1, B3, Selectivo, Sin nivel — pre-populated with current value.
- Wired `level` through `updatePlayerAction` to the `players` table.
- `Nivel` now shows in the player profile info grid alongside gender, uniform size, and jersey number.

### Attendance Export — Branding + Tel Tutor Removal (v1.13.1)
- Removed the `Tel Tutor` column from the attendance sheet (TOTAL_COLUMNS 26 → 25).
- Applied FC Porto brand colors throughout:
  - Title bar: Porto navy (`#003087`) background, white bold text
  - Column headers: Porto gold (`#FFC72C`) with navy text
  - Gender section headers (Little Dragons): Porto blue (`#1455A4`) with white text
  - Level section headers: light Porto blue tint with navy text
- Title row now reads `Dragon Force Monterrey · {campus} · {group}` and is 42px tall.
- Logo (`watermark dragon force mty-15.png`) overlaid on the right side of each title row; read from `public/` at request time, silently skipped if file is missing.
- `workbook.creator` updated to `Dragon Force Monterrey`.

### Attendance Export — Fixed Group Sheets (v1.13.0)
- Replaced the dynamic per-birth-year/gender sheet layout with a fixed set of 16 predefined groups per campus.
- Groups:
  - Little Dragons (all genders, 2021–2022)
  - FEM 2016–2019, FEM 2014–2015, FEM 2012–2013, FEM 2009–2011
  - VAR 2019–2020, VAR 2018, VAR 2017, VAR 2016, VAR 2015, VAR 2014, VAR 2013, VAR 2012, VAR 2011, VAR 2010, VAR 2008–2009
- Sheet tabs named `{campusCode} · {groupLabel}` (e.g. `LV · VAR 2018`, `LV · Little Dragons`).
- Multi-gender sheets (Little Dragons) show a VARONIL / FEMENIL section header before level sections.
- Single-gender sheets go straight to level sections — no redundant gender header.
- Players sort by birth year asc → level rank → name within each section.
- Sheets with zero matching players are skipped; players outside all defined groups are silently excluded.
- No changes to data fetching (`player-exports.ts`) or the API route.
