# Competitions, Signups, And Roster Builder Plan

Date: 2026-04-28
Status: planning / audit

## Purpose

This document defines the next sports competition planning pass.

The current live `Inscripciones Torneos` board is useful but intentionally thin: it mainly shows players who have paid a competition/tournament product. That helped front desk and directors during live operations, but it is not enough for the long-term competition workflow.

The next model should separate:

1. training groups
2. competition invitations / signups
3. competition teams / rosters

This keeps attendance and daily groups clean while giving Director Deportivo the roster-building workflow they actually need.

## Three-Layer Sports Model

### 1. Training Groups

Training groups answer:

- Who trains together year-round?
- Which campus/program/category/subgroup does the player belong to?
- Who should be invited to a competition?

Source:

- `training_groups`
- `training_group_assignments`

Training groups are the best starting point for tournament invitations because operations usually invites an entire category/program/group.

Example:

- Invite `2014 Linda Vista Futbol Para Todos B1`
- Invite `2014 Linda Vista Selectivo`
- Invite `2014/2015 Contry FPT B2 Femenil`

Important: inviting a group does not mean every player becomes part of the final tournament roster. It only defines the eligible/invited pool.

### 2. Competition Signups

Competition signups answer:

- Which invited players are eligible for this competition?
- Who has paid or otherwise been confirmed?
- Who is pending, invited, excluded, or manually added?

Current compatibility input:

- paid product charge / allocation detection from `Inscripciones Torneos`

Future source of truth should be a competition signup/entry state, not raw charges alone.

Payment detection remains valuable:

- front desk can still use paid/unpaid views
- admin can reconcile against Caja/product charges
- Director Deportivo can see confirmed candidates without seeing money amounts

But product payment should be one signal that updates signup state, not the only model.

### 3. Competition Teams

Competition teams answer:

- Which signed-up players are assigned to `Dragon Force Azul`, `Dragon Force Blanco`, etc.?
- Which roster is approved/final?
- Which players are still unassigned?

This is the Trello-style roster builder layer.

Input:

- confirmed / paid / invited players from the signup layer

Output:

- final roster columns/teams for the tournament

Training groups should remain context/filtering only. A competition team should not be the same object as a training group because:

- one training group can split into multiple tournament teams
- not every training-group player signs up
- Selectivo usually maps closely to a competition team, but exceptions still happen
- tournament-specific roster names can differ from training group names

## Current App Audit

### Live / Useful Surface

`/sports-signups` (`Inscripciones Torneos`)

Current strengths:

- works with real front desk behavior
- product/payment driven
- category-first and easy to scan
- no money amounts shown to sports users
- useful CSV/export path exists for reconciliation

Current limitations:

- raw product list can include players who should never be eligible
- paid/unpaid is inferred from charges instead of a dedicated competition invitation/signup state
- does not help directors assemble actual tournament teams
- cannot yet model group invitations cleanly
- cannot distinguish "not invited" from "unpaid"

Examples of eligibility problems:

- older girls should not appear for Superliga Regia if they do not play that competition
- male players should not appear for Rosa Power Cup
- product boards should not show every active player as unpaid when the player was never invited/eligible

### Hidden / WIP Surface

`/tournaments`

Existing objects found in migrations and queries:

- `tournaments`
- `tournament_player_entries`
- `tournament_source_teams`
- `tournament_squads`
- `teams`
- `team_assignments`

Useful existing ideas:

- tournament links to product
- tournament has campus, gender, date/deadline, eligible YOB range
- entries can be `confirmed` or `interested`
- source teams and squads already point toward roster planning
- source/team participation can be `competitive` or `invited`
- roster status can be `planning` or `approved`

Main mismatch:

- WIP tournament source teams are based on `teams`, while the new operating model says invitations should usually start from `training_groups`.

Recommendation:

- do not delete the hidden WIP tournament stack
- treat it as a discovery branch
- adapt the best ideas into the new training-group invitation and roster-builder flow

## Eligibility And Invitation Rules

The permanent model should avoid showing irrelevant unpaid players.

A player should appear in a competition board only if they are in the invited/eligible pool.

Possible eligibility inputs:

- competition campus
- competition gender
- eligible YOB range
- invited training groups
- product restrictions by training group
- manual inclusion/exclusion

Recommended v1 logic:

1. Competition defines basic scope:
   - campus
   - gender
   - YOB min/max
   - product

2. Competition chooses invited training groups:
   - one or more `training_groups`
   - this creates the candidate pool

3. Player appears as:
   - `Invitado / pendiente` if eligible but not paid/confirmed
   - `Confirmado` if paid or manually confirmed
   - `No invitado` should not appear in the normal board

4. Manual states can handle exceptions:
   - invited without payment
   - scholarship/covered
   - staff override
   - excluded

This keeps front desk/product usefulness while making the board operationally correct.

## Trello-Style Roster Builder

### User

Primary:

- `director_deportivo`
- `director_admin`
- `superadmin`

Front desk:

- likely read-only or no access to roster builder
- front desk continues to use `Inscripciones Torneos` / payment-oriented view

### Board Structure

