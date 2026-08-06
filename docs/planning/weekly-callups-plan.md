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

### Pass 2B - Controlled exceptions and refresh (implemented in preview v1.16.238)

- Added director-only manual unpaid exceptions with a required reason and audit event. These exceptions only affect the packet and never create tournament payments or registrations.
- Added explicit game ordering when a category has multiple games.
- Added an opt-in paid-roster comparison that lists added, removed, and moved players before any write.
- Added an explicitly confirmed transactional refresh. It preserves games, rest state, category order, packet exclusions, and manual exceptions while synchronizing the paid snapshot and returning the packet to `Borrador`.
- Added duplicate active-assignment and duplicate roster-payload safeguards so ambiguous source data fails instead of silently duplicating a player.

### Pass 3A - Direct WhatsApp PNG (implemented in preview v1.16.239)

- Added one-click, high-resolution PNG download from the frozen packet.
- The image includes every included player, all configured games, `Descansa` categories, packet context, and a visible draft watermark.
- Generation happens locally in the browser and does not write to the database.
- A production-sized 12-category/152-player fixture rendered without clipping.

### Pass 3B - Fitting and visual polish

- Refine category reading order and column balancing.
- Tune extra-long player names, unusually large rosters, and multiple-game cards while retaining a single image.
- Validate real Linda Vista and Contry packets at WhatsApp/mobile viewing sizes.

### Pass 3C - Editor simplification

- Reduce visual density in the operational editor after staff test the complete draft-to-image flow.
- Keep exception, refresh, and status controls understandable without hiding their safeguards.

### Pass 4 - Hardening

- Validate role and campus behavior with debug users.
- Compare saved rosters against `Inscripciones Torneos` for direct and Combo registrations.
- Verify no pagination gaps, duplicate players, or finance mutations.
- Browser-test desktop, narrow screens, and the generated PNG.

## Safety Boundary

This workflow reads tournament payment eligibility but never creates, reprices, reallocates, voids, or refunds charges/payments. Its tables are operational snapshots and game-planning records only.
