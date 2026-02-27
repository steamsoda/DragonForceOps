# Dragon Force Ops App — Software Design Document (SDD)

## 0. Status
- Current stage: Foundation + dashboards
- Auth: Supabase Auth with Azure provider enabled
- Environments:
  - Production DB: Supabase main project
  - Preview DB: Supabase preview branch (Pro plan)
  - Hosting: Vercel (prod + preview deployments)
- Known pain: environment brittleness, unclear business rules, roles not fully designed

## 1. Goals (Phase 1 MVP)
We are building a single source of truth for:
- Player identity + Guardians
- Enrollment (Inscripción) as operational anchor
- Team organization (campus-based)
- Billing ledger:
  - Charges: monthly tuition, inscription, uniform, tournaments/cups, trips, events
  - Payments: cash/transfer/card/Stripe(360Player), later Clip
- Balance + pending payments lists (collections workflow)
- Basic reporting:
  - Daily "corte"
  - Monthly summary dashboards

## 2. Non-goals (Phase 1)
Explicitly NOT in Phase 1:
- Coach workflows and training planning
- Full scheduling engine for matches/fields
- Clip terminal integration (Phase 2+)
- Automated 360Player/Stripe sync (Phase 2+; CSV import first)
- Complex communications (Twilio/VoIP call logging) (Phase 3+)

## 3. Guiding Principles
- Security-first: minors + payments => strict access control + audit logs
- Brick-by-brick: rules will evolve; architecture must allow change
- Client is dumb: business logic runs on server
- DB schema changes are migration-only (no ad-hoc dashboard edits)
- Fast UX: avoid full refresh; use narrow queries + optimistic updates

## 4. Domain Model Overview
### 4.1 Core Entities
- Player: identity (name, DOB, sex, etc.)
- Guardian: contact person linked to Player(s)
- Enrollment (Inscripción): membership instance with campus + start/end + status
- Team: belongs to a campus; includes category (year of birth) and sex if needed
- TeamAssignment: Enrollment ↔ Team over time (history)
- Charge: what is owed (type + amount + due_date + period)
- Payment: what was paid (amount + method + reference + timestamp + recorded_by)
- Balance: computed or cached summary per Enrollment

### 4.2 Why Enrollment Anchors Everything
Enrollment represents the time-bounded relationship:
- campus transfers => new Enrollment
- leaving and rejoining => new Enrollment
- reporting “who was active in month X” becomes trivial
- charges/payments/attendance attach to operational reality, not just identity

## 5. Business Rules (initial, evolving)
### 5.1 Campus
- A player can only have one active enrollment (one campus) at a time
- Transfers are rare and represented by ending prior enrollment and creating a new one

### 5.2 Tuition tiers
Monthly tuition tier based on date:
- Days 1–10: early bird
- Days 11–20: regular
- Day 21+: penalty

Implementation note:
- Do not hardcode in UI.
- Use pricing rules + monthly charge generation.

### 5.3 Charges types
- Monthly tuition (recurring)
- Inscripción (one-time)
- Uniform (one-time or multiple SKUs)
- Tournament/Cup registration (one-time)
- Trips / events / posadas / parties (ad-hoc)

## 6. Roles & Permissions (current + roadmap)
### 6.1 Current
- Only one active user (Javi) with admin access (temporary bootstrap via env var)

### 6.2 Near-term target
- Roles stored in DB (profiles table) and enforced server-side and via RLS:
  - Admin/Director (full access)
  - Restricted Admin (limited: no deleting payments, limited reporting, etc.)
  - Finance (edit payments + reports)
  - Coach (Phase 2+)

## 7. Environment Safety
### 7.1 Environment Stamp
Add an environment stamp so UI clearly shows:
- PREVIEW vs PROD (admin-only display)

### 7.2 Health Page (admin-only)
Admin-only route:
- shows current environment
- verifies DB connectivity
- verifies auth session and role
- shows configured project URL (safe subset)

## 8. Performance Plan
- Index foreign keys:
  - payments.enrollment_id
  - charges.enrollment_id
  - team_assignments.enrollment_id
  - enrollment.campus_id
- Balance:
  - start with computed sums
  - add cached EnrollmentBalance table when needed for instant UX

## 9. Roadmap
### Phase 1 (MVP Backbone)
- Enrollment + Teams + Charges + Payments + Balances
- Pending payments list + tel links
- Corte report
- Roles groundwork + admin-only health page

### Phase 2
- Attendance module
- 360Player/Stripe CSV import + reconciliation
- More segmentation dashboards
- Begin coach workflows

### Phase 3
- Clip terminal integration via webhooks
- More automation + integrations
- Advanced reporting and auditing

## 10. Open Questions (to resolve incrementally)
- What exact restricted roles should access?
- How do we treat paused memberships?
- How do we handle partial payments and credit balances?
- What are the official charge SKUs/concepts for uniforms and tournaments?