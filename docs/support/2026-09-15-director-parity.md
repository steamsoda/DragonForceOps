# Director Read-Only: Interface Parity

## Approved Contract

- Reuse Director pages, navigation, panels, tables, and workflows.
- Show individual account amounts, prices, debt, credit, payments, and payment status.
- Conceal consolidated business amounts with an em dash in the same layout.
- Do not serialize restricted amounts, chart series, deltas, or export data to the browser.
- Keep local exploration enabled. Disable actual writes, including implicit writes on reads.
- Preserve backend and database write vetoes. Do not promote the role to Director.
- Superadmin tools remain excluded. Jugadores performance is a separate subsequent pass.
- Preview review precedes a separately approved production release.

## Initial Audit Findings (Historical Base State)

The base is main commit bba7d54, in an isolated worktree. The original dirty
checkout is untouched. This is not a production deployment checkpoint.

1. Caja substitutes `NonfinancialCaja` for `CajaClient`.
2. Player profiles substitute a restricted loader and omit several normal sections.
3. Panel substitutes a four-card screen for the normal Director dashboard.
4. Layout has a separate read-only navigation list filtered through reviewed routes.
5. The proxy rejects all non-authentication POSTs. Normal Caja uses POST-based
   server actions for reads as well as writes. Enabling the original UI alone
   would leave search and account loading broken.
6. Opening a normal Caja account may call `auto_apply_enrollment_credit_fifo`
   using the admin client. This side effect must never run for the viewer.
7. Database RLS blocks raw business tables and legacy RPCs for this role. Do not
   loosen this wholesale to make ordinary loaders work.
8. Read-only branches also exist in attendance, sports, nutrition, enrollment,
   calls, trials, uniforms, and other operational pages. Full parity is not yet done.

## Implemented Locally

- Separate presentation capabilities for individual versus consolidated finances;
  existing authorization flags and database permissions are unchanged.
- Shared read-only context and an opt-in disabled persistence button. This is a
  UI affordance only, not a security boundary or a blanket interception mechanism.
- Explicit deny-first guard for automatic credit application in Caja, including
  mixed-role and debug-read-only cases.
- One `DashboardView` for Director and read-only Panel. Explicit projection
  nulls financial totals and series before rendering. Restricted charts retain
  their panels without exposing data or pretending the total is zero.
- Read-only monthly attendance participation assembled from existing authenticated
  barrier views, deduplicating active players and completed-session attendance.

## Remaining Before Preview

- Implementation is complete locally, including payment/debt counts on Panel.
- Separate final security sweep: authenticated HTTP/browser review, desktop/mobile
  comparison, staff regression, session revocation, write denial and export/data
  leakage checks. Local tests are not a substitute for hosted release validation.
- After review and approval: apply the five pending reader migrations to Preview,
  deploy Preview, and verify the hosted build. No production release authorized.

## Final Implementation and Validation

### Security Sweep Retry Results

- Authenticated local production-build HTML/RSC reads now pass all 15 sampled
  screens. Pendientes and Llamadas exposed oversized 500-UUID query batches.
  Reduced their helper batches to 100; rebuild/TypeScript and local regressions
  pass, including the authenticated rerun of both repaired pages.
- Restricted admin/financial/signing routes denied; 28 forged POST/PUT/PATCH/DELETE
  and Next-Action requests returned 403 with the real synthetic reader session.
- Preview real-role migration/ledger/count/write-denial rollback test passed again.
- Real browser settings form retains editable fields and disabled save buttons.
  Enter did not submit an app request; mobile 390x844 has no horizontal overflow.
- Same unrefreshed JWT remains authenticated but loses database and HTTP access
  immediately after removing the test role. Revocation passed.
- Both temporary Preview identities used during the retries were deleted; their
  saved session files removed. Test browser/server closed. No production changes.
- Hosted migration-dependent routes still require release-time checks after
  applying the five reviewed migrations to Preview. Staff behavior has unit/DB
  coverage, not a new staff browser comparison in this sweep. Full visual parity,
  hosted export payload review and production release are not signed off here.
