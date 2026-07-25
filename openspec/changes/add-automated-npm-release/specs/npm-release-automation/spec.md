## ADDED Requirements

### Requirement: Release runs on push to main
After Trusted Publisher configuration and workflow activation, the repository SHALL provide a GitHub Actions release workflow that is triggered exclusively by `push` events on the `main` branch. Git tags and GitHub Releases SHALL NOT be used as triggers, because they are produced by the workflow itself. The workflow SHALL serialize concurrent runs so that two pushes cannot publish simultaneously. This is the final steady state; the pre-configuration bootstrap state is governed separately by the dormant-workflow requirement.

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
- **WHEN** the activated release workflow runs after Trusted Publisher configuration and the commits since the last release contain only non-releasing types such as `chore:`, `docs:`, or `test:`
- **THEN** the workflow completes successfully without publishing and without creating a tag

### Requirement: Bootstrap release workflow remains dormant until npm trust exists
The automation bootstrap SHALL add a fully defined `.github/workflows/release.yml` whose only trigger is `workflow_dispatch`. The workflow SHALL NOT be run or manually dispatched before the package's npm Trusted Publisher is configured. The bootstrap merge SHALL prove the CI workflow is green and that dormant `release.yml` exists on canonical `main`; it SHALL NOT claim or require successful pre-authentication release execution.

#### Scenario: Automation setup reaches canonical main
- **WHEN** the automation pull request is merged with a non-releasing `ci:` setup commit after green pull-request CI
- **THEN** fully defined `release.yml` exists under `.github/workflows/` on canonical `main` with only the `workflow_dispatch` trigger
- **AND** no release workflow run is started by the merge

#### Scenario: Dormant workflow before Trusted Publisher configuration
- **WHEN** `release.yml` exists on canonical `main` but npm Trusted Publisher is not yet configured
- **THEN** maintainers do not run or manually dispatch the workflow

#### Scenario: Pre-authentication execution is unsafe
- **WHEN** semantic-release would run before npm Trusted Publisher configuration with no `NPM_TOKEN` available
- **THEN** the workflow remains dormant because `@semantic-release/npm` authentication occurs during `verifyConditions` before `analyzeCommits` can classify a commit as non-releasing

#### Scenario: Workflow activation after trust configuration
- **WHEN** npm Trusted Publisher configuration is confirmed complete
- **THEN** the README fix pull request replaces the dormant `workflow_dispatch` trigger with `push` on `main`
- **AND** the release workflow becomes active only when that pull request is merged

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
- **WHEN** the `1.0.0` bootstrap is published and tagged, dormant `release.yml` exists on canonical `main`, and pull-request CI has succeeded
- **AND** the maintainer configures npm Trusted Publishing
- **THEN** the publisher uses organization/user `Angel-M-R`, repository `opencode-openspec-task-tui`, and workflow filename `release.yml`
- **AND** no `NPM_TOKEN` or equivalent npm authentication secret exists

#### Scenario: Referenced workflow is still absent
- **WHEN** `release.yml` does not yet exist under `.github/workflows/` on canonical `main`
- **THEN** npm Trusted Publisher configuration remains blocked

#### Scenario: First trusted patch release
- **WHEN** Trusted Publisher configuration is complete and the pull request containing both the prepared README correction and the `push`-to-`main` workflow activation lands on `main` with an accurate `fix:` Conventional Commit
- **THEN** the release workflow authenticates with OIDC and publishes `1.0.1` with provenance
- **AND** no npm authentication token is used

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

### Requirement: Release operation is documented
The README SHALL document that commit messages follow Conventional Commits, release-worthy merges to `main` publish automatically, and released versions are read from git tags and the npm registry while committed `package.json` retains `0.0.0-development`.

#### Scenario: Contributor checks how releases work
- **WHEN** a contributor reads the release-process documentation
- **THEN** they can determine how commit type affects publishing and where to find the current released version
