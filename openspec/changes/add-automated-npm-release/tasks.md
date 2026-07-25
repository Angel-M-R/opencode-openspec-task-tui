Each task is tagged with who performs it:

- **[impl]** — an implementer working inside this repository.
- **[user]** — the maintainer, acting manually outside the repository (npm website, `npm login`, interactive publish, pushing a tag). These cannot be automated and must not be attempted by an agent.

The groups are strictly ordered: each group must be complete before the next starts. In particular, no `1.0.0` bootstrap preparation or publish may begin until group 1's canonical remote and metadata corrections are verified, committed, and pushed to `main`; group 3 cannot start before group 2 is pushed to canonical `main`; group 5 cannot start before group 4 is confirmed.

## 1. Publishable package metadata

- [x] 1.1 **[impl]** Set both Git `origin` URLs to the canonical repository: run `git remote set-url origin git@github.com:Angel-M-R/opencode-openspec-task-tui.git` and `git remote set-url --push origin git@github.com:Angel-M-R/opencode-openspec-task-tui.git`, then verify `git remote -v` shows that URL for both fetch and push.
- [x] 1.2 **[impl]** Update `repository` in `package.json` to `{ "type": "git", "url": "https://github.com/Angel-M-R/opencode-openspec-task-tui" }`, exactly matching the canonical GitHub repository required by npm Trusted Publishing.
- [x] 1.3 **[impl]** Update `homepage` to the canonical repository README URL and `bugs.url` to `https://github.com/Angel-M-R/opencode-openspec-task-tui/issues`.
- [x] 1.4 **[impl]** Add a `keywords` array to `package.json` (e.g. `opencode`, `openspec`, `plugin`, `tui`, `statusline`, `tasks`).
- [x] 1.5 **[impl]** Add `publishConfig: { "access": "public" }` to `package.json`.
- [x] 1.6 **[impl]** Create a MIT `LICENSE` file at the repository root with the correct copyright holder and year; verify it matches the existing `license: "MIT"` field.
- [x] 1.7 **[impl]** Add `README.md` to the `files` array if the published tarball should include it, then run `pnpm pack --dry-run` and inspect the listed contents (expect `dist/` output and nothing from `src/`, `test/`, `openspec/`, or `references/`).
- [x] 1.8 **[impl]** Verify the canonical `repository`, `homepage`, and `bugs` values and both `origin` entries; re-run `pnpm typecheck` and `pnpm test`; then commit the corrections with a conventional message and push them to canonical `main`. Confirm the pushed commit is present before starting group 2.

## 2. First-version bootstrap in the repo

- [x] 2.1 **[impl]** Set `version` in `package.json` to `1.0.0` (temporary — group 5 replaces it with the sentinel). Commit as `chore(release): prepare 1.0.0 bootstrap`.
- [x] 2.2 **[impl]** Re-run `pnpm pack --dry-run` and confirm the generated tarball name reflects `1.0.0` and the `prepack` build succeeded.
- [x] 2.3 **[impl]** Confirm the package name `opencode-openspec-task-tui` is still unclaimed on npm (e.g. `npm view opencode-openspec-task-tui` should report a 404) and report to the maintainer if it is taken — the bootstrap cannot proceed under a taken name.
- [ ] 2.4 **[impl]** Push the `1.0.0` bootstrap commit to canonical `main` and verify a clean checkout from `git@github.com:Angel-M-R/opencode-openspec-task-tui.git` resolves to that commit before handing off the manual publish.

## 3. Manual first publish (maintainer only)

- [ ] 3.1 **[user]** Create or sign in to an npm account with 2FA enabled, on npmjs.com.
- [ ] 3.2 **[user]** Run `npm login` locally and confirm `npm whoami` returns the expected account.
- [ ] 3.3 **[user]** From a clean checkout of `main` at the `1.0.0` commit, run `npm publish` and confirm version `1.0.0` appears on npmjs.com. **This is irreversible after 72 hours — inspect the dry-run output from task 2.2 before running it.**
- [ ] 3.4 **[user]** Create and push the matching tag: `git tag v1.0.0 && git push origin v1.0.0`. Skipping this makes the first automated release attempt `1.0.0` again and fail with a registry conflict.

## 4. Configure npm Trusted Publishing (maintainer only)

