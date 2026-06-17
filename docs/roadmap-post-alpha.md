# Post-Alpha Roadmap 🗺️ Dragon Force Ops (INVICTA)

Last reorganized: 2026-05-06. Last checkpoint: 2026-06-15.

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

- Current production line: `v1.16.157`
- Current preview line: `v1.16.159`
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

## Now

These are the highest-value items to consider next. Keep this list short: usually 3-5 active decisions or edits.

| Status | Item | Why it matters | Reference |
|---|---|---|---|
| ✅ | Re-enrollment pricing tier fix | Preview `v1.16.159` updates returning-enrollment `Solo inscripcion` from `$600` to `$700` and adds a pricing assertion. | Front Desk / Caja / Collections below, `v1.16.159` devlog |
| 🔴 | Training-group permissions audit | Before expanding group automation, confirm exactly who can view, move, remove, batch-edit, or auto-trigger training group assignments. | Jugadores / Safety lanes |
| 🔴 | New enrollment B1 auto-assignment | Reduce manual setup by auto-assigning new players to the matching B1 Futbol Para Todos training group when campus + YOB + gender produce one unambiguous active group. | Jugadores lane |
| 🔴 | Attendance risk + collections signal | Build the confirmed-absence risk badge first, then reuse it in Pendientes and relation reports so Front Desk can prioritize calls with attendance context. | Front Desk / Asistencia / Reports lanes |
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
| 🔴 | June 2026 feedback wave | Active priority wave. Use the ordered sequence below; promote one or two items into implementation at a time. | Checkpoint 2026-06-15 |
| ✅ | 1. Re-enrollment pricing tier still at `$600` | Preview `v1.16.159` updates the returning `Solo inscripcion` option to `$700` without changing unrelated pricing rules. | Front Desk / Caja / Collections, `v1.16.159` devlog |
| 🔴 | 2. Training-group move permissions audit | Confirm group-edit visibility and write permissions for Super Admin, Director Admin, Director Deportivo, Front Desk, and Field Admin before expanding assignment automation. | Safety / Permissions / Data Integrity, Jugadores |
| 🔴 | 3. New-enrollment B1 auto-assignment | Auto-assign new enrollments only when there is exactly one matching active B1 Futbol Para Todos group by campus, category/YOB, and gender. Female-specific group wins when available; ambiguous/no match stays `Sin grupo`. | Jugadores |
| 🔴 | 4. Attendance risk badge | Add a derived global badge for players with 3 confirmed true absences in their last consecutive scheduled sessions. Missing records do not count as absences. | Asistencia, Front Desk / Caja / Collections |
| 🔴 | 5. Pendientes attendance summary | Add compact attendance context to pending-month detail views, reusing the same attendance-risk source instead of duplicating calculations. | Front Desk / Caja / Collections |
| 🔴 | 6. Collections + attendance relation report | Build a finance-visible report for `no paga y no asiste`, `no paga pero si asiste`, and related risk combinations. Keep attendance-only users out of money data. | Reports / Finance / Admin |
| 🟡 | 7. Injury workflow + tuition omission rework | Needs a separate design because it can touch charge generation, current-month voiding, omissions, and possible approval rules. | Front Desk / Caja / Collections, Asistencia |
| 🟡 | 8. Attendance nomenclature pass | Keep as a copy/label cleanup after the data-flow items are clearer, so terms stay consistent across Hoy, Calendario, Grupos, Reportes, player profile, and Pendientes. | Asistencia |
| 🧊 | Baja confirmation before final dropout | Already captured under `Jugadores > Bajas confirmation workflow`; keep parked until higher-priority Front Desk/Admin changes are handled. | Jugadores lane |
| 🧊 | Tournament, coach, and parent/mobile-adjacent feedback | Do not treat these as one feature. Split into specs before promotion: coach match posting, tournament redesign, and parent/mobile data contract. | Sports / Tournaments, Strategic Later Phases |
| 🟡 | Finance/Caja edge cases from real use | Route through Caja product lane and validate with preview plus `/admin/finance-sanity`; avoid ad hoc production fixes. | Front Desk / Caja / Collections, Safety / Permissions / Data Integrity |
| ⚠️ | Expenses / Nomina module | Big finance module, not a quick UX pass. Needs a dedicated spec for expense categories, payroll, campus attribution, payment method, evidence, permissions, and finance reports. | Reports / Finance / Admin, Strategic Later Phases |

## Safety / Permissions / Data Integrity

