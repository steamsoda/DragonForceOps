# FC Porto Dragon Force Monterrey - Phase 1 MVP SDD

## 1) Overview and Goals
- Build a secure internal operations app (30-50 staff users) for two campuses in Monterrey: Linda Vista and Contry.
- Establish a single source of truth for:
  - Players and guardians
  - Enrollments (`Inscripciones`) as the operational anchor
  - Teams and team assignments
  - Charges and payments (ledger model)
  - Pending balances and payment follow-up lists
  - Daily cash register report (`corte`) and monthly summaries
- Use architecture aligned with scale and compliance needs:
  - Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
  - Supabase Postgres + Supabase Auth
  - RLS enforced at the database layer
  - Server-side business logic only (Server Actions/API routes)

## 2) Explicit Non-Goals (Phase 1)
- Coach module and coach permissions (Phase 2+).
- Attendance and training session management (Phase 2+).
- Clip terminal integration (Phase 2+).
- Full accounting/ERP integration.
- Automated WhatsApp/SMS reminders (Phase 2+).
- Advanced BI dashboards beyond operational reports listed here.

## 3) Core Domain Model (ERD in Text)
- `player` is identity data only.
- `enrollment` is a membership instance and operational anchor:
  - One player can have many enrollments over time.
  - Only one active enrollment per player at a time.
  - Campus transfer is represented as closing old enrollment + creating new enrollment.
- `charges` and `payments` attach to `enrollment`.
- `payment_allocations` links payment amounts to one or more charges.
- `teams` are campus-scoped; `team_assignments` attach to enrollment.
- `guardians` relate to players through junction table `player_guardians`.
- `pricing_plan` and `pricing_plan_tuition_rules` define monthly tuition tiers by payment day.
- `cash_sessions` and `cash_session_entries` support daily `corte`.
- `audit_logs` capture critical create/update/delete/payment actions.

## 4) Data Model (Postgres Tables - Key Columns)
### 4.1 Reference and Auth
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

### 4.2 Players and Guardians
- `players`
  - `id uuid pk`
  - `first_name`, `last_name`
  - `birth_date date`
  - `gender text null`
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

### 4.3 Enrollment and Teams
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
  - `age_group text null`
  - `season_label text null`
  - `is_active boolean`
- `team_assignments`
  - `id uuid pk`
  - `enrollment_id uuid`
  - `team_id uuid`
  - `start_date date`
  - `end_date date null`
  - `is_primary boolean`

### 4.4 Ledger
- `charge_types`
  - `id uuid pk`
  - `code text unique`:
    - `monthly_tuition`, `inscription`, `uniform`, `tournament`, `cup`, `trip`, `event`
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

### 4.5 Reporting and Audit
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

### 4.6 Derived Balance
- `v_enrollment_balances` (view)
  - `enrollment_id`
  - `total_charges`
  - `total_payments`
  - `balance`
- Optional future optimization: cached `enrollment_balances` table maintained by triggers/jobs. **TBD**.

## 5) Indexing Plan
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

## 6) RLS Strategy and Roles Matrix
### 6.1 Strategy
- Enable RLS on all domain tables in `public`.
- For Phase 1, allow only authenticated users with `director_admin` role.
- Server-side API/Server Actions use user JWT context; policies enforce access.
- Create helper SQL function: `is_director_admin()` backed by `user_roles`.
- Keep policies restrictive by default (`deny all`) and explicit per table.

### 6.2 Role/Permission Matrix (Current + Future-Ready)
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

## 7) Core Workflows
### 7.1 Registration + Enrollment
1. Search existing player by name/birth date.
2. Create player if missing.
3. Link/create guardians.
4. Create enrollment with campus + pricing plan + start date.
5. Create inscription charge (if applicable) and optional uniform charge.
6. Audit log emitted for each mutation.

### 7.2 Team Assignment
1. Open enrollment page.
2. Assign enrollment to active campus team.
3. End prior team assignment if needed.
4. Persist and log assignment change.

### 7.3 Monthly Charge Generation
1. Scheduled job (monthly) selects active enrollments.
2. Creates one `monthly_tuition` charge per enrollment per month (idempotent index).
3. On payment posting, tuition rule (day 1-10, 11-20, 21+) is selected from `pricing_plan_tuition_rules`.
4. Any required differential adjustment is created server-side as charge/credit entry. **TBD: exact adjustment policy**

### 7.4 Desk Payment Posting
1. Staff opens enrollment ledger and starts payment modal.
2. Server validates amount, method, enrollment status, open cash session (for cash).
3. Create payment + allocations atomically in transaction.
4. Insert cash session entry when method is cash.
5. Return updated ledger summary for optimistic UI reconciliation.
6. Write audit log.

### 7.5 Pending Payments List
1. Query active enrollments with `balance > 0` from balance view.
2. Join primary guardian phone for contact.
3. Filter by campus, team, balance bucket, overdue days.
4. UI exposes `tel:` link for rapid call workflow.

### 7.6 Daily Corte Report
1. Staff opens cash session per campus/day.
2. All cash inflows recorded via linked payments and manual entries.
3. End-of-day close captures reported cash and variance.
4. Report shows totals by method + expected vs reported cash.

## 8) Performance Plan
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

## 9) Audit Logging Strategy
- App layer emits explicit audit events for critical operations:
  - Create/update player, enrollment, charge
  - Post/void/refund payment
  - Open/close cash session
  - Team assignment changes
- Store before/after JSON snapshots for mutable records.
- Include `actor_user_id`, timestamp, table, record id, and optional request id.
- Keep immutable append-only policy; no updates/deletes on `audit_logs`.

## 10) 360Player/Stripe Import/Reconciliation (Phase 2)
- Create staging table `external_payment_events` with raw payload and provider ids. **TBD**
- Idempotency key: provider event id + amount + timestamp.
- Reconciliation job:
  - Match by enrollment external reference and period.
  - Create internal payment if unmatched.
  - Mark exceptions queue for manual review.
- Report:
  - Internal vs provider totals by day/month and discrepancy list.

## 11) Roadmap
### Phase 1 (Now)
- Core master data, enrollments, teams, ledger, pending list, corte, baseline reports, RLS/admin roles, audit.

### Phase 2
- Restricted admin roles and campus scoping.
- Coach module + attendance.
- 360Player/Stripe import and reconciliation.
- Clip integration design and pilot.

### Phase 3
- Advanced segmentation and analytics.
- Automated reminders (WhatsApp/SMS/email).
- Financial controls hardening (approval workflows, anomaly detection).

## 12) Assumptions and TBDs
- Assumption: all Phase 1 users are authenticated Supabase users mapped to `director_admin`.
- Assumption: one active enrollment per player globally.
- TBD: exact accounting representation for tuition tier differentials (discount vs surcharge lines).
- TBD: policy windows for payment void/refund authority.
- TBD: legal retention policy for minors' data and audit records.
