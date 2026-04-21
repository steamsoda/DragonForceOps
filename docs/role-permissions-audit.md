# Role Permissions Audit

Last updated: 2026-04-20

This document is the working source of truth for app roles, navigation access, data access, and write boundaries in INVICTA. It exists because app-layer route guards, Supabase RLS, preview debug mode, and production login behavior can drift apart if they are not reviewed together.

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
- `Gestion`: Panel, Pendientes
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
- `Gestion`: Panel, Pendientes
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
- `Gestion`: Pendientes
- `Competencias`: Inscripciones Torneos
- `Reportes`: Corte Diario, Recibos

Expected permissions:

- Create new player + tutor + enrollment from `/players/new`.
- Search and view players in assigned campus scope.
- Edit basic player/tutor operational data.
- Post payments through Caja.
- Create normal guided Caja charges/products.
- Use `Inscripciones Torneos` as a read-only/non-admin operational board.
- See receipts and Corte Diario for assigned campus scope.
- No `Gestion > Panel` dashboard.
- No director finance reports.
- No admin pages.
- No direct finance correction toolkit.
- No nutrition measurement capture.

Known current risk:

- The hardened front-desk RLS model checks some child inserts against an existing enrollment/player campus relationship.
- The one-page intake creates brand-new records in stages, so linking a tutor to a brand-new player before the enrollment exists can fail under RLS.
- Recommendation: move the whole new-player intake mutation into one audited trusted server RPC/action after app-layer auth + campus validation, or reorder the non-admin RLS path so enrollment exists before the tutor link check.

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

Known current mismatch:

- App-layer guards allow `director_deportivo` into `Inscripciones Torneos`.
- The `Inscripciones Torneos` query still derives confirmation from products, charges, payment allocations, active enrollments, players, teams, and team assignments.
- In live production, a real `director_deportivo` user likely does not have RLS read access to enough of those underlying rows, so the page can render empty even though preview debug works.
- Recommendation: do not broadly grant sports users raw finance-table access. Add a server-side safe query/RPC that returns only nonfinancial signup summaries needed by sports views.

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

Known current mismatch:

- The nutrition migration added `nutritionist` data policies for campuses, players, enrollments, and measurement sessions.
- It did not add explicit self-read policies for `app_roles` and `user_roles` equivalent to the later `director_deportivo` bootstrap fix.
- If production does not have a working trusted fallback during auth bootstrap, a live nutritionist can authenticate but resolve as role-less.
- Recommendation: add a nutritionist self-read bootstrap migration:
  - `nutritionist_read_app_roles`
  - `nutritionist_read_own_user_roles`
  - keep `nutritionist_read_campuses` scoped to accessible campuses

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

## Current Incidents Under Review

### Julio, Director Deportivo Linda Vista

Reported issue:

- Can access app path but sees nothing in `Inscripciones Torneos`.

Known data:

- `julioc@dragonforcemty.com` has `director_deportivo` scoped to Linda Vista in production.
- `sebastiang@dragonforcemty.com` has `director_deportivo` scoped to Contry in production.

Likely cause:

- App access is allowed, but live RLS does not expose the raw tables used to compute tournament signup boards.

Preferred fix:

- Build a sports-safe server-side query/RPC for signup boards that returns only the fields sports staff should see.
- Avoid granting direct sports RLS access to raw payment allocations or charge amounts unless the business explicitly approves it.

### Nutritionist Linda Vista

Reported issue:

- Works in preview test but cannot log into live production.

Known data:

- `denisseo@dragonforcemty.com` has `nutritionist` scoped to Linda Vista in production.

Likely cause:

- Missing nutritionist self-read bootstrap policies for `app_roles` / `user_roles`, combined with preview debug masking the issue.

Needed from ops:

- Confirm the nutritionist user's email so the live role row can be checked.

Preferred fix:

- Add nutritionist self-read bootstrap policies and verify prod role assignment.

Director/director-admin boundary:

- `director_admin` can read nutrition pages for oversight.
- `director_admin` cannot register nutrition measurements.
- `superadmin` remains allowed to write for emergency/debug ownership.

### Caja Linda Vista and Contry New Player Intake

Reported issue:

- Trouble creating new players; error appears around tutor creation.

Likely cause:

- The staged intake flow creates guardian/player/link/enrollment/charges across several RLS-sensitive tables.
- The current hardened policies are campus-aware, but some records do not have a campus relationship until later in the flow.

Preferred fix:

- Treat new-player intake as one trusted, audited server operation after:
  - user is authenticated
  - user is `front_desk` or director
  - selected campus is within their allowed scope
  - form validates
- Keep normal edit/update flows under RLS after the record exists.

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

Open operational decision:

- `julioc@dragonforcemty.com` is currently scoped to Linda Vista in production. If he must see Contry `Inscripciones Torneos`, the role assignment should become Contry + Linda Vista or global; the app should not silently override campus scope in code.

## Recommended Next Fix Order

1. Production auth bootstrap hardening:
   - add missing nutritionist self-read role policies
   - verify each live role resolves at least one role row
2. Sports signup board data boundary:
   - replace raw client/RLS table reads with a sports-safe trusted server query
   - return no money amounts
3. Intake read/write boundary:
   - keep new-player intake as a trusted audited server operation after app-layer permission checks
   - use trusted reads for pricing/charge type setup so front desk does not fail on reference-table RLS
4. Regression matrix:
   - create one smoke path per role:
     - login
     - `/inicio`
     - expected nav item exists
     - expected forbidden route redirects
     - one expected data query returns rows when data exists
