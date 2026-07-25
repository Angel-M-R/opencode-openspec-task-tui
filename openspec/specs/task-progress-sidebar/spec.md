## Purpose

Parse and present the validated active change's task progress as a compact, persistent, and distributable OpenCode session-sidebar experience.

## Requirements

### Requirement: Supported task syntax
The plugin SHALL parse checked and unchecked tasks written either as Markdown list checkboxes or as level-three checkbox headings, preserving their source order.

#### Scenario: List checkbox tasks are parsed
- **WHEN** `tasks.md` contains `- [ ]`, `- [x]`, or `- [X]` task items
- **THEN** the plugin represents each item in source order with its corresponding unchecked or checked state

#### Scenario: Heading checkbox tasks are parsed
- **WHEN** `tasks.md` contains `### [ ]`, `### [x]`, or `### [X]` task headings
- **THEN** the plugin represents each heading in source order with its corresponding unchecked or checked state

#### Scenario: Non-task Markdown is present
- **WHEN** `tasks.md` contains prose, code, or Markdown elements that are not supported task markers or section headings
- **THEN** the plugin excludes those elements from task counts and task rows

### Requirement: Tasks are grouped by section
The plugin SHALL project parsed tasks into ordered sections and SHALL provide a stable fallback section for tasks that occur before any explicit section heading.

#### Scenario: Tasks follow section headings
- **WHEN** supported tasks appear beneath distinct non-task section headings
- **THEN** the plugin groups each task under its corresponding section and preserves section order

#### Scenario: Tasks precede all section headings
- **WHEN** supported tasks appear before the first explicit section heading
- **THEN** the plugin groups those tasks under a `Tasks` fallback section

#### Scenario: Section labels repeat
- **WHEN** two sections have the same displayed label
- **THEN** the plugin retains them as separate ordered sections with independently addressable accordion state

### Requirement: Global and section progress
The plugin SHALL derive completed and total counts globally and for every section from the parsed task states.

#### Scenario: Mixed task completion
- **WHEN** a section and the full document contain both checked and unchecked tasks
- **THEN** the plugin reports accurate completed and total counts for that section and for the full document

#### Scenario: No supported tasks exist
- **WHEN** a validated `tasks.md` contains no supported tasks
- **THEN** the plugin reports zero completed of zero total without treating the document as fully completed

#### Scenario: A task is checked externally
- **WHEN** a successful refresh changes a task from unchecked to checked
- **THEN** the plugin updates the task marker, its section count, and global progress in the same rendered snapshot

### Requirement: Active-change task tree rendering
The plugin SHALL render only the validated active change in the session sidebar as a compact task tree containing global progress, section counts, and task markers `✓` and `☐`.

#### Scenario: Active change has tasks
- **WHEN** a valid active change has one or more parsed task sections
- **THEN** the sidebar shows the change identity, global progress, each section's completed and total count, and each visible task with `✓` or `☐`

#### Scenario: Session moves to another valid change
- **WHEN** active-change resolution switches to a different valid change
- **THEN** the sidebar replaces the former task tree and shows only the newly active change

#### Scenario: Snapshot is stale
- **WHEN** the plugin is retaining a last-valid snapshot after a temporary failure
- **THEN** the sidebar keeps the task tree visible and shows a discreet stale warning

### Requirement: Section accordion interaction
Each task section SHALL be independently collapsible and expandable, and every section without a saved collapsed preference SHALL initially be open.

#### Scenario: New change is first displayed
- **WHEN** a project and change combination has no saved accordion preferences
- **THEN** all of its task sections are open

#### Scenario: User collapses a section
- **WHEN** the user activates an open section header by mouse, Enter, or Space
- **THEN** that section's task rows are hidden while its header and section count remain visible

#### Scenario: User expands a section
- **WHEN** the user activates a collapsed section header by mouse, Enter, or Space
- **THEN** that section's task rows become visible without changing other sections

### Requirement: Project-and-change accordion persistence
The plugin SHALL persist collapsed section identities separately for each project and validated change, and newly encountered sections SHALL default to open.

#### Scenario: Existing change is revisited
- **WHEN** the same project and change are displayed again after one or more sections were collapsed
- **THEN** the plugin restores those sections as collapsed and leaves the other sections open

#### Scenario: Same change name exists in another project
- **WHEN** another project displays a change with the same name
- **THEN** the plugin does not apply accordion preferences saved for the original project

#### Scenario: A new section is added
- **WHEN** refreshed task content introduces a section identity with no saved preference
- **THEN** the plugin displays the new section open

### Requirement: Discreet empty state
The plugin SHALL display a discreet empty state when no valid active OpenSpec change is resolved and SHALL NOT render controls for selecting or mutating changes.

#### Scenario: Current session has no active change
- **WHEN** active-change resolution produces no validated change and no stale snapshot is retained
- **THEN** the sidebar shows a subtle no-active-change message without a task tree

#### Scenario: Empty state is displayed
- **WHEN** the no-active-change message is visible
- **THEN** the plugin exposes no change selector and no apply, verify, archive, or task-edit action

### Requirement: Consumable compiled TUI package
The project SHALL produce an npm-packable ESM distribution whose exported TUI entry can also be loaded locally by OpenCode from the compiled bundle.

#### Scenario: Package is built
- **WHEN** the package build completes successfully
- **THEN** the declared TUI JavaScript entry and TypeScript declarations exist in the distribution output

#### Scenario: Package contents are inspected
- **WHEN** an npm package dry run is performed
- **THEN** the package includes the compiled TUI entry and required documentation without including source-only reference files

#### Scenario: Compiled bundle is loaded locally
- **WHEN** OpenCode is configured to consume the local compiled TUI entry
- **THEN** the plugin registers its sidebar content and can display the bounded task-progress experience
