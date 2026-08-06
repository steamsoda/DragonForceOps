# Weekly WhatsApp Convocatorias

## Goal

Generate one clear weekly WhatsApp image per campus, tournament, and program (`Selectivos` or `Futbol Para Todos`) without rebuilding paid rosters by hand.

## Confirmed Rules

- The normal roster source is every active player in the selected program who is fully paid for the selected tournament.
- Direct tournament payments and Combo/bundle entitlements use the same truth as `Inscripciones Torneos`.
- A saved draft freezes player name, YOB, current training group, and eligibility source. Later payment or group changes do not silently rewrite an already prepared packet.
- A category may have zero, one, or several games in the same week.
- Super Admin, Director Admin, Director Deportivo, and Front Desk can create and edit weekly packets within their campus scope.
- Only Super Admin, Director Admin, and Director Deportivo may manually include an unpaid player.
- Weeks run Monday through Sunday in Monterrey time.
- The model stores no payment amount or other financial detail.

## Passes

### Pass 1 - Data foundation and frozen draft

- Add weekly packet, category, player snapshot, and game tables.
- Add campus-scoped RLS and a director-only guard for future unpaid exceptions.
- Add `Competencias > Convocatorias` with creation by campus, tournament, program, and week.
- Reuse the existing fully-paid and bundle-aware tournament signup source.
- Save only paid players whose current active training group matches the selected campus/program.

### Pass 2A - Core operational editor (implemented in preview v1.16.237)

- Open a saved draft and edit category ordering/rest state.
- Add, edit, and remove multiple games per category.
- Review the frozen player roster and explicitly exclude a player.
- Require every category to contain a complete game or be marked `Descansa` before the packet can be marked `Lista`.
- Return a ready packet to `Borrador` after any edit.

### Pass 2B - Controlled exceptions and refresh

- Add director-only manual unpaid exceptions with a required reason and audit event.
- Add explicit game ordering when a category has multiple games.
- Add an explicit roster refresh that previews added/removed/moved players before replacing the snapshot.

### Pass 3 - WhatsApp image

- Render a high-resolution, compact image with all categories, players, and games visible at a glance.
- Preserve readable typography for long rosters and multiple games.
- Provide direct PNG download and a clear shared/final status.

### Pass 4 - Hardening

- Validate role and campus behavior with debug users.
- Compare saved rosters against `Inscripciones Torneos` for direct and Combo registrations.
- Verify no pagination gaps, duplicate players, or finance mutations.
- Browser-test desktop, narrow screens, and the generated PNG.

## Safety Boundary

This workflow reads tournament payment eligibility but never creates, reprices, reallocates, voids, or refunds charges/payments. Its tables are operational snapshots and game-planning records only.
