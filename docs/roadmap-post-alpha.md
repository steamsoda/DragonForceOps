# Post-Alpha Roadmap 🗺️ Dragon Force Ops (INVICTA)

Last reorganized: 2026-05-06. Last checkpoint: 2026-06-23.

This file is the active planning roadmap. Detailed shipped notes belong in `docs/devlog.md`.

Full pre-reorg roadmap snapshot is preserved at:

- `docs/archive/roadmap-post-alpha-pre-reorg-2026-05-06.md`

## Maintainer Notes

- Update `docs/devlog.md` after every meaningful implementation session with what changed, why, and any verification notes.
- Update this roadmap after every meaningful planning or implementation session so `Now`, `Next`, and the relevant product-area lane stay current.
- Keep this file decision-oriented. Put detailed history, debugging notes, screenshots, command output, and long implementation narratives in `docs/devlog.md` instead.
- Preserve status markers consistently:
  - 🔴 for open work
  - 🟡 for partially shipped / in progress
  - 🟢 for ready to validate
  - ✅ for shipped / solved
  - 🧊 for parked or lower-priority work
  - ⚠️ for work blocked on a spec or decision
- Keep `Now` limited to roughly 3-5 items. If everything is urgent, the roadmap stops being useful.
- Prefer short rows with a devlog version reference over long historical bullets. Example: `Nutrition v2 metrics/reporting base ✅ shipped in v1.16.78-v1.16.83`.
- Do not delete historical planning detail without preserving it in an archive or moving it into the devlog.
- When adding a new item, place it in one product-area lane and only duplicate it in `Now` or `Next` if it is actively being considered.
- New staff/user feedback starts in `User Feedback Intake`; if it duplicates an existing product-area item, link to that item instead of creating a second copy.
- When feedback ships, mark the feedback row done with the version/devlog reference and keep the durable product note in the relevant product-area lane.

## Status Legend

- 🔴 Open / not started
- 🟡 In progress / partially shipped
- 🟢 Ready for validation
- ✅ Done / shipped
- 🧊 Parked / lower priority
- ⚠️ Needs spec or decision

## Current Release State

- Current production line: `v1.16.190`
- Current preview line: `v1.16.192`
- Working branch policy: new implementation continues on `preview`; merge to `main` only after explicit production approval.
- Devlog source of truth: `docs/devlog.md`
- Archived full roadmap detail: `docs/archive/roadmap-post-alpha-pre-reorg-2026-05-06.md`

## Checkpoint: 2026-06-15

This checkpoint marks the state before the next wave of user feedback is reprioritized.

**Stable / Usable Now**

- ✅ Caja core workflows are usable: normal payments, current + advance tuition in one receipt, guarded refund/reassignment, protected tuition/inscription allocations, and explicit account-credit handling are live through `v1.16.157`.
- ✅ Finance sanity monitoring is available; preview `v1.16.158` adds CSV export, and the latest production deep scan showed `$0.00` drift with only warning-level June repricing cautions.
- ✅ `Jugadores` grouped roster performance and export are stable enough for daily use after the RPC/API/server fast path and Excel export passes.
- ✅ `Llamadas`, bajas, injury omission, contact cleanup, and dropout analytics are operational; keep gathering staff feedback before large workflow rewrites.
- ✅ Attendance capture/correction workflows are stable after correction-permission widening, Contry 2016/2017 split, campus-button UX, daily notes, and YOB label polish.

**Parked / Lower Priority**

- 🧊 Baja confirmation workflow remains planned, but intentionally lower priority until Front Desk/Admin finish the current workflow-feedback cycle.
- 🧊 Legacy implicit credit cleanup remains review-only. Do not auto-convert old credit until a deliberate cleanup pass is planned and tested.
- 🧊 Offline fallback, coach match posting, tournament redesign, parent/mobile work, Nutrition vNext, and uniform follow-up stay visible but should not interrupt urgent operator fixes unless promoted.

**Next Planning Mode**

- 🔴 Use `User Feedback Intake` below as the first stop for the new feedback wave.
- 🔴 Promote only the highest-impact, lowest-risk items into `Now`; leave the rest in product lanes or `Next`.
- 🔴 For finance-sensitive feedback, keep using preview first plus `/admin/finance-sanity` before main.

## Checkpoint: 2026-06-23

Front Desk added a small but high-value feedback wave before the remaining attendance bundle work.

**Promoted**

- ✅ `Jugadores` coach roster print sheet shipped in `v1.16.166`: direct print from the app, one group per page, alphabetical players, ID, enrollment date, `Conozco a este jugador?` Si/No checkboxes, and notes space.
- 🟢 Recent attendance at-a-glance: `v1.16.167` adds the shared batch source and first `Jugadores` roster chips; `v1.16.168` reuses it in `Pendientes` detail rows. Other operational surfaces can reuse it next.

**Still Active**

- 🔴 Confirmed-absence risk badge remains the durable source for 3 true absences in a row.
- 🟢 New-enrollment B1 auto-assignment is implemented in preview `v1.16.174`; validate that new intake/re-enrollment players land in the intended B1 group, 2014/2015 female players land in the Femenil combined-year group, and ambiguous cases remain `Sin grupo`.
- 🟡 Caja refund/reassignment/account-credit monitoring stays active after finance-sensitive changes.

## Checkpoint: 2026-07-08

The academy feedback cycle pushed attendance operations and player-context visibility back to the top. Keep the already-shipped tournament/product work and finance guardrails visible, but treat the items below as the current priority track.

**Promoted**

