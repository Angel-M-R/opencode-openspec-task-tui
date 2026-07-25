## ADDED Requirements

### Requirement: Current-session change inference
The plugin SHALL infer at most one active OpenSpec change from the most recent explicit OpenSpec change reference in the current OpenCode session and SHALL NOT use references from another session.

#### Scenario: Newest current-session reference is selected
- **WHEN** the current session contains multiple explicit OpenSpec change references
- **THEN** the plugin selects only the most recent referenced change candidate

#### Scenario: Another session references a change
- **WHEN** another session contains a newer OpenSpec change reference than any reference in the current session
- **THEN** the plugin ignores the other session's reference

#### Scenario: No explicit reference exists
- **WHEN** the current session contains no recognized explicit OpenSpec change reference
- **THEN** the plugin resolves no active change

### Requirement: Authoritative OpenSpec validation
The plugin MUST validate the inferred candidate with `openspec status --change <name> --json` in the current project and MUST use the successful JSON response to identify the change and resolve its task artifact path.

#### Scenario: Candidate validates successfully
- **WHEN** the authoritative status command returns parseable JSON identifying the inferred candidate and its resolved paths
- **THEN** the plugin accepts that candidate as the active change and reads tasks only from the resolved task artifact path

#### Scenario: Candidate is definitively invalid
- **WHEN** the newest inferred candidate is reported as missing or invalid by the authoritative status command
- **THEN** the plugin resolves no active change and does not fall back to an older session reference

#### Scenario: Candidate token is unsafe
- **WHEN** extracted text does not satisfy the supported change-name token rules
- **THEN** the plugin does not invoke the status command with that text and does not accept it as an active change

### Requirement: Session-driven re-evaluation
The plugin SHALL re-evaluate the active change when relevant content in the current session changes.

#### Scenario: Session moves to a different change
- **WHEN** the current session gains a newer explicit reference to a different valid OpenSpec change
- **THEN** the plugin validates and switches to that change without offering a selector or retaining the former change as an alternative

#### Scenario: Unrelated session event occurs
- **WHEN** a session event does not alter the current session's change references
- **THEN** the plugin keeps the current active change and avoids a visible state reset

### Requirement: Watched and reconciled refresh
For a validated active change, the plugin SHALL refresh task state from filesystem notifications and SHALL periodically reconcile it against a fresh authoritative status result and task-file read.

#### Scenario: Task file changes
- **WHEN** the active change's task file is edited or atomically replaced and a filesystem notification is delivered
- **THEN** the plugin debounces the notification and refreshes the validated task snapshot

#### Scenario: Filesystem notification is missed
- **WHEN** task content changes without a usable filesystem notification
- **THEN** the periodic reconciliation eventually refreshes the validated task snapshot

#### Scenario: Plugin is disposed
- **WHEN** OpenCode disposes the TUI plugin
- **THEN** the plugin closes watchers, removes event subscriptions, and clears refresh timers

### Requirement: Last-valid failure behavior
The plugin SHALL retain the last valid task snapshot during a temporary validation, filesystem, or parsing failure and SHALL identify the retained snapshot as stale.

#### Scenario: Temporary refresh failure after valid data
- **WHEN** a refresh temporarily fails after a valid task snapshot has been displayed
- **THEN** the plugin continues displaying that unchanged snapshot with a stale warning

#### Scenario: Refresh recovers
- **WHEN** a later refresh succeeds after a temporary failure
- **THEN** the plugin atomically replaces the snapshot with current task data and removes the stale warning

#### Scenario: Failure occurs before any valid data
- **WHEN** resolution or refresh fails and no valid task snapshot exists
- **THEN** the plugin displays no active-change task tree
