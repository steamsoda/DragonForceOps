# Dragon Force Ops — Software Design Document (SDD)

This is the consolidated, living SDD. It merges and preserves the content from:
- `docs/new-sdd.md` (foundation notes + environment safety)
- `docs/phase-1-sdd.md` (Phase 1 MVP SDD: schema, workflows, RLS, performance)

## 0) Status
- Current stage: v0.8 — Phase 1B complete. Internal testing begins 2026-03-17, one campus, directors only.
- Auth: Supabase Auth with Azure provider, fully wired (preview + prod)
- Environments:
  - Production DB: Supabase main project
  - Preview DB: Supabase preview branch (Pro plan)
  - Hosting: Vercel (prod + preview deployments)
- Live and working as of 2026-03-17:
  - Core billing loop: enrollment → charges → payments → ledger → pending list
  - Caja POS: player search, pending charges, payment posting, thermal receipt (two copies, line items), ad-hoc charges (products grid)
  - Cash session management: open/close per campus, Corte Diario inline close, prominent no-session banner
  - Dashboard: 8 KPIs + trends + charts, campus/month filters
  - Reports: Corte Diario (+ print layout), Corte Semanal, Resumen Mensual, Porto Mensual (all sections wired)
  - Activity log: audit feed with date/actor/action-type filters
  - Products catalog with POS grid
  - Role system: director_admin, front_desk, superadmin with RLS
  - Void charges (director only) + batch baja write-off (`/pending/bajas`)
  - Full 34-reason Porto dropout taxonomy
  - Dark mode with localStorage persistence
- Known gaps identified pre-testing (2026-03-17):
  - Caja cancel UX: canceling "Registrar Pago" resets page to top instead of returning to enrollment panel
  - Caja drill-down: no charge detail view inline before payment (period, type, age)
  - Nav/panel audit needed: some menu items overlap, some reports show incorrect numbers
  - Player profile: missing uniform size, team assignment, coach on player page
  - Player list (Jugadores): no status tags (league, tuition paid, balance)
  - Teams/tournaments: team assignment UX is rough, no tournament registration system yet

## 1) Overview and Goals (Phase 1 MVP)
- Build a secure internal operations app (30–50 staff users) for two campuses in Monterrey: Linda Vista and Contry.
- Establish a single source of truth for:
  - Players and guardians
  - Enrollments (*Inscripción*) as the operational anchor
  - Teams and team assignments
  - Charges and payments (ledger model)
  - Pending balances and payment follow-up lists (collections workflow)
  - Daily cash register report (*corte*) and monthly summaries/dashboards
- Architecture aligned with scale and compliance needs:
  - Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
  - Supabase Postgres + Supabase Auth
  - RLS enforced at the database layer
  - Server-side business logic only (Server Actions / API routes)

## 2) Explicit Non-Goals (Phase 1)
Explicitly NOT in Phase 1:
- Coach module and coach permissions (Phase 2+)
- Attendance and training session management (Phase 2+)
- Coach workflows and training planning (Phase 2+)
- Full scheduling engine for matches/fields
- Clip terminal integration (Phase 2+)
- Automated 360Player/Stripe sync (Phase 2+; CSV import first)
- Full accounting/ERP integration
- Automated WhatsApp/SMS reminders (Phase 2+)
- Complex communications (Twilio/VoIP call logging) (Phase 3+)
- Advanced BI dashboards beyond the operational reports listed here

## 3) Guiding Principles
- Security-first: minors + payments ⇒ strict access control + audit logs
- Brick-by-brick: rules will evolve; architecture must allow change
- Client is dumb: business logic runs on server
- DB schema changes are migration-only (no ad-hoc dashboard edits)
- Fast UX: narrow queries + pagination; optimistic UI only where safe
- Preview-first delivery: validate in preview before merging/releasing

## 4) Core Domain Model (ERD in Text)
- `player` is identity data only. Carries birth date, gender, and individual playing level.
- `enrollment` is a membership instance and operational anchor:
  - One player can have many enrollments over time.
  - Only one active enrollment per player at a time.
  - Campus transfer is represented as closing old enrollment + creating new enrollment.
- `charges` and `payments` attach to `enrollment`.
- `payment_allocations` links payment amounts to one or more charges.
- `teams` are campus-scoped, categoría-scoped, and level-scoped; `team_assignments` attach to enrollment.
- `guardians` relate to players through junction table `player_guardians`.
- `pricing_plan` and `pricing_plan_tuition_rules` define monthly tuition tiers by payment day.
- `cash_sessions` and `cash_session_entries` support daily *corte*.
- `audit_logs` capture critical create/update/delete/payment actions.

### 4.2 Player Organization Hierarchy
**Categoría (year of birth) is the primary defining characteristic of every player.** All player lists, team groupings, and filters should lead with it.

Players are organized along five dimensions, in priority order:
1. **Categoría** — the player's **year of birth** (e.g. 2013, 2014, 2015). This is the immutable fact. Named labels like "Sub-12" are derived and informal; the year of birth is the source of truth and is already captured in `players.birth_date`.
2. **Campus** — Linda Vista or Contry (from enrollment)
3. **Gender** — Male / Female (on player record)
4. **Level** — B1 / B2 / B3, representing playing ability/experience. Assigned per player by the Director Deportivo. Also set on the team so teams are level-homogeneous.
5. **Team** — the specific squad a player trains with (campus + birth year + gender + level)

A fully described team is therefore: *Linda Vista · 2013 · Male · B2*

UI implications: player lists, search results, team views, and filters should default to sorting/grouping by birth year first.

### 4.1 Why Enrollment Anchors Everything
Enrollment represents the time-bounded relationship:
- Campus transfers ⇒ new enrollment
- Leaving and rejoining ⇒ new enrollment
- Reporting “who was active in month X” becomes trivial
- Charges/payments (and future attendance) attach to operational reality, not just identity

## 5) Business Rules (Initial, Evolving)
### 5.1 Campus / Enrollment
- A player can only have one active enrollment (one campus) at a time.
- Transfers are rare and represented by ending prior enrollment and creating a new one.
- `paused` enrollment status is reserved in the schema but **not used operationally in Phase 1**. Players are either active or ended/cancelled.