- ✅ `Asistencia > Grupos` selected-group polish: shipped in `v1.16.188`; adds compact group KPIs, uses the previous full calendar week for the "attended last week" signal, shows current-month no-attendance counts, keeps the selected group open when changing month, and preserves the existing non-finance attendance scope.
- ✅ `Inscripciones Torneos` paid-date filter: shipped in `v1.16.189`; lets Front Desk filter confirmed paid players by `payments.paid_at` range without changing tournament/product/payment logic.
- ✅ Player notes workflow foundation: shipped in `v1.16.190`; adds a dated, cross-surface general note history for operational notes that do not belong in finance, attendance, or baja-only flows.
- 🟢 `Jugadores` roster export/print attendance history: preview `v1.16.192` adds the last 15 recorded attendance entries to the Excel export and direct `Imprimir listas` roster printout, with compact date headers and letter-only attendance cells.
- 🟡 Attendance operations workflow: simplify special training days and cancellation/rain flows, with Office Admin, Field Admin, Director Deportivo, Admin, and Super Admin permissions.
- 🟡 Injury/absence workflow v2: plan carefully because it touches attendance state, current-month tuition omission, multi-month omission, and return-to-normal behavior.
- 🟡 Attendance analytics panel: larger dashboard/reporting pass after the group-detail polish proves the summary data shape.
- 🧊 WhatsApp-group communication planning: keep visible as a future communication lane, not part of the immediate attendance edit.

**Still Active / Not Dropped**

- 🟡 Enrollment data validation + confirmation popup remains priority, but moves behind the attendance group polish unless staff escalate intake errors again.
- 🔴 Tryout player tracking remains a priority placeholder awaiting workflow detail.
- 🟡 Caja refund/reassignment/account-credit monitoring remains active after finance-sensitive work; keep using `/admin/finance-sanity` after finance edits.

## Now

These are the highest-value items to consider next. Keep this list short: usually 3-5 active decisions or edits.

| Status | Item | Why it matters | Reference |
|---|---|---|---|
| ✅ | `Asistencia > Grupos` detail KPIs and month persistence | Shipped in `v1.16.188`: selected-group summary cards for total roster, attended last calendar week, no attendance in current month, and attendance rate; changing month now keeps the group detail open. | Checkpoint 2026-07-08, `v1.16.188` devlog |
| ✅ | `Inscripciones Torneos` paid-date filter | Shipped in `v1.16.189`: date-range filtering for confirmed tournament payments based on `payments.paid_at`, without changing how paid status is derived. | Checkpoint 2026-07-08, `v1.16.189` devlog |
| ✅ | Player notes workflow foundation | Shipped in `v1.16.190`: dated general notes visible from player profile and Caja, without mixing them into finance-only or attendance-only records. | Checkpoint 2026-07-08, `v1.16.190` devlog |
| 🟢 | `Jugadores` roster export/print attendance history | Preview `v1.16.192` adds the last 15 recorded attendance entries to the grouped roster Excel export and a direct compact roster print action, using date headers and letter-only attendance cells. | Jugadores, `v1.16.191`-`v1.16.192` devlog |
| 🟡 | Attendance special-day and cancellation workflow | Simplify creating special sessions and cancelling/rain days; include Office Admin, Field Admin, Director Deportivo, Admin, and Super Admin permissions. | Checkpoint 2026-07-08, Asistencia lane |
| 🟡 | Injury/absence workflow v2 | Needs design before edits: injury/absence can affect attendance labels, current-month tuition omission, multi-month omission, and return-to-normal behavior. | Checkpoint 2026-07-08, Asistencia / Caja |
| 🔴 | Enrollment data validation + confirmation | New priority-one request: harden new enrollment data quality with required last name/date of birth/gender validation, proper capitalization guidance, clear field errors, and a confirmation popup before the existing redirect-to-Caja payment workflow. | New Enrollments / Caja, User Feedback Intake 2026-06-27 |
| 🔴 | Tryout player tracking | New priority-one intake placeholder: track players who come in for tryouts. Awaiting workflow details before design. | User Feedback Intake 2026-06-27 |
| 🟡 | Caja refund/reassignment/account-credit monitoring | The core workflow is live, but this remains finance-sensitive. Watch real Caja usage and run sanity checks after changes. | Front Desk / Caja / Collections below, `v1.16.147`-`v1.16.157` devlog |

**How `Now` Works**

- `Now` is not the backlog. It is the short list we are actively deciding or editing next.
- New feedback starts in `User Feedback Intake`; if it is already represented elsewhere, add a pointer instead of a duplicate task.
- When a feedback item becomes the next edit, promote it to `Now` and keep the durable product detail in its product-area lane.
- When it ships, mark it ✅ with the version/devlog reference, then remove it from `Now` at the next checkpoint.

## Next

Important, but not necessarily the next edit.

Recently promoted: `v1.16.138` app-shell/attendance UX polish and `v1.16.139` Caja current + advance tuition one-receipt guard are now on `main`.

| Status | Item | Notes |
|---|---|---|
| ✅ | Caja current + next-month same-receipt unlock | Shipped in `v1.16.139`; allows current/pending monthly tuition plus advance tuition in one receipt only when prior monthly charges are selected and the payment covers the staged total. |
| 🟢 | Caja refund / reassignment guardrails | Preview `v1.16.147` tightens the existing ledger refund/reassignment path; preview `v1.16.148` adds Caja `Ultimos pagos` shortcuts, `v1.16.149`-`v1.16.151` polish the bottom grid, `v1.16.152` adds allocation-level reassignment for non-monthly parts of mixed payments, and `v1.16.153` protects inscriptions like tuition. |
| 🟢 | Caja account credit ledger / partial refund model | Preview `v1.16.154` adds the additive schema foundation, `v1.16.155` adds read-only Caja display, `v1.16.156` adds guarded explicit `Usar credito`, and `v1.16.157` creates explicit credit from eligible Caja reassignment remainders. Legacy implicit credit conversion remains out of scope. |
| ✅ | Attendance daily notes overview | Shipped in `v1.16.140`; adds a read-only day-level notes view at `/attendance/notes` for scanning session and player notes across all groups. |
| 🔴 | Favicon / app icon pass | Choose or create the square source mark, then add the required Next metadata/icons. Keep this as app-shell polish, not an operational blocker. |
| 🔴 | Coach match posting v1 | Let coaches start posting match info before the parent/mobile app launch, so the habit and data shape can be tested early. |
| 🟡 | Offline/outage mitigation plan | Plan a pragmatic fallback for front desk when internet is down: printable queues, local notes, retry-safe capture, and clear limits around payments. |
| 🟢 | Batch 360Player monthly posting | Preview `v1.16.143` adds the first guarded workflow and UX polish: campus/month/category/search filters, early-vs-late pricing mode, explicit row selection, confirmation checkbox, submit-loading feedback, prior-month arrears lock, server-side charge revalidation, exact charge allocation, repricing audit, and duplicate/partial-payment skips. |
| 🟡 | Torneos workflow redesign | Larger planning item after urgent ops polish; needs confirmed team, signup, payment, and roster behavior. |
| 🟢 | Product/admin KPI language cleanup | Preview `v1.16.133` renames product KPIs away from sales/revenue language and adds confirmed collected/pending amounts. |
| 🔴 | Regularización competition-charge guardrails | Reduce accidental tournament/competition charges without matching historical payment. Scope should be workflow guardrails, not a finance model rewrite. |
| 🟡 | Finance drift monitoring | Preview `v1.16.158` adds a filtered CSV export for `/admin/finance-sanity`; latest production deep scan after the Caja credit release showed `$0.00` drift and three warning-only June repricing cautions. Keep using this page after finance-sensitive work. |
| 🟡 | Nutrition vNext | V1 and OMS/report passes are shipped; keep circumference metrics, parent PDF polish, richer analytics, and workflow speedups open. |
| 🟡 | Uniformes follow-up | Compact menu feedback and auto-sync captured uniform size into player technical data. Keep stock/supplier management separate. |
| 🟡 | Player profile consolidation polish | Continue making `/players/[id]` the single-player hub; remaining polish includes local date formatting and account navigation. |
| 🧊 | Drag-and-drop group editing | Later UI layer over the existing audited batch group assignment flow. Current dropdown edit mode is usable. |