- Approval-service capacity errors resolved on retry. Await Preview deployment
  approval; perform the remaining hosted checks before production promotion.

### Implementation Summary

- Normal operational screens restored for sports, weekly callups, teams, trials,
  uniforms, contacts, nutrition and reviewed Director product/settings pages.
- Monthly/weekly/Porto/dashboard use counts-only readers. Daily reports and product
  reports explicitly remove consolidated monetary fields before serialization.
  Individual ledger rows and prices remain visible. Product reads are paginated.
- Added migrations 20260915180000, 20260915190000 and 20260915200000 for report
  counts, Porto counts and scoped product ledgers, alongside earlier local
  20260915160000 Caja and 20260915170000 receipt readers.
- Full Next production build and TypeScript passed. Focused policy, parity,
  catalog, sports, callup, attendance and trials regressions passed.
- All five migrations tested in a Preview transaction with temporary real-role
  users: canonical Director parity, counts/ledger scope, raw-table/write denial
  and revocation passed. Transaction rolled back; no persistent changes.
- Final hosted authenticated UI/security sweep remains pending. Nothing deployed.

## Second Chunk: Canonical Account Read Path

Implemented locally, not deployed:

- GET `/api/director-readonly/account?enrollmentId=<uuid>` returns one canonical
  enrollment ledger. Unknown/duplicate query parameters are rejected. Responses
  are private/no-store, errors are generic, and no POST handler exists.
- Before privileged SELECTs, the reader checks the release gate, actual-session
  `is_director_readonly()` RPC (verification, ban, mixed roles, revocation), the
  authenticated enrollment barrier view, and the accessible campus list.
- The internal reader exposes only SELECT for the canonical ledger's explicit
  relation list, not an admin RPC/write client. Browser raw-table access stays denied.
- `getEnrollmentLedger` reuses the same calculations as staff. Read-only loads
  force strict read errors, so a failed balance query cannot become a zero balance.
- No changes to `hasOperationalAccess`, Director identity, or database grants.
- Focused tests cover authorization before admin creation, scope/revocation,
  HTTP validation/cache/errors, and equal Director/read-only ledger outputs for
  credit-funded tuition. TypeScript and existing read-only auth tests pass.

This backend preparation is now consumed by the Caja chunk below.

## Third Chunk: Normal Caja Interface

Implemented locally, not deployed:

- Caja now reuses CajaClient, with the same catalog eligibility/pricing, cart,
  account status and individual financial details. Staff keep existing read actions.
- Reader search, campus/year drilldown, account and catalog use a strict GET-only
  endpoint with private/no-store responses, real-session role checks and enrollment
  scope validation before privileged reads. Failed reads do not become paid accounts.
- The migration adds role-checked discovery RPCs only; no raw financial table grants.
  Search returns eight matches; cohort results fail closed at the 1,000-row safety
  cap rather than silently presenting a truncated roster.
- Local forms remain interactive, but all seven persistent submit controls are
  disabled and eight write handlers return immediately in read-only mode.
  Automatic credit application remains vetoed. Proxy/database restrictions remain.
- Preview DB transaction test passed staff/reader cohort parity, YOB search, invalid
  filters, raw-payment denial, write denial and revocation. All test DDL and fixtures
  rolled back; no real accounts changed.
- GET transport/API and existing catalog/credit-funded checkout assertions passed.
- Actual CajaClient tested with synthetic data at 1440x1000 and 375x812: search,
  account load, cart preparation and completed cancellation confirmation leave final
  actions disabled. No horizontal overflow. Temporary visual fixture removed.
- Hosted authenticated HTTP/UI verification remains pending. Caja links into new
  enrollment, account history and session/closing pages still follow existing route
  restrictions; those screens require the remaining parity/navigation chunks.

## Fourth Chunk: Shared Player Profile

Implemented locally, not deployed:

