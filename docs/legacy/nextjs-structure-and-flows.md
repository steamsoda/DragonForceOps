# Next.js Initial Structure and Screens (Phase 1 MVP)

## 1) Proposed File/Folder Structure
```text
src/
  app/
    (auth)/
      login/
        page.tsx
    (protected)/
      layout.tsx
      dashboard/
        page.tsx
      players/
        page.tsx
        [playerId]/
          page.tsx
          enrollments/
            new/
              page.tsx
            [enrollmentId]/
              edit/
                page.tsx
      enrollments/
        [enrollmentId]/
          charges/
            page.tsx
            new/
              page.tsx
          team-assignment/
            page.tsx
      pending/
        page.tsx
      reports/
        corte-diario/
          page.tsx
        resumen-mensual/
          page.tsx
    api/
      payments/
        route.ts
      monthly-charges/
        route.ts
      reports/
        corte/
          route.ts
        monthly-summary/
          route.ts
    layout.tsx
    page.tsx
  components/
    ui/
      ...
    players/
      player-search-table.tsx
      player-form.tsx
      guardian-form.tsx
    enrollments/
      enrollment-form.tsx
      team-assignment-form.tsx
    billing/
      charges-table.tsx
      charge-form.tsx
      payment-post-modal.tsx
      payment-method-badge.tsx
      balance-chip.tsx
    reports/
      corte-summary-cards.tsx
      monthly-summary-chart.tsx
  lib/
    auth/
      roles.ts
      permissions.ts
    supabase/
      client.ts
      server.ts
      middleware.ts
    queries/
      players.ts
      enrollments.ts
      billing.ts
      reports.ts
    services/
      enrollments.ts
      payments.ts
      monthly-charge-generator.ts
      audit-log.ts
      cash-session.ts
    validations/
      player.ts
      enrollment.ts
      charge.ts
      payment.ts
    utils/
      money.ts
      dates.ts
  server/
    actions/
      players.ts
      enrollments.ts
      charges.ts
      payments.ts
      reports.ts
  types/
    db.ts
    domain.ts
supabase/
  migrations/
    20260224090000_phase1_core.sql
docs/
  phase-1-sdd.md
  nextjs-structure-and-flows.md
```

## 2) First Screens (Phase 1)
1. Player search/list (`/players`)
2. Player detail card/page (`/players/[playerId]`)
3. Enrollment create (`/players/[playerId]/enrollments/new`)
4. Enrollment edit (`/players/[playerId]/enrollments/[enrollmentId]/edit`)
5. Charges list (`/enrollments/[enrollmentId]/charges`)
6. Charge create (`/enrollments/[enrollmentId]/charges/new`)
7. Payment posting modal (from charges list page)
8. Pending payments list (`/pending`)
9. Reports: daily corte (`/reports/corte-diario`)
10. Reports: monthly summary (`/reports/resumen-mensual`)

## 3) User Flows
### 3.1 Player Search and Detail
1. User opens `/players`.
2. Search by name, phone (guardian), campus, status.
3. Open player detail page.
4. View profile, guardians, active/past enrollments, current balance summary.

### 3.2 Enrollment Create/Edit
1. From player detail, click `Nueva inscripcion`.
2. Fill campus, pricing plan, start date, status.
3. Save server action creates enrollment + optional initial charges.
4. Redirect back to player detail with success toast.

### 3.3 Charges + Payment Posting
1. Open enrollment charges page.
2. View ledger timeline: charges, payments, balance.
3. Click `Registrar pago` modal.
4. Enter method, amount, allocations, notes.
5. Submit server action transaction:
   - create payment
   - create allocations
   - create cash entry (if cash)
   - write audit log
6. Optimistic UI updates balance row and recent payments table.

### 3.4 Pending Payments Follow-up
1. Open `/pending`.
2. Filter by campus/team/balance/overdue bucket.
3. List shows player, guardian primary phone, pending amount.
4. Click `Llamar` (`tel:` link) for direct follow-up.

### 3.5 Daily Corte
1. Open `/reports/corte-diario`.
2. Select date and campus.
3. Show totals by payment method, cash expected, cash reported, variance.
4. Exportable table (CSV/PDF) is **TBD**.

### 3.6 Monthly Summary
1. Open `/reports/resumen-mensual`.
2. Select month + campus.
3. Show:
   - total charges generated
   - total payments posted
   - net pending
   - payment method distribution
4. Drill-down to enrollments with pending balance.

## 4) Minimal Implementation Notes
- Keep all mutations in `server/actions/*` or `app/api/*`.
- UI components stay presentational, consuming server-returned DTOs.
- Every mutation service calls `audit-log.ts`.
- RLS remains final guardrail even if app-level role checks fail.
- TBD:
  - exact CSV/PDF export mechanism
  - background jobs scheduler choice (Supabase cron/Edge Functions/external worker)
