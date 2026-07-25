## Context

This repository is a new product shell with a read-only reference plugin under `references/sub-agent-statusline`. The implementation will be a minimal TypeScript OpenCode TUI plugin, not a fork of the reference. Verified reference patterns include an ESM package with a compiled TUI export, Solid roots and signals, `sidebar_content` slot registration, project key-value storage, lifecycle disposal, keyboard and mouse handlers, and integration tests driven by a mocked TUI API.

The plugin must derive one active OpenSpec change from the current OpenCode session, treat `openspec status --change <name> --json` as authoritative, parse only task progress, and remain useful across file replacement and temporary process or filesystem failures. All product code, identifiers, messages, and documentation will be English.

## Goals / Non-Goals

**Goals:**

- Resolve only the most recently referenced valid OpenSpec change in the current session.
- Present `tasks.md` as global progress, section summaries, and checked or unchecked task rows.
- Support independent accordion state that persists per project and change and defaults open for unseen sections.
- Combine filesystem-triggered refresh with periodic reconciliation and preserve the last valid snapshot when refresh temporarily fails.
- Produce a minimal npm-ready ESM package whose compiled TUI bundle also supports local OpenCode consumption.
- Keep parsing, resolution, state transitions, and rendering testable without launching OpenCode.

**Non-Goals:**

- Selecting or browsing changes other than the inferred active change.
- Displaying proposal, design, spec, verification, or archive state.
- Applying, verifying, archiving, editing, or otherwise mutating an OpenSpec change.
- Supporting arbitrary Markdown trees, nested task hierarchy, or task authoring.
- Copying runtime or domain implementation from the reference plugin.

## Decisions

### Separate the domain pipeline from the TUI adapter

The implementation will use small modules for session-reference extraction, authoritative OpenSpec resolution, task parsing, refresh coordination, persisted accordion preferences, and Solid/OpenTUI rendering. The TUI entry point will compose these modules and own lifecycle cleanup.

This keeps CLI and filesystem work outside render components and allows deterministic unit tests. A single large TSX module, like the mature reference plugin, was rejected because this new MVP does not need its accumulated compatibility logic and would be harder to bound.

### Resolve the current session's newest explicit change reference

The adapter will obtain the current session identifier from the sidebar slot context, with the current route as a compatibility fallback, and read that session's messages and parts through the TUI state API. Reference extraction will inspect textual message/part content from newest to oldest and recognize explicit OpenSpec forms such as `--change <name>` and `openspec/changes/<name>`. Names must satisfy a conservative kebab-case token rule before any command is invoked.

Only the newest extracted candidate is considered active. It becomes valid only when `openspec status --change <name> --json`, executed in the current project directory with an argument array, returns parseable JSON for that same change and exposes its resolved change root and artifact paths. A definitively missing or invalid candidate yields the empty state; a temporary CLI failure preserves an existing valid snapshot and marks it stale. Falling back to an older reference was rejected because it could display work the session has already moved away from.

### Use OpenSpec status output to resolve paths

The plugin will not construct `openspec/changes/<name>` paths. It will use the status JSON's resolved change root and task artifact path, constrain the task path to the validated change root, and read only that `tasks.md`. The CLI will be invoked with `execFile`-style arguments, a timeout, and bounded output.

Direct directory inference was rejected because stores and future OpenSpec layouts can differ. Shell command strings were rejected to avoid interpolation and quoting hazards.

### Parse a two-level task projection

The parser will normalize `tasks.md` into ordered sections containing ordered tasks. It will recognize unchecked and checked list items (`- [ ]`, `- [x]`, `- [X]`) and task headings (`### [ ]`, `### [x]`, `### [X]`). Non-task headings establish section labels; tasks before the first section are grouped under a stable `Tasks` section. Indentation and non-task Markdown are not represented. Section identity will combine a normalized heading label with its occurrence index so duplicate headings remain independently addressable.

Counts and percentages will be derived from parsed task state, never from status text. With zero tasks, progress is represented as zero of zero rather than inventing completion.

### Model refresh as last-valid snapshot plus health

A coordinator will own `idle`, `ready`, and `stale` presentation state. Session message events trigger candidate re-evaluation. Once a candidate is valid, the coordinator watches the resolved task file and its parent directory to tolerate atomic replacement, debounces bursts, and also runs a periodic reconciliation timer. Every refresh reruns authoritative status validation before reading and parsing the task file.

A successful refresh atomically replaces the snapshot and clears stale health. A transient command, read, parse, or watcher error leaves the last valid snapshot unchanged and sets a concise stale warning. If no valid snapshot exists, failures use the discreet empty state. All watchers, event subscriptions, debounce timers, and reconciliation timers are disposed through the TUI lifecycle.

