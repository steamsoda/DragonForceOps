# Director Read-Only Access

Status: also deployed to production on September 14 in release 1.17.69.
See `2026-09-14-production-auth-release.md` for current evidence and remaining
verification. No real accounts granted this role during deployment. The
Preview-only scope and gates below describe the earlier implementation checkpoint.

## Preview Deployment

- Stable URL: https://dragon-force-ops-git-preview-steamsodas-projects.vercel.app
- Deployment: `dpl_Bk8XwMUso86umU9N43pXE3xedHbH`, Ready.
- Immutable URL: https://dragon-force-dh8ul14x4-steamsodas-projects.vercel.app
- Isolated source SHA-256: `7cd2cc74de4f745a94c5315ff5bbaf26c4f13ae80a4cdb3ae2ee1cb70dbf4de7`; 79 explicit overlays, 410 manifest files, no source drift after deployment.
- Previous Preview email-auth flags preserved; new `DIRECTOR_READONLY_ENABLED=true` supplied at build/runtime. No persistent production configuration changed.
- Cloud build and TypeScript passed. The isolated local build could not fetch Google Fonts under restricted networking; cloud success supersedes that build blocker, not its log.
- Migration `20260914160000` installed only in Preview with exact history checksum; fresh and installed-state rehearsals each passed 857 checks. Details: `director-readonly-database-install.md`.
- Authenticated hosted checks passed 22 normal pages and 20 detail pages (HTML and RSC), grouped-roster API, financial/raw-data denial, rejected POST/Next-Action requests, and actual PostgREST mutation denial on an owner-verified absent test target.
- All detail resources covered: players, teams, tournaments, callups, attendance sessions, nutrition player history and reports. Team IDs were discovered via an authenticated safe view.
- Desktop Players and hosted mobile tournament layouts visually inspected. Mobile viewport/content width both 390px; zero financial/admin links in the inspected page. Only hosted console issue observed was the existing missing favicon.
- Temporary identity was admin-provisioned without sending email. This does not verify email delivery, CAPTCHA or password recovery.
- Revocation passed against the same unrefreshed, still-authenticated JWT: safe data, raw financial access and protected HTTP requests denied. The existing browser session was redirected from Players to `/unauthorized`.
- Guarded cleanup confirmed deletion of only the synthetic account and its two local state files. Test browser and local validation server closed; no real user role changed.
- Local SSR stress probes emitted Gzip listener-count and chart-dimension warnings without failed responses. These were not diagnosed as regressions; chart visual coverage was not exhaustive and this was not a load test.

## Agreed Scope

- Normal Director navigation and operational screens, using actual application data.
- No academy mutations, financial information, collections queues, administration, permissions, diagnostics or repair tools.
- Player/guardian identity and contact information remain visible as explicitly authorized by the owner.
- Sporting participation, team membership, roster counts and the label Inscrito are permitted operational facts. Payment provenance and financial fields are not.
- Existing `porto_viewer` stays separate. Do not grant Director Admin as a shortcut or combine a reader with staff roles.

## Enforcement

- New role: `director_readonly`. Existing writer helpers and role arrays are not broadened.
- Read-only overrides conflicting writer flags. Database assignments require a verified, unbanned identity, global scope and no conflicting role.
- The authenticated database predicate is checked before the actor's application context is accepted. Role and email revocation deny subsequent reads.
- Normal routes are explicitly reviewed and allowlisted in `director-readonly-policy.ts`; financial/admin routes and unreviewed APIs/exports default to denial.
- Academy POST/PUT/PATCH/DELETE requests are blocked independently of UI controls, including requests targeting asset-like paths. Only exact authentication and logout endpoints are exempt; these retain their own origin and identity checks.
- Safe barrier views expose selected operational columns, not raw enrollment/coaching financial columns. Database protections deny raw-table reads/writes and legacy financial RPCs for this role.
- Some competition membership calculations still use existing private server-side financial logic to preserve the ordinary board's membership rules. Only an explicit sporting projection leaves that function. This is not a grant of financial access.
- Freeform notes that may contain financial narratives are omitted, not regex-redacted. Existing staff behavior is retained.
- Workload and frequency wrappers reuse historical calculations and sanitize coach snapshot JSON.