## User Feedback Intake

Use this lane for fresh operator/admin feedback before it becomes roadmap work. The goal is to prevent duplicate rows while still preserving where the request came from.

| Status | Feedback | Routing / decision | Reference |
|---|---|---|---|
| 🟡 | 2026-07-08 attendance/player-context feedback wave | Current priority wave. `Asistencia > Grupos` detail KPIs shipped in `v1.16.188`, tournament paid-date filtering shipped in `v1.16.189`, and player notes shipped in `v1.16.190`; next up are attendance operations, injury/absence v2, and larger attendance analytics. | Checkpoint 2026-07-08, `v1.16.188` baseline |
| ✅ | `Asistencia > Grupos` selected-detail polish | Shipped in `v1.16.188`: selected-group summary cards for total roster, players with at least one `A Asistio` in the previous full calendar week, active players without current-month attendance, and month attendance rate. Month changes keep the selected group open. | Asistencia lane, `v1.16.188` devlog |
| ✅ | `Inscripciones Torneos` paid-date filter | Shipped in `v1.16.189`: start/end paid-date filters for confirmed tournament signups; paid confirmation remains based on fully paid product charges. | Competencias / Products, `v1.16.189` devlog |
| ✅ | General player notes workflow | Shipped in `v1.16.190`: adds the dated notes model and quick entry/view points from Caja/player context. Keep separate from finance ledger notes and attendance records unless intentionally linked. | Front Desk / Caja / Player profile |
| 🟡 | Attendance special-day/cancellation workflow | Improve special training day and rain/cancellation workflows with Office Admin, Field Admin, Director Deportivo, Admin, and Super Admin permissions. | Asistencia |
| 🟡 | Attendance analytics panel | Larger dashboard: filters, charts, date ranges, best/worst attendance groups, and trend views. Build after the group-detail summary source is stable. | Reports / Asistencia |
| 🧊 | WhatsApp group communication planning | Keep visible as long-term communication planning now that the academy is returning to WhatsApp groups. Do not mix into attendance implementation. | Strategic later phases |
| 🟢 | 2026-07-01 tournament product/pricing refresh | Preview `v1.16.183` implements the urgent July 2026 product refresh with additive pricing rules and keeps old products manually deactivatable for history safety. | Front Desk / Caja / Products, `v1.16.183` devlog |
| 🟢 | 2026-06-27 priority wave: weekly coach packet | Preview `v1.16.180` implements the first priority item for validation: full campus packet and single-coach reprint, grouped by coach and training group, printable from app, with new-player, pending-payment, and absence-risk signals. | Asistencia / Reports, `v1.16.180` devlog |
| 🔴 | Enrollment data validation + confirmation popup | Plan after coach packet. Must preserve the current successful behavior where enrollment opens Caja with inscription/monthly charges staged for payment. | New Enrollments / Caja |
| 🔴 | Tryout player tracking | Placeholder only until the workflow is described; do not mix with enrollment validation. | Future planning |
| 🔴 | 2026-06-23 Front Desk print + attendance visibility wave | Promote the coach print sheet first if staff need paper immediately; build recent attendance through a shared source before surfacing it across queues. | Checkpoint 2026-06-23 |
| ✅ | Coach roster print sheet from `Jugadores` | Shipped in `v1.16.166`: direct-print action under `Herramientas`, separate from `Exportar Excel`. One group per printed page; players alphabetical; columns: count, full name, ID, enrollment date, `Conozco a este jugador?` Si/No checkboxes, and notes. | Jugadores, `v1.16.166` devlog |
| 🟢 | Recent attendance visible beside players | Production `v1.16.167` adds the shared batch source and first `Jugadores` roster chips; production `v1.16.168` adds the same last-five chips to `Pendientes` detail rows. Preview `v1.16.171` adds the tiered attendance-risk badge source; `v1.16.172` fixes large-roster batch pagination. Continue later with Caja and relation reports. | Asistencia, Jugadores, Front Desk / Caja / Collections, `v1.16.167`-`v1.16.172` devlog |
| 🔴 | June 2026 feedback wave | Active priority wave. Use the ordered sequence below; promote one or two items into implementation at a time. | Checkpoint 2026-06-15 |
| ✅ | 1. Re-enrollment pricing tier still at `$600` | Preview `v1.16.159` updates the returning `Solo inscripcion` option to `$700` without changing unrelated pricing rules. | Front Desk / Caja / Collections, `v1.16.159` devlog |
| ✅ | 2. Training-group move permissions audit | Preview `v1.16.160` confirms the route/action split and adds explicit attendance-campus write checks before service-role group assignment writes. It also adds `Admin Oficina` as a global non-finance player/contact + attendance role. | Safety / Permissions / Data Integrity, Jugadores, `v1.16.160` devlog |
| 🟢 | 3. New-enrollment B1 auto-assignment | Preview `v1.16.174` wires guarded auto-assignment into both existing-player enrollment and one-page intake. Female-specific group wins when available, including the 2014/2015 Femenil combined-year group; ambiguous/no match stays `Sin grupo`. | Jugadores, `v1.16.173`-`v1.16.174` devlog |
| 🟢 | 4. Attendance risk badge | Preview `v1.16.171` adds a derived badge for 3 confirmed absences, 4+ confirmed absences, and 30+/60+ days since last positive attendance. Missing records do not count as absences. First surfaces: `Jugadores` and `Pendientes`; `v1.16.178` reuses it in Caja. Relation-report reuse remains next. | Asistencia, Front Desk / Caja / Collections |
| 🟢 | 5. Pendientes attendance summary | `v1.16.161` adds YOB-first ordering, category dividers, Excel export, and print list. `v1.16.162` adds primary tutor phone to the printed list. Production `v1.16.168` adds last-five attendance chips to detail rows; preview `v1.16.171` adds tiered attendance-risk badges. | Front Desk / Caja / Collections, `v1.16.168` and `v1.16.171` devlog |
| 🟢 | 6. Collections + attendance relation report | Preview `v1.16.179` adds the first operational-only relation report in `Asistencia > Reportes`: `Debe + riesgo`, `Debe + asiste`, `Al corriente + riesgo`, and `Al corriente sin registros`. It shows pending-month counts only, not peso amounts. Keep validating with Front Desk/Admin before marking shipped. | Reports / Finance / Admin |
| 🟡 | 7. Injury workflow + tuition omission rework | Needs a separate design because it can touch charge generation, current-month voiding, omissions, and possible approval rules. | Front Desk / Caja / Collections, Asistencia |
| ✅ | 8. Attendance nomenclature pass | Preview `v1.16.175` standardizes capture, player summaries, recent chips, reports, and group views around `A Asistió`, `F Falta`, `🩹 Lesión`, and `📝 Justificada`; report `Ausencias` copy now reads as `Faltas`. | Asistencia, `v1.16.165` and `v1.16.175` devlog |
| 🧊 | Baja confirmation before final dropout | Already captured under `Jugadores > Bajas confirmation workflow`; keep parked until higher-priority Front Desk/Admin changes are handled. | Jugadores lane |
| 🧊 | Tournament, coach, and parent/mobile-adjacent feedback | Do not treat these as one feature. Split into specs before promotion: coach match posting, tournament redesign, and parent/mobile data contract. | Sports / Tournaments, Strategic Later Phases |
| 🟡 | Finance/Caja edge cases from real use | Route through Caja product lane and validate with preview plus `/admin/finance-sanity`; avoid ad hoc production fixes. | Front Desk / Caja / Collections, Safety / Permissions / Data Integrity |
| ⚠️ | Expenses / Nomina module | Big finance module, not a quick UX pass. Needs a dedicated spec for expense categories, payroll, campus attribution, payment method, evidence, permissions, and finance reports. | Reports / Finance / Admin, Strategic Later Phases |