### 5.1.1 Enrollment Lifecycle
- **New enrollment** generates two initial charges at creation time:
  1. Inscription fee (`inscription`) — default **$1,800 MXN** (includes 2 training kits). Staff-editable at enrollment for edge cases (e.g. player already has kits).
  2. First month's tuition (`monthly_tuition`) — default **$600 MXN** flat (same as early bird rate). Staff-editable for late-month sign-ups (day 20+: staff ballparks a pro-rated amount; no system rule).
- There is **no separate training uniform charge at enrollment** — kits are bundled in the inscription fee. A `uniform_training` charge ($600) is created ad-hoc only if a player needs an extra kit later.
- Game uniform (`uniform_game`) is charged ad-hoc when the player receives it. Not part of enrollment creation.
- **Subsequent months**: only a monthly tuition charge is generated (automated job, day 1).
- **Non-attendance does not stop charges**. A player is charged every month regardless of whether they train. The obligation ends only when the enrollment is officially ended.
- **Baja (unenrollment) triggers** — any of the following:
  1. Player or guardian notifies staff directly → staff manually ends the enrollment.
  2. 3+ consecutive months of unpaid charges → system flags the enrollment as a baja candidate; director reviews and manually ends it.
  3. *(Phase 2+)* 3+ months of no attendance per attendance records → automatic baja candidate.
- **Re-enrollment after baja**: treated as a brand-new enrollment. Inscription fee, uniform, and first month's tuition all apply again.
- **1 month non-payment rule**: in principle, a player with an unpaid month should not be allowed to continue training. In practice this rule is applied leniently. The system surfaces it via the collections list but does not automatically block training (no enforcement gate in Phase 1).

### 5.1.2 Dropout Reason Tracking
When ending or cancelling an enrollment, staff must record a **dropout reason** for analytics and follow-up. Data retained permanently as historical record — unenrolled players do not appear in the active player list but remain in the DB.

**Predefined reasons** (stored as code values, displayed as labels):
- `cost` — Costo / precio
- `distance` — Distancia / logística
- `injury` — Lesión o salud
- `attitude` — Actitud / disciplina
- `time` — Falta de tiempo
- `level_change` — Cambio de nivel / campus (use only for internal transfers, not for real bajas)
- `other` — Otro (requires a notes field explaining)

**Note**: Porto HQ uses ~30 dropout reason categories. The 7 codes above are the initial set. Expansion to Porto's full taxonomy is tracked as Phase 1.5 (see Section 16.3b). Since this field is `text` (not a PG enum), expansion requires only a server action + UI update — no schema migration.

**Schema**: `enrollments.dropout_reason text null` (one of the codes above) and `enrollments.dropout_notes text null` (free text, always optional, required when reason = `other`).

**UI rule**: dropout reason + notes fields appear in the enrollment edit form when status is set to `ended` or `cancelled`. They are always shown (server component, no JS toggle) with a hint label. Server action validates that a reason is present when ending/cancelling.

**Analytics potential** (Phase 2+ report):
- Distribution of dropout reasons over time
- Median days enrolled before dropout by reason
- Campus/categoría breakdowns

### 5.2 Tuition tiers (pricing rules)
Monthly tuition — **2 tiers only**, based on the day of the month when payment is posted:
- Days 1–10: early bird — **$600 MXN**
- Days 11+: regular — **$750 MXN**

There is no penalty tier for late payment.

Implementation (confirmed):
- Monthly charge is **created at the regular rate ($750)** on day 1 of each month.
- Do not hardcode tier amounts in the UI; read from `pricing_plan_tuition_rules`.
- At payment posting time, the server checks the current day of month:
  - Days 1–10: create a **discount credit line** (negative `charges` entry, amount = -$150) to bring the effective amount to the early bird rate ($600).
  - Days 11+: no adjustment. Charge stands at $750.
- Adjustment lines reference the original charge and pricing rule for traceability.

### 5.3 Charge types (catalog) and confirmed prices
- **Monthly tuition** (`monthly_tuition`) — recurring, auto-generated day 1. $750 regular / $600 early bird (days 1–10).
- **Inscripción** (`inscription`) — **$1,800 MXN**, one-time at enrollment. All-inclusive: covers the sign-up fee + 2 training kits. Staff may adjust the amount at enrollment if a player already has kits.
- **Extra training kit** (`uniform_training`) — **$600 MXN**, ad-hoc only. Created manually when a player needs an additional kit. Not generated at enrollment (kits are bundled in the inscription fee).
- **Game uniform** (`uniform_game`) — **$600 MXN**, ad-hoc, created manually when player receives it.
- **Tournament/Copa** (`tournament`, `cup`) — **$300–350 MXN** typical range, ad-hoc. Charged at start of each season (~4 times/year). Phase 1: free-text description. Phase 2: linked to tournament entity.
- **Trips / events / posadas** (`trip`, `event`) — ad-hoc, variable amounts.

### 5.5 Products / Items Admin Page (Phase 1)
An admin-only page (`director_admin` role) for managing the charge catalog and bulk-assigning charges.

**Catalog view**: shows all active charge types with their default amounts from `pricing_plan_items` + `charge_types`. Admins can update default amounts.

**Bulk charge assignment**:
- Admin selects a team (or individual players via checkbox)
- Selects a charge type from the catalog
- Enters amount (pre-filled from catalog default) + description + due date (optional)
- Submits → server creates one `charge` record per selected active enrollment

**Use cases**: tournament fees, game uniform batch, Copa charges.

**Access**: `director_admin` only. Route: `/admin/products` (tentative).

### 5.6 Tournament Rules (Phase 1 → Phase 2)
**Phase 1:** Tournament charges are created manually as ad-hoc `charges` with type `tournament` or `cup` and a free-text description (e.g. "Copa Navidad 2026"). No tournament entity or team-level tracking.

**Phase 2 — Tournament entity (planned):**
- A `tournaments` table: name, date, campus, type (`copa`, `torneo`, `liga`), `is_mandatory boolean`.
- `tournament_team_entries`: links a team to a tournament. Charge generation is triggered from here.
- **Mandatory tournaments**: charges auto-generated for all players enrolled in the participating team.
- **Optional tournaments**: staff selects which players opt in; charges generated only for opted-in players.
- Some players may explicitly opt out even from mandatory tournaments (case-by-case, director discretion).

