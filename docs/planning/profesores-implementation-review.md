# Profesores implementation review

Reference: INV-PLAN-002A r1. Reviewed 2026-09-22.

Status: user approved Preview release. Local implementation/security checks
completed. Preview migration installed transactionally after schema baseline and
exact pending-migration verification. Hosted smoke checks pending deployment.
No existing coach/account changed; production remains untouched.
The handed-off planning document remains unchanged. Tickets and the
Grupos y horarios feature are outside this implementation scope.

## Findings and proposals

- The released implementation worktree is `.tmp/copa-tigres`. Preserve its
  existing documentation/test changes and user-owned CLAUDE.md changes.
- Existing assignment management is director/sports-director scoped; retain
  these checks and campus boundaries. Propose Superadmin-only coach lifecycle
  changes, consistent with current account-linking authority.
- Coaches have a nullable campus_id. Use it as the explicit home campus for
  groupless coaches; show missing campus as unassigned rather than infer one.
  Derive additional directory appearances from actual group campuses without
  duplicating coach identities or broadening write permissions.
- Existing group assignment replacement deletes then inserts without checking
  results. Replace with an atomic, stale-edit-aware operation preserving other
  coaches and primary designation. Validate every affected group and coach.
- Group times and attendance templates are separate sources. Display existing
  times and flag discrepancies; do not edit or normalize schedules in 002A.
- Propose immediate assignment changes with before/after audit timestamps.
  Inspect attendance/report attribution and generated sessions before coding;
  do not assume current links provide historical attribution.
- Tournament coach assignments are distinct. Show unresolved responsibilities
  during departure without silently transferring or deleting them.
- Inactive coach lookup only removes coachId in the inspected permission path;
  other roles still confer permissions. Account departure therefore requires
  persistent account-level denial enforced by server and database access paths,
  plus provider session/refresh revocation. Provider failure must remain visible
  and retryable while the local deny remains effective.
- Review preauthorization, role grants, relinking, reactivation, authenticated
  storage/RPC paths, and self/protected-account lockout protections. Do not rely
  on hiding UI or provider sign-out alone to invalidate issued credentials.

## Implementation sequence after approval

1. Read-only live discrepancy inventory with verified environment; map all
   permission and historical-attribution consumers. Report conflicts; no repair.
2. Transactional assignment/lifecycle backend and account-denial coverage with
   synthetic stale-write, rollback, multi-role, and existing-session tests.
3. Campus-grouped directory and side panels, with visible unassigned groups,
   groupless coaches, and departure impact confirmation.
4. Role/campus, history, tournament, mobile, and performance checks against
   P01-P14. Preview and production remain separately authorized release gates.

## Remaining review gates

- Live browser/auth-provider tests now have Preview release approval and use
  temporary test accounts. SQL checks simulate an existing authenticated JWT
  identity; they are not proof of hosted provider-session revocation.
- User amendment on 2026-09-22 supersedes r1's inheritance restriction: active
  inherited tournament squads follow the new training-group coaches. Review
  shows before/after responsibility and unstaffed teams. Manual assignments and
  the organizer's existing combined-team manual default remain unchanged.
  Stale tournament mode/source/coaching snapshots reject the whole save; audit
  contains the complete batch's before/after impact. No copied squad coaches.
- Security/deployment review remains necessary before installing the migration:
  it adds account-block checks to existing public definer functions and raw RLS
  policies (including storage objects). New application auth checks fail closed
  until that migration is installed, so migration must precede application release.

## Implementation evidence

- Production read-only transaction: 14 active coaches, 8 linked accounts, 50
  training-group links; no duplicate account links, missing home campuses,
  cross-campus links, inactive assigned coaches, multiple primary coaches, or
  active unstaffed groups. One linked account has another role. Current active
  templates match group times and use only Monday-Wednesday.
- New `/profesores` directory, campus-first sections containing coach-first rows,
  native modal side panel, search/status filters, explicit review, creation/edit,
  assignment/replacement, guarded departure, and provider-block retry controls.
- Assignment and departure changes are transactionally audited, stale-edit
  checked, and campus/role checked. Other co-coaches and historical facts remain.
  Past attendance snapshots are frozen on assignment changes so late completion
  cannot attribute an earlier session to the new coach. No schedule times edited.
- Account denial is persistent and applies to existing JWT database access,
  server context, proxy, legacy definer RPCs, and storage-object policies. Role
  rows and identities remain; no reactivation/regrant shortcut is provided.
- Provider banning is attempted only after local denial commits. Failure or an
  unrecorded result stays visibly pending. Provider behavior tested with mocks,
  not with a real account. Reference: Supabase Auth admin updateUserById and
  session documentation: https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid
  and https://supabase.com/docs/guides/auth/sessions.
- Validation: 57 rollback-only coach database checks; 111 existing checkout and
  operation-receipt database checks with the new migration, all rolled back;
  11 mocked server-action checks; 19 desktop/mobile browser fixture checks;
  7 pure combined-team inheritance checks;
  shared proxy boundary regression; full webpack build with TypeScript enabled.
- Browser fixtures never connect to QZ or hosted services. Visual snapshots in
  `.tmp/coaches-ui`. A mobile panel margin overflow was detected and corrected.
- Build hit the known stale incremental TypeScript cache OOM; removing only
  `.next/cache/.tsbuildinfo` produced a successful full build. No checks disabled.
