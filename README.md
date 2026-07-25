# OpenSpec Task Progress for OpenCode

`opencode-openspec-task-tui` automatically selects the active OpenSpec change for the current project and adds a read-only OpenCode sidebar. It shows global and per-section task progress and keeps accordion preferences separate by project and change.

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
  "plugin": ["/absolute/path/to/opencode-openspec-task-tui/dist/tui.js"]
}
```

Restart OpenCode. Keep the bundle in this package directory so its OpenCode, OpenTUI, and Solid peer dependencies remain resolvable.

## Active change and task syntax

No session command or change reference is required. The plugin automatically selects a change from `openspec list --json` in the current project and keeps the selection and progress current through filesystem watchers and periodic reconciliation.

Selection is deterministic:

- only `in-progress` and `complete` changes are eligible;
- `in-progress` changes outrank `complete` changes;
- within the winning status group, the change with the newest valid `lastModified` wins;
- `no-tasks` and invalid entries are ignored.

The selected name is authoritatively validated and resolved with `openspec status --change <name> --json`. Global and section progress are calculated from the resolved `tasks.md`, not from list counters. OpenCode session content and explicit `--change` references do not affect selection.

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

## Releases

Conventional Commits determine the release type: `fix:` publishes a patch, `feat:` publishes a minor, and a breaking change publishes a major. Merging a release-worthy commit to `main` publishes automatically. Git tags and the npm registry are the source of truth for released versions; the committed `package.json` intentionally retains `0.0.0-development`.

## MVP boundaries

This MVP is task-progress visibility only. It does not provide:

- change selection or browsing;
- proposal, design, spec, verification, archive, or other non-task artifact status;
- apply, verify, archive, edit, task-authoring, or other mutation actions;
- arbitrary Markdown trees or nested task hierarchy.
