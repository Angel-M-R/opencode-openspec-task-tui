## Why

OpenCode users working through an OpenSpec change cannot currently see the active change's task progress without leaving the session and inspecting `tasks.md`. A compact, session-aware TUI view would keep the current plan visible while preserving OpenSpec as the source of truth.

## What Changes

- Add an OpenCode TUI plugin that shows only the OpenSpec change most recently referenced by the current session after validating it with `openspec status --change <name> --json`.
- Parse the active change's `tasks.md` into global progress, section counts, and checked or unchecked task rows, supporting both list-task and heading-task syntax.
- Render sections as independently collapsible accordions, initially open for each newly encountered project and change, with persisted collapse preferences.
- Refresh from filesystem changes with periodic reconciliation; retain the last valid snapshot and mark it stale during temporary failures.
- Show a discreet empty state when no active change can be resolved.
- Create a minimal TypeScript package that builds a consumable OpenCode TUI bundle for local use and npm distribution, reusing only verified TUI integration patterns from the reference plugin.
- Add unit tests, TUI integration tests, and a documented manual OpenCode smoke test for the bounded MVP.
- Keep the MVP limited to task visibility and progress. Explicitly exclude change selection, non-task artifact status, and apply, verify, or archive actions.

## Capabilities

### New Capabilities
- `active-change-resolution`: Resolve and validate the single active OpenSpec change from references in the current OpenCode session, with authoritative status checks and resilient refresh behavior.
- `task-progress-sidebar`: Parse and present the active change's task progress as an interactive, persistent accordion tree with empty and stale states.

### Modified Capabilities

None.

## Impact

- Introduces a new TypeScript/npm package and compiled TUI entry point at the project root during implementation.
- Integrates with OpenCode's TUI plugin API, current-session state, slot registration, key/mouse input, lifecycle cleanup, and project-scoped key-value persistence.
- Reads OpenSpec change state through the `openspec` CLI and watches the resolved `tasks.md`; it does not modify OpenSpec changes.
- Uses the existing plugin under `references/` only to verify compatible TUI, packaging, lifecycle, and testing patterns; reference files remain unchanged.
