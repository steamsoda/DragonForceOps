# Role Permissions Audit

Last updated: 2026-04-21

This document is the working source of truth for app roles, navigation access, data access, and write boundaries in INVICTA. It exists because app-layer route guards, Supabase RLS, preview debug mode, and production login behavior can drift apart if they are not reviewed together.

Current safety additions:

- `Super Admin > Auditoria accesos` is the production-safe read-only diagnostic for env, role, and campus scope checks.
- `Debug permisos` remains preview-only and must not be treated as proof that production RLS works.
- Supabase admin-client creation now validates that the URL project ref and service-role JWT project ref match before trusted reads are used.
- As of `v1.16.58`, `Pendientes` means the tuition-only board with no money amounts or contact data; the old call/follow-up workflow now lives under `Llamadas`.

## Core Principle

Every role needs three aligned layers:

1. App bootstrap: the user can read enough `user_roles`, `app_roles`, and `campuses` data to resolve their role after login.
2. App routes/actions: the protected layout, pages, and server actions allow only the intended surfaces.
3. Database access: RLS or trusted server-side RPCs allow exactly the data needed by those surfaces.

Preview debug mode is not proof that production RLS works. In preview, `Ver como` can use a superadmin actor while rendering another user's role context, so the page can work in preview and still fail for the real live user.

## Roles

### `superadmin`

Purpose: full system owner and emergency operator.

Expected navigation:

- `Diario`: Caja, Jugadores, Uniformes, Regularizacion Contry where applicable
- `Gestion`: Panel, Pendientes, Llamadas
- `Competencias`: Inscripciones Torneos
- `Nutricion`: Panel, Toma de medidas
- `Reportes`: all reports
- `Admin`: all admin pages
- `Super Admin`: Usuarios y Permisos, Auditoria, Sanidad financiera, Debug permisos

Expected permissions:

- Read/write all operational data.
- Manage users and roles.
- Use finance diagnostics and correction tooling.
- Use preview debug tools.
- Access all campuses.

### `director_admin`

Purpose: full operational director without preview/debug ownership.

Expected navigation:

- `Diario`: Caja, Jugadores, Uniformes, Regularizacion Contry where applicable
- `Gestion`: Panel, Pendientes, Llamadas
- `Competencias`: Inscripciones Torneos
- `Nutricion`: Panel, Toma de medidas
- `Reportes`: all director reports
- `Admin`: operational admin pages

Expected permissions:

- Read/write operational data across campuses.
- Manage products, monthly generation, team charges, bajas, scholarships, player merge where allowed.
- Access finance reports.
- Access nutrition and sports oversight.
- No preview debug impersonation unless separately elevated.

### `front_desk`

Purpose: daily Caja and enrollment operator, scoped by campus.

Expected navigation:

- `Diario`: Caja, Jugadores, Uniformes, Regularizacion Contry only if their campus scope includes Contry
- `Gestion`: Pendientes, Llamadas
- `Competencias`: Inscripciones Torneos
- `Reportes`: Corte Diario, Recibos

Expected permissions:

- Create new player + tutor + enrollment from `/players/new`.
- Search and view players in assigned campus scope.
- Edit basic player/tutor operational data.
- Post payments through Caja.
- Create normal guided Caja charges/products.
- Use `Pendientes` as a tuition-only board without money amounts or contact info.
- Use `Llamadas` for collections follow-up, phone/contact context, and promise tracking.
- Use `Inscripciones Torneos` as a read-only/non-admin operational board.
- See receipts and Corte Diario for assigned campus scope.
- No `Gestion > Panel` dashboard.
- No director finance reports.
- No admin pages.
- No direct finance correction toolkit.
- No nutrition measurement capture.

Known current risk:

- New-player intake now uses trusted server-side setup reads after app-layer role/campus validation.
- The April 21 pricing outage was caused by a Vercel Supabase URL/service-role project mismatch, not missing pricing rows.
- Continue verifying Caja after deployments with `/players/new` and `/caja` smoke tests.

### `director_deportivo`

Purpose: sports-only operations for assigned campus.

Expected navigation:

- `Competencias`: Inscripciones Torneos
- Sports routes if exposed intentionally:
  - `/director-deportivo`
  - `/teams`
  - `/tournaments`