| Status | Item | Current decision |
|---|---|---|
| 🟡 | Role permissions audit and stabilization | Keep active. Manual direct-route checklist exists; later follow-up can automate the highest-risk route assertions. |
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
| 🟢 | `Datos faltantes` contact cleanup | Preview `v1.16.134`-`v1.16.136` adds a fast operational queue for missing tutor phones/contact fields, campus/YOB/gender filtering, phone-only tutor capture, and default YOB scoping. |
| ✅ | Caja current + next-month same-receipt unlock | Shipped in `v1.16.139`; keeps the pending-tuition safety rule and adds a one-receipt exception only when the pending monthly charges are selected and covered in the same Caja checkout. |
| 🟢 | Caja refunds and payment reassignment guardrails | Preview `v1.16.147` hardens the existing ledger actions; preview `v1.16.148` adds a Caja recent-payments panel with guarded `Cambiar concepto` / `Reembolsar` shortcuts and disabled reason chips; preview `v1.16.149`-`v1.16.151` widen/polish the bottom grid; preview `v1.16.152` lets staff move only eligible non-monthly source allocations from mixed payments while keeping tuition protected; preview `v1.16.153` also makes inscriptions non-refundable/non-reassignable. |
| 🟢 | Caja account credit ledger / partial refund model | Planning spec in `docs/planning/caja-account-credit-ledger-plan.md`; preview `v1.16.154` adds the additive schema foundation, `v1.16.155` surfaces explicit/legacy credit in Caja, `v1.16.156` applies explicit credit to selected charges with a confirmation checkbox and service-role-only RPC, and `v1.16.157` turns eligible Caja reassignment remainders into explicit credit. Future passes: legacy implicit-credit review/conversion and deeper credit reporting. Legacy implicit credits stay warning-only until manually reviewed. |
| 🟢 | Batch 360Player monthly posting | Preview `v1.16.143` adds `/admin/360player-posting` for manual 360Player monthly tuition posting with early/late price calculation, exact single-charge allocation, repricing where needed, audit entries, explicit confirmation, submit-loading feedback, and prior-month arrears lock. Validate with May 2026 360Player checks before production promotion. |
| 🟡 | Offline/outage fallback | Define what Front Desk can safely keep doing without internet and what must wait; likely printable queues plus retry-safe notes rather than offline payment mutation. |
| 🟡 | `Pendientes` call-center mode | Tuition-only pending board works; keep open for follow-up refinements after real usage. |
| ✅ | Single-page new enrollment intake | Intake, duplicate warning, pricing, uniform decision, and Caja handoff are shipped. |
| 🟡 | Refund workflow | `v1.16.147` adds stronger source-charge guardrails; `v1.16.148`-`v1.16.149` add and polish Caja shortcuts; `v1.16.153` protects inscriptions like tuition. Future scope includes receipt printing for refunds, possible policy windows, and a deliberate account-credit model for mixed payments. |
| ✅ | Re-enrollment pricing tier fix | Preview `v1.16.159` updates returning-enrollment `Solo inscripcion` to `$700` and adds a regression assertion. |
| 🔴 | Pendientes attendance context | Add compact attendance context to pending detail views: confirmed-absence streak, recent attendance summary, and last attended date. Reuse the future attendance-risk source. |
| ✅ | Corte Diario revamp | Automatic checkpoints, detailed reports, 360Player visibility, historical browsing, and receipt/corte print improvements are shipped. |

### Jugadores

| Status | Item | Notes |
|---|---|---|
| ✅ | Grouped roster performance | Main spreadsheet-style roster optimized through `v1.16.106`-`v1.16.109`. |
| ✅ | Training group emergency edit mode | Dropdown edit, audited batch save, permission hiding, and `Quitar grupo` shipped in `v1.16.116`-`v1.16.117`. |
| ✅ | Grouped roster Excel export | Export shipped in `v1.16.129`; category/YOB sheets and black-white print-friendly formatting shipped in `v1.16.130`. |
| 🟡 | `Bajas` tab polish | Month/date filters, alphabetical archive, categorized reasons, reason KPIs, and copyable summary shipped in `v1.16.123`-`v1.16.126`. Keep open for later visual cleanup or deeper analytics. |
| 🧊 | Bajas confirmation workflow | Lower priority for now because Front Desk/admin have more urgent requested changes. Planned later: Front Desk / Director Deportivo can flag a potential dropout (`Baja potencial`) with reason/context, while director/admin confirmation performs the final enrollment-ending action. |
| 🟡 | Excel/list export tools | First grouped roster export is live; keep open for broader list/export needs. |
| 🔴 | Account-page YOB + breadcrumb polish | Restore year/category visibility and better navigation context on remaining account/finance surfaces. |
| 🔴 | Training-group movement permissions audit | Deep dive who can view/edit/remove/batch-move training group assignments and who can trigger auto-assignment through enrollment. Use this before adding more group automation. |
| 🔴 | New enrollment B1 auto-assignment | Auto-assign new players to the matching active B1 Futbol Para Todos group only when the match is unambiguous by campus, category/YOB, and gender. Female-specific groups should be preferred for female players when available. |

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
| 🟡 | Submit smoothing | Save path has been optimized; keep monitoring large roster latency. |
| 🔴 | Confirmed-absence risk badge | Derived badge for players with 3 confirmed true absences in their last consecutive scheduled sessions. Missing attendance records are not absences. Surface the badge across Asistencia, Jugadores, Caja, and Pendientes once built. |
| 🟡 | Attendance nomenclature pass | Rename/copy-clean attendance tracking labels in one sweep after the risk/reporting source is settled, so all attendance surfaces use consistent terms. |
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
| 🔴 | Autopopulate base teams from current `Nivel` | Important but needs careful guided/backfill planning. Only assign when campus + birth year + gender + level match is unambiguous. |
| 🔴 | Sports lane rethink | Use live signup-board success as planning anchor before adding heavier sports complexity. |

### Reports / Finance / Admin

| Status | Item | Notes |
|---|---|---|
| 🔴 | Dashboard KPI verification | Verify pending-balance totals against canonical sources before adding drilldowns/trends. |
| 🔴 | Panel KPI drilldowns + trends | Add pending-tuition breakdowns and trend charts only after canonical checks. |
| 🔴 | Folio → payment lookup in Actividad | Surface payment ID in audit/activity so staff can trace transactions by folio. |
| 🔴 | Caja pending charge detail | Expandable rows showing period month and charge type before payment. |
| 🔴 | Collections + attendance relation report | Add a finance-visible report showing combinations such as players who owe and stopped attending, owe but are still attending, and are current but stopped attending. This must stay behind finance-capable roles. |
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