### 5.6 Field Management (Phase 2)
- Track which teams train on which fields on which days/times.
- `fields` table: name, campus, capacity.
- `field_schedules`: team, field, day of week, start time, end time, effective date range.
- Phase 1: no field management. Teams may have informal notes in the `notes` field.
- Phase 2: scheduling view, conflict detection (two teams on same field at same time).

### 5.4 Payment Rules
**Partial payments:**
- Allowed in practice (staff discretion for special cases).
- No system restriction at input — staff can post any amount.
- The enrollment remains on the pending/collections list until balance is fully cleared.

**Payment auto-fill (cash register UX):**
- When opening the payment form, the amount field is pre-populated with the current outstanding balance (total_charges − total_payments).
- Staff can override the amount for partial payments.
- On submit, the server auto-allocates the payment to pending charges oldest-first, no manual line-item assignment.
- This keeps the flow fast: in most cases staff just hits submit without changing anything.

**Overpayments / credit balances:**
- If a payment exceeds the current balance, the excess becomes a credit balance on the account (confirmed).
- Credit balance is visible in the ledger and the balance view (negative balance = credit).
- Staff applies credit to the next charge manually at payment posting time.
- Auto-apply of credit to next month's charge is a Phase 2 feature.
- Pending list must exclude enrollments with a credit balance (balance ≤ 0).

**Payment voids:**
- Director only (`director_admin` role), no time restriction.
- Requires a reason note (logged in `audit_logs`).
- Voiding a payment reverses its allocations; affected charges return to `pending` status.

## 6) Data Model (Postgres Tables — Key Columns)
### 6.1 Reference and Auth
- `campuses`
  - `id uuid pk`
  - `code text unique` (`LINDA_VISTA`, `CONTRY`)
  - `name text`
  - `is_active boolean`
- `app_roles`
  - `id uuid pk`
  - `code text unique` (`director_admin`, `admin_restricted`, `coach`)
  - `name text`
- `user_roles`
  - `id uuid pk`
  - `user_id uuid` (references `auth.users(id)`)
  - `role_id uuid` (references `app_roles`)
  - `campus_id uuid null` (for future campus-scoped roles)
  - unique (`user_id`, `role_id`, `campus_id`)

### 6.2 Players and Guardians
- `players`
  - `id uuid pk`
  - `first_name`, `last_name`
  - `birth_date date`
  - `gender text null` (`male`, `female`)
  - `level text null` (`B1`, `B2`, `B3`) — set by Director Deportivo, updated as player progresses
  - `status text` (`active`, `inactive`, `archived`)
  - `medical_notes text null`
  - timestamps
- `guardians`
  - `id uuid pk`
  - `first_name`, `last_name`
  - `phone_primary text`
  - `phone_secondary text null`
  - `email text null`
  - `relationship_label text null`
  - timestamps
- `player_guardians`
  - `id uuid pk`
  - `player_id uuid`
  - `guardian_id uuid`
  - `is_primary boolean`
  - unique (`player_id`, `guardian_id`)

### 6.3 Enrollment and Teams
- `pricing_plans`
  - `id uuid pk`
  - `name text`
  - `currency text default MXN`
  - `is_active boolean`
- `pricing_plan_tuition_rules`
  - `id uuid pk`
  - `pricing_plan_id uuid`
  - `day_from int` (1-31)
  - `day_to int null` (`null` means open-ended, e.g. 21+)
  - `amount numeric(12,2)`
  - `priority int`
  - check constraints for valid day ranges
- `enrollments`
  - `id uuid pk`
  - `player_id uuid`
  - `campus_id uuid`
  - `pricing_plan_id uuid`
  - `status text` (`active`, `paused`, `ended`, `cancelled`)
  - `start_date date`
  - `end_date date null`
  - `inscription_date date`
  - `notes text null`
  - `dropout_reason text null` — one of: `cost`, `distance`, `injury`, `attitude`, `time`, `level_change`, `other`. Required when status = `ended` or `cancelled`.
  - `dropout_notes text null` — free text, always optional (required when dropout_reason = `other`).
  - timestamps
- `coaches` *(new — Phase 1 structure, data TBD)*
  - `id uuid pk`
  - `first_name text`
  - `last_name text`
  - `phone text null`
  - `email text null` (for future auth account link)
  - `campus_id uuid null` (primary campus assignment; null = no campus restriction)
  - `is_active boolean default true`
  - timestamps
- `teams`
  - `id uuid pk`
  - `campus_id uuid`
  - `name text`
  - `gender text null` (`male`, `female`, `mixed`)
  - `birth_year int null` (categoría — e.g. `2013`, `2014`; renamed from `age_group` in schema migration TBD)
  - `level text null` (`B1`, `B2`, `B3`)
  - `season_label text null`
  - `coach_id uuid null` (references `coaches(id)`) — primary assigned coach. Phase 1: one coach per team. Phase 2+: extend to `team_coaches` junction for multi-coach.
  - `is_active boolean`
- `team_assignments`
  - `id uuid pk`
  - `enrollment_id uuid`
  - `team_id uuid`
  - `start_date date`
  - `end_date date null`
  - `is_primary boolean`

### 6.4 Ledger
- `charge_types`
  - `id uuid pk`
  - `code text unique`:
    - `monthly_tuition` — recurring monthly tuition
    - `inscription` — one-time sign-up fee
    - `uniform_training` — training kit, charged at enrollment
    - `uniform_game` — game kit, charged ad-hoc
    - `tournament` — tournament registration (ad-hoc Phase 1; Phase 2 linked to tournament entity)
    - `cup` — cup registration
    - `trip`, `event` — ad-hoc academy events
  - `name text`
  - `is_active boolean`
- `charges`
  - `id uuid pk`
  - `enrollment_id uuid`
  - `charge_type_id uuid`
  - `period_month date null` (first day of month for monthly tuition)
  - `description text`
  - `amount numeric(12,2)` (positive charge)
  - `currency text`
  - `status text` (`pending`, `posted`, `void`)
  - `due_date date null`
  - `pricing_rule_id uuid null`
  - `created_by uuid`
  - timestamps
