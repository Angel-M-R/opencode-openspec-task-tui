## ADDED Requirements

### Requirement: Release runs on push to main
The repository SHALL provide a GitHub Actions release workflow that is triggered exclusively by `push` events on the `main` branch. Git tags and GitHub Releases SHALL NOT be used as triggers, because they are produced by the workflow itself. The workflow SHALL serialize concurrent runs so that two pushes cannot publish simultaneously.

#### Scenario: Commit merged to main
- **WHEN** a commit is pushed to `main`
- **THEN** the release workflow runs and invokes `semantic-release`

#### Scenario: Tag created by the workflow
- **WHEN** the release workflow creates the tag `vX.Y.Z` and its GitHub Release
- **THEN** no further workflow run is triggered by that tag or release

#### Scenario: Two pushes in quick succession
- **WHEN** a second push to `main` arrives while a release run is still in progress
- **THEN** the second run waits for the first to finish instead of running in parallel, and neither run is cancelled

### Requirement: Version is derived from conventional commits
The release workflow SHALL determine the next version solely from the Conventional Commit messages since the last release, using `semantic-release` with the plugins `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, `@semantic-release/npm`, and `@semantic-release/github`, configured for the `main` branch. There SHALL be no manual approval gate.

#### Scenario: Feature commit
- **WHEN** the commits since the last release include a `feat:` commit and no breaking change
- **THEN** a minor version is published

#### Scenario: Fix commit
- **WHEN** the commits since the last release include only `fix:` commits
- **THEN** a patch version is published

#### Scenario: Breaking change
- **WHEN** a commit since the last release declares a breaking change
- **THEN** a major version is published

#### Scenario: No release-worthy commits
- **WHEN** the commits since the last release contain only non-releasing types such as `chore:`, `docs:`, or `test:`
- **THEN** the workflow completes successfully without publishing and without creating a tag

### Requirement: package.json version is a sentinel
The committed `package.json` SHALL carry the version `0.0.0-development`. The release process SHALL NOT commit a version back to the repository; git tags and the npm registry SHALL be the sole source of truth for released versions.

#### Scenario: After a successful release
- **WHEN** a release publishes version `X.Y.Z` to npm
- **THEN** the `version` field in the repository's `package.json` on `main` remains `0.0.0-development`
- **AND** the tag `vX.Y.Z` exists in the repository

#### Scenario: Local inspection
- **WHEN** a contributor reads `package.json` to find the current released version
- **THEN** the sentinel value signals that the version must be read from git tags or the registry instead

### Requirement: npm authentication uses trusted publishing
Publishing SHALL authenticate to npm via npm Trusted Publishing (OIDC). No npm authentication token SHALL be stored as a GitHub secret or referenced by any workflow. The release job SHALL request the `id-token: write` permission, run on a GitHub-hosted runner, and use a Node.js and npm CLI version that support trusted publishing (Node.js >= 22.14.0, npm >= 11.5.1). The package's Trusted Publisher SHALL identify organization/user `Angel-M-R`, repository `opencode-openspec-task-tui`, and workflow filename `release.yml`.

#### Scenario: Publish from CI
- **WHEN** the release workflow publishes to npm
- **THEN** authentication succeeds using the workflow's OIDC identity with no `NPM_TOKEN` present in the environment

#### Scenario: Provenance
- **WHEN** a version is published under trusted publishing from the public repository
- **THEN** npm records a provenance attestation for that version without any explicit provenance configuration

#### Scenario: Secret scan of workflows
- **WHEN** the workflow files are inspected for credentials
- **THEN** the only token referenced is the built-in `GITHUB_TOKEN`

#### Scenario: Trusted Publisher repository identity
- **WHEN** the maintainer configures npm Trusted Publishing after the bootstrap publish
- **THEN** the publisher uses organization/user `Angel-M-R`, repository `opencode-openspec-task-tui`, and workflow filename `release.yml`

### Requirement: Package metadata supports publishing
`package.json` SHALL declare the metadata required for a public, OIDC-published package: `repository.url` equal to `https://github.com/Angel-M-R/opencode-openspec-task-tui`, `homepage` pointing to that repository's README, `bugs.url` equal to `https://github.com/Angel-M-R/opencode-openspec-task-tui/issues`, `keywords`, `license`, and `publishConfig.access: public`. The repository SHALL contain a MIT `LICENSE` file. The declared repository URL SHALL match the canonical GitHub repository that runs the release workflow exactly.

#### Scenario: Repository URL mismatch
- **WHEN** `repository.url` does not resolve to the repository executing the release workflow
- **THEN** trusted publishing is rejected, so the URL is treated as a release-blocking requirement rather than cosmetic metadata

#### Scenario: Public access
- **WHEN** the package is published
- **THEN** it is published with public access

#### Scenario: License present
- **WHEN** the published tarball is inspected
- **THEN** it declares the MIT license and the repository contains a matching `LICENSE` file

### Requirement: Canonical repository is established before bootstrap
Before preparing or publishing the manual `1.0.0` bootstrap release, the local Git `origin` fetch and push URLs SHALL both be `git@github.com:Angel-M-R/opencode-openspec-task-tui.git`. The canonical repository metadata corrections SHALL be verified, committed, and pushed to `main` before bootstrap work proceeds.

#### Scenario: Forwarding origin still configured
- **WHEN** `git remote -v` reports the old forwarding slug for either fetch or push
- **THEN** bootstrap preparation and publishing remain blocked

#### Scenario: Canonical repository correction complete
- **WHEN** both `origin` URLs use the canonical SSH URL and the canonical metadata has been verified, committed, and pushed to `main`
- **THEN** preparation of the manual `1.0.0` bootstrap release may begin

### Requirement: Released artifact is verified before publish
The release workflow SHALL verify the package before publishing by running typecheck, the test suite, a production dependency audit, and a packaging dry run. A failure in any verification step SHALL abort the release without publishing.

#### Scenario: Tests fail on main
- **WHEN** the test suite fails during a release run
- **THEN** nothing is published to npm, no tag is created, and the workflow fails

#### Scenario: Verification passes
- **WHEN** all verification steps pass
- **THEN** `semantic-release` proceeds to publish

### Requirement: GitHub Release accompanies each npm release
Each published version SHALL be accompanied by a GitHub Release containing generated release notes derived from the conventional commits included in that version, created with the built-in `GITHUB_TOKEN`.

#### Scenario: Successful publish
- **WHEN** version `X.Y.Z` is published to npm
- **THEN** a GitHub Release for tag `vX.Y.Z` exists with notes grouped by commit type
