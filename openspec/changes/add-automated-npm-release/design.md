## Context

GitHub reports that the repository moved and now has the canonical identity `Angel-M-R/opencode-openspec-task-tui` (`https://github.com/Angel-M-R/opencode-openspec-task-tui`). The local directory remains `openspec-opencode-statusline`, and the existing SSH `origin` still uses GitHub's non-canonical forwarding URL. The repository holds the package `opencode-openspec-task-tui`; its publish metadata still uses the non-canonical identity and must be corrected before bootstrap publishing. It has a working build (`tsup`), typecheck, unit and integration tests, and a `prepack` hook, but no CI or release automation and it has never been published.

A sibling project (`references/sub-agent-statusline`, gitignored, its own git repo) already runs semantic-release with the same four plugins and a very similar `ci.yml` / `release.yml` pair. It is a useful style reference, but it authenticates with a stored `NPM_TOKEN`; this design deliberately diverges to OIDC trusted publishing so no npm credential ever exists in GitHub.

Facts this design relies on (already verified; do not re-research):
- npm Trusted Publishing requires `permissions: id-token: write`, a GitHub-hosted runner, npm CLI >= 11.5.1, and Node.js >= 22.14.0.
- The trusted publisher is configured **per package** on npmjs.com, so the package must already exist before OIDC can be enabled.
- Under trusted publishing from a public repository, provenance is generated automatically.
- `@semantic-release/npm` officially supports trusted publishing.
- semantic-release does not commit the `package.json` version back to the repository.

## Goals / Non-Goals

**Goals:**
- Publishing to npm is an automatic consequence of merging a `feat:`/`fix:` commit into `main`.
- Zero npm credentials in GitHub: OIDC only, with automatic provenance.
- Every push and pull request is validated (typecheck, tests, packaging, production audit) on the minimum supported Node version.
- Conventional Commits are enforced before a bad message can reach `main`.
- The bootstrap path from "never published" to "fully automated" is written down as an explicit, ordered sequence, with the maintainer-only steps clearly separated from in-repo steps.

**Non-Goals:**
- No release branches, prereleases, `next`/`beta` channels, or maintenance lines. `main` only.
- No manual approval gate, environment protection rule, or release captain. Merging is the decision.
- No `CHANGELOG.md` file committed to the repository — release notes live in the GitHub Release.
- No changes to product code, build configuration, tests, or runtime `peerDependencies`.
- No multi-Node test matrix, no coverage thresholds, no publishing of the `dist/` build as a GitHub artifact.
- No renaming of the npm package and no further repository rename; this change only reconciles release setup with GitHub's already-completed move to the canonical slug.

## Decisions

### Trigger: `push` to `main`, tags as output
`release.yml` triggers on `push` to `main` and calls `semantic-release`, which computes the version, publishes, then creates the `vX.Y.Z` tag and GitHub Release. Tags are therefore *effects*, never causes.

- *Alternative rejected — tag-triggered release*: requires a human to compute and push the right tag, which is exactly the manual step semantic-release exists to remove, and invites tag/registry divergence.
- *Alternative rejected — `workflow_dispatch` gate*: the confirmed decision is no gate; a gate would also make "merged" and "released" diverge.
- A `concurrency: { group: release, cancel-in-progress: false }` block serializes runs. Cancelling mid-publish is unsafe: a cancelled run could publish to npm and then never create its tag.

### Auth: npm Trusted Publishing (OIDC), bootstrapped by one manual publish
The release job declares `permissions: { contents: write, issues: write, pull-requests: write, id-token: write }` and runs on `ubuntu-latest`. `@semantic-release/npm` picks up the OIDC identity; no `NPM_TOKEN`/`NODE_AUTH_TOKEN` is set anywhere.

The chicken-and-egg problem is that a Trusted Publisher is configured per package on npmjs.com, so the package must exist first. Resolution: the maintainer publishes `1.0.0` once by hand (`npm login` + `npm publish`), tags `v1.0.0`, then configures the Trusted Publisher, then automation takes over from `1.0.1`/`1.1.0` onward.

- *Alternative rejected — `NPM_TOKEN` secret* (what the reference project does): a long-lived credential that can leak, must be rotated, and requires explicit `NPM_CONFIG_PROVENANCE=true`.
- *Alternative rejected — granular automation token for the bootstrap only*: still a stored credential for a one-time step already covered by an interactive `npm login`.
- The manual `v1.0.0` tag matters: without it, semantic-release sees no previous release and would try to publish `1.0.0` again, which the registry rejects.

### Version source of truth: `0.0.0-development` sentinel
`package.json` carries `version: "0.0.0-development"` on `main` (per the semantic-release FAQ). semantic-release sets the real version in the published tarball at publish time and never commits it back. Git tags plus the registry are authoritative.

- *Alternative rejected — commit the version back via `@semantic-release/git`*: adds a bot commit to `main` on every release, which then needs `[skip ci]` handling and a push permission carve-out for protected branches.
- The visible cost: `package.json` never shows the released version. The sentinel value is chosen precisely so this looks deliberate rather than broken.

### Node versions: 22.13 in CI, 24 in release
`engines.node` stays `>=22.13` (a consumer contract, unchanged). `ci.yml` runs on Node 22.13 so the floor is genuinely exercised. `release.yml` runs on Node 24, because trusted publishing needs Node >= 22.14 and npm >= 11.5.1 — the npm bundled with 22.13 is too old.