- Normal `getPlayerDetail` now serves the reader through a player-scoped SELECT
  facade. It validates UUID, release gate, current verified role and authenticated
  enrollment scope before creating the privileged client. Enrollment filters are
  enforced inside the facade; raw browser grants remain unchanged.
- The same profile layout now shows canonical account details, guardian contact,
  medical/operational notes, plan, training group, squads, history and uniforms.
  Missing/failed balance reads fail closed rather than displaying a paid account.
- Charge/payment/incident/note submission controls use the shared read-only button.
  Uniform updates have disabled buttons and handler guards. Note creation now has
  an explicit action-level read-only veto, in addition to proxy denial.
- Superadmin diagnostic/repair tools remain excluded. Separate editing routes are
  not enabled yet: their profile links remain visible but disabled. Dedicated account
  history and other restricted navigation still need the next route-review chunk.
- Tests passed canonical staff/reader fixture equality, failed reads, scope,
  revocation, direct note-write denial and rendered disabled controls with local
  textarea/select controls retained. Existing auth/account/Caja tests remain green.
- Preview rollback test checked the actual enrollment barrier before/after role
  revocation and uniform write denial. No durable data changes or grants.
- Full authenticated browser comparison of the profile remains pending in Preview;
  rendered component tests are not a substitute for that release check.

## Verification So Far

### Tenth Chunk: Attendance Controls and Operational Notes

- Shared session recorder replaces the reduced roster; local attendance choices
  and notes stay interactive. Save is disabled and form submission/client handler
  denied. Standard cancellation, generation, manual session, closure and schedule
  forms are visible with disabled final actions.
- Actual verified reader gate runs before attendance scope and freeform reads.
  Notes/incident context are now approved operational data; no finance permissions
  or raw database grants were widened by this chunk.
- Explicit reader veto protects the separate attendance-save authorization path
  even with a Director role alongside it. Schedule, generation, closure and
  cancellation actions also reject readers before creating a writer.
- `test-director-attendance-parity.cjs` passes direct mutation denial, mixed-role
  denial, revocation before reads, rendered recorder fields and GET-only notes.
  Existing auth, group-finance/operational-notes, pagination and presentation
  checks pass. TypeScript passes. No browser comparison completed this chunk.
- No deployments or lasting database writes. Sports/trials/uniforms, attendance
  group finance/weekly packet, financial reports and Director settings remain.

### Eighth and Ninth Chunks: Intake and Remaining Caja Workflows

- Shared intake/manual-return forms and existing-player reenrollment pages opened
  as GET-only views. Searches use `/api/director-readonly/intake`, gated by enabled
  feature and current verified role, with bounded parameters and no-store responses.
- Existing-player context uses the scoped player facade. Historical credit and
  debt are read without reconciliation; the enrollment write boundary rejects the
  reader before any data access, credit application, enrollment or group assignment.
- Shared session page reads only ID/campus/opened timestamp for readers, never
  underlying cash figures. Shared open/close forms remain explorable but cannot save.
- Added `director_search_receipts`: exact normal individual receipt mapping with
  current verified role and active-campus restriction. No financial-table grants.
  Search/filters/pagination use the normal screen; printing is visibly disabled
  and blocked in handlers, automatic print effect and receipt-print server action.
- 360Player selection/confirmation and standalone charge product selection now use
  normal screens. Individual prices remain visible, consolidated totals concealed,
  final posting blocked by shared controls and explicit action guards.
- Focused `test-director-intake-caja.cjs` passed. Existing account/profile/Caja/
  forms/bajas/calls/auth suites passed. Final TypeScript check passed after cleanup.
  Preview transactional test installed both local read RPC
  migrations and proved receipt equality, pagination, scope and revocation, then
  rolled everything back. No permanent DB changes or deployment.
- Visual browser fixture did not complete: browser blocked the URL and Turbopack
  could not resolve Next from parent node_modules. Temporary fixture removed;
  server stopped. Authenticated hosted UI verification remains a release gate.

### Seventh Chunk: Bajas Write-Off Screen

