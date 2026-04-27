# Jugadores Spreadsheet-Style Roster View Plan

## Purpose

Front desk and admin users are used to Excel workbooks where one campus is split into familiar roster sheets. The app should support that scanning workflow without replacing the current `Jugadores` list.

V1 adds a separate read-only `Vista por grupos` inside `Jugadores`. It gives staff a dense, spreadsheet-style roster organized by training groups and reliable account signals, while avoiding ambiguous product/tournament shorthand until that model is cleaned up.

## V1 Behavior

- Route state: `/players?view=groups`.
- Existing `Activos` and `Bajas` views remain unchanged.
- Access follows the same operational campus scope as `Jugadores`.
- One campus is selected at a time.
- Active training groups are the sheet-like sections.
- Players without an active training-group assignment appear in `Sin grupo`.
- Each active player appears once.
- V1 columns:
  - `#`
  - `ID`
  - `Nombre`
  - `CAT`
  - `Nivel/Grupo`
  - `INSC`
  - last 3 tuition months, including the current Monterrey month
- Tuition cells:
  - `MES P` for 360Player/Stripe-covered tuition
  - latest payment date, like `10-feb`, when covered by normal app payment
  - `Pendiente` when the month still has unpaid tuition
  - `-` when no matching tuition charge exists
- No amounts are shown in the month cells in v1.
- No tutor/contact columns are shown in v1.

## Public Player ID

- Add permanent `players.public_player_id`.
- Format: `DF-0001`, `DF-0002`, etc.
- Global across Dragon Force Monterrey, not campus-specific.
- Never reused.
- Existing players are backfilled by `players.created_at`, then name/id as deterministic tie-breakers.
- New players receive the next ID automatically.
- This is separate from `jersey_number`, which remains sports/team context.

## Deferred Product And Tournament Columns

The old Excel sheet carries compact columns such as `SLR`, `UNIF JGO`, and `CECAFF`. Those fields currently mix amount, payment date, payment source, size, and tournament meaning in free text.

V1 intentionally defers those columns. The roadmap keeps a follow-up for compact product/tournament indicators after the product and competition rules are cleaned up.

## Hidden WIP Sports Surfaces

The hidden `Equipos`, tournament management, and WIP competition/squad surfaces should remain untouched in this pass. They need a later decision: promote, rebuild, or retire after the product/competition rules rework.
