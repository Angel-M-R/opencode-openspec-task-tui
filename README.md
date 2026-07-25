# OpenSpec Task Progress for OpenCode

`opencode-openspec-task-tui` adds a read-only OpenCode sidebar for the active OpenSpec change referenced by the current session. It shows global and per-section task progress and keeps accordion preferences separate by project and change.

## Requirements

- Node.js 22.13 or newer
- OpenCode with a compatible TUI plugin API
- The `openspec` CLI available on `PATH`
- An OpenSpec project opened as the current OpenCode project

## Install from npm

Install the package:

```sh
npm install opencode-openspec-task-tui
```

Add its TUI entry to `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-openspec-task-tui"]
}
```

Restart OpenCode after changing the configuration.

## Use a local compiled bundle

From this repository, install dependencies and build the bundle:

```sh
pnpm install
pnpm build
```

Point OpenCode at the resulting JavaScript file with an absolute path:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["/absolute/path/to/openspec-opencode-statusline/dist/tui.js"]
}
```

Restart OpenCode. Keep the bundle in this package directory so its OpenCode, OpenTUI, and Solid peer dependencies remain resolvable.

## Active change and task syntax

Reference a change explicitly in the current session with either `--change <kebab-case-name>` (including `--change=<name>`) or `openspec/changes/<kebab-case-name>`. The newest explicit current-session reference is validated with `openspec status --change <name> --json`; references from other sessions are ignored.

Only these task markers in the resolved `tasks.md` are counted:

```md
- [ ] Unfinished list task
- [x] Finished list task
- [X] Finished list task with uppercase X

### [ ] Unfinished heading task
### [x] Finished heading task
### [X] Finished heading task with uppercase X
```

Other Markdown is not counted as a task. Non-task headings group tasks into ordered accordion sections; tasks before a section use the `Tasks` fallback section.

## MVP boundaries

This MVP is task-progress visibility only. It does not provide:

- change selection or browsing;
- proposal, design, spec, verification, archive, or other non-task artifact status;
- apply, verify, archive, edit, task-authoring, or other mutation actions;
- arbitrary Markdown trees or nested task hierarchy.

See [`openspec/changes/add-active-change-task-tui/verification-handoff.md`](openspec/changes/add-active-change-task-tui/verification-handoff.md) for the manual OpenCode smoke procedure reserved for final OpenSpec verification.
