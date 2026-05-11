# Post-Alpha Roadmap 🗺️ Dragon Force Ops (INVICTA)

Last reorganized: 2026-05-06.

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

## Status Legend

- 🔴 Open / not started
- 🟡 In progress / partially shipped
- 🟢 Ready for validation
- ✅ Done / shipped
- 🧊 Parked / lower priority
- ⚠️ Needs spec or decision

## Current Release State

- Current production line: `v1.16.139`
- Current preview line: `v1.16.139`
- Working branch policy: new implementation continues on `preview`; merge to `main` only after explicit production approval.
- Devlog source of truth: `docs/devlog.md`
- Archived full roadmap detail: `docs/archive/roadmap-post-alpha-pre-reorg-2026-05-06.md`

## Now

These are the highest-value items to consider next. Keep this list short.

| Status | Item | Why it matters | Reference |
|---|---|---|---|
| 🟢 | Role-regression checklist validation | Latest static pass confirmed `Datos faltantes` uses the operational route/action boundary and exposes no finance fields; next step is still manual direct-URL checks before the next permission-sensitive merge. | `docs/role-regression-checklist.md`, `docs/role-permissions-audit.md`, `v1.16.136` devlog |
| ✅ | Regularización Histórica performance pass | Shipped in `v1.16.132`; selected accounts now open with a pending-focused ledger and load full payment/refund history on demand. | `v1.16.112`-`v1.16.114`, `v1.16.127`, `v1.16.128`, `v1.16.132` devlog |
| 🟢 | Front Desk feedback cycle | Recent `Llamadas`, `Bajas`, and `Jugadores` export changes are live; gather real operator feedback before another broad workflow pass. | `v1.16.118`-`v1.16.130` devlog |
| 🟢 | Attendance quick UX pass | Preview `v1.16.138` makes the logo link home and replaces attendance campus dropdowns with direct campus buttons on Hoy, Calendario, Grupos, and Reportes. | General UX / Asistencia items below, `v1.16.138` devlog |
| 🟢 | Front Desk contact cleanup queue | Preview `v1.16.136` adds `Datos faltantes` for completing missing tutor phone/contact data without exposing finance fields. Validate with Front Desk roles. | Front Desk item below, `v1.16.134`-`v1.16.136` devlog |

## Next

Important, but not necessarily the next edit.

`v1.16.138` preview validation: app-shell logo now links to `/inicio`, and attendance campus selectors now use direct buttons that auto-navigate while preserving the active date/month/report filters.

| Status | Item | Notes |
|---|---|---|
| 🟢 | Caja current + next-month same-receipt unlock | Preview `v1.16.139` allows current/pending monthly tuition plus advance tuition in one receipt only when prior monthly charges are selected and the payment covers the staged total. |
| 🔴 | Caja refund / reassignment workflow planning | Design before implementation. Likely needs a small recent-payments/charges panel in Caja, refund recording, and a separate path for moving tournament/payment credit to tuition. |
| 🔴 | Attendance daily notes overview | Add a simple way to review notes for a selected day across all groups/sessions without opening every session one by one. |
| 🔴 | Favicon / app icon pass | Choose or create the square source mark, then add the required Next metadata/icons. Keep this as app-shell polish, not an operational blocker. |
| 🔴 | Coach match posting v1 | Let coaches start posting match info before the parent/mobile app launch, so the habit and data shape can be tested early. |
| 🟡 | Offline/outage mitigation plan | Plan a pragmatic fallback for front desk when internet is down: printable queues, local notes, retry-safe capture, and clear limits around payments. |
| 🔴 | Batch 360Player monthly posting | Design a fast manual batch-entry workflow for many 360Player tuition payments without opening Regularización Histórica one player at a time. |
| 🟡 | Torneos workflow redesign | Larger planning item after urgent ops polish; needs confirmed team, signup, payment, and roster behavior. |
| 🟢 | Product/admin KPI language cleanup | Preview `v1.16.133` renames product KPIs away from sales/revenue language and adds confirmed collected/pending amounts. |
| 🔴 | Regularización competition-charge guardrails | Reduce accidental tournament/competition charges without matching historical payment. Scope should be workflow guardrails, not a finance model rewrite. |
| 🟡 | Finance drift monitoring | Read-only prod export on 2026-05-08 scanned 735 enrollments and found 43 warning-only accounts, with no correction-grade report result. Keep using `/admin/finance-sanity` and exports after finance-sensitive work. |
| 🟡 | Nutrition vNext | V1 and OMS/report passes are shipped; keep circumference metrics, parent PDF polish, richer analytics, and workflow speedups open. |
| 🟡 | Uniformes follow-up | Compact menu feedback and auto-sync captured uniform size into player technical data. Keep stock/supplier management separate. |
| 🟡 | Player profile consolidation polish | Continue making `/players/[id]` the single-player hub; remaining polish includes local date formatting and account navigation. |
| 🧊 | Drag-and-drop group editing | Later UI layer over the existing audited batch group assignment flow. Current dropdown edit mode is usable. |

## Safety / Permissions / Data Integrity