Recommended page:

```text
Competencias > Armar equipos
```

For one competition/category:

- left side: available confirmed players
- right side: roster columns
  - `Dragon Force Azul`
  - `Dragon Force Blanco`
  - optional additional teams
- drag cards from available into team columns
- drag between teams
- remove from team back to available

### Player Card Fields

Sports-safe only:

- player name
- public player ID
- category/YOB
- campus
- training group
- program
- subgrupo if FPT
- gender
- signup status chip
- optional sports note later

Do not show:

- money amounts
- payment methods
- receipts
- guardian contact
- finance status beyond safe chips

### Roster Save Model

Roster builder should persist assignments to tournament-specific roster objects.

Existing WIP candidate:

- `tournament_squads`

Possible future naming if we simplify:

- `competition_teams`
- `competition_team_players`

Recommendation for next audit:

- inspect whether `tournament_squads` can be safely reused as competition team columns
- if it is too coupled to old `teams`, add a cleaner additive layer rather than forcing it

## Product / Payment Compatibility

Paid product detection stays useful, but should become compatibility input.

Recommended approach:

- keep current charge/allocation recognition for `confirmed` status
- create or update signup entries from paid product data
- never use payment rows directly as the only source for team-building

This allows:

- front desk sees paid/unpaid operationally
- directors build rosters from confirmed players
- admin can reconcile product charges
- future parent app or Stripe integration can update signup states cleanly

## Product Filtering Improvements

Current product boards can show irrelevant unpaid players. That should be fixed with invitation/eligibility filters.

Examples:

- Rosa Power Cup:
  - female only
  - male players should not appear as unpaid

- Superliga Regia:
  - no older girls if that competition does not apply to them
  - should invite only selected groups/categories

Potential sources:

- `products` restricted to training groups
- tournament product link
- competition invited groups
- explicit gender/YOB rules

Recommendation:

- product setup alone should not carry all competition semantics
- competition setup should define invite/eligibility scope
- product can remain the payment object linked to the competition

## Proposed Navigation

### Short Term

Keep:

- `Competencias > Inscripciones Torneos`

Add later:

- `Competencias > Armar equipos`

Keep hidden until cleaned:

- old/heavier `/tournaments`
- old `Equipos` surfaces that imply competition management before the model is ready

### Long Term

Recommended sports menu:

- `Inscripciones`
  - signup/payment status, front desk friendly
- `Armar equipos`
  - roster builder for directors
- `Equipos`
  - finalized competition teams
- `Torneos`
  - competition setup/configuration

## Proposed Data Direction

### Keep Existing For Now

- `tournaments`
- `tournament_player_entries`
- `tournament_source_teams`
- `tournament_squads`
- `teams`
- `team_assignments`

### Add Or Adapt Later

Possible additive table:

```sql
tournament_invited_training_groups
  id uuid primary key
  tournament_id uuid not null
  training_group_id uuid not null
  created_at timestamptz
  unique(tournament_id, training_group_id)
```

Possible signup-state expansion:

```text
invited
confirmed
interested
excluded
waitlisted
```

Current `confirmed` and `interested` already exist in `tournament_player_entries`; confirm if this can be extended safely.

Possible roster layer if `tournament_squads` is too constrained:

```sql
competition_roster_teams
competition_roster_players
```

Do not decide this until the WIP tournament stack is audited more deeply.

## Implementation Stages

### Stage 1 — Documentation And Audit

- document three-layer model
- audit current tournament tables, queries, routes, and hidden surfaces
- identify what to reuse vs bypass

### Stage 2 — Eligibility / Invitation Cleanup

- add invited training groups to competition setup
- make signup boards show only invited/eligible players
- keep paid product detection as confirmed-status input

### Stage 3 — Roster Builder V1

- build category/group-scoped board
- available confirmed players on one side
- team columns on the other side
- save roster assignments
- no finance/contact exposure

### Stage 4 — Tournament Surface Cleanup

- decide whether `/tournaments` becomes the official configuration surface or gets rebuilt
- retire or hide confusing WIP screens
- align `Equipos` copy with competition-team meaning only

### Stage 5 — Product Rules Cleanup

- ensure product restrictions, competition eligibility, and signup boards agree
- avoid irrelevant unpaid players
- clarify product KPIs so charged/paid/signup counts are not confused

## Open Questions

1. Should front desk see all invited unpaid players, or only players with a created charge?
2. Should directors be able to manually mark a player as invited/confirmed without payment?
3. Should roster builder allow players from outside invited groups as `refuerzo`?
4. Should `Dragon Force Azul/Blanco` be manually named every tournament, or generated by default?
5. Should Selectivo tournaments auto-seed one default team from the Selectivo group?
6. Should competition teams live as `teams(type='competition')`, `tournament_squads`, or a new cleaner roster table?

## Recommendation

Work brick by brick:

1. finish attendance/training-group UX first
2. audit hidden tournament stack in more detail
3. add training-group invitation filtering
4. then build Trello-style roster builder

Do not combine attendance simplification and roster-builder implementation in one code pass. They share vocabulary, but they are different workflows and should be stabilized separately.