- `payments`
  - `id uuid pk`
  - `enrollment_id uuid`
  - `paid_at timestamptz`
  - `method text` (`cash`, `transfer`, `card`, `stripe_360player`, `other`)
  - `amount numeric(12,2)` (positive)
  - `currency text`
  - `status text` (`posted`, `void`, `refunded`)
  - `provider_ref text null`
  - `external_source text null` (`manual`, `360player_import`)
  - `notes text null`
  - `created_by uuid`
  - timestamps
- `payment_allocations`
  - `id uuid pk`
  - `payment_id uuid`
  - `charge_id uuid`
  - `amount numeric(12,2)`
  - unique (`payment_id`, `charge_id`)

### 6.5 Reporting and Audit
- `cash_sessions`
  - `id uuid pk`
  - `campus_id uuid`
  - `opened_at`, `closed_at`
  - `opened_by`, `closed_by`
  - `opening_cash numeric(12,2)`
  - `closing_cash_reported numeric(12,2) null`
  - `status text` (`open`, `closed`)
- `cash_session_entries`
  - `id uuid pk`
  - `cash_session_id uuid`
  - `payment_id uuid null` (linked cash payments)
  - `entry_type text` (`payment_in`, `manual_in`, `manual_out`, `adjustment`)
  - `amount numeric(12,2)`
  - `notes text null`
  - `created_by uuid`
- `audit_logs`
  - `id bigserial pk`
  - `event_at timestamptz`
  - `actor_user_id uuid`
  - `action text` (`insert`, `update`, `delete`, `post_payment`, `void_payment`, etc.)
  - `table_name text`
  - `record_id uuid null`
  - `before_data jsonb null`
  - `after_data jsonb null`
  - `request_id text null`
  - `ip text null`

### 6.6 Derived Balance
- `v_enrollment_balances` (view)
  - `enrollment_id`
  - `total_charges`
  - `total_payments`
  - `balance`
- Optional future optimization: cached `enrollment_balances` table maintained by triggers/jobs. **TBD**.

### 6.7 Porto Report — Continuous Log Tables
- `academy_events`
  - `id uuid pk`
  - `title text not null`
  - `description text null`
  - `event_date date not null`
  - `actual_date date null`
  - `campus_id uuid null` references `campuses(id)`
  - `is_done boolean not null default false`
  - `participant_count int null`
  - `cost numeric(12,2) null`
  - `evaluation smallint null` (1–5)
  - `created_by uuid` references `auth.users(id)`
  - `created_at timestamptz default now()`

- `area_map_entries`
  - `id uuid pk`
  - `entry_date date not null`
  - `type_code text not null` — R, SM, C, NC, PNC, AS, OM, M
  - `topic text not null` — from Porto's predefined topic list
  - `description text not null`
  - `root_cause text null`
  - `corrective_action text null` — acción correctiva (immediate fix)
  - `correction_action text null` — acción de corrección (systemic fix)
  - `assigned_to text null` — free text (Phase 2: link to staff table)
  - `deadline_days int null`
  - `closure_date date null`
  - `effectiveness text null` — `E`, `NE`, or `SP`
  - `campus_id uuid null` references `campuses(id)`
  - `created_by uuid` references `auth.users(id)`
  - `created_at timestamptz default now()`

## 7) Indexing Plan
- Players:
  - `players(last_name, first_name)` for staff search.
  - `players(status)` for active lists.
- Guardians:
  - `guardians(phone_primary)`, `guardians(email)` for contact lookup.
- Enrollments:
  - `enrollments(player_id, status)`
  - `enrollments(campus_id, status)`
  - partial unique index on active enrollment per player.
- Teams:
  - `teams(campus_id, is_active)`
  - `team_assignments(enrollment_id, start_date desc)`
- Ledger:
  - `charges(enrollment_id, status, due_date)`
  - unique monthly tuition index: (`enrollment_id`, `charge_type_id`, `period_month`) where not void.
  - `payments(enrollment_id, paid_at desc)`
  - `payments(method, paid_at desc)` for corte/report.
  - `payment_allocations(charge_id)` and `(payment_id)`.
- Cash report:
  - `cash_sessions(campus_id, opened_at desc)`
  - `cash_session_entries(cash_session_id)`.
- Audit:
  - `audit_logs(event_at desc)`, `audit_logs(table_name, event_at desc)`.

## 8) RLS Strategy and Roles Matrix
### 8.1 Strategy
- Enable RLS on all domain tables in `public`.
- For Phase 1, allow only authenticated users with `director_admin` role.
- Server-side API/Server Actions use user JWT context; policies enforce access.
- Create helper SQL function: `is_director_admin()` backed by `user_roles`.
- Keep policies restrictive by default (`deny all`) and explicit per table.

### 8.2 Role/Permission Matrix (Confirmed + Future-Ready)

| Role | Financial Reports / Dashboard Stats | Player Data | Post Payments | Void Payments | Caja | Enrollments | Phase |
|---|---|---|---|---|---|---|---|
| `superadmin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 1 |
| `director_admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 1 |
| `front_desk` | ❌ | ✅ | ✅ | ❌ | ✅ | Read-only | 1B |
| `coach` | ❌ | Own teams only | ❌ | ❌ | ❌ | ❌ | 2 |

**Role definitions:**
- `superadmin` — Javi only. Full access to everything including bootstrap config, audit logs, and any future admin tooling.
- `director_admin` — Directors and high-level admins Full operational access including monthly income, financial totals, reports, and voids. Cannot change system configuration.
- `front_desk` — Daily operations staff. Can search players, view all player/enrollment data, post payments, and use the Caja (POS). **Cannot** see dashboard financial stats (monthly income, revenue totals), cannot void payments, cannot delete or end enrollments.
- `coach` — Phase 2. Read-only access to their own assigned teams' rosters. No financial data visible.

**Payment void authority:** `director_admin` and `superadmin` only. Always requires a reason note logged in `audit_logs`.

Current operational note:
- `superadmin` and `director_admin` are the active roles in Phase 1.
- `front_desk` role to be implemented in Phase 1B alongside the Caja feature.
- Bootstrap env var (`BOOTSTRAP_ADMIN_EMAILS`) to be removed once `user_roles` records are seeded for all active staff.