| Status | Item | Current decision |
|---|---|---|
| 🟡 | Role permissions audit and stabilization | Keep active. Manual direct-route checklist exists; later follow-up can automate the highest-risk route assertions. |
| ✅ | Finance direct-URL hardening | Caja, receipts, reports, enrollment ledgers, charge/reassign/refund pages, and finance helpers fail closed unless the user has the right operational access. See devlog around `v1.16.107`. |
| ✅ | Supabase advisor cleanup pass | Advisor-backed function/RLS/search-path/index cleanup shipped in `v1.16.104`-`v1.16.105`; rerun advisor before large DB/security releases. |
| 🟡 | Finance drift monitoring | Tooling exists through `/admin/finance-sanity` and `npm run diagnose:finance`; latest prod read-only export found warning-only historical/account-structure items, not a correction-grade drift result. |
| 🧊 | Auth hardening settings | Supabase leaked-password protection and more MFA options remain admin-console settings, not repo changes. Revisit when operationally ready. |

## Performance

| Status | Surface | Current state / next action |
|---|---|---|
| ✅ | `Jugadores > Vista por grupos` | RPC + client/API split + service-role server path brought production grouped roster down to usable latency. Export is now available. |
| ✅ | `/admin/regularizacion-historica` | `v1.16.132` trims selected-account opening to enrollment/balance/pending charges first; full payment/refund history is available on demand. |
| 🟡 | Attendance submit | Multiple passes reduced submit overhead and revalidation. Monitor large real rosters after field use. |
| 🟡 | Front Desk hot paths | Timing instrumentation exists for payment posting, intake, receipt prep/print, and attendance saves. Use logs when operators report lag. |
| 🔴 | Dashboard / Panel drilldowns | Add only after canonical finance-source checks so dashboards do not introduce drift. |

## Product Areas

### Front Desk / Caja / Collections

| Status | Item | Notes |
|---|---|---|
| ✅ | `Llamadas` v1/v2 workflow polish | Board/detail queues, follow-up statuses, auto-save status, direct baja, and inline injury omission shipped in `v1.16.118`-`v1.16.122`. |
| 🟢 | `Datos faltantes` contact cleanup | Preview `v1.16.134`-`v1.16.136` adds a fast operational queue for missing tutor phones/contact fields, campus/YOB/gender filtering, phone-only tutor capture, and default YOB scoping. |
| 🟢 | Caja current + next-month same-receipt unlock | Preview `v1.16.139` keeps the pending-tuition safety rule and adds a one-receipt exception only when the pending monthly charges are selected and covered in the same Caja checkout. |
| 🔴 | Caja refunds and payment reassignment | Needs planning. Include recent payment/charge context from Caja, direct refund registration, and a separate credit-reassignment path for cases like cancelled tournament participation. |
| 🔴 | Batch 360Player monthly posting | Plan a manual batch workflow to post many 360Player tuition payments quickly with auditability and duplicate protection. |
| 🟡 | Offline/outage fallback | Define what Front Desk can safely keep doing without internet and what must wait; likely printable queues plus retry-safe notes rather than offline payment mutation. |
| 🟡 | `Pendientes` call-center mode | Tuition-only pending board works; keep open for follow-up refinements after real usage. |
| ✅ | Single-page new enrollment intake | Intake, duplicate warning, pricing, uniform decision, and Caja handoff are shipped. |
| 🟡 | Refund workflow | V1 works; future scope includes partial refunds, stronger finance guardrails, and performance polish. |
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

### Regularización Histórica

| Status | Item | Notes |
|---|---|---|
| ✅ | Superadmin-only historical workspace | Replaced old staff-facing Contry flow; both campuses; historical payments, tuition, exceptional charges, and pending-charge voids. |
| ✅ | Past monthly tuition options | Prior-two-month tuition creation added in `v1.16.128`. |
| ✅ | Performance pass | Pending-focused ledger load shipped in `v1.16.132`; full history remains available on demand. |
| 🔴 | Competition-charge guardrails | Prevent incomplete competition charge/payment workflows. |

### Asistencia

`v1.16.137` shipped scoped completed-session correction for Director Deportivo and Field Admin, plus the Contry 2016/2017 B1 split into separate 2016 and 2017 groups. `v1.16.138` preview adds direct campus buttons across the attendance menu.

| Status | Item | Notes |
|---|---|---|
| ✅ | Attendance capture foundation | Attendance roles, sessions, schedules, reports, correction audit, closure model, group views, and monthly matrix are shipped. |
| ✅ | Calendar day redirect | Calendar day click now redirects to `/attendance?date=YYYY-MM-DD` instead of stretching the calendar. |
| 🟢 | Campus button selectors | Preview `v1.16.138` replaces campus dropdowns on Hoy, Calendario, Grupos, and Reportes with direct campus buttons that preserve the active date/month/report filters. |
| 🔴 | Daily notes overview | Add a day-level notes review so directors/admin can scan all session notes for a selected day at once. |
| 🟡 | Submit smoothing | Save path has been optimized; keep monitoring large roster latency. |
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
| ⚠️ | Custom receipt tickets | Needs product list and ticket spec before implementation. |
| 🧊 | Receipt encoding artifact cleanup | Low-priority cleanup for remaining accent/`Ñ` artifacts in edge receipts. |

### App Shell / General UX

| Status | Item | Notes |
|---|---|---|
| 🟢 | Clickable logo home link | Preview `v1.16.138` links the `INVICTA` header wordmark to `/inicio`. |
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

## Recently Shipped Shortlist

This is intentionally short. Full details live in `docs/devlog.md`.

- 🟢 `v1.16.139` — preview Caja one-receipt path for pending monthly tuition plus advance tuition.
- 🟢 `v1.16.138` — preview quick UX pass: clickable header logo and attendance campus button selectors.
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
