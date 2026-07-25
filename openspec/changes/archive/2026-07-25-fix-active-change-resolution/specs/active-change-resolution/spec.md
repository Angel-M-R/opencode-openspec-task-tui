## MODIFIED Requirements

### Requirement: Project-level active change selection
The plugin SHALL resolve at most one active OpenSpec change from `openspec list --json` in the current project, SHALL consider only entries whose status is `in-progress` or `complete`, SHALL prefer `in-progress` over `complete`, and SHALL select the most recent `lastModified` value within the preferred status group without using OpenCode session content.

#### Scenario: In-progress candidate wins over complete candidate
- **WHEN** the current project's list contains at least one `in-progress` change and one or more `complete` changes, including a more recently modified complete change
- **THEN** the plugin selects the most recently modified `in-progress` change

#### Scenario: Most recent candidate in one status group is selected
- **WHEN** the preferred eligible status group contains multiple changes
- **THEN** the plugin selects the change with the most recent valid `lastModified` value in that group

#### Scenario: No-task entries are excluded
- **WHEN** the list contains a `no-tasks` entry, whether or not it is the most recently modified entry
- **THEN** the plugin excludes that entry from active-change selection

#### Scenario: No eligible candidate exists
- **WHEN** the list contains no valid `in-progress` or `complete` entry
- **THEN** the plugin resolves no active change

#### Scenario: Sessions reference other changes
- **WHEN** any OpenCode session content references a change other than the project-level selected candidate
- **THEN** the plugin ignores the session content and keeps selection based on the current project's list

### Requirement: Authoritative OpenSpec validation
The plugin MUST select a candidate through `openspec list --json`, MUST validate the selected name with `openspec status --change <name> --json` in the current project, and MUST use the successful status JSON to identify the change, resolve its task artifact path, and obtain the authoritative planning-home changes directory.

#### Scenario: Candidate resolves successfully in two steps
- **WHEN** list output selects a valid candidate and the status command returns parseable JSON identifying that candidate and its resolved paths
- **THEN** the plugin accepts that candidate as active and reads tasks only from the resolved task artifact path

#### Scenario: Selected candidate is definitively invalid
- **WHEN** the selected candidate is reported as missing or invalid by the authoritative status command
- **THEN** the plugin does not accept that candidate and does not fall back to a lower-ranked list entry

#### Scenario: Candidate token is unsafe
- **WHEN** a list entry's name does not satisfy the supported change-name token rules
- **THEN** the plugin does not invoke the status command with that name and does not accept it as an active change

#### Scenario: Status returns an unsafe task path
- **WHEN** status output resolves a task path that is not strictly within the returned change root
- **THEN** the plugin rejects the status result as a temporary unsafe-path failure

#### Scenario: List counters differ from task content
- **WHEN** the selected list entry's task counters differ from the successfully parsed `tasks.md`
- **THEN** the plugin derives both global and section progress from `tasks.md` and does not render progress from the list counters

### Requirement: Change-inventory re-evaluation
The plugin SHALL re-evaluate project-level active-change selection when the authoritative changes directory reports a filesystem change and SHALL NOT subscribe to OpenCode session events for active-change resolution.

#### Scenario: A higher-precedence change appears
- **WHEN** the changes-directory watcher triggers after a new or updated change becomes the highest-precedence eligible candidate
- **THEN** the plugin reruns list and status resolution and switches atomically to that change

#### Scenario: The selected change is archived
- **WHEN** the changes-directory watcher triggers after the selected change is archived
- **THEN** the plugin recomputes selection and displays the next eligible candidate or the empty state when none exists

#### Scenario: Session content changes
- **WHEN** OpenCode messages or parts are created, updated, or removed
- **THEN** the plugin performs no active-change refresh solely because of that session event

### Requirement: Watched and reconciled refresh
For a validated active change, the plugin SHALL refresh selection and task state from filesystem notifications for the authoritative planning-home changes directory, the resolved task file, and the task file's directory, and SHALL periodically reconcile through fresh list resolution, status validation, and task-file reading.

#### Scenario: Task file changes
- **WHEN** the active change's task file is edited or atomically replaced and a filesystem notification is delivered
- **THEN** the plugin debounces the notification and refreshes the validated task snapshot

#### Scenario: Change inventory changes
- **WHEN** the authoritative planning-home changes directory reports a filesystem change
- **THEN** the plugin debounces the notification and re-evaluates the project-level candidate before resolving its task snapshot

#### Scenario: Filesystem notification is missed
- **WHEN** candidate or task content changes without a usable filesystem notification
- **THEN** the periodic reconciliation eventually refreshes selection and the validated task snapshot

#### Scenario: Cold start has no candidate
- **WHEN** startup list output has no eligible candidate and therefore no status-derived changes directory is available to watch
- **THEN** the plugin remains idle and periodic reconciliation detects a later candidate within the configured reconciliation interval

#### Scenario: Plugin is disposed
- **WHEN** OpenCode disposes the TUI plugin
- **THEN** the plugin closes changes-directory and task watchers and clears refresh timers

### Requirement: Last-valid failure behavior
The plugin SHALL retain the last valid task snapshot during a temporary list, status validation, filesystem, or parsing failure and SHALL identify the retained snapshot as stale.

#### Scenario: Temporary list failure after valid data
- **WHEN** `openspec list --json` temporarily fails after a valid task snapshot has been displayed
- **THEN** the plugin continues displaying that unchanged snapshot with a stale warning

#### Scenario: Temporary downstream failure after valid data
- **WHEN** status validation, filesystem access, or task parsing temporarily fails after a valid task snapshot has been displayed
- **THEN** the plugin continues displaying that unchanged snapshot with a stale warning

#### Scenario: Refresh recovers
- **WHEN** a later two-step resolution and task read succeeds after a temporary failure
- **THEN** the plugin atomically replaces the snapshot with current task data and removes the stale warning

#### Scenario: Failure occurs before any valid data
- **WHEN** list resolution or a downstream refresh step temporarily fails and no valid task snapshot exists
- **THEN** the plugin remains idle and displays no active-change task tree

#### Scenario: Successful list has no candidate
- **WHEN** a successful list refresh reports no eligible candidate
- **THEN** the plugin clears any former snapshot and displays the empty state

## RENAMED Requirements

- FROM: `### Requirement: Current-session change inference`
- TO: `### Requirement: Project-level active change selection`
- FROM: `### Requirement: Session-driven re-evaluation`
- TO: `### Requirement: Change-inventory re-evaluation`
