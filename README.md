# OpenSpec Task Progress for OpenCode

`opencode-openspec-task-tui` automatically selects the active OpenSpec change for the current project and adds a read-only OpenCode sidebar. It shows global and per-section task progress and keeps accordion preferences separate by project and change.

<img width="350" height="250" alt="CleanShot 2026-08-01 at 13 09 53@2x" src="https://github.com/user-attachments/assets/89ea9e4e-6245-4753-9567-ac49dd55d8b2" />


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
