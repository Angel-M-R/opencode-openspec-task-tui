## 1. Captured OpenSpec JSON Fixtures

- [x] 1.1 Add repository fixtures captured from real `openspec list --json` and successful `openspec status --change <name> --json` output, preserving representative `no-tasks`, `in-progress`, planning-home, and task-path fields.
- [x] 1.2 Add reusable test fixture loading/building support so gateway, coordinator, and integration tests consume fixture JSON without spawning the OpenSpec CLI.

## 2. List Selection and Gateway

- [x] 2.1 Implement a pure candidate selector that validates list entries, excludes `no-tasks` and unsupported entries, ranks `in-progress` above `complete`, and chooses the newest valid `lastModified` within the winning group.
- [x] 2.2 Implement the bounded `openspec list --json` command gateway and result contract for selected, no-candidate, and temporary-failure outcomes using the existing process timeout and output limits.
- [x] 2.3 Extend successful status resolution with the authoritative `planningHome.changesDir` while preserving change-name validation and the existing `unsafe-path` / `isStrictlyWithin` task-path checks unchanged.
- [x] 2.4 Add fixture-backed unit tests for list parsing, status and timestamp precedence, `no-tasks` exclusion, empty inventories, unsafe names, process failures, malformed output, and status-derived planning paths.

## 3. Coordinator and Watcher Refactor

- [x] 3.1 Refactor the refresh coordinator to resolve list selection before status and task reading, removing current-session reference inputs while retaining serialized/debounced refresh behavior.
- [x] 3.2 Apply the existing presentation contract to list outcomes: no candidate clears to idle, temporary failure preserves a stale last-valid snapshot, and temporary failure before any snapshot remains idle.
- [x] 3.3 Manage one replaceable watcher set for `planningHome.changesDir`, the resolved `tasks.md`, and its parent directory, including debounced reselection and cleanup on replacement, errors, idle transitions, and disposal.
- [x] 3.4 Preserve 30-second reconciliation as the missed-event and no-candidate cold-start fallback, without deriving or hardcoding the OpenSpec changes directory.
- [x] 3.5 Update coordinator unit tests for two-step resolution, candidate switching and archival, changes-directory and task notifications, stale retention, cold-start reconciliation, serialized refreshes, and complete cleanup.

## 4. TUI and Session-Plumbing Cleanup

- [x] 4.1 Wire the list gateway into default and injected TUI dependencies, remove session-message lookup and session-event subscriptions from sidebar runtime construction, and stop gating project-level resolution on a session ID.
- [x] 4.2 Remove `extractNewestChangeReference`, `SessionMessageLike`, `ChangeReferenceSource`, `getReferenceSource`, `subscribeToSessionEvents`, `SessionEventLike`, and `isRelevantCurrentSessionEvent`; retain `isValidChangeName` for status and accordion-preference consumers.
- [x] 4.3 Delete `test/unit/change-reference.test.ts` and update affected unit/API-contract tests to cover retained validation through its surviving consumers.
- [x] 4.4 Update integration tests to prove project-level candidate display, precedence-based switching, no-candidate empty state, stale rendering, and progress sourced from parsed `tasks.md` rather than list counters.
