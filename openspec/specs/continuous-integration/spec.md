# Continuous Integration Specification

## Purpose

Define reproducible validation performed by GitHub Actions without publishing side effects.

## Requirements

### Requirement: CI validates pull requests and pushes
The repository SHALL provide a GitHub Actions CI workflow triggered on pull requests and on pushes. The workflow SHALL run typecheck, the test suite, a packaged-artifact inspection (`pnpm run pack:dry-run`), and a production dependency audit (`pnpm audit --prod --audit-level moderate`).

#### Scenario: Pull request opened
- **WHEN** a pull request is opened or updated
- **THEN** CI runs typecheck, tests, packaging inspection, and the production audit

#### Scenario: Push to a branch
- **WHEN** a commit is pushed
- **THEN** the same validation steps run

#### Scenario: A check fails
- **WHEN** any validation step fails
- **THEN** the workflow fails and reports which step failed

#### Scenario: Automation introduced through a pull request
- **WHEN** the pull request that adds `ci.yml` and the fully defined but dormant `release.yml` is opened or updated
- **THEN** the newly added CI workflow runs all required validation steps and must pass before the automation is merged to `main`
- **AND** the release workflow is not run or dispatched before npm Trusted Publisher configuration

### Requirement: CI never publishes
The CI workflow SHALL NOT publish to any registry, create tags, or create releases. It SHALL request only read permissions on repository contents and SHALL NOT request an OIDC token.

#### Scenario: CI run on main
- **WHEN** CI runs for a push to `main`
- **THEN** it performs validation only; publishing happens exclusively in the release workflow

### Requirement: CI validates the minimum supported Node version
The CI workflow SHALL run on the minimum Node.js version declared in `engines` (Node 22.13), so that support for consumers on that version is actually exercised. The release workflow MAY run on a newer Node.js version as required by trusted publishing.

#### Scenario: Consumer minimum
- **WHEN** CI runs
- **THEN** it uses Node 22.13, matching the `engines.node` floor

#### Scenario: Release runtime differs
- **WHEN** the release workflow runs
- **THEN** it uses a Node.js version that satisfies the trusted-publishing minimum, without changing the `engines` floor for consumers

### Requirement: Dependency installation is reproducible and script-free in CI
Both workflows SHALL install dependencies from the committed lockfile with scripts disabled (`pnpm install --frozen-lockfile --ignore-scripts`), so that git hooks are not installed on runners and a lockfile drift fails the run. pnpm SHALL be provisioned from the `packageManager` field rather than a hardcoded version.

#### Scenario: Lockfile out of date
- **WHEN** `pnpm-lock.yaml` does not match `package.json`
- **THEN** installation fails and the workflow stops

#### Scenario: Hook installation skipped
- **WHEN** dependencies are installed on a runner
- **THEN** the git hook setup script does not run

#### Scenario: pnpm version source
- **WHEN** the pnpm setup step runs
- **THEN** it resolves the pnpm version from the `packageManager` field in `package.json`
