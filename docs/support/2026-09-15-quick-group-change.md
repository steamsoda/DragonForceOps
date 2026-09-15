# Quick Training Group Changes

Release revision: after Preview approval, the user requested Jugadores only.
The Caja integration was removed completely before production release. Staff use
the Jugadores search or player-row action; Caja remains unchanged.

Implementation branch: `codex/quick-group-change`, isolated from the dirty working tree.
No production or permanent Preview data/schema changes made during implementation.

## Scope

- Shared Cambiar grupo panel in Caja's selected-player panel and Jugadores grouped,
  active-table, and active-mobile views. Jugadores also has a campus-scoped search.
- Field Admin has a nonfinancial Jugadores search via its existing campus roles;
  existing broader roster APIs and Caja access remain unchanged for that role.
- All active destination categories are available, including out-of-year choices.
  Moving between campuses is deliberately not an enrollment-transfer operation:
  only destinations in the selected enrollment's campus can be chosen.
- Explicit review and confirmation; no dragging, bulk move, or implicit override.
- Lazy-load choices on opening, debounce search, ignore stale search responses.
- Current assignment ID is checked under an enrollment lock. Assignment/history and
  audit writes are atomic; same-day return visits reopen the matching historical row.
- Existing assignment-date semantics remain inclusive; no attendance records are rewritten.
- Existing tournament reconciliation is retained behind a wrapper. Manual/Invitado
  placements survive this workflow while automatic memberships follow existing rules.
- Existing Editar grupos bulk controls are retained. Their destination list now also
  uses all active campus groups, independent of the visible year/gender sections.

## Verification

- Preview rollback rehearsal: 20 assertions (Field Admin, Front Desk, readonly/anonymous
  role denial, cross-campus, out-of-year, stale assignment, repeated same-day moves,
  inactive destination, audit rollback, finance counts, manual/Invitado preservation).
- UI/action contract tests and TypeScript validation.
- Synthetic browser check: open, choose 2014 for a 2015 player, review, confirm,
  success, focus returns to opener. Desktop screenshot inspected. At 375px width,
  dialog spans x=16..359, width=343; document scroll width=375 (no horizontal overflow).
- Temporary synthetic public UI route removed before the release build.

## Pending Release

Requires `20260915120000_quick_training_group_change.sql` in Preview before real
browser save testing. Production release remains a separate approval step.
No real players were moved. Do not ship temporary development logs or generated files.