Expected permissions:

- Read sports-relevant player identity fields for assigned campus:
  - name
  - birth year/category
  - gender
  - level/base team
  - active enrollment identity
- Read paid/unpaid competition signup status only as an operational state.
- See status chips such as `Pagado` / `Pendiente` when needed for sports operations.
- Manage sports teams, tournament source teams, squads, rosters, and interest/confirmation workflows where enabled.
- No Caja.
- No money amounts.
- No payment methods.
- No receipts.
- No general player financial profile.
- No enrollment editing.
- No nutrition data.

Current guardrail:

- `Inscripciones Torneos` is allowed for sports staff but must remain a no-money surface.
- Sports access should be verified through the production access diagnostic and live `/sports-signups` smoke test.
- Do not broadly grant sports users raw finance-table access. If a sports view needs derived payment state, keep using safe server-side summaries with no amounts or payment methods.

Bootstrap requirement:

- `director_deportivo` must be able to read their own `user_roles`, role code, and allowed campus during login.
- This currently has a dedicated self-read migration, but it should be verified in prod.

### `nutritionist`

Purpose: nutrition-only player measurement workflow for assigned campus.

Expected navigation:

- `Nutricion`: Panel, Toma de medidas

Expected permissions:

- Login to the protected app.
- Read nutrition-safe player identity fields for assigned campus:
  - name
  - campus
  - birth year/category
  - gender if needed for future metrics
  - medical notes
  - tutor name and contact information
  - read-only level/base team
  - latest active enrollment date
- Read and insert `player_measurement_sessions`.
- See measurement history and deltas.
- See first-measurement pending queue.
- No Caja.
- No financial data.
- No receipts.
- No general `/players/[id]` profile.
- No enrollment editing.
- No level assignment.
- No sports competition management.

Current guardrail:

- Nutrition pages use the nutrition context and campus fallback path.
- Nutritionist production access should be verified with `Super Admin > Auditoria accesos`, `/nutrition`, and `/nutrition/measurements`.
- If a nutritionist authenticates but resolves as role-less, inspect `user_roles`, `app_roles`, campus scope, and the Supabase env match before changing policies.

### `attendance_admin`

Purpose: field attendance operator, campus-scoped only.

Expected navigation:

- `Asistencia`: Hoy, Calendario, Grupos, Reportes

Expected permissions:

- Login to the protected app and land on `/inicio`.
- See attendance-only entry cards on the welcome page.
- Read attendance sessions, group/month attendance, calendar, and attendance reports for assigned campus scope.
- Record attendance for scheduled sessions in assigned campus scope.
- Cancel individual sessions only through the attendance workflow where allowed by current attendance rules.
- No Caja.
- No player finance/account profile.
- No payments, charges, balances, receipts, Corte, or financial reports.
- No `Diario`, `Gestion`, `Competencias`, `Nutricion`, `Admin`, or `Super Admin` navigation.
- No schedule/template/group setup pages; those are director/admin or Director Deportivo surfaces.
- No user/role management.

Current guardrail:

- Preview `Debug permisos` includes Field Admin personas for Contry and Linda Vista as of `v1.16.92`.
- Preview debug shortcut links must remain role-aware so the Field Admin view does not show finance/operations shortcuts even in read-only impersonation mode.
- Production verification should smoke test `/inicio`, `/attendance`, `/attendance/calendar`, `/attendance/groups`, and `/attendance/reports` with an actual `attendance_admin` account.

### `coach`

Purpose: future coach module.

Current expected state:

- Role exists in app constants but should not grant meaningful app access yet unless explicitly implemented.
- No protected navigation should depend on `coach` for now.
- Future work should define attendance/team-only access before activation.

## Login Flow

Expected production flow:

1. User starts at `/`.
2. If unauthenticated, they see login.
3. Azure/Supabase callback exchanges auth code and sets session cookies.
4. Authenticated users redirect to `/inicio`.
5. Protected layout resolves role context.
6. If the user has at least one recognized role, they see only their allowed nav sections.
7. If they have no recognized role, they go to `/unauthorized`.

Bootstrap data that every live role needs:

- their own `user_roles` row
- joined `app_roles.code`
- joined campus scope if campus-scoped
- active campus rows needed to build selectors/nav

