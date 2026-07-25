Each task is tagged with who performs it:

- **[impl]** — an implementer working inside this repository.
- **[user]** — the maintainer, acting manually outside the repository (npm website, `npm login`, interactive publish, pushing a tag). These cannot be automated and must not be attempted by an agent.

The groups are strictly ordered: each group must be complete before the next starts. Sections 1–5 are completed and remain unchanged. The remaining sequence is: preflight the dormant workflow after trust configuration, finalize and merge the first real OIDC release pull request, obtain the maintainer's npm publication and provenance confirmation, then verify the repository-side release artifacts and sentinel version. npm Trusted Publisher configuration must not begin until dormant `release.yml` exists on canonical `main`; that workflow must not run or be manually dispatched before trust is configured.

## 1. Publishable package metadata

- [x] 1.1 **[impl]** Set both Git `origin` URLs to the canonical repository: run `git remote set-url origin git@github.com:Angel-M-R/opencode-openspec-task-tui.git` and `git remote set-url --push origin git@github.com:Angel-M-R/opencode-openspec-task-tui.git`, then verify `git remote -v` shows that URL for both fetch and push.
- [x] 1.2 **[impl]** Update `repository` in `package.json` to `{ "type": "git", "url": "https://github.com/Angel-M-R/opencode-openspec-task-tui" }`, exactly matching the canonical GitHub repository required by npm Trusted Publishing.
- [x] 1.3 **[impl]** Update `homepage` to the canonical repository README URL and `bugs.url` to `https://github.com/Angel-M-R/opencode-openspec-task-tui/issues`.
- [x] 1.4 **[impl]** Add a `keywords` array to `package.json` (e.g. `opencode`, `openspec`, `plugin`, `tui`, `statusline`, `tasks`).
- [x] 1.5 **[impl]** Add `publishConfig: { "access": "public" }` to `package.json`.
- [x] 1.6 **[impl]** Create a MIT `LICENSE` file at the repository root with the correct copyright holder and year; verify it matches the existing `license: "MIT"` field.
- [x] 1.7 **[impl]** Add `README.md` to the `files` array if the published tarball should include it, then run `pnpm run pack:dry-run` and inspect the listed contents (expect `dist/` output and nothing from `src/`, `test/`, `openspec/`, or `references/`).
- [x] 1.8 **[impl]** Verify the canonical `repository`, `homepage`, and `bugs` values and both `origin` entries; re-run `pnpm typecheck` and `pnpm test`; then commit the corrections with a conventional message and push them to canonical `main`. Confirm the pushed commit is present before starting group 2.

## 2. First-version bootstrap in the repo

- [x] 2.1 **[impl]** Set `version` in `package.json` to `1.0.0` (temporary — group 4 replaces it with the sentinel). Commit as `chore(release): prepare 1.0.0 bootstrap`.
- [x] 2.2 **[impl]** Re-run `pnpm run pack:dry-run` and confirm the generated tarball name reflects `1.0.0` and the `prepack` build succeeded.
- [x] 2.3 **[impl]** Confirm the package name `opencode-openspec-task-tui` is still unclaimed on npm (e.g. `npm view opencode-openspec-task-tui` should report a 404) and report to the maintainer if it is taken — the bootstrap cannot proceed under a taken name.
- [x] 2.4 **[impl]** Push the `1.0.0` bootstrap commit to canonical `main` and verify a clean checkout from `git@github.com:Angel-M-R/opencode-openspec-task-tui.git` resolves to that commit before handing off the manual publish.

## 3. Manual first publish (maintainer only)

- [x] 3.1 **[user]** Create or sign in to an npm account with 2FA enabled, on npmjs.com.
- [x] 3.2 **[user]** Run `npm login` locally and confirm `npm whoami` returns the expected account.
- [x] 3.3 **[user]** From a clean checkout of `main` at the `1.0.0` commit, run `npm publish` and confirm version `1.0.0` appears on npmjs.com. **This is irreversible after 72 hours — inspect the dry-run output from task 2.2 before running it.**
- [x] 3.4 **[user]** Create and push the matching tag: `git tag v1.0.0 && git push origin v1.0.0`. Skipping this makes the first automated release attempt `1.0.0` again and fail with a registry conflict.

## 4. Create CI and bootstrap dormant release automation

