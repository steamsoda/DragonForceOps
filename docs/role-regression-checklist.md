# Role Regression Checklist

Last updated: 2026-05-06.

Use this before production merges that touch permissions, navigation, server actions, finance/account reads, Supabase policies, or role/campus bootstrap.

This checklist complements `docs/role-permissions-audit.md`. The audit explains the intended model; this file is the practical smoke test.

## Rules

- Test direct URLs, not only navigation visibility.
- Preview `Ver como` is useful for UI smoke checks, but it is not proof that production RLS works.
- For production-sensitive verification, use `Super Admin > Auditoria accesos` and, when possible, the real user account.
- Do not fix blocked sports/nutrition/attendance users by granting raw finance-table access.
- Any unexpected finance exposure for non-operational roles is a stop-merge issue.
- Record the tested deployment/version, tester, role/persona, campus scope, and date.

## Result Markers

- ✅ Allowed and data scope is correct.
- 🚫 Blocked or redirected to `/unauthorized`.
- 👀 Allowed read-only/non-financial view.
- ⚠️ Unexpected result; stop and investigate.
- N/A Not applicable for this role.

## Precheck

| Check | Expected |
|---|---|
| Vercel env project refs | `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` belong to the same Supabase project. |
| User has expected role row | `Super Admin > Auditoria accesos` shows the expected role code. |
| User campus scope resolves | Assigned campus labels appear correctly; global roles show all expected campuses. |
| Preview debug banner | If using debug personas, debug/read-only state is obvious and does not hide route-guard bugs. |

## Personas To Test

| Persona | Role | Campus scope | Must never see |
|---|---|---|---|
| Superadmin | `superadmin` | All campuses | N/A |
| Director Admin | `director_admin` | All campuses | Preview-only debug tools unless separately elevated. |
| Front Desk Contry | `front_desk` | Contry | Admin tools outside front-desk scope; other-campus data unless explicitly global. |
| Front Desk Linda Vista | `front_desk` | Linda Vista | Admin tools outside front-desk scope; other-campus data unless explicitly global. |
| Julio / Sports | `director_deportivo` | Assigned or global sports scope | Money amounts, receipts, Caja, player financial accounts, nutrition data. |
| Denisse / Nutrition | `nutritionist` | Assigned campus | Finance, Caja, receipts, general player profile, enrollment editing, sports management. |
| Field Admin | `attendance_admin` | Assigned campus | Finance, Caja, reports with money, admin tools, nutrition, sports management. |

## Sensitive Direct URL Matrix

Expected results by role:

- `SA`: superadmin
- `DIR`: director_admin
- `FD`: front_desk
- `SPORTS`: director_deportivo
- `NUTRI`: nutritionist
- `ATT`: attendance_admin

| Route | SA | DIR | FD | SPORTS | NUTRI | ATT | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| `/admin/access-audit` | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | Production-safe diagnostic is superadmin-only. |
| `/admin/users` | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | User/role management. |
| `/admin/actividad` | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | Director/superadmin operational audit only. |
| `/admin/finance-sanity` | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | Superadmin finance diagnostic. |
| `/admin/regularizacion-historica` | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | Historical repair workspace is superadmin-only. |
| `/admin/mensualidades` | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | Director/admin tuition generation/config. |
| `/admin/cargos-equipo` | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | Operational admin. |
| `/products` | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | Product/admin surface. |
| `/reports/corte-diario` | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | Front desk allowed only in assigned campus scope. |
| `/reports/corte-semanal` | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | Director finance report. |
| `/reports/resumen-mensual` | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | Director finance report. |
| `/reports/porto-mensual` | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | Director finance report. |
| `/receipts` | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | Front desk allowed only in assigned campus scope. |
| `/caja` | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | Front desk allowed only in assigned campus scope. |
| `/players/new` | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | Intake is operational/front-desk only. |
| `/players` | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | Sports/nutrition/attendance use dedicated safe surfaces, not general players. |
| `/players/[playerId]` | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | Use a real in-scope player ID; non-operational roles must not see financial profile. |
| `/players/[playerId]/edit` | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | Front desk only for in-scope operational data. |
| `/players/[playerId]/enrollments/[enrollmentId]/charges` | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | Finance/account route; front desk only in assigned campus scope. |
| `/players/[playerId]/enrollments/[enrollmentId]/payments/[paymentId]/reassign` | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | Finance correction. |
| `/players/[playerId]/enrollments/[enrollmentId]/payments/[paymentId]/refund` | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | Finance correction. |
| `/players/[playerId]/nuke` | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | Destructive superadmin-only tool. |
| `/pending` | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | Tuition-only board; no phone/money/receipt/Caja actions. |
| `/pending/detail` | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | Same as pending; check no money/contact leakage. |
| `/llamadas` | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | Collections follow-up; front desk/directors only. |
| `/llamadas/detail` | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | Phone/contact workflow; front desk/directors only. |
| `/sports-signups` | ✅ | ✅ | ✅ | 👀 | 🚫 | 🚫 | Sports can see operational signup state, no money amounts/methods/receipts. |
| `/sports-signups/detail` | ✅ | ✅ | ✅ | 👀 | 🚫 | 🚫 | Same no-money rule. |
| `/director-deportivo` | ✅ | ✅ | 🚫 | 👀 | 🚫 | 🚫 | Sports-only operational surface. |
| `/teams` | ✅ | ✅ | 🚫 | 👀 | 🚫 | 🚫 | Sports/team surface where enabled. |
| `/tournaments` | ✅ | ✅ | 🚫 | 👀 | 🚫 | 🚫 | Sports/tournament surface where enabled. |
| `/nutrition` | ✅ | ✅ | 🚫 | 🚫 | ✅ | 🚫 | Nutrition-safe only; no finance data. |
| `/nutrition/measurements` | ✅ | ✅ | 🚫 | 🚫 | ✅ | 🚫 | Nutrition capture only. |
| `/nutrition/players/[playerId]` | ✅ | ✅ | 🚫 | 🚫 | ✅ | 🚫 | Use in-scope nutrition player; no finance/account data. |
| `/attendance` | ✅ | ✅ | 🚫 | 👀 | 🚫 | ✅ | Attendance capture/read by attendance scope; sports may have intended attendance access where configured. |
| `/attendance/calendar` | ✅ | ✅ | 🚫 | 👀 | 🚫 | ✅ | Assigned attendance campus scope only. |
| `/attendance/groups` | ✅ | ✅ | 🚫 | 👀 | 🚫 | ✅ | Read-only for field admin; setup remains protected elsewhere. |
| `/attendance/reports` | ✅ | ✅ | 🚫 | 👀 | 🚫 | ✅ | Attendance reports only, no finance. |
| `/attendance/schedules` | ✅ | ✅ | 🚫 | 👀 | 🚫 | 🚫 | Setup/template route; field admin should not access setup. |
| `/attendance/settings` | ✅ | ✅ | 🚫 | 👀 | 🚫 | 🚫 | Setup/config route; field admin should not access setup. |
| `/uniforms` | ✅ | ✅ | ✅ | 🚫 | 🚫 | 🚫 | Operational/front-desk uniform workflow. |
| `/activity` | ✅ | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | Director-only activity route. |