## Safety / Permissions / Data Integrity

| Status | Item | Current decision |
|---|---|---|
| 🟡 | Role permissions audit and stabilization | Keep active. `v1.16.160` adds the `Admin Oficina` non-finance role and hardens training-group writes; later follow-up can automate the highest-risk route assertions. |
| ✅ | Finance direct-URL hardening | Caja, receipts, reports, enrollment ledgers, charge/reassign/refund pages, and finance helpers fail closed unless the user has the right operational access. See devlog around `v1.16.107`. |
| ✅ | Supabase advisor cleanup pass | Advisor-backed function/RLS/search-path/index cleanup shipped in `v1.16.104`-`v1.16.105`; rerun advisor before large DB/security releases. |
| 🟡 | Finance drift monitoring | Tooling exists through `/admin/finance-sanity`, its CSV export, and `npm run diagnose:finance`; latest prod deep scan found zero drift and only warning-level monthly repricing cautions. |
| 🟢 | Dependency security patch pass | Preview `v1.16.144` updates Next, eslint-config-next, and root PostCSS. High-severity audit items are cleared; one moderate nested PostCSS advisory remains inside Next until an upstream stable patch replaces Next's pinned dependency. |
| 🧊 | Auth hardening settings | Supabase leaked-password protection and more MFA options remain admin-console settings, not repo changes. Revisit when operationally ready. |

## Performance

| Status | Surface | Current state / next action |
|---|---|---|
| ✅ | `Jugadores > Vista por grupos` | RPC + client/API split + service-role server path brought production grouped roster down to usable latency. Export is now available. |
| ✅ | `/admin/regularizacion-historica` | `v1.16.132` trims selected-account opening to enrollment/balance/pending charges first; full payment/refund history is available on demand. |
| 🟡 | Attendance submit | Multiple passes reduced submit overhead and revalidation. Monitor large real rosters after field use. |
| 🟢 | Attendance group category labels | Preview `v1.16.146` appends configured YOB ranges to training-group session labels, so repeated levels on `Asistencia > Hoy` are distinguishable. |
| 🟡 | Front Desk hot paths | Timing instrumentation exists for payment posting, intake, receipt prep/print, and attendance saves. Use logs when operators report lag. |
| 🔴 | Dashboard / Panel drilldowns | Add only after canonical finance-source checks so dashboards do not introduce drift. |

## Product Areas

### Front Desk / Caja / Collections