- Shared Director layout now available at GET `/pending/bajas`. Admission keeps
  the ordinary Director-only boundary for staff and verifies actual reader role
  and release gate before privileged reads. Front Desk is not newly admitted.
- Enrollment queries are campus-scoped and paged with stable ordering. Balance
  and charge reads are restricted to admitted enrollment IDs, chunked and paged
  where needed. Query failures throw; existing amount semantics are preserved.
- Individual amounts remain visible. Combined page and selection money totals
  are not calculated for the reader and render as an em dash. Counts stay visible.
- Selection and reason fields remain usable; ReadOnlyForm intercepts Enter,
  WriteButton disables submission, client action returns and the direct server
  action rejects the reader before creating a writer.
- `test-director-bajas.cjs` covers admission/role-verification failure, staff-only
  access, scoping, multi-page fixtures, staff equality, query failure, rendered
  controls/masking and direct action rejection. TypeScript and existing auth,
  edit-form and calls tests passed. No live DB writes or deployment. Hosted
  authenticated browser checks remain pending before release.

### Sixth Chunk: Pendientes and Llamadas

- Shared queue/detail pages are GET-only for the reader. The common queue loader
  calls the verified-role page gate before admin access, and derives all subsequent
  enrollment/player reads from the allowed campus scope. Existing staff financial
  admission on Llamadas is retained. No global permission flags were changed.
- Individual balances/contact data use the normal Llamadas mapping; the boards
  contain counts rather than consolidated currency totals. Pendientes workbook
  export contains categories/players/pending months, not monetary totals.
- Local status/date edits do not autosave for the reader. Follow-up, injury and
  dropout final buttons are disabled; each handler also returns before invoking
  a server action. All three actions explicitly reject the reader.
- `scripts/test-director-calls.cjs` covers direct action denial, local handlers,
  staff autosave, admission before admin, campus scope and GET-only policy.
- TypeScript passed. Hosted authenticated browser QA remains pending. Separate
  `/pending/bajas` bulk write-off screen remains closed. No database writes or
  deployment in this chunk.

### Fifth Chunk: Editing Forms and Navigation Audit

- Enabled GET-only player/guardian edits, enrollment edit/dropout and dedicated
  account pages. Shared forms preserve fields and options; saves are disabled and
  Enter submission is intercepted. Server actions explicitly reject the reader.
- Guardian data comes only from guardians linked to the checked player. Enrollment
  edit/dropout loaders check the URL player/enrollment relationship, real reader
  admission and campus scope; failed reads never become a zero pending balance.
- Dedicated account pages reuse the canonical ledger and disabled financial
  controls. Superadmin diagnostic/repair tools remain excluded.
- Desktop/mobile navigation now retains Director section/item ordering instead
  of removing denied items. Unreviewed destinations remain disabled, not granted.
  No Super Admin section is added. This is interim navigation, not full parity.
- Synthetic browser checks exercised guardian editing, Enter, scholarship options
  and disabled saves at desktop/mobile widths. Fixed shared dark-mode contrast in
  scholarship/baja panels. Temporary test route removed and test server stopped.
- Remaining route work: new inscription/reingreso, Caja session, 360Player posting,
  Pendientes/Bajas, Llamadas, attendance notes, receipts, consolidated financial
  reports and Director Admin pages. Some already-open operational screens also
  still use reduced reader branches. Full parity and hosted authentication QA
  are not complete; do not deploy this as a finished release.
- Focused tests cover direct action denial, staff/reader loader parity, URL scope,
  failed reads, rendered forms, Enter interception and exact GET/write route policy.

- TypeScript no-emit check passed.
- `scripts/test-director-parity.cjs`: presentation policy, mixed-role veto,
  credit-on-open veto, disabled buttons, safe projection, restricted charts/trends.
- Existing Director read-only auth suite passed, including proxy, permissions,
  campus projections, and mutation blocking.
- Dashboard attendance participation regression passed.
- No durable database changes, user grants, real account changes, or deployments.