- [x] 4.1 **[impl]** Preserve the current uncommitted `README.md` correction: inspect and retain its diff, do not restore or overwrite it, and exclude it from every release-setup commit by staging only explicit automation files.
- [x] 4.2 **[impl]** Set `version` in `package.json` to `0.0.0-development`; add devDependencies `semantic-release`, `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, `@semantic-release/npm`, and `@semantic-release/github`; run `pnpm install` to update `pnpm-lock.yaml`.
- [x] 4.3 **[impl]** Add a `release` block to `package.json` with `branches: ["main"]` and the four plugins in order: commit-analyzer, release-notes-generator, npm, github. Add a `release` script (`semantic-release`) and an `audit:prod` script (`pnpm audit --prod --audit-level moderate`); keep `pack:dry-run` consistent with the command CI runs.
- [x] 4.4 **[impl]** Create `.github/workflows/ci.yml`: triggers `pull_request` and `push`; `permissions: contents: read`; steps = checkout, `pnpm/action-setup@v4` with **no** `version` input (resolved from `packageManager`), `actions/setup-node@v4` with `node-version: 22.13` and `cache: pnpm`, `pnpm install --frozen-lockfile --ignore-scripts`, typecheck, test, `pnpm run pack:dry-run`, `pnpm audit --prod --audit-level moderate`.
- [x] 4.5 **[impl]** Create a fully defined but dormant `.github/workflows/release.yml`: its only initial trigger is `workflow_dispatch` (no `push` trigger); `permissions: { contents: write, issues: write, pull-requests: write, id-token: write }`; `concurrency: { group: release, cancel-in-progress: false }`; steps = checkout with `fetch-depth: 0`, `pnpm/action-setup@v4` (no pinned version), `actions/setup-node@v4` with `node-version: 24`, `cache: pnpm` and `registry-url: https://registry.npmjs.org`, `pnpm install --frozen-lockfile --ignore-scripts`, typecheck, test, `pnpm run pack:dry-run`, `pnpm audit --prod --audit-level moderate`, then `pnpm exec semantic-release` with only `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` in `env`. Do not run or dispatch this workflow before task 5.3 confirms Trusted Publisher configuration.
- [x] 4.6 **[impl]** Verify neither workflow references `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or `NPM_CONFIG_PROVENANCE` — trusted publishing supplies auth and provenance automatically.
- [x] 4.7 **[impl]** Add devDependencies `@commitlint/cli`, `@commitlint/config-conventional`, and `husky`; add a `prepare: husky` script; run `pnpm install` if needed to keep `pnpm-lock.yaml` synchronized.
- [x] 4.8 **[impl]** Create `commitlint.config.js` extending `@commitlint/config-conventional`, and a husky `commit-msg` hook that runs commitlint on `$1`. Make the hook file executable.
- [x] 4.9 **[impl]** Run focused configuration checks: pass one valid message and one invalid message directly to commitlint, confirm the hook invokes commitlint with its message-file argument, inspect both workflow definitions for the specified triggers/permissions/steps, explicitly confirm `release.yml` has only `workflow_dispatch` and no `push` trigger, and confirm `package.json` and `pnpm-lock.yaml` agree. Do not include or alter the preserved README correction, and do not run or dispatch `release.yml`.
- [x] 4.10 **[impl]** Stage only the release-automation changes, commit them with a non-releasing conventional message such as `ci: add semantic-release publishing and CI workflows`, push a branch, and open a pull request so the new `ci.yml` validates the setup before it reaches `main`.
- [x] 4.11 **[impl]** Wait for the pull request CI to finish and confirm typecheck, tests, packaged-artifact inspection, and production audit all pass on Node 22.13 before merging.
- [x] 4.12 **[impl]** Merge the automation pull request to `main`; confirm CI was green for the pull request and canonical `main` now contains the fully defined `.github/workflows/release.yml` with only its dormant `workflow_dispatch` trigger. Confirm the merge did not start a release run, and do not manually dispatch it before npm Trusted Publisher is configured.

## 5. Configure npm Trusted Publishing (maintainer only)

- [x] 5.1 **[user]** After task 4.12 confirms dormant `release.yml` exists on canonical `main`, open the published package's Settings → Trusted Publisher on npmjs.com and add a GitHub Actions publisher with organization/user `Angel-M-R`, repository `opencode-openspec-task-tui`, and workflow filename `release.yml`.
- [x] 5.2 **[user]** Confirm no `NPM_TOKEN` (or equivalent npm authentication secret) exists in the GitHub repository or organization settings; if one exists, delete it.
- [x] 5.3 **[user]** Confirm to the implementer that the trusted publisher is saved and the token check is complete, so the first real OIDC release may proceed.

## 6. Preflight dormant release automation after trust configuration

- [x] 6.1 **[impl]** Manually dispatch the dormant `.github/workflows/release.yml` on canonical `main` and wait for the run to complete. Do not edit the preserved, currently uncommitted `README.md` or activate the workflow's `push` trigger before this preflight succeeds.
- [x] 6.2 **[impl]** Require the preflight run to complete typecheck, tests, `pnpm run pack:dry-run`, and `pnpm audit --prod --audit-level moderate` successfully, and require npm OIDC token exchange plus semantic-release `verifyConditions` to succeed.
- [x] 6.3 **[impl]** Confirm semantic-release reports no relevant release and that the preflight creates no npm version, git tag, or GitHub Release. Stop rollout on any failure, unexpected release result, or created output; investigate without attempting repair by deleting an npm version, git tag, or GitHub Release.

## 7. Finalize and publish the prepared README correction as 1.0.1

- [x] 7.1 **[impl]** Continue from the preserved, currently uncommitted `README.md` correction. Ensure it documents project-level active-change selection via `openspec list --json`: exclude changes with no tasks, validate candidate status, prefer in-progress over complete, choose the greatest `lastModified`, and read progress from `tasks.md`. Use the canonical project path, remove the stale session instructions, and remove the broken archived-change link.
- [x] 7.2 **[impl]** Before committing, add concise release-process documentation to `README.md`: Conventional Commits determine release type, a release-worthy merge to `main` publishes automatically, and git tags plus the npm registry—not the sentinel in `package.json`—are the released-version source of truth.
- [x] 7.3 **[impl]** In the same pull request as the README correction, change `release.yml` from its dormant `workflow_dispatch` trigger to the final `push` on `main` trigger. Review the final diff for only the intended README corrections, release documentation, and workflow activation; commit with an accurate patch-releasing message such as `fix(readme): correct active change selection guidance`, then push and open or update the pull request as appropriate.
- [x] 7.4 **[impl]** Wait for green pull-request CI, merge the README correction and workflow activation to `main`, and confirm that the merge's `fix:` commit triggers the newly activated release workflow and reports a successful npm publish of `1.0.1` through OIDC.

## 8. Confirm the public npm release (maintainer only)

- [x] 8.1 **[user]** On npmjs.com, confirm version `1.0.1` is publicly accessible and shows a provenance attestation.

## 9. Verify repository release outputs

- [x] 9.1 **[impl]** Confirm tag `v1.0.1` and its GitHub Release with generated notes exist, and confirm `package.json` on canonical `main` still reads `0.0.0-development`.