| Status | Item | Notes |
|---|---|---|
| ✅ | `Llamadas` v1/v2 workflow polish | Board/detail queues, follow-up statuses, auto-save status, direct baja, and inline injury omission shipped in `v1.16.118`-`v1.16.122`. |
| 🟢 | `Jugadores > Bajas` recency sort | Preview `v1.16.145` makes the default bajas list sort by most recent effective baja date first, with player name as the tie-breaker. |
| 🟢 | `Datos faltantes` contact cleanup | Preview `v1.16.134`-`v1.16.136` adds a fast operational queue for missing tutor phones/contact fields, campus/YOB/gender filtering, phone-only tutor capture, and default YOB scoping. `v1.16.163` adds principal + optional second-tutor capture; `v1.16.164` polishes layout; preview `v1.16.169` fixes Office Admin write access and simplifies tutor saving to one `Guardar datos` action with optional fields. Preview `v1.16.184` fixes Office Admin creation of brand-new tutors under RLS by allowing the insert-return-link flow for unlinked tutor rows. |
| ✅ | Caja current + next-month same-receipt unlock | Shipped in `v1.16.139`; keeps the pending-tuition safety rule and adds a one-receipt exception only when the pending monthly charges are selected and covered in the same Caja checkout. |
| 🟢 | Caja refunds and payment reassignment guardrails | Preview `v1.16.147` hardens the existing ledger actions; preview `v1.16.148` adds a Caja recent-payments panel with guarded `Cambiar concepto` / `Reembolsar` shortcuts and disabled reason chips; preview `v1.16.149`-`v1.16.151` widen/polish the bottom grid; preview `v1.16.152` lets staff move only eligible non-monthly source allocations from mixed payments while keeping tuition protected; preview `v1.16.153` also makes inscriptions non-refundable/non-reassignable. |
| 🟢 | Caja account credit ledger / partial refund model | Planning spec in `docs/planning/caja-account-credit-ledger-plan.md`; preview `v1.16.154` adds the additive schema foundation, `v1.16.155` surfaces explicit/legacy credit in Caja, `v1.16.156` applies explicit credit to selected charges with a confirmation checkbox and service-role-only RPC, and `v1.16.157` turns eligible Caja reassignment remainders into explicit credit. Future passes: legacy implicit-credit review/conversion and deeper credit reporting. Legacy implicit credits stay warning-only until manually reviewed. |
| 🟢 | Batch 360Player monthly posting | Preview `v1.16.143` adds `/admin/360player-posting` for manual 360Player monthly tuition posting with early/late price calculation, exact single-charge allocation, repricing where needed, audit entries, explicit confirmation, submit-loading feedback, and prior-month arrears lock. Validate with May 2026 360Player checks before production promotion. |
| 🟢 | Tournament product pricing rules | Preview `v1.16.183` adds additive product pricing rules for July 2026 tournaments. Caja resolves tournament prices server-side by Monterrey business date, gender, and YOB while old products stay manually deactivatable for historical safety. Future pass: product archive/pricing-rule admin UI and paid-player roster reports by product. |
| 🟡 | Uniform quantity/payment mismatch guardrail | Production repair on 2026-07-03 showed Front Desk can overtype one product payment to cover multiple physical items while only one charge exists. Future UX should make quantity/add-another-item obvious and prevent payments from being partially misapplied to tuition by accident. |
| ✅ | General player notes workflow | Shipped in `v1.16.190`: adds a dated, operational notes history for player context that can be viewed/added from Caja and the player profile. Keep separate from finance ledger/audit notes and attendance records unless a workflow intentionally links them. |
| 🟡 | Offline/outage fallback | Define what Front Desk can safely keep doing without internet and what must wait; likely printable queues plus retry-safe notes rather than offline payment mutation. |
| 🟡 | `Pendientes` call-center mode | Tuition-only pending board works; keep open for follow-up refinements after real usage. |
| ✅ | Single-page new enrollment intake | Intake, duplicate warning, pricing, uniform decision, and Caja handoff are shipped. |
| 🟡 | Refund workflow | `v1.16.147` adds stronger source-charge guardrails; `v1.16.148`-`v1.16.149` add and polish Caja shortcuts; `v1.16.153` protects inscriptions like tuition. Future scope includes receipt printing for refunds, possible policy windows, and a deliberate account-credit model for mixed payments. |
| ✅ | Re-enrollment pricing tier fix | Preview `v1.16.159` updates returning-enrollment `Solo inscripcion` to `$700` and adds a regression assertion. |
| 🟢 | Pendientes attendance context | Production `v1.16.168` adds recent last-five attendance chips to pending detail rows. Preview `v1.16.171` adds tiered confirmed-absence / inactive badges beside those chips. |
| ✅ | Recent attendance at-a-glance | Production `v1.16.168` adds a compact last-5-sessions summary to pending detail rows using the shared batch attendance source. Money fields remain finance-only; attendance-only roles do not get debt amounts through this feature. |
| ✅ | Corte Diario revamp | Automatic checkpoints, detailed reports, 360Player visibility, historical browsing, and receipt/corte print improvements are shipped. |

### Jugadores

