## Why

The package is not published anywhere and has no automated quality gate: every release would be a hand-run `npm publish` from a laptop, with the version number, changelog, and git tag maintained by hand. Users cannot install the plugin, and nothing prevents a broken `main` from being shipped. Publishing needs to become a boring, repeatable consequence of merging conventional commits into `main`, with npm credentials that cannot leak because they never exist.

## What Changes

- Add a **release pipeline** (`.github/workflows/release.yml`) that runs `semantic-release` on every push to `main`. It derives the next version from conventional commits, publishes to npm, and creates the `vX.Y.Z` git tag plus the GitHub Release with generated notes. Tags and releases are *outputs* of the pipeline, never triggers.
- Authenticate to npm with **npm Trusted Publishing (OIDC)**. No `NPM_TOKEN` is stored in GitHub; provenance attestation is produced automatically. This requires the package to already exist on the registry, so the very first `1.0.0` publish is a deliberate one-time manual bootstrap performed by the maintainer.
- Add a **CI pipeline** (`.github/workflows/ci.yml`) that runs typecheck, tests, `pnpm pack --dry-run`, and `pnpm audit --prod --audit-level moderate` on pull requests and pushes. CI validates; it never publishes.
- **Enforce conventional commits locally** with `commitlint` + `husky`, so the version semantics the release pipeline depends on are actually respected. CI installs dependencies with `--ignore-scripts`, so hooks are never installed on runners.
- Complete the **publishable package metadata** that OIDC and the registry require: `repository.url`, `homepage`, and `bugs` must use the canonical `Angel-M-R/opencode-openspec-task-tui` GitHub repository, alongside a MIT `LICENSE` file, `keywords`, and `publishConfig.access: public`. The local Git `origin` must also use that canonical repository before bootstrap publishing. The `version` field becomes the sentinel `0.0.0-development`; git tags and the registry are the source of truth.
- No publication gate beyond the pipeline itself: any push to `main` carrying a `feat:` or `fix:` commit publishes a release.

## Capabilities

### New Capabilities
- `npm-release-automation`: Automated, conventional-commit-driven publishing of the package to npm from `main`, authenticated via GitHub OIDC trusted publishing, including the version/tag/release artifacts it produces and the package metadata it depends on.
- `continuous-integration`: Automated validation of pull requests and pushes — typecheck, tests, packaged-artifact inspection, and production dependency audit — on the minimum supported Node version.
- `commit-conventions`: Local enforcement of Conventional Commits message format so release versioning is deterministic.

### Modified Capabilities
<!-- None. openspec/specs/ is currently empty; no existing requirements change. -->

## Impact

- **New files**: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `LICENSE`, commitlint config, husky `commit-msg` hook.
- **Modified files**: `package.json` (metadata, `version` sentinel, `release` config block, `devDependencies`, release-related scripts), `pnpm-lock.yaml`.
- **New devDependencies**: `semantic-release` and its four plugins (`commit-analyzer`, `release-notes-generator`, `npm`, `github`), `@commitlint/cli`, `@commitlint/config-conventional`, `husky`.
- **No product/runtime code changes.** `src/`, `test/`, and build configuration are untouched; runtime `peerDependencies` are unaffected.
- **External systems**: an npm account and a published `1.0.0` package; a per-package Trusted Publisher configured on npmjs.com; GitHub Actions permissions (`id-token: write`, `contents: write`) using only the built-in `GITHUB_TOKEN`.
- **Irreversibility risk**: an npm publish cannot be undone after 72 hours, and a wrong `repository.url` breaks OIDC silently until the first CI publish attempt.
