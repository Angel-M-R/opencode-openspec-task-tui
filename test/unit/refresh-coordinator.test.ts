import { afterEach, describe, expect, it, vi } from "vitest";

import type { PresentationState } from "../../src/domain.js";
import type {
  OpenSpecListGateway,
  OpenSpecListResult,
} from "../../src/openspec-list.js";
import type {
  OpenSpecStatusGateway,
  OpenSpecStatusResult,
} from "../../src/openspec-status.js";
import {
  createRefreshCoordinator,
  type RefreshWatcher,
  type WatchFactory,
  type WatchHandlers,
} from "../../src/refresh-coordinator.js";
import { parseTaskDocument } from "../../src/task-parser.js";

const PROJECT_DIRECTORY = "/project";
const CHANGES_DIRECTORY = "/authoritative/planning/changes";

interface WatchedTarget {
  readonly path: string;
  readonly handlers: WatchHandlers;
  readonly close: ReturnType<typeof vi.fn>;
}

interface HarnessOptions {
  readonly watch?: WatchFactory;
  readonly parseTasks?: typeof parseTaskDocument;
}

function selected(changeName: string): OpenSpecListResult {
  return { status: "selected", changeName };
}

function resolved(changeName: string): OpenSpecStatusResult {
  const rootPath = `${CHANGES_DIRECTORY}/${changeName}`;
  return {
    status: "resolved",
    change: {
      name: changeName,
      rootPath,
      taskFilePath: `${rootPath}/tasks.md`,
      changesDirectoryPath: CHANGES_DIRECTORY,
    },
  };
}