| Status | Item | Notes |
|---|---|---|
| ✅ | Grouped roster performance | Main spreadsheet-style roster optimized through `v1.16.106`-`v1.16.109`. |
| ✅ | Training group emergency edit mode | Dropdown edit, audited batch save, permission hiding, and `Quitar grupo` shipped in `v1.16.116`-`v1.16.117`. |
| ✅ | Grouped roster Excel export | Export shipped in `v1.16.129`; category/YOB sheets and black-white print-friendly formatting shipped in `v1.16.130`. |
| 🟢 | `Bajas` tab polish | Month/date filters, alphabetical archive, categorized reasons, reason KPIs, and copyable summary shipped in `v1.16.123`-`v1.16.126`. `v1.16.181` adds a compact print-only dropout report using all filtered rows and campus/YOB/name/baja-date ordering; `v1.16.182` also shows category/YOB in the visible app list. Keep open for later visual cleanup or deeper analytics. |
| 🧊 | Bajas confirmation workflow | Lower priority for now because Front Desk/admin have more urgent requested changes. Planned later: Front Desk / Director Deportivo can flag a potential dropout (`Baja potencial`) with reason/context, while director/admin confirmation performs the final enrollment-ending action. |
| 🟡 | Excel/list export tools | First grouped roster export is live; `v1.16.166` adds a direct-print coach roster sheet. Keep open for broader list/export needs. |
| ✅ | Coach roster direct print sheet | Shipped in `v1.16.166`: print-only roster sheet from `Jugadores > Vista por grupos`, inside `Herramientas`, one training group per page, alphabetical roster, ID, enrollment date, coach familiarity checkboxes, and notes column. |
| 🟢 | Recent attendance on player roster | Production `v1.16.167` shows compact last-5-sessions attendance chips beside players without per-player client queries; `v1.16.168` shares the same helper with `Pendientes`; preview `v1.16.171` adds tiered attendance-risk badges; `v1.16.172` chunks large player batches to avoid truncated chip data. |
| 🔴 | Account-page YOB + breadcrumb polish | Restore year/category visibility and better navigation context on remaining account/finance surfaces. |
| ✅ | Training-group movement permissions audit | Preview `v1.16.160` adds explicit attendance-campus write checks before group assignment service-role writes and documents the next automation boundary. |
| 🟢 | New enrollment B1 auto-assignment | Preview `v1.16.174` auto-assigns new players to the matching active Futbol Para Todos group only when the match is unambiguous by campus, category/YOB, and gender. Female-specific groups are preferred for female players when available, including the 2014/2015 Femenil combined-year group. |

### Regularización Histórica

| Status | Item | Notes |
|---|---|---|
| ✅ | Superadmin-only historical workspace | Replaced old staff-facing Contry flow; both campuses; historical payments, tuition, exceptional charges, and pending-charge voids. |
| ✅ | Past monthly tuition options | Prior-two-month tuition creation added in `v1.16.128`. |
| ✅ | Performance pass | Pending-focused ledger load shipped in `v1.16.132`; full history remains available on demand. |
| 🔴 | Competition-charge guardrails | Prevent incomplete competition charge/payment workflows. |

### Asistencia

`v1.16.137` shipped scoped completed-session correction for Director Deportivo and Field Admin, plus the Contry 2016/2017 B1 split into separate 2016 and 2017 groups. `v1.16.138` shipped direct campus buttons across the attendance menu.

| Status | Item | Notes |
|---|---|---|
| ✅ | Attendance capture foundation | Attendance roles, sessions, schedules, reports, correction audit, closure model, group views, and monthly matrix are shipped. |
| ✅ | Calendar day redirect | Calendar day click now redirects to `/attendance?date=YYYY-MM-DD` instead of stretching the calendar. |
| ✅ | Campus button selectors | Shipped in `v1.16.138`; replaces campus dropdowns on Hoy, Calendario, Grupos, and Reportes with direct campus buttons that preserve the active date/month/report filters. |
| ✅ | Daily notes overview | Shipped in `v1.16.140`; adds a day-level notes review for session notes and player-level attendance observations. |
| 🟢 | Daily attendance report | Preview `v1.16.165` adds a read-only daily report inside `Asistencia > Reportes` with session totals, expected-vs-recorded counts, status counts, closures, and notes. |
| 🟡 | Submit smoothing | Save path has been optimized; keep monitoring large roster latency. |
| 🟢 | Confirmed-absence risk badge | Preview `v1.16.171` derives tiered badges for 3 confirmed absences, 4+ confirmed absences, and 30+/60+ days since last positive attendance. Missing attendance records are not absences. First surfaces: Jugadores and Pendientes; `v1.16.178` reuses the signal in Caja, with relation reports still pending. |
| 🟢 | Shared recent attendance summary source | Production `v1.16.167` adds the batch/RPC-backed source for latest player attendance; `v1.16.168` reuses it in `Pendientes`; preview `v1.16.171` adds the companion attendance-risk RPC; `v1.16.176` fixes paginated monthly record loading in `Grupos`. Reuse the sources next for Caja/collections reports. |
| ✅ | Attendance nomenclature pass | Preview `v1.16.175` standardizes the attendance capture UI, shared chips, player summaries, daily reports, and group monthly views to `A Asistió`, `F Falta`, `🩹 Lesión`, and `📝 Justificada`; report/group `Ausencias` copy now reads as `Faltas`. |
| 🟢 | `Grupos` selected-detail KPI polish | Preview `v1.16.188` adds compact selected-group KPIs for total roster, previous full calendar week attendance, current-month no-attendance count, and monthly attendance rate; selected group is preserved when changing month. |
| 🟡 | Special-day and cancellation workflow | Simplify special session creation and rain/cancellation handling. Permission target: Office Admin, Field Admin, Director Deportivo, Admin, and Super Admin. |
| 🟡 | Attendance analytics panel | Larger reporting surface with date filters, charts, KPIs, best/worst groups, and trends. Use shared summary sources so it does not recalculate every screen ad hoc. |
| 🟡 | Injury workflow + tuition omission rework | Redesign how injuries interact with omitted monthly tuition, current/future charges, and return-to-normal behavior. Requires a separate finance-sensitive design. |
| 🧊 | Closure workflow expansion | Planned closures/rain/vacation workflows remain later; current cancellation model already excludes cancelled sessions from attendance rates. |
| 🧊 | Parent-facing attendance | Out of scope for now. |

### Nutrición

| Status | Item | Notes |
|---|---|---|
| ✅ | Nutrition role + measurements v1 | Nutritionist role, menu lane, measurement intake, nutrition-safe profile, panel KPIs, and OMS profile charts shipped. |
| ✅ | Nutrition v2 metrics/reporting base | Waist circumference, parent report page, compact OMS charts, timestamp fixes, and OMS chart polish shipped in `v1.16.78`-`v1.16.83`. |
| 🟡 | Nutrition vNext | More body metrics, richer analytics, parent PDF polish, notes/recommendations, and faster intake workflows. |

### Sports / Tournaments