## 9) Core Workflows
### 9.1 Registration + Enrollment
1. Search existing player by name/birth date.
2. Create player if missing.
3. Link/create guardians.
4. Create enrollment with campus + pricing plan + start date.
5. Create two charges atomically with enrollment:
   - Inscription charge (`inscription`) — default $1,800, staff-editable
   - First month tuition (`monthly_tuition`) — default $600, staff-editable for late-month
   - No training uniform charge at enrollment (bundled in inscription)
   - Game uniform (`uniform_game`) added separately later, ad-hoc
6. Audit log emitted for each mutation.

### 9.2 Team Assignment
1. Open enrollment page.
2. Assign enrollment to active campus team.
3. End prior team assignment if needed.
4. Persist and log assignment change.

### 9.3 Monthly Charge Generation
1. Automated job runs on day 1 of each month (no manual trigger required).
2. Selects all `active` enrollments.
3. Creates one `monthly_tuition` charge per enrollment at the **regular rate** for that enrollment's pricing plan (idempotent — unique index prevents duplicates for the same enrollment + period_month).
4. At payment posting time, server applies tier adjustment based on current day of month (see section 5.2).

### 9.4 Desk Payment Posting
1. Staff opens player page → clicks "Registrar Pago" → navigates to enrollment ledger.
2. Payment form pre-fills amount with current outstanding balance (cash register UX).
3. Staff adjusts if partial payment; clicks post.
4. Server validates amount, method, enrollment status, open cash session (for cash).
5. Server auto-allocates payment to pending charges oldest-first.
6. Create payment + allocations atomically in transaction.
7. Insert cash session entry when method is cash.
8. Return updated ledger summary for optimistic UI reconciliation.
9. Write audit log.

### 9.4.1 Caja — Point of Sale Quick Action Panel
A dedicated `/caja` route designed for front desk staff. Always-open tab for daily payment collection.

**Who uses it:** `front_desk`, `director_admin`, `superadmin`.

**Design philosophy:** Fast cashier mode. After each payment, the panel resets to the search box — staff can process the next player immediately.

**Flow:**
1. Staff types player name → debounced real-time search (300ms, `ilike` on `first_name || last_name`) → top 8 results appear as dropdown suggestions.
2. Staff selects player → panel shows all **pending charges, oldest first** (all charge types, not just tuition).
3. If player has a credit balance, this is shown prominently and the credit is applied first.
4. Payment amount auto-fills with the total outstanding balance. Staff can override for partial payments.
5. Staff selects payment method (cash / card / transfer) → clicks **Cobrar**.
6. Server posts payment, auto-allocates oldest-first, applies early-bird discount credit if applicable (days 1–10).
7. Receipt is generated → panel resets to search (fast cashier mode).

**Pending charge ordering rules:**
- Tuition months shown oldest-first — server enforces oldest-first allocation regardless of UI selection.
- Players with 2+ unpaid months: all months shown. Current month cannot be paid before older months are cleared.
- Credit balance enrollments: shown in Caja with balance displayed as credit; next payment reduces credit first.

**Architecture:**
- `/caja` is a Server Component wrapper.
- Search box is a **Client Component** (required for real-time debounced typing).
- Payment posting reuses the existing Server Action from the billing module.
- No new server logic needed — same allocation rules apply.

**Receipt printing:**
- **Phase 1:** Browser `window.print()` with `@media print` CSS styled for 80mm thermal paper. Works with any printer. Staff sets the receipt printer as the browser's default printer.
- **Phase 2:** ESC/POS integration via QZ Tray (local bridge app on front desk PC) → true one-click thermal printing. Compatible printers: Star TSP100, Epson TM-T20 (~$2,500 MXN). No print dialog, direct to printer.

**Receipt content (Phase 1):**
- Academy name + logo
- Date and time
- Player name + enrollment campus
- List of charges being paid (description, amount, period)
- Payment method
- Total paid
- Remaining balance (if partial)
- Receipt number (payment ID short code)

**Access control:**
- `front_desk` can access `/caja` but NOT `/reportes`, `/panel` (dashboard stats).
- Payment voids are NOT available from Caja — only from the enrollment ledger by `director_admin`+.

### 9.5 Pending Payments List
1. Query active enrollments with `balance > 0` from balance view.
2. Join primary guardian phone for contact.
3. Filter by campus, team, balance bucket, overdue days.
4. UI exposes `tel:` link for rapid call workflow.

### 9.6 Daily Corte Report
1. Staff opens cash session per campus/day.
2. All cash inflows recorded via linked payments and manual entries.
3. End-of-day close captures reported cash and variance.
4. Report shows totals by method + expected vs reported cash.

## 10) Performance Plan
- Primary strategy:
  - Tight indexes on enrollment/campus/status and ledger dates.
  - Narrow server queries (select only required columns).
  - Pagination for lists (players, charges, payments).
  - Optimistic UI only for payment posting confirmation flow.
- Balance strategy:
  - Start with `v_enrollment_balances` view (simple and correct).
  - If needed, move to cached `enrollment_balances` with trigger/job refresh. **TBD threshold: >100k charges/payments**
- Reporting strategy:
  - Daily and monthly reports use pre-filtered date ranges and indexed methods.

## 11) Audit Logging Strategy
- App layer emits explicit audit events for critical operations:
  - Create/update player, enrollment, charge
  - Post/void/refund payment
  - Open/close cash session
  - Team assignment changes
- Store before/after JSON snapshots for mutable records.
- Include `actor_user_id`, timestamp, table, record id, and optional request id.
- Keep immutable append-only policy; no updates/deletes on `audit_logs`.

## 12) 360Player/Stripe Import/Reconciliation (Phase 2)
- Create staging table `external_payment_events` with raw payload and provider ids. **TBD**
- Idempotency key: provider event id + amount + timestamp.
- Reconciliation job:
  - Match by enrollment external reference and period.
  - Create internal payment if unmatched.
  - Mark exceptions queue for manual review.
- Report:
  - Internal vs provider totals by day/month and discrepancy list.

## 13) Environment Safety
### 13.1 Environment stamp
Add an environment stamp so UI clearly shows:
- PREVIEW vs PROD (admin-only display)

