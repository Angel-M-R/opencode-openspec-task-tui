# Documentation and Verification Handoff

## Manual OpenCode smoke procedure

**Execution gate:** Do not execute this procedure while completing planned tasks. Run it only during final OpenSpec verification, after the package has been built, with OpenCode loading the absolute `dist/tui.js` path documented in the repository README.

### Preconditions

1. Choose two valid changes in one disposable OpenSpec project and record them as `CHANGE_A` and `CHANGE_B`. Each must pass `openspec status --change "$CHANGE_A" --json` or the equivalent command for `CHANGE_B`.
2. Back up both changes' `tasks.md` files before editing them.
3. Give `CHANGE_A/tasks.md` two non-task section headings. Under them, include at least these tasks with unique labels:

   ```md
   - [ ] List smoke task
   - [x] Completed list smoke task
   ### [ ] Heading smoke task
   ### [X] Completed heading smoke task
   ```

4. Give `CHANGE_B/tasks.md` at least one uniquely labelled unchecked task.
5. Build the package during final verification, set `~/.config/opencode/tui.json` to the absolute path of this checkout's `dist/tui.js`, and restart OpenCode in the disposable project.
6. Record the OpenCode version, OpenSpec version, package commit, bundle path, project path, and UTC start time in the result record below.

### Procedure

1. **No active change:** Open a new OpenCode session containing no explicit OpenSpec change reference. Confirm the sidebar shows the discreet no-active-change state and no task tree. In another session, reference `CHANGE_A`; confirm that does not alter the first session's empty state.
2. **Active-reference inference and both task syntaxes:** In the first session, send a message containing `--change CHANGE_A` with the recorded name substituted literally. Confirm the sidebar shows only `CHANGE_A`, both list-checkbox tasks, both level-three heading tasks, correct `✓`/`☐` markers, section counts, and global progress.
3. **Live completion update:** Change `List smoke task` from `- [ ]` to `- [x]` in `CHANGE_A/tasks.md` and save it. Without restarting OpenCode, confirm its marker, section count, and global count update together.
4. **Accordion persistence:** Collapse one section using the mouse and a different section using Enter or Space while its header is focused. Confirm each toggle leaves the other section unchanged. Restart OpenCode, reference `CHANGE_A` again if needed, and confirm both collapsed sections are restored for the same project and change.
5. **Change switching:** Send a newer message containing `openspec/changes/CHANGE_B`, substituting the literal name. Confirm the sidebar replaces the `CHANGE_A` tree with only `CHANGE_B` and that its previously unseen sections start open. Then send a newer `--change CHANGE_A` reference and confirm the saved `CHANGE_A` collapsed state returns.
6. **Temporary-failure stale retention:** With a valid `CHANGE_A` snapshot visible, rename its `tasks.md` to `tasks.md.smoke-backup`. Wait for a filesystem refresh or one reconciliation interval. Confirm the unchanged last-valid tree remains visible with a discreet stale warning. Do not edit the backup while the failure is active.
7. **Recovery:** Rename `tasks.md.smoke-backup` back to `tasks.md`. Confirm a later refresh removes the stale warning and presents current task data without restarting OpenCode.
8. Restore both original task files, remove the local bundle entry from `tui.json` if it is no longer needed, and restart OpenCode. Record every observation and any deviations below.

### Result record

Execution status: **NOT RUN — reserved for final OpenSpec verification**

| Field | Recorded value |
| --- | --- |
| OpenCode version | Pending |
| OpenSpec version | Pending |
| Package commit | Pending |
| Compiled bundle path | Pending |
| Disposable project path | Pending |
| UTC start/end | Pending |
| Operator | Pending |

| Check | Expected result | Result | Evidence or notes |
| --- | --- | --- | --- |
| No active change and current-session isolation | Empty state; another session's reference is ignored | Not run | Final verification only |
| Active-reference inference | Newest explicit current-session reference selects one validated change | Not run | Final verification only |
| List task syntax | `- [ ]`, `- [x]`, and `- [X]` render and count correctly | Not run | Final verification only |
| Heading task syntax | `### [ ]`, `### [x]`, and `### [X]` render and count correctly | Not run | Final verification only |
| Live completion update | Marker, section count, and global count update atomically | Not run | Final verification only |
| Accordion interaction and persistence | Independent toggles persist for the same project and change | Not run | Final verification only |
| Change switching | Newest valid reference replaces the former tree; saved per-change state returns | Not run | Final verification only |
| Temporary-failure stale retention | Last-valid tree remains visible with a stale warning | Not run | Final verification only |
| Recovery | Current data replaces stale data and warning clears | Not run | Final verification only |

Final smoke verdict: **PENDING**

Any failed row must remain failed in this record until an equivalent or broader compiled-bundle rerun succeeds and is recorded.

## MVP capability and exclusion review

Review status: **CONFIRMED by source and documentation review; runtime verification remains pending.**

The finished implementation and README were reviewed against both change capability specs:

- `active-change-resolution`: current-session newest-reference extraction, authoritative status validation and resolved task path use, relevant-session re-evaluation, watched and periodic refresh, last-valid stale retention and recovery, and lifecycle disposal are represented in the implementation and documented smoke coverage.
- `task-progress-sidebar`: both supported task syntaxes, ordered grouping and fallback sections, duplicate identities, section/global counts, compact task-tree rendering, independent accordion interaction, project/change persistence, empty and stale states, and compiled package consumption are represented in the implementation and setup or smoke documentation.

Explicit MVP-exclusion confirmation:

- **Change selection was not introduced.** The TUI registers only `sidebar_content`, follows the newest validated current-session reference, and exposes no selector or change-browsing control.
- **Non-task artifact status was not introduced.** Resolution reads only the task artifact path from authoritative status output; proposal, design, spec, verification, and archive status are not rendered.
- **Apply, verify, archive, or edit actions were not introduced.** The UI renders read-only progress plus section toggles and registers no mutation action, task editor, command-palette action, or equivalent control.

The README states the same boundaries. This handoff review does not replace final OpenSpec verification: typecheck, build, full tests, package inspection, and compiled-bundle smoke execution remain intentionally unexecuted and pending.