## Role-Specific Smoke Tests

### Superadmin

- ✅ Can open `/admin/access-audit`.
- ✅ Can open finance diagnostics and admin pages.
- ✅ Can see all campuses.
- ✅ Can use `Debug permisos` on preview only.

### Director Admin

- ✅ Can use operational, finance, reporting, nutrition oversight, and sports oversight surfaces.
- 🚫 Cannot access preview-only debug/user-management surfaces unless separately elevated.
- ✅ Can access all intended campuses.

### Front Desk

- ✅ `/caja` loads assigned campus data.
- ✅ `/players/new` creates a normal intake path in assigned campus.
- ✅ `/receipts` and `/reports/corte-diario` work for assigned campus.
- ✅ `/players`, `/pending`, `/llamadas`, and `/uniforms` work in assigned campus scope.
- 🚫 Direct URLs to director reports, products, admin pages, historical regularization, payment reassignment/refund, and superadmin tools block.
- 🚫 Other-campus records block or return no data unless the user is intentionally global.

### Director Deportivo

- ✅ `/sports-signups` and `/sports-signups/detail` load assigned/global sports scope.
- ✅ `/director-deportivo`, `/teams`, and `/tournaments` work where enabled.
- 👀 Sports views may show operational payment state such as `Pagado` / `Pendiente`.
- 🚫 No money amounts, payment methods, receipts, Caja, player financial profile, or enrollment editing.
- 🚫 `/players`, `/caja`, `/receipts`, `/reports/*`, `/admin/*`, and `/nutrition/*` block.

### Nutritionist

- ✅ `/nutrition` and `/nutrition/measurements` load assigned campus.
- ✅ `/nutrition/players/[playerId]` shows nutrition-safe identity, measurements, OMS summaries, and tutor contact where intended.
- 🚫 `/players`, `/caja`, `/receipts`, `/reports/*`, `/admin/*`, `/sports-signups`, `/attendance`, and enrollment-account routes block.
- 🚫 No charges, payments, balances, receipts, Caja buttons, or admin controls appear.

### Attendance Admin

- ✅ `/inicio` shows attendance entry cards only.
- ✅ `/attendance`, `/attendance/calendar`, `/attendance/groups`, and `/attendance/reports` work in assigned campus scope.
- ✅ Can save attendance for assigned sessions.
- 🚫 No Caja, player finance/account routes, financial reports, admin pages, nutrition pages, competition pages, or setup pages.
- 🚫 `/attendance/schedules` and `/attendance/settings` block unless the user also has a director/admin/sports setup role.

## Data-Leak Checks

For `director_deportivo`, `nutritionist`, and `attendance_admin`, scan visible pages for these forbidden terms/data types:

- balance / saldo
- amount / monto
- paid amount / total pagado
- charge amount / cargo
- payment method / metodo
- receipt / recibo / folio
- Caja actions
- refund / reassign / void finance actions
- monthly tuition ledger rows

Some operational state labels are allowed in specific surfaces:

- `director_deportivo` may see non-financial signup state such as `Pagado` / `Pendiente` when it does not expose amounts, payment methods, receipts, or ledgers.
- `attendance_admin` may see attendance status only.
- `nutritionist` may see nutrition measurements, tutor contact, and nutrition-safe player identity only.

## Merge Gate

Before merging a permission-sensitive release to `main`, record:

| Field | Value |
|---|---|
| Preview commit/version |  |
| Tester |  |
| Date |  |
| Roles checked |  |
| Sensitive direct routes checked |  |
| Unexpected findings |  |
| Decision | Merge / hold |

Do not merge if:

- A non-operational role can open a finance/account route.
- Sports users can see money amounts, payment methods, receipts, or player ledgers.
- Nutrition users can reach general player profiles or financial data.
- Attendance users can reach Caja, finance reports, admin pages, or setup pages outside their intended scope.
- Front desk can access director/superadmin correction tools.