### 13.2 Health page (admin-only)
Admin-only route:
- Shows current environment
- Verifies DB connectivity
- Verifies auth session and role
- Shows configured project URL (safe subset)

## 14) Roadmap
### Phase 1 (Now)
- Core master data, enrollments, teams, ledger, pending list, corte, baseline reports, RLS/admin roles, audit.
- Player creation flow (player + guardian in one form).
- Dropout reason tracking on enrollment end/cancel.
- Coaches schema (structure + data; no accounts yet).
- Team/categoría/coach display on player detail page.
- Products/Items admin page: charge catalog management + bulk charge assignment by team.
- Payment cash-register UX: auto-fill balance, auto-allocate oldest-first.
- Monthly charge generation (automated or manual trigger — TBD delivery mechanism).

### Phase 2
- Restricted admin roles and campus scoping.
- **Coach module**: coaches access the app to take attendance per training session. Attendance records link to team/session/date.
- **Attendance-based baja detection**: 3 consecutive missed months surfaces player as baja candidate automatically.
- Tournament entity: `tournaments` table, team entries, mandatory vs optional participation, auto charge generation.
- **Field management**: fields per campus, weekly schedule per team, conflict detection.
- 360Player/Stripe import and reconciliation.
- Clip integration design and pilot.

### Phase 3
- **Game scores and match results**: track match outcomes per team, opponent, date, competition.
- **Coach performance tracking**: metrics tied to team results, attendance rates, player progression.
- Advanced segmentation and analytics.
- Automated reminders (WhatsApp/SMS/email).
- Financial controls hardening (approval workflows, anomaly detection).

## 15) Assumptions and TBDs / Open Questions
Assumptions:
- All Phase 1 users are authenticated Supabase users mapped to `director_admin`.
- One active enrollment per player globally.

**Resolved:**
- ~~Tuition tier differentials~~ → regular rate at charge creation; discount credit or penalty surcharge applied at payment time (see 5.2).
- ~~Payment void authority~~ → director only, any time, with required reason note.
- ~~Partial payments~~ → allowed in practice, no input restriction, enrollment stays in collections list.
- ~~Credit balances / overpayments~~ → stay on account as negative balance, applied to next charge.
- ~~Paused memberships~~ → not used operationally. Active or ended/cancelled only.

TBD / questions:
- ~~Credit balance allocation UX~~ → confirmed manual for Phase 1 (staff applies at next payment posting). Auto-apply is Phase 2.
- ~~Overpayment~~ → confirmed: credit stays on account (negative balance), applied manually to next charge.
- Uniform amounts: confirmed $600 each. Fixed price, same across sizes/campuses.
- Legal retention policy for minors' data and audit records.
- What exact permissions should `admin_restricted` role have?
- What are the policy windows for `admin_restricted` void authority (Phase 2)?
- ~~Categoría~~ → confirmed as year of birth. `teams.birth_year int` replaces `age_group text`. No separate categories table needed.
- Level (B1/B2/B3): are there more levels, or is this the complete set? Can a player be unclassified?
- Field management (Phase 2): how many fields per campus, and is scheduling done weekly (recurring) or ad-hoc?
- Coach full roster: TBD — Javi to provide list of coach names per campus to seed `coaches` table.
- Teams full roster: TBD — to be seeded once coach data is available.
- Monthly charge generation delivery: automated Supabase Edge Function cron vs manual "Generar mensualidades" button. **Recommendation: manual button for Phase 1** so director retains control and can review before committing.

## 16) Porto Monthly Report — Reporte de Acompañamiento

### 16.1 Background
Porto HQ requires a monthly report delivered in a fixed Excel format ("Reporte de Acompañamiento mensual"). This section specs out the app's `/reports/porto-mensual` page that generates all auto-computable fields and clearly marks the fields that require manual input.

### 16.2 Report Tabs and Computation Strategy

#### Tab 1: Datos Generales
Fully auto-generatable from DB:
- **Nuevas inscripciones** — COUNT enrollments where `created_at` falls in the report month
- **Retiros** — COUNT enrollments where `ended_at` falls in the report month (status = ended or cancelled)
- **Jugadores activos** — COUNT enrollments with status = `active` on last day of report month
- **Varonil / Femenil breakdown** — JOIN `players.gender` on active enrollments
- **Retrasos (deudores)** — COUNT active enrollments with `balance > 0` (pending charges > 0)
- **Facturación pendiente (USD)** — SUM of pending balances across all active enrollments, converted at ~18 MXN/USD
- **Motivos de retiro** — COUNT retiros grouped by `dropout_reason` for the report month

Requires manual fill in the report UI:
- **Eventos** — Event log (dates, description, attendance). No DB infrastructure in Phase 1.
- **Mapa de Área** — Operational contacts and area info. Static/manual.

#### Tab 2: Equipos de Competición
Auto-generatable (once teams are seeded):
- Team name (birth_year + gender + level + campus)
- Head coach name (`coaches.name` via `teams.coach_id`)
- Player count (active players on team)
- Competition name (Phase 1: free text on team; Phase 3: `tournaments` entity)
- **Standings** — Cannot be auto-generated. Manual input in Phase 1. Phase 3 candidate.

#### Tab 3: Clases (Class Groups)
Auto-generatable (once teams seeded with `type = 'class'` flag):
- Group name
- Coach name
- Enrolled count

#### Tab 4: Eventos
**Continuous event log** — staff log events throughout the month as they happen. Porto report reads all events where `event_date` falls in the selected month. No more end-of-month scramble.

Each event entry captures:
- Title, description, proposed date, actual date, campus (optional), whether it occurred (`is_done`), participant count, optional charge amount, satisfaction evaluation (1–5)

DB table: `academy_events` (see Section 6.7)

#### Tab 5: Mapa de Área
**Continuous quality/incident log** — staff log incidents, improvements, and observations throughout the month using Porto's structured format. Porto report shows all entries for the selected month.

This is a quality management log (similar to an internal ticketing system), not a free-text field. Each entry captures the full lifecycle: logged → actioned → closed → marked effective/not.