## Screen Workstreams

- Players, grouped roster, contacts and attendance: `director-readonly-screen-audit.md`.
- Attendance sessions/calendar/groups/schedules and reports: `director-readonly-operational-audit.md`.
- Nutrition and measurement history: `director-readonly-nutrition-audit.md`.
- Caja inspection, intake, contact cleanup, operational dashboard, trials and uniforms: `director-readonly-management-audit.md`.
- Tournament registrations, teams and weekly callups: `director-readonly-competition-audit.md`.

Collections screens remain excluded because membership in the debt queue is itself financial information. Financial exports, receipt printing, settings, and mutation forms are not available to this role. Normal auth recovery and sign-out remain available.

## Verification So Far

- Final full build and TypeScript passed after the component changes. Central auth tests and the built production email-auth gate passed again; whitespace checks passed.
- Permission, mixed-role veto, request firewall, safe-campus bootstrap and password-auth tests passed.
- Player, management, nutrition and attendance tests passed populated fixtures, pagination, omitted-finance payloads and staff-path regressions. Synthetic player browser checks are not authenticated end-to-end evidence.
- Final database rehearsal reported 857 checks, fully rolled back: 38 views, 76 raw tables, 30 legacy definer signatures, role lifecycle, and report parity for 296 workload/7 frequency rows. Revoked and fresh unassigned identities each passed 119 denial checks. A legacy app_settings revocation gap was fixed by requiring an assigned role for raw reads and legacy RPCs. Forty-five staff comparisons matched. Receipt and player-list timing remained near baseline.
- Storage audit found no buckets, objects or policies; RLS is enabled. No storage changes made.
- Preview API schema probe confirmed `public` and `graphql_public` are exposed, but the GraphQL extension is absent. Disabled-engine responses were verified; enabled-GraphQL authorization remains unproven and requires testing before deployment to an environment where it is active.
- Live canonical tournament comparison passed all eight registration combinations, 67 squads, 20 reports and seven games. The initial HTTP header-size error was resolved with bounded UUID batches and paginated reads; no header-limit override was used.
- Synthetic competition components were checked in a browser, including team cards, normal weekly control cards/matrix and mobile containment. This is visual fixture evidence, not authenticated end-to-end evidence. The temporary fixture server and browser tab were closed.

## Release Gate

`DIRECTOR_READONLY_ENABLED=true` is accepted only in Preview or local development. Production is hard-disabled in the current implementation. Neither the flag nor a menu item alone makes the role ready.

Required before Preview activation:

1. Latest rollback rehearsal and normal-screen integration completed. Confirm the target's GraphQL state; test authorization if the extension is active.
2. Owner approved Preview installation and a temporary test identity on September 14. Production and real-user role changes remain out of scope.
3. Exact verified migration applied transactionally in Preview, with migration history and installed-state checks.
4. Authenticated reader navigation/data, GET/RSC/API, forbidden writes/financial access, and desktop/mobile checks passed. Session revocation verified on hosted Preview.
5. Staff regression checks preserved; temporary account and session files removed after tests.

Production requires separate approval, drift review/rehearsal, explicit production enablement and a controlled deployment. Do not deploy the entire dirty workspace or accidentally include unrelated work. Preserve existing Preview email-auth configuration when building any isolated release snapshot.

## Repeatable Checks

Run `npm run test:director-readonly-auth` for the central boundary suite. The new GitHub workflow also runs page/data projection tests without database secrets. This is not a substitute for the guarded Preview rollback script, `scripts/test-director-readonly-db.cjs`, or authenticated browser checks.

Future tables, views, security-definer functions, exports and service-client loaders must be re-audited before release. Do not treat the current review as blanket approval for future endpoints.
