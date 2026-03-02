# Dragon Force Ops — Software Design Document (SDD)

This is the consolidated, living SDD. It merges and preserves the content from:
- `docs/new-sdd.md` (foundation notes + environment safety)
- `docs/phase-1-sdd.md` (Phase 1 MVP SDD: schema, workflows, RLS, performance)

## 0) Status
- Current stage: Foundation + dashboards
- Auth: Supabase Auth with Azure provider enabled
- Environments:
  - Production DB: Supabase main project
  - Preview DB: Supabase preview branch (Pro plan)
  - Hosting: Vercel (prod + preview deployments)
- Known pain:
  - Environment brittleness
  - Unclear business rules
  - Roles not fully designed / enforced yet

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

### 5.5 Tournament Rules (Phase 1 → Phase 2)
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

**Overpayments / credit balances:**
- If a payment exceeds the current balance, the excess becomes a credit balance on the account.
- Credit balance is visible in the ledger and the balance view (negative balance = credit).
- Credit applies to the next charge (staff allocates manually or system allocates automatically at next payment posting — **TBD: exact allocation UX**).
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
  - timestamps
- `teams`
  - `id uuid pk`
  - `campus_id uuid`
  - `name text`
  - `gender text null` (`male`, `female`, `mixed`)
  - `birth_year int null` (categoría — e.g. `2013`, `2014`; renamed from `age_group` in schema migration TBD)
  - `level text null` (`B1`, `B2`, `B3`)
  - `season_label text null`
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

### 8.2 Role/Permission Matrix (Current + Future-Ready)
- `director_admin` (Phase 1 active):
  - Full CRUD on all Phase 1 tables.
  - Can post/void payments and close cash sessions.
  - Can view audit logs.
- `admin_restricted` (Phase 2 planned):
  - Read/write players/enrollments/charges/payments.
  - Cannot void historical payments older than policy window. **TBD**
  - Limited report scope (possibly campus-scoped). **TBD**
- `coach` (Phase 2 planned):
  - Read-only roster/team data, no financial data.

Additional near-term target (roles direction from earlier notes):
- `finance` (optional): edit payments + reports

Current operational note:
- Only one active user (Javi) with admin access (temporary bootstrap via env var).
- Earlier notes referenced “profiles table” for roles; the Phase 1 SDD model (`app_roles` + `user_roles`) is the intended source of truth.

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
1. Staff opens enrollment ledger and starts payment modal.
2. Server validates amount, method, enrollment status, open cash session (for cash).
3. Create payment + allocations atomically in transaction.
4. Insert cash session entry when method is cash.
5. Return updated ledger summary for optimistic UI reconciliation.
6. Write audit log.

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
- **Credit balance allocation UX**: when a credit balance exists and a new charge is generated, does the system auto-allocate or does staff manually apply it at payment posting? (Recommendation: manual for Phase 1, auto in Phase 2.)
- Uniform amounts: what are the actual prices for `uniform_training` and `uniform_game`? Are they fixed or vary by size/campus?
- Legal retention policy for minors' data and audit records.
- What exact permissions should `admin_restricted` role have?
- What are the policy windows for `admin_restricted` void authority (Phase 2)?
- ~~Categoría~~ → confirmed as year of birth. `teams.birth_year int` replaces `age_group text`. No separate categories table needed.
- Level (B1/B2/B3): are there more levels, or is this the complete set? Can a player be unclassified?
- Field management (Phase 2): how many fields per campus, and is scheduling done weekly (recurring) or ad-hoc?