Entry fields:
- `entry_date`, `type_code` (R/SM/C/NC/PNC/AS/OM/M), `topic` (from Porto's predefined list), `description`, `root_cause`, `corrective_action`, `correction_action`, `assigned_to` (free text), `deadline_days`, `closure_date`, `effectiveness` (E/NE/SP)

**Type codes (Porto Directrices):**
- `R` — Reclamación (complaint from parent/player)
- `SM` — Sugerencia de Mejoría (improvement suggestion)
- `C` — Constatación (verified defect/issue)
- `NC` — No Conforme (non-conformance, operational risk)
- `PNC` — Posible No Conforme (potential non-conformance)
- `AS` — Auditoría (audit finding, internal or external)
- `OM` — Orden de Mejora
- `M` — Mantenimiento (maintenance)

**Topics (predefined, from Porto Directrices):**
Material Deportivo, Decoración y Publicidad, Kit Alumnos, Kit Entrenadores, Nutrición, Psicología, Fisioterapia, Secretaria, Entrenadores, Padres de Familia y Alumnos, Torneos y Equipos de Competencia, Instalaciones, Auditoría Externa, Auditoría Interna, Organización de la Escuela, Hardware, Software

**Effectiveness values:** `E` (Eficaz), `NE` (No Eficaz), `SP` (Sin efecto)

DB table: `area_map_entries` (see Section 6.7)

### 16.3 Schema Changes Required

#### a) `enrollments.has_scholarship boolean not null default false`
- Scholarship players (`beca`) are enrolled but should NOT receive a `monthly_tuition` charge
- They still count as active players in all enrollment counts
- When generating monthly charges, skip enrollments where `has_scholarship = true`
- Monthly charge generation must filter: `WHERE has_scholarship = false`
- Staff can toggle this flag via enrollment edit form (director_admin only)

#### b) Expand `dropout_reason` enum (or keep as text with validation)
Porto's taxonomy has ~30 dropout categories vs. our current 7. Current schema uses `text` (not a PG enum), so expansion requires no migration — only:
- Update the allowed-values list in the server action validation
- Update the UI dropdown with Porto's full category list
- Porto reasons include: economic, distance, schedule conflict, injury, attitude, level mismatch, family relocation, school conflict, returned to home country, aging out, etc.
Full list to be provided by Porto. For now, keep the 7 existing codes and add a Phase 1.5 task to expand.

#### c) `teams.type text not null default 'competition'`
- Values: `'competition'` | `'class'`
- Competition teams appear in the Equipos de Competición tab
- Class groups appear in the Clases tab
- Migration: add column with default, backfill if needed

#### d) Currency handling
- All internal amounts in MXN
- Porto report outputs USD totals using a configurable exchange rate
- Phase 1: rate stored as a constant (~18.0) in the report page, editable by staff at report generation time (input field)
- Phase 2+: exchange rate table with date-stamped rates

### 16.4 Route and UX
- Route: `/reports/porto-mensual`
- Access: director_admin and above only
- Month selector at top (defaults to previous month)
- Shows auto-computed fields as read-only with edit button for manual sections
- "Exportar Excel" button (Phase 1: not implemented — show data on screen for manual copy or future CSV export)
- Manual sections (Eventos, standings, Mapa de Área) displayed as text areas

### 16.4.1 Route Update
The porto-mensual page renders Eventos and Mapa de Área as inline CRUD panels (not text areas). Staff can add, view, and close entries directly from the report page for the selected month. No separate route needed.

### 16.5 Coach Seeding
Coach names are visible in Clases.csv from Porto template. These can be used to seed the `coaches` table:
- Adrián Cárdenas, Carlos Tinajero, and others per campus
- Seed migration TBD once full list is confirmed with Javi
- Each coach linked to their team(s) via `teams.coach_id`

### 16.6 Fidelización (Tryout Conversion)
Porto template includes a fidelización (tryout → enrollment conversion) metric. **Do not track in this app.** Porto tracks this at the regional level from separate tryout records. Our app only sees enrolled players.

### 16.7 Implementation Order
1. Migration: `has_scholarship` flag on enrollments
2. Migration: `teams.type` column
3. Update monthly charge generation to skip scholarship enrollments
4. Seed coaches from Clases.csv list (once list confirmed)
5. Build `/reports/porto-mensual` page with Datos Generales tab (fully auto)
6. Add Equipos/Clases tabs (team data display, manual standings)
7. Add Eventos + Mapa de Área as free-text manual sections
8. Add "Exportar" (CSV/Excel) — Phase 1.5
- Products admin page route: `/admin/products` or integrated into existing navigation?

## 17) Admin Feedback — Feature Backlog (2026-03-13 Demo)

Features requested by operations staff after demo session. Organized by phase.

### 17.1 Phase 1B Enhancements

#### Activity Log UI (`/activity`)
- Director/superadmin-only route that surfaces `audit_logs` as a human-readable feed.
- Format: "User X posted a payment of $600 for [Player Name] · Linda Vista · 2 min ago"
- Filterable by date, actor, action type, campus.
- No new DB table needed — `audit_logs` already exists.

#### Corte Diario — Summary by Charge Type
- Current corte lists individual payments. Admins want a summary row: "Mensualidades: $15,000 · Inscripciones: $5,400 · Uniformes: $1,200"
- Aggregate totals grouped by `charge_types.code` for the session/day.
- UI change only, no schema change.

#### Weekly Corte
- Aggregate version of Corte Diario spanning a full week (Mon–Sun).
- Same data model, different date filter.
- Route TBD (extend `/reports/corte` with a toggle, or separate `/reports/corte-semanal`).

#### Caja Enhancements
- **Player context in Caja** ✅ Done — team name and coach name shown on player card. Birth-year search (4-digit query) and fuzzy/typo-tolerant name search via `pg_trgm` `word_similarity`.
- **Ad-hoc item charges from Caja** — staff can charge a player for a specific item (uniform, league fee, etc.) directly from the Caja panel, without navigating to the enrollment ledger. New charge flow alongside the existing payment flow.

#### Write-Off / Baja Processing for Dropped-Out Players with Pending Charges
- Problem: players who drop out often leave with 1–3 months of unpaid charges. These charges should be written off rather than left as phantom pending balances.
- Phase 1 approach (TBD): director_admin selects one or more pending charges on an enrollment, enters a void reason (`dropout`), system voids them and records in `audit_logs`.
- Distinct from a regular void — this is a batch-end-of-baja action, not a per-payment fix.
- UX: "Zona de baja" section on enrollment page, or inline action on the Pendientes list.
- Phase 2: integrate with automatic baja detection so the write-off prompt appears automatically when a player is marked inactive.

### 17.2 Phase 2 Features

#### Product Catalog + Uniform Delivery Tracking
- Expand charge types into a richer product catalog with delivery tracking.
- New table `player_uniform_deliveries`:
  - `player_id`, `product_type` (`training`, `game`, `goalkeeper`), `ordered_at date null`, `received_at date null`, `size text null`, `notes text null`, `created_by`, `created_at`
- Enables: quickly see which players have/have not received their uniforms per type.
- UI: player card shows uniform status badges (training kit ✓, game kit ✗, etc.)
- Goalkeeper uniform flagged as a distinct product type.

#### Uniform Stock Control (Light Inventory Module)
- Track stock levels of uniforms by type and size.
- `uniform_stock` table: `product_type`, `size`, `quantity_on_hand`, `quantity_on_order`, updated manually by staff.
- Dashboard widget: "Training kits on hand: 12 · Game kits needed this week: 8"
- No barcode/SKU complexity in Phase 2 — purely count-based.
- Pending orders view: "Order X more training kits in size S by [date]"

#### Player Documents / File Uploads
- Upload and store player documents (photo ID, passport, birth certificate, medical forms).
- Supabase Storage bucket: `player-documents`, path: `/{player_id}/{document_type}/{filename}`
- New table `player_documents`: `player_id`, `document_type text`, `storage_path text`, `uploaded_by`, `uploaded_at`
- Access: `director_admin` and `superadmin` only (RLS on both the table and Storage bucket policy).
- UI: document section on player detail page with upload + list + delete.

#### Jersey Number Assignment
- Business rule: players born in even years get even numbers; odd years get odd numbers. Full ruleset TBD.
- **Do not design schema until full rules are confirmed.** Javi to clarify with coaching staff.
- Likely model: `team_jersey_numbers` (team_id, enrollment_id, number int) with uniqueness enforced per team.
- Phase 2 task: define rules → design schema → build auto-suggest on enrollment.

### 17.3 Phase 3

#### Stripe Integration
- Accept card payments via Stripe directly in the app.
- Payment method `stripe` added to `payments.method`.
- Stripe webhook ingestion, reconciliation queue, refund handling.
- See Section 12 for broader integration design notes.

---

## 18) Pre-Testing Feedback — Feature Gaps (2026-03-17)

Notes captured before first internal testing session. These informed the Phase 2 roadmap reprioritization.

### 18.1 Caja UX Issues

#### Cancel Returns to Top (Quick Fix)
- Bug: when "Registrar Pago" card is open and user clicks cancel, the Caja page resets to the top (player search) instead of returning to the enrollment panel for that player.
- Fix: `onCancel` in the payment form should call `setView({ tag: "enrollment", ... })` instead of resetting to `idle`.

#### Caja Drill-Down Charge Detail (Not Started)
- Staff need to see more detail about a pending charge before deciding to pay it: what period it covers (e.g. "Mensualidad Feb 2026"), the charge type, the amount, and whether it's overdue.
- Current state: charges are listed as flat rows with description + amount only.
- Design options:
  a. Expandable rows — click a charge to reveal period, due date, charge type code inline.
  b. Side panel — selected charge opens a slim detail panel.
- Recommendation: expandable rows (zero navigation, no extra UI surface).
- Not blocking for first testing session; document for quick follow-up.

### 18.2 Nav / Panel Audit

- Several menu items appear to overlap in function or show placeholder/incorrect data.
- Some reports are not correctly wired and do not reflect actual numbers.
- Action: after first testing session, walk through every nav item with staff and:
  1. Identify what gets used, what's redundant, what's confusing.
  2. Cross-check each report's numbers against known real data.
  3. Merge, remove, or rewire as needed.
- This is an audit task, not a build task — do not prematurely refactor before user feedback.

### 18.3 Player Profile Expansion

Current player page shows: name, birth date, campus, enrollment status, ledger.
Missing (requested pre-testing):
- **Uniform size** — staff need to know the player's size when delivering kits.
- **Current team assignment** — which team (name + birth year + level + campus) and coach.
- **Enrollment history** — brief summary (start date, status, campus).

Design notes:
- Uniform size: add `players.uniform_size text null` column (migration needed). Staff editable from player page.
- Team: already queryable via `team_assignments JOIN teams JOIN coaches`. Display as a card on player page.
- No schema change needed for team/coach display — data already exists.

### 18.4 Player List Tags (Jugadores)

Goal: let directors and staff scan the player list and immediately see key status signals without drilling into each player.

Requested tags per player row:
- **Competición / Clase** — which type of team they're on (from `teams.type`).
- **Tuition paid this month** — does enrollment have a payment for the current period?
- **Balance owed** — non-zero balance flag, color-coded by size (green=0, amber=small, red=high).

Implementation notes:
- Tags should be lightweight — a few colored pills per row, not columns.
- Data needs: `v_enrollment_balances` (already exists) + a monthly charge query to detect if current period is paid.
- Performance: current Jugadores list fetches ~700 rows — ensure tag queries are aggregated, not N+1.

### 18.5 Teams & Competitions System

Current state: teams exist in DB, team assignments exist, but the UI for managing them is rough. Players and coaches are seeded but assigning a player to a team from the app is messy.

Requested:
1. **Clean team assignment UX** — from player page: show current team, allow change, set primary.
2. **Team detail page** — roster (all active players on team), coach name, campus, birth year, level.
3. **Tournament registration** — which teams are entered in which torneo. Mandatory vs optional participation. Phase 2.

Schema design notes (to be confirmed before building):
- `team_assignments` already exists: `enrollment_id`, `team_id`, `is_primary`, `start_date`, `end_date`.
- Multiple teams per enrollment is supported (e.g. training team + cup team). `is_primary` marks the main team.
- Tournament entity: `tournaments(id, name, campus_id, date, is_mandatory)` + `tournament_team_entries(tournament_id, team_id)` + optionally `tournament_player_entries(tournament_id, enrollment_id)` for optional participation.
- **Do not build tournament entity until the team assignment UX is clean and tested.**