function createHarness(options: HarnessOptions = {}) {
  let listResult: OpenSpecListResult = selected("first-change");
  const statusResults = new Map<string, OpenSpecStatusResult>([
    ["first-change", resolved("first-change")],
    ["second-change", resolved("second-change")],
  ]);
  const taskFiles = new Map([
    [
      `${CHANGES_DIRECTORY}/first-change/tasks.md`,
      "## Work\n- [ ] First task",
    ],
    [
      `${CHANGES_DIRECTORY}/second-change/tasks.md`,
      "## Work\n- [x] Second task",
    ],
  ]);
  const callOrder: string[] = [];
  const watchedTargets: WatchedTarget[] = [];
  const listGateway: OpenSpecListGateway = {
    resolve: vi.fn(async () => {
      callOrder.push("list");
      return listResult;
    }),
  };
  const statusGateway: OpenSpecStatusGateway = {
    resolve: vi.fn(async (changeName) => {
      callOrder.push(`status:${changeName}`);
      return (
        statusResults.get(changeName) ?? {
          status: "authoritative-failure",
          reason: "missing-change",
        } satisfies OpenSpecStatusResult
      );
    }),
  };
  const readTaskFile = vi.fn(async (taskFilePath: string) => {
    callOrder.push(`read:${taskFilePath}`);
    const markdown = taskFiles.get(taskFilePath);
    if (markdown === undefined) throw new Error("unreadable");
    return markdown;
  });
  const watch: WatchFactory =
    options.watch ??
    ((targetPath, handlers) => {
      const close = vi.fn();
      watchedTargets.push({ path: targetPath, handlers, close });
      return { close } satisfies RefreshWatcher;
    });

  const coordinator = createRefreshCoordinator({
    projectDirectory: PROJECT_DIRECTORY,
    listGateway,
    statusGateway,
    readTaskFile,
    parseTasks: options.parseTasks,
    watch,
    debounceMs: 10,
    reconcileIntervalMs: 1_000,
  });

  return {
    callOrder,
    coordinator,
    listGateway,
    readTaskFile,
    statusGateway,
    taskFiles,
    watchedTargets,
    currentWatch(targetPath: string): WatchedTarget {
      const target = [...watchedTargets]
        .reverse()
        .find(
          (entry) =>
            entry.path === targetPath && entry.close.mock.calls.length === 0,
        );
      if (!target) throw new Error(`missing active watcher for ${targetPath}`);
      return target;
    },
    setListResult(next: OpenSpecListResult) {
      listResult = next;
    },
    setStatusResult(changeName: string, next: OpenSpecStatusResult) {
      statusResults.set(changeName, next);
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createRefreshCoordinator", () => {
  it("resolves list selection before status and task reading", async () => {
    const harness = createHarness();

    await harness.coordinator.start();

    expect(harness.callOrder).toEqual([
      "list",
      "status:first-change",
      `read:${CHANGES_DIRECTORY}/first-change/tasks.md`,
    ]);
    expect(harness.statusGateway.resolve).toHaveBeenCalledWith(
      "first-change",
      PROJECT_DIRECTORY,
    );
    expect(harness.coordinator.getState()).toMatchObject({
      status: "ready",
      snapshot: {
        change: { name: "first-change" },
        progress: { completed: 0, total: 1 },
      },
      health: { status: "fresh" },
    });
    expect(harness.watchedTargets.map((target) => target.path)).toEqual([
      CHANGES_DIRECTORY,
      `${CHANGES_DIRECTORY}/first-change/tasks.md`,
      `${CHANGES_DIRECTORY}/first-change`,
    ]);

    harness.coordinator.dispose();
  });

  it("does not try a lower-ranked candidate after an authoritative status failure", async () => {
    const harness = createHarness();
    harness.setStatusResult("first-change", {
      status: "authoritative-failure",
      reason: "missing-change",
    });

    await harness.coordinator.start();

    expect(harness.listGateway.resolve).toHaveBeenCalledTimes(1);
    expect(harness.statusGateway.resolve).toHaveBeenCalledTimes(1);
    expect(harness.statusGateway.resolve).toHaveBeenCalledWith(
      "first-change",
      PROJECT_DIRECTORY,
    );
    expect(harness.statusGateway.resolve).not.toHaveBeenCalledWith(
      "second-change",
      PROJECT_DIRECTORY,
    );
    expect(harness.readTaskFile).not.toHaveBeenCalled();
    expect(harness.coordinator.getState()).toEqual({ status: "idle" });
    expect(harness.watchedTargets).toHaveLength(0);

    harness.coordinator.dispose();
  });

  it("switches candidates and clears archived inventory from a debounced changes notification", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const published: PresentationState[] = [];
    harness.coordinator.subscribe((state) => published.push(state));
    await harness.coordinator.start();
    published.length = 0;
    const firstWatchers = [...harness.watchedTargets];

    harness.setListResult(selected("second-change"));
    harness.currentWatch(CHANGES_DIRECTORY).handlers.change("second-change");
    await vi.advanceTimersByTimeAsync(10);

    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      status: "ready",
      snapshot: { change: { name: "second-change" } },
    });
    expect(firstWatchers.every((entry) => entry.close.mock.calls.length === 1)).toBe(
      true,
    );
    const secondWatchers = harness.watchedTargets.slice(3);

    harness.setListResult({ status: "no-candidate" });
    harness.currentWatch(CHANGES_DIRECTORY).handlers.change("second-change");
    await vi.advanceTimersByTimeAsync(10);

    expect(harness.coordinator.getState()).toEqual({ status: "idle" });
    expect(secondWatchers.every((entry) => entry.close.mock.calls.length === 1)).toBe(
      true,
    );
    expect(harness.statusGateway.resolve).toHaveBeenCalledTimes(2);

    harness.coordinator.dispose();
  });

  it("debounces task-file and parent-directory notifications through fresh reselection", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    await harness.coordinator.start();
    harness.taskFiles.set(
      `${CHANGES_DIRECTORY}/first-change/tasks.md`,
      "## Work\n- [x] First task",
    );
    const taskWatch = harness.currentWatch(
      `${CHANGES_DIRECTORY}/first-change/tasks.md`,
    );
    const parentWatch = harness.currentWatch(
      `${CHANGES_DIRECTORY}/first-change`,
    );

    parentWatch.handlers.change("other.md");
    taskWatch.handlers.change();
    parentWatch.handlers.change("tasks.md");
    await vi.advanceTimersByTimeAsync(10);

    expect(harness.listGateway.resolve).toHaveBeenCalledTimes(2);
    expect(harness.statusGateway.resolve).toHaveBeenCalledTimes(2);
    expect(harness.coordinator.getState()).toMatchObject({
      status: "ready",
      snapshot: { progress: { completed: 1, total: 1 } },
    });

    harness.coordinator.dispose();
  });

  it("retains the last valid snapshot across temporary list and status failures", async () => {
    const harness = createHarness();
    await harness.coordinator.start();
    const original = snapshotOf(harness.coordinator.getState());
    harness.setListResult({ status: "temporary-failure", reason: "timeout" });

    await harness.coordinator.reconcile();

    expect(harness.coordinator.getState()).toEqual({
      status: "stale",
      snapshot: original,
      health: { status: "stale", reason: "OpenSpec list unavailable" },
    });
    expect(harness.statusGateway.resolve).toHaveBeenCalledTimes(1);

    harness.setListResult(selected("first-change"));
    harness.setStatusResult("first-change", {
      status: "temporary-failure",
      reason: "command",
    });
    await harness.coordinator.reconcile();

    expect(harness.coordinator.getState()).toEqual({
      status: "stale",
      snapshot: original,
      health: {
        status: "stale",
        reason: "OpenSpec validation unavailable",
      },
    });

    harness.setStatusResult("first-change", resolved("first-change"));
    await harness.coordinator.reconcile();
    expect(harness.coordinator.getState()).toMatchObject({
      status: "ready",
      health: { status: "fresh" },
    });

    harness.coordinator.dispose();
  });

  it("remains idle when a temporary list failure occurs before any snapshot", async () => {
    const harness = createHarness();
    harness.setListResult({ status: "temporary-failure", reason: "command" });

    await harness.coordinator.start();

    expect(harness.coordinator.getState()).toEqual({ status: "idle" });
    expect(harness.statusGateway.resolve).not.toHaveBeenCalled();
    expect(harness.watchedTargets).toHaveLength(0);

    harness.coordinator.dispose();
  });

  it("retains the last valid snapshot through task read and parse failures", async () => {
    let parseFails = false;
    const parseTasks = vi.fn((markdown: string) => {
      if (parseFails) throw new Error("invalid tasks");
      return parseTaskDocument(markdown);
    });
    const harness = createHarness({ parseTasks });
    await harness.coordinator.start();
    const original = snapshotOf(harness.coordinator.getState());
    const taskPath = `${CHANGES_DIRECTORY}/first-change/tasks.md`;

    harness.taskFiles.delete(taskPath);
    await harness.coordinator.reconcile();
    expect(harness.coordinator.getState()).toEqual({
      status: "stale",
      snapshot: original,
      health: { status: "stale", reason: "Task file unreadable" },
    });

    harness.taskFiles.set(taskPath, "## Work\n- [ ] First task");
    parseFails = true;
    await harness.coordinator.reconcile();
    expect(harness.coordinator.getState()).toEqual({
      status: "stale",
      snapshot: original,
      health: { status: "stale", reason: "Task file invalid" },
    });

    harness.coordinator.dispose();
  });

  it("uses reconciliation to discover a candidate after a no-candidate cold start", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.setListResult({ status: "no-candidate" });
    await harness.coordinator.start();

    expect(harness.coordinator.getState()).toEqual({ status: "idle" });
    expect(harness.watchedTargets).toHaveLength(0);

    harness.setListResult(selected("first-change"));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(harness.listGateway.resolve).toHaveBeenCalledTimes(2);
    expect(harness.coordinator.getState()).toMatchObject({
      status: "ready",
      snapshot: { change: { name: "first-change" } },
    });
    expect(harness.watchedTargets[0]?.path).toBe(CHANGES_DIRECTORY);

    harness.coordinator.dispose();
  });

  it("periodically refreshes an active task snapshot after a missed notification", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    await harness.coordinator.start();
    harness.taskFiles.set(
      `${CHANGES_DIRECTORY}/first-change/tasks.md`,
      "## Work\n- [x] First task",
    );

    await vi.advanceTimersByTimeAsync(1_000);

    expect(harness.listGateway.resolve).toHaveBeenCalledTimes(2);
    expect(harness.statusGateway.resolve).toHaveBeenCalledTimes(2);
    expect(harness.readTaskFile).toHaveBeenCalledTimes(2);
    expect(harness.coordinator.getState()).toMatchObject({
      status: "ready",
      snapshot: {
        change: { name: "first-change" },
        progress: { completed: 1, total: 1 },
      },
      health: { status: "fresh" },
    });

    harness.coordinator.dispose();
  });

  it("closes the whole watcher set on errors, recreates it, and disposes once", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    await harness.coordinator.start();
    const initialWatchers = [...harness.watchedTargets];

    initialWatchers[0]?.handlers.error(new Error("watch failed"));

    expect(initialWatchers.every((entry) => entry.close.mock.calls.length === 1)).toBe(
      true,
    );
    expect(staleReason(harness.coordinator.getState())).toBe(
      "OpenSpec watch unavailable",
    );

    await vi.advanceTimersByTimeAsync(10);
    const replacementWatchers = harness.watchedTargets.slice(3);
    expect(replacementWatchers).toHaveLength(3);
    expect(harness.coordinator.getState()).toMatchObject({ status: "ready" });

    harness.coordinator.dispose();
    harness.coordinator.dispose();

    expect(
      replacementWatchers.every((entry) => entry.close.mock.calls.length === 1),
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("closes partially created watchers and publishes the parsed snapshot as stale", async () => {
    const created: WatchedTarget[] = [];
    const watch: WatchFactory = (targetPath, handlers) => {
      if (targetPath.endsWith("tasks.md")) throw new Error("watch unavailable");
      const close = vi.fn();
      created.push({ path: targetPath, handlers, close });
      return { close };
    };
    const harness = createHarness({ watch });

    await harness.coordinator.start();

    expect(harness.coordinator.getState()).toMatchObject({
      status: "stale",
      snapshot: { change: { name: "first-change" } },
      health: { status: "stale", reason: "OpenSpec watch unavailable" },
    });
    expect(created).toHaveLength(1);
    expect(created[0]?.path).toBe(CHANGES_DIRECTORY);
    expect(created[0]?.close).toHaveBeenCalledTimes(1);

    harness.coordinator.dispose();
  });

  it("serializes refreshes and coalesces concurrent follow-up work", async () => {
    const harness = createHarness();
    await harness.coordinator.start();
    const deferredResolutions: Array<() => void> = [];
    let active = 0;
    let maximumActive = 0;
    vi.mocked(harness.listGateway.resolve).mockImplementation(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => deferredResolutions.push(resolve));
      active -= 1;
      return selected("first-change");
    });

    const first = harness.coordinator.reconcile();
    const second = harness.coordinator.reconcile();
    const third = harness.coordinator.reconcile();
    expect(harness.listGateway.resolve).toHaveBeenCalledTimes(2);

    deferredResolutions.shift()?.();
    await waitForRefresh();
    expect(harness.listGateway.resolve).toHaveBeenCalledTimes(3);
    deferredResolutions.shift()?.();
    await Promise.all([first, second, third]);

    expect(maximumActive).toBe(1);
    harness.coordinator.dispose();
  });
});

function snapshotOf(state: PresentationState) {
  if (state.status === "idle") throw new Error("expected a snapshot");
  return state.snapshot;
}

function staleReason(state: PresentationState): string | undefined {
  return state.status === "stale" ? state.health.reason : undefined;
}

async function waitForRefresh(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