- *Alternative rejected — bump `engines` to `>=22.14`*: penalizes consumers for a CI-only constraint.
- *Alternative rejected — run everything on 24*: the minimum supported version would then never be tested.

### Two workflows, one responsibility each
`ci.yml` validates (typecheck, test, `pnpm pack --dry-run`, `pnpm audit --prod --audit-level moderate`) on `pull_request` and `push`, with `permissions: contents: read` and no OIDC token. `release.yml` re-runs the same verification steps before invoking semantic-release, then publishes.

- The duplication is intentional: the release job must not trust that a CI run for that commit happened or passed. It is a few minutes of runner time in exchange for never publishing an unverified tarball.
- *Alternative rejected — `workflow_run`-chained release*: more moving parts, harder to reason about, and inherits CI's result rather than establishing its own.

### pnpm provisioning from `packageManager`
`pnpm/action-setup@v4` with no `version` input, so it reads `packageManager: pnpm@10.8.0`. Bumping pnpm then means editing one field, not three files. Both workflows install with `--frozen-lockfile --ignore-scripts`; `--ignore-scripts` keeps husky's `prepare` from touching runners and `--frozen-lockfile` turns lockfile drift into a failure.

### semantic-release configuration
A `release` block in `package.json` (matching the reference project's shape) with `branches: ["main"]` and plugins in order: `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, `@semantic-release/npm`, `@semantic-release/github`. No separate `.releaserc`; one fewer root file, and the plugins are already `devDependencies` neighbours.

- *Alternative rejected — `@semantic-release/changelog` + `@semantic-release/git`*: would commit a `CHANGELOG.md` back to `main`, reintroducing the bot-commit problem for a document the GitHub Release already provides.

### Commit convention enforcement: commitlint + husky, local only
`@commitlint/cli` + `@commitlint/config-conventional`, a `commitlint.config.js`, a husky `commit-msg` hook, and a `prepare: husky` script. This is a local guard; CI's `--ignore-scripts` means the hook is never installed on runners.

- *Alternative rejected — a commitlint CI job on PR commits*: squash-merge rewrites the message anyway, so the PR-time check validates text that may never land; the local hook catches mistakes at the moment they are made.
- Accepted gap: a maintainer committing via the GitHub web UI, or with `--no-verify`, bypasses the hook. The consequence is a mis-versioned or non-releasing commit, not a broken publish.

### Package metadata as a release-blocking requirement
`repository.url` must be exactly `https://github.com/Angel-M-R/opencode-openspec-task-tui`, because npm Trusted Publishing validates it against the canonical repository that runs the workflow. `homepage` must use that repository's README URL, and `bugs.url` must use its issues URL. Also required: `LICENSE` (MIT), `keywords`, and `publishConfig.access: public`.

- These are treated as hard requirements, not polish: OIDC validates the repository claim against this field.

### Repository move reconciliation precedes bootstrap
The existing SSH `origin` still names the old forwarding slug, so it is not sufficient evidence of the canonical identity. Before setting or publishing version `1.0.0`, update both the fetch and push URL for `origin` to `git@github.com:Angel-M-R/opencode-openspec-task-tui.git`, verify both entries with `git remote -v`, correct the repository/homepage/bugs metadata, re-run verification, and commit and push those corrections to canonical `main`.

After the manual `1.0.0` publish creates the npm package, configure its Trusted Publisher with organization/user `Angel-M-R`, repository `opencode-openspec-task-tui`, and workflow filename `release.yml`.

- *Alternative rejected — continue using GitHub's forwarding URL*: forwarding preserves Git transport temporarily but leaves local configuration and npm's exact repository identity tied to a non-canonical slug.

## Risks / Trade-offs

- **npm publishes are effectively irreversible after 72 hours** → the bootstrap publish is preceded by `npm pack --dry-run` and a manual inspection of the tarball contents; `files: ["dist"]` and `prepack` are verified before the first publish. After the window, the only remedy is publishing a superseding version.
- **A wrong `repository.url` breaks OIDC silently until the first CI publish** → use the canonical identity returned by GitHub, update both Git `origin` URLs to match it, verify the metadata before bootstrap, and treat the first automated release as a deliberate smoke test (a trivial `fix:` commit) rather than a real feature ship.
- **No gate: any merge to `main` with `feat:`/`fix:` publishes** → accepted by decision. Mitigated by the release job re-running full verification before publishing, so a merge can only publish something that typechecks, tests clean, packs, and passes the production audit.
- **Bootstrap ordering is fragile**: publishing `1.0.0` without tagging `v1.0.0` makes the first automated run attempt `1.0.0` again and fail on a registry conflict → the tag step is an explicit, non-optional task in the sequence.
- **Node 24 in release vs 22.13 in CI** means the publish path runs on a runtime CI never exercises → the release job re-runs typecheck and tests on Node 24, so a Node-version-specific break surfaces there before publishing.
- **A cancelled or infrastructure-failed release run can publish to npm and fail before tagging** → `cancel-in-progress: false` avoids self-inflicted cancellation; if it still happens, the recovery is to push the missing tag manually so the next run computes from the right baseline.
- **`pnpm audit --prod` can fail on a newly disclosed advisory in a dependency that nobody touched**, blocking an unrelated release → accepted; the audit is `--prod --audit-level moderate` to keep the blast radius to shipped dependencies at real severity.
- **Adding husky/commitlint changes the local install experience** (a `prepare` script now runs on `pnpm install`) → documented in the tasks; harmless on runners because of `--ignore-scripts`.