| Status | Item | Notes |
|---|---|---|
| 🔴 | Coach match posting v1 | Let coaches start entering match posts/results this week as a lightweight habit/data-shape test before the parent app depends on it. |
| 🟡 | Director Deportivo dashboard | Category-first sports lane exists; keep open for Julio validation and UX simplification. |
| 🟡 | League/tournament management | Configuration + team drilldown exists; keep open for competition-specific rules and mixed-year realities. |
| 🟡 | Team-building workflow | Roster-final workflow exists; keep open for manual override polish. |
| 🟡 | Torneos workflow redesign | Larger planned pass covering signup, payment, team assignment, roster approval, and parent/mobile-facing needs. |
| ✅ | Tournament signup paid-date filter | Shipped in `v1.16.189`: start/end paid-date filters to `Inscripciones Torneos` so Front Desk can see players who paid for a selected tournament in a specific date window. |
| 🔴 | Autopopulate base teams from current `Nivel` | Important but needs careful guided/backfill planning. Only assign when campus + birth year + gender + level match is unambiguous. |
| 🔴 | Sports lane rethink | Use live signup-board success as planning anchor before adding heavier sports complexity. |

### Reports / Finance / Admin

| Status | Item | Notes |
|---|---|---|
| 🔴 | Dashboard KPI verification | Verify pending-balance totals against canonical sources before adding drilldowns/trends. |
| 🔴 | Panel KPI drilldowns + trends | Add pending-tuition breakdowns and trend charts only after canonical checks. |
| 🔴 | Folio → payment lookup in Actividad | Surface payment ID in audit/activity so staff can trace transactions by folio. |
| 🔴 | Caja pending charge detail | Expandable rows showing period month and charge type before payment. |
| 🟢 | Collections + attendance relation report | Preview `v1.16.179` adds the first operational-only relation report under `Asistencia > Reportes`, using pending-month counts plus attendance risk/recent chips and no peso amounts. Validate with Front Desk/Admin before marking solved. |
| ⚠️ | Expenses / Nomina module | New finance module for daily expenses, payroll/nomina payments, campus attribution, evidence, methods, categories, and reporting. Needs its own spec before implementation. |
| ⚠️ | Custom receipt tickets | Needs product list and ticket spec before implementation. |
| 🧊 | Receipt encoding artifact cleanup | Low-priority cleanup for remaining accent/`Ñ` artifacts in edge receipts. |

### App Shell / General UX

| Status | Item | Notes |
|---|---|---|
| ✅ | Clickable logo home link | Shipped in `v1.16.138`; links the `INVICTA` header wordmark to `/inicio`. |
| 🔴 | Favicon / app icon | Choose a square source mark and then add the favicon/app icon metadata. Current available assets are not yet confirmed as the final icon source. |

## Strategic Later Phases

Keep these visible, but do not mix them into urgent operational fixes.

| Status | Phase | Notes |
|---|---|---|
| 🧊 | Parent app / parent portal | Separate product surface; requires deliberate auth, permissions, and UX design. |
| 🧊 | Stripe automation / webhooks | 360Player is currently recorded manually; true automation needs a practical external matching path. |
| 🧊 | Multi-campus / multi-tenant architecture | Larger schema and platform design phase. |
| 🧊 | Mobile / native app path | Later consideration after core web workflows stabilize. |
| 🧊 | Coach module | Coach login and session capture can build on attendance foundations later. |
| 🧊 | Document uploads | Supabase Storage, RLS, and admin-only document surfaces remain future work. |
| 🧊 | Specialist appointments | Product-catalog/admin pass for physiotherapy, psychology, nutrition appointments. |
| 🧊 | Expenses / Nomina expansion | Larger finance-control phase after the near-term Front Desk/attendance feedback wave. Start with a dedicated planning spec before adding tables or UI. |

## Recently Shipped Shortlist

This is intentionally short. Full details live in `docs/devlog.md`.

- 🟢 `v1.16.183` — Caja tournament products now support July 2026 dynamic pricing rules for Superliga/Rosa, Copa Polideportivo, and Torneo de Leyendas.
- 🟢 `v1.16.182` — `Jugadores > Bajas` visible app list now includes category/YOB, matching the print report context.
- 🟢 `v1.16.181` — `Jugadores > Bajas` now has a compact direct-print dropout report using all filtered rows and campus/YOB/name/baja-date ordering.
- 🟢 `v1.16.176` — `Asistencia > Grupos` detail matrices now paginate monthly attendance record loads so large campuses/months do not drop player-day cells.
- 🟢 `v1.16.175` — Attendance nomenclature is standardized across capture, player summaries, recent chips, reports, and group views: `A Asistió`, `F Falta`, `🩹 Lesión`, `📝 Justificada`, with report `Faltas` wording.
- 🟢 `v1.16.174` — Female 2014/2015 new enrollments now resolve to the single matching Femenil combined-year Futbol Para Todos group even when its operational code is not B1.
- 🟢 `v1.16.173` — New enrollments now auto-assign to the matching active B1 Futbol Para Todos training group when the campus/YOB/gender match is unambiguous.
- 🟢 `v1.16.172` — Large player RPC batches are chunked so recent attendance chips and risk badges do not truncate big rosters.
- 🟢 `v1.16.171` — Attendance risk badges identify confirmed absence streaks and 30+/60+ day inactivity.
- ✅ `v1.16.170` — Enrollment scholarships now support custom fixed monthly tuition amounts.