Failure pattern:

- If role bootstrap returns empty rows, the app says `Sin autorizacion` even when the DB role assignment is valid.
- If preview debug uses a superadmin actor, preview can pass while production fails.
- If the Supabase service-role key belongs to a different project than the URL, trusted fallback reads fail with `Invalid API key` and can look like empty pricing/config/role data.
- Use `Super Admin > Auditoria accesos` for production-safe verification before changing RLS or role assignments.

## Current Incidents Under Review

### Julio, Director Deportivo Linda Vista

Reported issue:

- Can access app path but sees nothing in `Inscripciones Torneos`.

Known data:

- `julioc@dragonforcemty.com` should now have global `director_deportivo` scope (`campus_id = null`) in production.
- `sebastiang@dragonforcemty.com` has `director_deportivo` scoped to Contry in production.

Resolved / current cause:

- Earlier empty-board reports were caused by a combination of scoped campus fallback issues and later the Supabase env mismatch.
- Julio's intended scope is now global sports visibility.

Verification:

- Confirm `Auditoria accesos` shows Julio with `director_deportivo | Todos`.
- Confirm `/sports-signups` shows both campuses and still no money amounts.

### Nutritionist Linda Vista

Reported issue:

- Works in preview test but cannot log into live production.

Known data:

- `denisseo@dragonforcemty.com` has `nutritionist` scoped to Linda Vista in production.

Likely historical cause:

- Scoped campus fallback and production env mismatch could both make valid role assignments resolve as empty in live production.

Verification:

- Confirm `Auditoria accesos` shows Denisse as Linda Vista `nutritionist`.
- Confirm Denisse can open `/nutrition` and `/nutrition/measurements`.

Director/director-admin boundary:

- `director_admin` can read nutrition pages for oversight.
- `director_admin` cannot register nutrition measurements.
- `superadmin` remains allowed to write for emergency/debug ownership.

### Caja Linda Vista and Contry New Player Intake

Reported issue:

- Trouble creating new players; error appears around tutor creation.

Resolved / current cause:

- The latest confirmed outage was caused by Vercel production Supabase env mismatch, which made trusted pricing reads fail with `Invalid API key`.
- Pricing rows existed in production and Caja recovered after the Vercel env correction and redeploy.

Verification:

- Caja Contry and Caja Linda Vista should smoke test `/players/new`.
- If the error returns, inspect env match first, then pricing rows, then intake action logs.

Known production front desk role assignments:

- `patyg@dragonforcemty.com` has `front_desk` scoped to Contry.
- `lorenar@dragonforcemty.com` has `front_desk` with global campus scope and also has `director_admin`.

## Owner Decisions Locked On 2026-04-20

1. Dashboard / `Gestion > Panel` is director-only.
2. Front desk can see `Inscripciones Torneos`.
3. `director_deportivo` can see paid and unpaid competition candidates, but no money amounts or financial details.
4. `director_deportivo` can see status chips/tags such as `Pagado` / `Pendiente`, but no amounts or payment methods.
5. `nutritionist` can see gender, medical notes, tutor contact information, campus, category/year of birth, read-only level, and nutrition measurements.
6. `director_admin` can read nutrition content for oversight, but cannot register measurements.
7. `director_admin` can modify sports rosters.
8. `coach` remains completely inactive until the coach/attendance module is explicitly activated.
9. Campus-scoped users only see assigned campuses unless their `user_roles.campus_id` is `null`.

Operational decision resolved on 2026-04-21:

- `julioc@dragonforcemty.com` should have global `director_deportivo` scope so he can see all sports signup boards without money amounts.

## Recommended Next Fix Order

1. Production smoke verification:
   - Denisse: `/nutrition`, `/nutrition/measurements`
   - Julio: `/sports-signups` across campuses, no money amounts
   - Caja: `/players/new`, `/caja`
2. Use `Super Admin > Auditoria accesos` after every auth/env deploy to verify:
   - Supabase URL/key project refs match
   - key live users exist
   - role rows and campus scopes resolve as expected
3. Keep sports and nutrition surfaces safe:
   - derived status chips are allowed
   - raw money amounts/payment methods are not allowed for sports/nutrition
4. Continue workflow work only after access smoke tests are stable.