- [ ] 4.1 **[user]** On npmjs.com, open the published package's Settings → Trusted Publisher and add a GitHub Actions publisher with organization/user `Angel-M-R`, repository `opencode-openspec-task-tui`, and workflow filename `release.yml`.
- [ ] 4.2 **[user]** Confirm no `NPM_TOKEN` (or equivalent) secret exists in the GitHub repository or organization settings; if one exists, delete it.
- [ ] 4.3 **[user]** Confirm to the implementer that the trusted publisher is saved, so group 5 can proceed.

## 5. Release automation in the repo

- [ ] 5.1 **[impl]** Set `version` in `package.json` to `0.0.0-development`.
- [ ] 5.2 **[impl]** Add devDependencies: `semantic-release`, `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`, `@semantic-release/npm`, `@semantic-release/github`; run `pnpm install` and commit the updated `pnpm-lock.yaml`.
- [ ] 5.3 **[impl]** Add a `release` block to `package.json` with `branches: ["main"]` and the four plugins in order: commit-analyzer, release-notes-generator, npm, github.
- [ ] 5.4 **[impl]** Add a `release` script (`semantic-release`) and an `audit:prod` script (`pnpm audit --prod --audit-level moderate`) to `scripts`; keep `pack:dry-run` consistent with the command CI runs.
- [ ] 5.5 **[impl]** Create `.github/workflows/ci.yml`: triggers `pull_request` and `push`; `permissions: contents: read`; steps = checkout, `pnpm/action-setup@v4` with **no** `version` input (resolved from `packageManager`), `actions/setup-node@v4` with `node-version: 22.13` and `cache: pnpm`, `pnpm install --frozen-lockfile --ignore-scripts`, typecheck, test, `pnpm pack --dry-run`, `pnpm audit --prod --audit-level moderate`.
- [ ] 5.6 **[impl]** Create `.github/workflows/release.yml`: trigger `push` on `main` only; `permissions: { contents: write, issues: write, pull-requests: write, id-token: write }`; `concurrency: { group: release, cancel-in-progress: false }`; steps = checkout with `fetch-depth: 0`, `pnpm/action-setup@v4` (no pinned version), `actions/setup-node@v4` with `node-version: 24`, `cache: pnpm` and `registry-url: https://registry.npmjs.org`, `pnpm install --frozen-lockfile --ignore-scripts`, typecheck, test, `pnpm pack --dry-run`, `pnpm audit --prod --audit-level moderate`, then `pnpm exec semantic-release` with only `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` in `env`.
- [ ] 5.7 **[impl]** Verify neither workflow references `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or `NPM_CONFIG_PROVENANCE` — trusted publishing supplies auth and provenance automatically.
- [ ] 5.8 **[impl]** Add devDependencies `@commitlint/cli`, `@commitlint/config-conventional`, and `husky`; add a `prepare: husky` script.
- [ ] 5.9 **[impl]** Create `commitlint.config.js` extending `@commitlint/config-conventional`, and a husky `commit-msg` hook that runs commitlint on `$1`. Make the hook file executable.
- [ ] 5.10 **[impl]** Verify the hook locally: an invalid message (`git commit -m "updated stuff"` on a throwaway change) is rejected, a valid one (`chore: verify commitlint hook`) is accepted.
- [ ] 5.11 **[impl]** Run `pnpm typecheck`, `pnpm test`, `pnpm pack --dry-run`, and `pnpm audit --prod --audit-level moderate` locally so the first CI run is not the first time these are exercised together.
- [ ] 5.12 **[impl]** Commit the whole release setup with a non-releasing conventional message (e.g. `ci: add semantic-release publishing and CI workflows`) and open a pull request so `ci.yml` runs before it reaches `main`.

## 6. Verify the pipeline end to end

- [ ] 6.1 **[impl]** Confirm the CI workflow ran on the pull request from 5.12 and all four validation steps passed on Node 22.13.
- [ ] 6.2 **[impl]** Merge to `main` and confirm the release workflow runs and exits successfully **without publishing**, because the commit type is non-releasing.
- [ ] 6.3 **[impl]** Push a deliberate smoke-test commit (e.g. `fix: correct package metadata link`) to `main` and confirm the release workflow publishes `1.0.1`.
- [ ] 6.4 **[user]** On npmjs.com, confirm version `1.0.1` exists, shows a provenance attestation, and is publicly accessible.
- [ ] 6.5 **[impl]** Confirm the tag `v1.0.1` and a GitHub Release with generated notes exist, and that `package.json` on `main` still reads `0.0.0-development`.
- [ ] 6.6 **[impl]** Document the release process in `README.md` (or `CONTRIBUTING.md`): conventional commits required, merging to `main` publishes, version lives in git tags and the registry rather than `package.json`.