- 🟢 `v1.16.169` — Datos Faltantes now lets Admin Oficina save player/tutor contact updates with simpler `Guardar datos` wording and optional tutor fields.
- 🟢 `v1.16.168` — `Pendientes` detail rows now show compact recent-attendance chips from the shared batch attendance source.
- 🟢 `v1.16.167` — `Jugadores > Vista por grupos` now shows compact recent-attendance chips from a batch SQL source.
- ✅ `v1.16.166` — `Jugadores > Vista por grupos` now has a direct-print coach roster sheet under `Herramientas`.
- 🟢 `v1.16.165` — Asistencia now has a daily report in Reportes and clearer capture labels; `v1.16.175` completes the cross-surface nomenclature cleanup.
- 🟢 `v1.16.164` — Datos Faltantes tutor form button moved to a footer so `Parentesco` keeps the same row alignment.
- 🟢 `v1.16.163` — Datos Faltantes can now capture a principal tutor plus optional second tutor; additional tutors are linked as non-primary.
- 🟢 `v1.16.159` — returning-enrollment `Solo inscripcion` pricing now uses `$700` and is covered by `npm run test:pricing`.
- 🟡 `v1.16.158` — Sanidad financiera now has a filtered CSV export; production warning review found only manual June repricing cautions, not drift.
- 🟡 `v1.16.157` — Caja now turns eligible `Cambiar concepto` remainders into explicit account credit, with confirmation and no legacy auto-conversion.
- ✅ `v1.16.153` — Caja now treats inscriptions like monthly tuition for refund/reassignment guardrails: visible, but non-refundable and non-reassignable.
- 🟡 `v1.16.154` — Caja account-credit ledger schema foundation added on preview: explicit credit tables/views with read-only grants and no app write behavior yet.
- ✅ `v1.16.152` — Caja concept changes now support allocation-level reassignment for eligible non-monthly parts of mixed payments while protecting tuition.
- ✅ `v1.16.151` — Caja `Ultimos pagos` bottom panel now uses a more uniform desktop grid with column headers.
- ✅ `v1.16.150` — Caja `Ultimos pagos` bottom panel columns now align more cleanly on desktop.
- ✅ `v1.16.149` — Caja widened the workspace, moved `Ultimos pagos` into a cleaner bottom panel, and kept deep-linked player names clickable.
- ✅ `v1.16.148` — Caja now shows `Ultimos pagos` shortcuts for guarded refund/reassignment workflows.
- ✅ `v1.16.147` — Caja refund/reassignment guardrails previewed: source monthly tuition blocked, eligible non-monthly source charges void after refund/reassignment, and refunds limited to cash/card.
- ✅ `v1.16.146` — Attendance `Hoy` group cards now show configured YOB ranges for repeated non-selectivo levels.

- ✅ `v1.16.140` — Attendance daily notes overview shipped for scanning session/player notes by campus and date.
- ✅ `v1.16.139` — Caja one-receipt path for pending monthly tuition plus advance tuition shipped to production.
- ✅ `v1.16.138` — quick UX pass shipped: clickable header logo and attendance campus button selectors.
- ✅ `v1.16.137` — attendance correction permissions widened and Contry 2016/2017 B1 split shipped.
- ✅ `v1.16.130` — `Jugadores` grouped roster export now splits into category/YOB sheets and prints black-and-white.
- ✅ `v1.16.129` — `Jugadores > Vista por grupos` Excel export added.
- ✅ `v1.16.128` — Regularización Histórica can create prior-two-month tuition charges.
- ✅ `v1.16.127` — Regularización duplicate load trimmed.
- ✅ `v1.16.126` — `Jugadores > Bajas` reason KPIs and copyable summary.
- ✅ `v1.16.123`-`v1.16.125` — Bajas filters, categorized dropout reasons, and dropdown ordering/labels.
- ✅ `v1.16.118`-`v1.16.122` — `Llamadas` workflow rebuild, detail queues, auto-save status, direct baja, and injury omission workflow.
- ✅ `v1.16.116`-`v1.16.117` — Training group edit mode, group unassignment, and attendance calendar day redirect.
- ✅ `v1.16.112`-`v1.16.114` — Regularización Histórica lazy/prefetch/eager-action performance trims.
- ✅ `v1.16.110`-`v1.16.111` — Attendance submit smoothing and revalidation trim.
- ✅ `v1.16.106`-`v1.16.109` — `Jugadores` grouped roster RPC/API/server fast-path optimization.
- ✅ `v1.16.104`-`v1.16.105` — Supabase advisor/security hardening and role-sensitive RPC cleanup.
- ✅ `v1.16.78`-`v1.16.83` — Nutrition v2 metrics/reporting base: waist, parent report, OMS chart polish, timestamp fixes.
- ✅ `v1.16.67`-`v1.16.68` — Superadmin-only Regularización Histórica workspace and charge voiding.
- ✅ `v1.16.58`-`v1.16.66` — Pendientes/Llamadas split and pending-tuition large-query completeness fix.

## Reference

- Detailed chronological implementation history: `docs/devlog.md`
- Role permission audit: `docs/role-permissions-audit.md`
- Role regression checklist: `docs/role-regression-checklist.md`
- Production access runbook: `docs/production-access-runbook.md`
- Attendance/training groups planning: `docs/planning/attendance-training-groups-roadmap.md`
- Attendance calendar/closures planning: `docs/planning/attendance-calendar-closures-plan.md`
- Full pre-reorg roadmap snapshot: `docs/archive/roadmap-post-alpha-pre-reorg-2026-05-06.md`

## Active Preview Addendum

- 🟢 `v1.16.176` Attendance group monthly pagination fix: `Grupos` detail matrices fetch all monthly attendance records in pages/chunks instead of relying on one capped response; no write/session/roster logic changed.
- 🟢 `v1.16.175` Attendance nomenclature cleanup: capture, player summaries, recent chips, reports, and group monthly views now use `A Asistió`, `F Falta`, `🩹 Lesión`, and `📝 Justificada`; no attendance write or roster logic changed.
- 🟢 `v1.16.174` Female combined-year auto-assignment fix: 2014/2015 female players resolve to the single matching Femenil Futbol Para Todos group; ambiguous/no-match players remain `Sin grupo`.
- 🟢 `v1.16.173` New enrollment B1 auto-assignment: guarded default assignment for one-page intake and existing-player enrollment; ambiguous/no-match players remain `Sin grupo`.

- 🟢 `v1.16.172` Attendance batch pagination fix: chunks large player RPC calls so recent attendance chips and risk badges do not drop later players from big rosters.
- 🟢 `v1.16.171` Attendance risk badge source: adds the batched confirmed-absence / inactive-player risk RPC and first badges in `Jugadores` and `Pendientes`. Validate on preview before main; no attendance write or finance behavior changes.
- ✅ `v1.16.170` Custom fixed scholarship amount: adds `Beca personalizada` with a fixed monthly amount, currently for `$500.00` tuition, through the existing enrollment scholarship section and shared tuition calculation paths.
