# Commit Conventions Specification

## Purpose

Define commit-message conventions and local enforcement required by automated releases.

## Requirements

### Requirement: Commit messages follow Conventional Commits
Commit messages in this repository SHALL follow the Conventional Commits specification, because the release version is derived from them. The repository SHALL configure `commitlint` with the conventional configuration as the authority for message validity.

#### Scenario: Valid message
- **WHEN** a commit message is `feat: add release workflow`
- **THEN** it passes validation

#### Scenario: Invalid message
- **WHEN** a commit message is `updated stuff`
- **THEN** validation fails and reports the expected format

### Requirement: Convention is enforced locally by a git hook
The repository SHALL install a `commit-msg` git hook via `husky` that runs `commitlint` on the message being committed, rejecting the commit when validation fails. Hook installation SHALL happen through the package's prepare step for local development only.

#### Scenario: Bad commit locally
- **WHEN** a developer with installed dependencies commits a non-conventional message
- **THEN** the commit is rejected before it is created

#### Scenario: Fresh clone
- **WHEN** a developer installs dependencies normally after cloning
- **THEN** the `commit-msg` hook is installed automatically

#### Scenario: CI runner
- **WHEN** dependencies are installed in CI with scripts disabled
- **THEN** no git hooks are installed and the run is unaffected
