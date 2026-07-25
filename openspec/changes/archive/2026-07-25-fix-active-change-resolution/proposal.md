## Why

The sidebar currently infers the active change by scraping only text parts from the current OpenCode session, but real sessions place most usable change references in non-text parts. This makes an existing active change appear absent, so resolution should instead use OpenSpec's project-level JSON inventory as the source of truth.

## What Changes

- Select one active change from `openspec list --json` for the current project, excluding `no-tasks` entries.
- Prefer `in-progress` changes over `complete` changes, then prefer the most recently modified candidate within the selected status group.
- Continue resolving the selected change's authoritative `tasks.md` path through `openspec status --change <name> --json` and retain the existing path-safety validation.
- Remove session-reference extraction, session-event refresh plumbing, and their obsolete tests while retaining shared change-name validation.
- Refresh project-level selection when the OpenSpec changes directory changes and through periodic reconciliation, while continuing to watch the selected task file and its directory.
- Preserve last-valid stale behavior for temporary list or status failures; show the empty sidebar only when no candidate exists and no snapshot is retained.
- Keep global and per-section progress sourced from the same parsed `tasks.md` content rather than list counters.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `active-change-resolution`: Replace current-session reference inference and session-driven re-evaluation with project-level candidate selection, two-step list/status resolution, and changes-directory refresh behavior.

## Impact

- Affects the active-change gateways, refresh coordinator, filesystem watcher lifecycle, and TUI dependency/session plumbing.
- Removes the session change-reference extraction surface and its dedicated unit tests, while preserving `isValidChangeName` for status validation and accordion preferences.
- Adds captured OpenSpec list/status JSON fixtures and pure precedence tests without invoking the OpenSpec CLI in CI.
- Requires the repository test suite and production build to pass before completion.