Filesystem watch alone was rejected because delivery varies by platform and editors commonly replace files atomically. Polling alone was rejected because it adds avoidable latency.

### Persist only collapsed section identities

Accordion preferences will be stored through the TUI key-value API under a versioned key derived from a stable project identity and validated change name. The value will contain only collapsed section identities. Missing keys, newly encountered changes, and newly added sections therefore render fully open by default. Removed section identities will be pruned on successful refresh.

Persisting expanded identities was rejected because newly added sections would incorrectly default closed. A global preference was rejected because it would leak state across projects and changes.

### Render in the session sidebar with narrow interaction scope

The plugin will register a single ordered `sidebar_content` slot. It will render a compact change title and global count/progress indicator, followed by section headers with completed/total counts and visible task rows using `✓` and `☐`. Each section header will be independently toggleable by mouse activation and by Enter or Space when focused. A subtle empty label appears when no active change exists; a subtle warning appears beside retained stale data.

No command palette commands, change selector, artifact controls, or task mutation controls will be registered in the MVP.

### Ship one npm package with a compiled TUI entry

The root implementation will use TypeScript, Solid, OpenTUI, the OpenCode TUI plugin API, and a small ESM bundler configuration following only the verified packaging shape of the reference. Package exports will point to the compiled TUI JavaScript and declarations. `prepack` will build, and the package file list will include the distribution output and required documentation. Local OpenCode setup will reference the compiled bundle rather than source TSX.

Dependencies will be kept as peer dependencies where supplied by OpenCode, with pinned development versions for reproducible typechecking and tests.

### Validate at domain, adapter, and runtime boundaries

Unit tests will cover reference extraction, status validation, task syntax, counts, duplicate and unsectioned headings, refresh state transitions, and accordion persistence. TUI integration tests will exercise slot registration, current-session scoping, initial rendering, toggling, stale retention, empty state, and lifecycle cleanup through a runtime harness. Planned implementation will add a clearly executable manual smoke procedure and result record covering local compiled-bundle loading, explicit change references, both task syntaxes, live completion updates, accordion persistence, change switching, empty state, stale retention, and recovery.

### Separate planned tasks from final OpenSpec verification

The remaining planned-task batch is limited to concise npm and local setup documentation, the manual smoke procedure or record template, and an explicit MVP-exclusion review. It will not run a build, the complete test suite, `prepack`, or a package dry run.

After every planned task is complete, final OpenSpec verification must typecheck and build the package, run the complete unit and TUI integration test suite, perform the package dry run and verify the compiled JavaScript, declarations, and required documentation while excluding source-only reference files, then execute and record the manual OpenCode smoke procedure against the compiled bundle. Final verification must also confirm that change selection, non-task artifact status, and apply, verify, archive, or edit actions remain absent.

## Risks / Trade-offs

- [OpenCode message shapes vary across versions] → Keep extraction adapters defensive, test supported shapes, and prefer public TUI state and slot APIs verified against installed typings during implementation.
- [Natural-language mentions can be ambiguous] → Recognize only explicit OpenSpec reference forms and require authoritative CLI validation.
- [The newest reference can be invalid] → Show no active change instead of silently falling back to older work; preserve prior data only for classified temporary failures and label it stale.
- [Filesystem watch events can be lost or duplicated] → Debounce watch events, watch replacement boundaries, and reconcile periodically.
- [Status checks can be expensive] → Coalesce refreshes, allow one in-flight refresh, bound command execution, and use a moderate reconciliation interval.
- [Section labels can repeat or change] → Include occurrence indexes in identity; renamed sections intentionally reopen because they are new identities.
- [Plugin API versions can drift] → Use peer ranges compatible with the verified reference pattern and test the compiled entry with the supported OpenCode version range.

## Migration Plan

1. Implement and test the new package without modifying `references/`.
2. Complete the bounded documentation, smoke-procedure, and MVP-exclusion planned tasks without running a build, the complete test suite, `prepack`, or a package dry run.
3. After all planned tasks are complete, run final OpenSpec verification: typecheck, build, execute the complete test suite, and verify package contents with the package dry run.
4. During final OpenSpec verification, load the compiled bundle from a local OpenCode configuration and complete the recorded manual smoke procedure.
5. Publish the same compiled entry through npm when release metadata is ready.

Rollback consists of removing the plugin entry from OpenCode configuration or uninstalling the package. The plugin writes only namespaced UI preferences and does not migrate or mutate OpenSpec data.

## Open Questions

None for the bounded MVP.
