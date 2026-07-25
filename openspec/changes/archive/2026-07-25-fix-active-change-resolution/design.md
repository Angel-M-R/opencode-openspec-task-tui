## Context

Active-change resolution currently starts by scanning the current OpenCode session for an explicit change reference. The scanner ignores non-`text` parts, while verified production data places most recognizable references in tool, reasoning, and patch parts. As a result, a project can have a valid in-progress change while the sidebar reports no active change.

OpenSpec already exposes the required project-level information through two JSON commands. `openspec list --json` supplies change names, derived statuses, and modification timestamps; `openspec status --change <name> --json` supplies the authoritative change root, task artifact path, and `planningHome.changesDir`. The existing status gateway already bounds process execution and validates that `tasks.md` is strictly within the returned change root.

## Goals / Non-Goals

**Goals:**

- Resolve a single project-level candidate without inspecting OpenCode session content.
- Apply the confirmed status and recency precedence deterministically from OpenSpec list data.
- Preserve authoritative status/path validation and the existing last-valid stale contract.
- Detect candidate creation, updates, and archival without assuming an `openspec/changes` layout.
- Remove obsolete session extraction and event-subscription plumbing while preserving shared change-name validation.
- Test parsing, precedence, coordination, and UI behavior from captured real JSON fixtures without invoking the CLI in CI.

**Non-Goals:**

- Scoping active changes to an OpenCode session.
- Adding a manual change selector or any change-mutating UI.
- Supporting multiple simultaneously displayed changes.
- Replacing `tasks.md` with list counters as the source of rendered progress.
- Changing the existing task-path containment policy or hardcoding OpenSpec's planning layout.

## Decisions

### 1. Add a bounded OpenSpec list gateway with pure candidate selection

A new gateway will execute `openspec list --json` in the current project under the same timeout and output-size boundaries used for status execution. Parsing will validate the response shape and change-name tokens, exclude `no-tasks` and unknown statuses, rank `in-progress` ahead of `complete`, and then select the greatest valid `lastModified` within that group. The precedence function will remain pure so fixtures can cover candidate order independently from process execution.

Malformed JSON, command failures, timeouts, oversized output, or an invalid list shape are temporary failures. A valid list with no eligible entries is an authoritative no-candidate result. Invalid individual entries are not allowed to reach the status command.

Alternative considered: expand session scraping to tool, reasoning, and patch parts. This retains coupling to OpenCode's part model and still cannot reliably distinguish the user's intended change, so it is rejected in favor of OpenSpec's project inventory.

### 2. Resolve in two steps and keep status validation authoritative

Each refresh first asks the list gateway for the selected name and then passes that name to the existing status gateway. The status response remains authoritative for `changeRoot` and `artifactPaths.tasks.resolvedOutputPath`; the current `unsafe-path` and strict containment checks remain unchanged. The resolved model will also carry the normalized `planningHome.changesDir` returned by status so the coordinator can watch the actual planning home without deriving it from project paths.

The status step does not fall back to a lower-ranked list candidate when the selected candidate is missing or invalid. A later inventory refresh recomputes selection from current OpenSpec state.

Alternative considered: use `completedTasks` and `totalTasks` from list for the sidebar. Those counters would create a second progress source and cannot provide section detail, so all rendered global and section progress continues to come from one parsed `tasks.md` snapshot.

### 3. Replace session triggers with planning-home and task watchers

The coordinator will no longer accept a current session ID, a reference-source callback, or a session-event subscription. After successful two-step resolution it will maintain watchers for:

- `planningHome.changesDir`, to trigger reselection when changes are created, changed, or archived;
- the selected `tasks.md`, for direct edits; and
- the task file's parent directory, for atomic replacement.

All notifications remain debounced and feed the existing serialized refresh loop. The 30-second reconciliation remains the fallback for missed notifications and for cold start with no candidate: list output does not provide `changesDir`, and without a successful status result there is no authoritative directory to watch. This accepted delay avoids hardcoding OpenSpec's directory layout.

Watcher replacement remains atomic around a resolved snapshot, and disposal closes every watcher and timer. Session event listeners are removed entirely.

Alternative considered: infer the changes directory from `<project>/openspec/changes`. This would improve empty cold-start responsiveness but violates planning-home indirection and store/layout compatibility, so it is rejected.

### 4. Preserve the last-valid presentation contract across both gateways

A temporary list or status failure retains the last valid snapshot and marks it stale; before any valid snapshot, the coordinator stays idle. Filesystem and task parsing failures keep the same behavior. A successful empty candidate list clears the snapshot and watcher set, while a successful later refresh publishes the new snapshot atomically.

### 5. Remove only session-specific surfaces

`extractNewestChangeReference`, `SessionMessageLike`, `ChangeReferenceSource`, `getReferenceSource`, `subscribeToSessionEvents`, `SessionEventLike`, `isRelevantCurrentSessionEvent`, and the dedicated change-reference test file will be removed. `isValidChangeName` remains available because status validation and accordion preference keys still depend on it. TUI runtime construction will no longer require session messages or register session-event handlers; project identity and accordion persistence remain unchanged.

### 6. Use captured CLI fixtures and layered tests

Repository fixtures will preserve representative real `openspec list --json` and `openspec status --change <name> --json` payloads. Unit tests will inject process results, task reads, and watcher factories; no CI test will spawn OpenSpec. Coverage will include status-group precedence, timestamp ordering, `no-tasks` exclusion, empty inventory, malformed/temporary failures, two-step calls, changes-directory refresh, task watchers, cold-start reconciliation, stale retention, and session-plumbing removal. Integration tests will confirm sidebar switching and empty-state behavior. The full test suite and production build are completion gates.

## Risks / Trade-offs

- **Parallel changes can make project-level selection differ from a user's current conversation** → The accepted trade-off is documented by deterministic status/recency precedence; no hidden session heuristic remains.
- **No candidate means no authoritative changes directory is available to watch** → Keep 30-second reconciliation and accept bounded cold-start delay rather than hardcode a layout.
- **CLI JSON shape or status values can evolve** → Validate inputs strictly, classify malformed output as temporary, and exercise captured fixtures.
- **A changes-directory event can race with archival or replacement** → Serialize refresh requests, re-run both gateways, and preserve a last-valid stale snapshot on temporary failure.
- **Additional watcher lifecycle increases cleanup complexity** → Manage planning-home and task watchers as one replaceable set and verify closure on replacement, errors, idle transitions, and disposal.

## Migration Plan

Implement fixture and gateway coverage first, then refactor the coordinator to consume list and status gateways, and finally remove TUI/session surfaces and obsolete tests. The final OpenSpec verifier runs focused and repository tests, typecheck, the production build, strict OpenSpec validation, and verifies the implementation against the planning artifacts. No data migration or preference-key migration is required. Rollback is a source revert because the persisted accordion format and task document format do not change.

## Open Questions

None. Candidate scope, precedence, failure behavior, watcher sources, and exclusions are confirmed.
