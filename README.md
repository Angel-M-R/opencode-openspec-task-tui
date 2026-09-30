# OpenSpec Task Progress for OpenCode

`opencode-openspec-task-tui` automatically selects the active OpenSpec change for the current project and adds a read-only OpenCode sidebar. It shows global and per-section task progress and keeps accordion preferences separate by project and change.

<img width="350" height="250" alt="CleanShot 2026-08-01 at 13 09 53@2x" src="https://github.com/user-attachments/assets/89ea9e4e-6245-4753-9567-ac49dd55d8b2" />


## Requirements

The `openspec` CLI must be available on `PATH`, and the current session must
point at an OpenSpec project. This plugin only displays progress; it does not
install OpenSpec or edit tasks. Sections can be collapsed with the mouse or
keyboard. Hover truncated task and section text to see the full description.

## OpenCode v2 migration

This branch targets OpenCode 2.0.18 and OpenTUI 0.5.12. It uses the native
`@opencode/plugin/tui` API and no longer supports the v1 plugin API.
The npm release must include this migration before the package name can be
used with v2. To try this branch now, build it locally with Node.js 22.13 or
newer and pnpm 10.8:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Add the **dist directory** to `~/.config/opencode/cli.json`:

```json
{
  "plugins": ["/absolute/path/to/opencode-openspec-task-tui/dist"]
}
```

Merge this entry with your existing `plugins` array. Keep the bundle in its
package directory so peer dependencies remain resolvable. After a v2-compatible
npm release is published, replace the path with `opencode-openspec-task-tui@<version>`.
Restart OpenCode after changing the configuration.

Remove the old entry from `opencode.json` or `tui.json`. OpenCode v2 CLI plugins
use `cli.json` and the plural `plugins` key. See the
[official plugin documentation](https://opencode.ai/v2/docs/cli/plugins).
Preferences from the v1 key-value store are not imported; set them again once
in v2.

## Development

Bun is required for the native OpenTUI tests. CI uses Bun 1.4.2.

```sh
pnpm typecheck
pnpm test
pnpm run pack:dry-run
pnpm audit --prod --audit-level moderate
```

Unit tests cover discovery and domain behavior. Native tests render the v2
slots and exercise the plugin lifecycle with OpenTUI.
