# Dragon Force Ops Docs

This folder is intentionally split between active operational references, planning documents, and legacy/historical material.

## Active Root Docs

The root docs folder should stay small and focused.

- `roadmap-post-alpha.md` is the active operating roadmap. Use it to understand current priorities, open issues, completed release notes, and what should be tackled next.
- `devlog.md` is the chronological implementation record. Update it after every meaningful fix, patch, migration, or workflow decision so we can reconstruct why a change happened.
- `branching-workflow.md` documents the preview-first workflow and production merge expectations.
- `production-access-runbook.md` documents production env/role/access checks after incidents or deploys.
- `role-permissions-audit.md` is the active source of truth for role visibility and access expectations.
- `finance-source-of-truth.md` documents financial source-of-truth rules and should stay easy to find.

## Planning Docs

Feature-specific mini-roadmaps live in `planning/`.

Use `planning/` for work that needs product/operations thinking before code:

- attendance and training groups
- attendance calendar and closures
- competition roster builder
- player spreadsheet-style roster view
- training groups model analysis

The main roadmap should link to these files instead of duplicating every detail.

## Legacy Docs

Historical docs live in `legacy/`.

These files are useful for context, but they are not the current source of truth. Examples include old SDDs, early security notes, old execution plans, preview seed scripts, and older CSV/reference artifacts.

When a legacy doc conflicts with `roadmap-post-alpha.md`, `devlog.md`, an active runbook, or current code, trust the active docs and current code.

## Reference Docs

Uploaded external/reference material can remain in `Reference Docs/` when it is still being used for analysis or implementation input.

Do not treat reference docs as app source of truth unless their conclusions have been copied into an active planning doc, roadmap entry, migration, or implementation.
