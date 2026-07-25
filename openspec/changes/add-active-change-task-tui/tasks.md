## 1. Project Foundation

- [x] 1.1 Create the minimal ESM TypeScript package, source/test directories, compiler settings, and package-manager metadata without copying files from `references/`.
- [x] 1.2 Configure the TSX-capable bundle and declaration build for a compiled TUI entry, with OpenCode, OpenTUI, and Solid supplied through compatible peer and development dependencies.
- [x] 1.3 Configure unit and integration test commands, typechecking, build, prepack, and npm package dry-run scripts.
- [x] 1.4 Verify the installed OpenCode TUI typings for current-session access, `sidebar_content` registration, key-value persistence, lifecycle disposal, and supported keyboard/mouse handlers; record any compatibility adapters in code comments or tests.

## 2. Task Domain Model and Parser

- [x] 2.1 Define typed active-change, task, section, progress, snapshot-health, and presentation-state models independent of Solid and OpenTUI.
- [x] 2.2 Implement parsing for checked and unchecked `- [ ]`/`- [x]` list tasks and `### [ ]`/`### [x]` heading tasks while ignoring unsupported Markdown.
- [x] 2.3 Implement ordered section grouping, the unsectioned `Tasks` fallback, and duplicate-heading identities based on normalized labels plus occurrence indexes.
- [x] 2.4 Derive atomic per-section and global completed/total progress, including zero-of-zero behavior.
- [x] 2.5 Add parser and progress unit tests covering both syntaxes, mixed casing, ordering, prose, unsectioned tasks, duplicate sections, mixed completion, and empty task documents.

## 3. Active Change Resolution

- [x] 3.1 Implement defensive extraction of explicit OpenSpec change references from current-session messages and parts in newest-first order, with conservative change-name validation.
- [x] 3.2 Add extraction tests proving current-session scoping, newest-reference selection, supported explicit forms, unsafe-token rejection, and no older-reference fallback.
- [x] 3.3 Implement an injected OpenSpec status gateway that uses argument-array process execution in the project directory with bounded time and output.
- [x] 3.4 Validate returned JSON against the requested change, obtain the resolved change root and task artifact path from status output, and reject paths outside the validated change root.
- [x] 3.5 Classify authoritative missing/invalid results separately from temporary command or output failures and add gateway tests for success, malformed JSON, mismatch, invalid change, timeout, and unsafe path results.

## 4. Refresh and Resilience

- [x] 4.1 Implement a refresh coordinator that re-evaluates references on relevant current-session events, switches validated changes atomically, and exposes idle, ready, or stale presentation state.
- [x] 4.2 Add debounced filesystem observation for the resolved task file and its replacement boundary, rebuilding watchers when the active change or resolved path changes.
- [x] 4.3 Add single-flight periodic reconciliation that reruns authoritative validation before reading and parsing `tasks.md`.
- [x] 4.4 Preserve the last valid snapshot and surface a concise stale reason for temporary validation, read, parse, or watch failures; clear stale health after recovery and use idle when no valid snapshot exists.
- [x] 4.5 Dispose session subscriptions, watchers, debounce handles, in-flight follow-up work, and reconciliation timers through one idempotent lifecycle cleanup path.
- [x] 4.6 Add coordinator tests for initial resolution, session-driven switching, invalid newest references, watch bursts, atomic replacement, missed-event reconciliation, stale retention, recovery, single-flight behavior, and disposal.

## 5. Accordion Preferences

- [x] 5.1 Implement a versioned key-value preference adapter scoped by stable project identity and validated change name, storing only collapsed section identities.
- [x] 5.2 Default unseen changes and newly added sections to fully open, restore known collapsed sections, and prune identities for removed sections after successful refresh.
- [x] 5.3 Add preference tests for project isolation, change isolation, revisit restoration, duplicate headings, newly added sections, renamed sections, and malformed stored data.

## 6. OpenCode TUI Integration

- [x] 6.1 Implement the TUI module root and register only the ordered `sidebar_content` slot using the verified reference lifecycle and Solid integration patterns.
- [x] 6.2 Wire sidebar context and route fallback to current-session resolution, project directory selection, the refresh coordinator, and project/change preferences.
- [x] 6.3 Render the active change identity, global progress, section arrows and counts, and visible `✓`/`☐` task rows with width-safe compact text.
- [x] 6.4 Render discreet no-active-change and stale states without a selector, artifact status, task editing, or apply/verify/archive controls.
- [x] 6.5 Implement independent section toggling by mouse and by Enter or Space on focused section headers, preserving other section state.
- [x] 6.6 Add TUI integration tests for slot registration, current-session isolation, initial all-open rendering, both toggle inputs, persisted collapse restoration, active-change replacement, refreshed counts, empty state, stale warning, and lifecycle cleanup.

## 7. Documentation and Verification Handoff

- [x] 7.1 Add concise English setup documentation for npm installation and local OpenCode consumption through the compiled bundle, including supported task syntax and explicit MVP exclusions.
- [x] 7.2 Add a clearly executable manual OpenCode smoke procedure and result record covering active-reference inference, both task syntaxes, live completion updates, accordion persistence, change switching, no-active-change state, temporary-failure stale retention, and recovery; reserve execution against the compiled bundle for final OpenSpec verification.
- [x] 7.3 Review the finished MVP and its documentation against both capability specs, then record confirmation that change selection, non-task artifact status, and apply, verify, archive, or edit actions were not introduced.
