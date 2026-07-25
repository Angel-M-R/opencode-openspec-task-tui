import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionMessageLike } from "../../src/change-reference.js";
import type { PresentationState } from "../../src/domain.js";
import type {
  OpenSpecStatusGateway,
  OpenSpecStatusResult,
} from "../../src/openspec-status.js";
import {
  createRefreshCoordinator,
  type RefreshWatcher,
  type SessionEventLike,
  type WatchFactory,
  type WatchHandlers,
} from "../../src/refresh-coordinator.js";
import { parseTaskDocument } from "../../src/task-parser.js";

const PROJECT_DIRECTORY = "/project";
const CURRENT_SESSION_ID = "current-session";

interface WatchedTarget {
  readonly path: string;
  readonly handlers: WatchHandlers;
  readonly close: ReturnType<typeof vi.fn>;
}

interface HarnessOptions {
  readonly watch?: WatchFactory;
  readonly parseTasks?: typeof parseTaskDocument;
}

function resolved(changeName: string): OpenSpecStatusResult {
  const rootPath = `${PROJECT_DIRECTORY}/openspec/changes/${changeName}`;
  return {
    status: "resolved",
    change: {
      name: changeName,
      rootPath,
      taskFilePath: `${rootPath}/tasks.md`,
    },
  };
}

function createHarness(options: HarnessOptions = {}) {
  let messages: SessionMessageLike[] = [messageFor("first-change")];
  let sessionListener: ((event: SessionEventLike) => void) | undefined;
  let statusResult: OpenSpecStatusResult = resolved("first-change");
  const taskFiles = new Map([
    [
      "/project/openspec/changes/first-change/tasks.md",
      "## Work\n- [ ] First task",
    ],
    [
      "/project/openspec/changes/second-change/tasks.md",
      "## Work\n- [x] Second task",
    ],
  ]);
  const watchedTargets: WatchedTarget[] = [];
  const unsubscribe = vi.fn();
  const statusGateway: OpenSpecStatusGateway = {
    resolve: vi.fn(async () => statusResult),
  };
  const readTaskFile = vi.fn(async (taskFilePath: string) => {
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
    currentSessionID: CURRENT_SESSION_ID,
    getReferenceSource: () => ({
      currentSessionID: CURRENT_SESSION_ID,
      messages,
    }),
    subscribeToSessionEvents: (listener) => {
      sessionListener = listener;
      return unsubscribe;
    },
    statusGateway,
    readTaskFile,
    parseTasks: options.parseTasks,
    watch,
    debounceMs: 10,
    reconcileIntervalMs: 1_000,
  });

  return {
    coordinator,
    readTaskFile,
    statusGateway,
    taskFiles,
    unsubscribe,
    watchedTargets,
    emitSession(event: SessionEventLike) {
      sessionListener?.(event);
    },
    setMessages(next: SessionMessageLike[]) {
      messages = next;
    },
    setStatusResult(next: OpenSpecStatusResult) {
      statusResult = next;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createRefreshCoordinator", () => {
  it("resolves the initial current-session reference and publishes a ready snapshot", async () => {
    const harness = createHarness();

    await harness.coordinator.start();

    expect(harness.coordinator.getState()).toMatchObject({
      status: "ready",
      snapshot: {
        change: { name: "first-change" },
        progress: { completed: 0, total: 1 },
      },
      health: { status: "fresh" },
    });
    expect(harness.watchedTargets.map((target) => target.path)).toEqual([
      "/project/openspec/changes/first-change/tasks.md",
      "/project/openspec/changes/first-change",
    ]);
  });

  it("switches atomically on a relevant current-session event and rebuilds watchers", async () => {
    const harness = createHarness();
    const published: PresentationState[] = [];
    harness.coordinator.subscribe((state) => published.push(state));
    await harness.coordinator.start();
    published.length = 0;

    harness.setMessages([
      messageFor("first-change"),
      messageFor("second-change"),
    ]);
    harness.setStatusResult(resolved("second-change"));
    harness.emitSession({
      type: "message.part.updated",
      properties: { part: { sessionID: CURRENT_SESSION_ID } },
    });
    await waitForRefresh();

    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      status: "ready",
      snapshot: { change: { name: "second-change" } },
    });
    expect(harness.watchedTargets.slice(0, 2).every((entry) =>
      entry.close.mock.calls.length === 1,
    )).toBe(true);
    expect(harness.watchedTargets.slice(2).map((target) => target.path)).toEqual([
      "/project/openspec/changes/second-change/tasks.md",
      "/project/openspec/changes/second-change",
    ]);
  });

  it("uses idle for an invalid newest reference without falling back", async () => {
    const harness = createHarness();
    await harness.coordinator.start();
    const resolveCalls = vi.mocked(harness.statusGateway.resolve).mock.calls.length;

    harness.setMessages([
      messageFor("first-change"),
      {
        sessionID: CURRENT_SESSION_ID,
        text: "openspec/changes/../unsafe",
      },
    ]);
    harness.emitSession({
      type: "message.updated",
      sessionID: CURRENT_SESSION_ID,
    });
    await waitForRefresh();

    expect(harness.coordinator.getState()).toEqual({ status: "idle" });
    expect(harness.statusGateway.resolve).toHaveBeenCalledTimes(resolveCalls);
  });

  it("debounces watch bursts and observes atomic replacement at the parent boundary", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    await harness.coordinator.start();
    const parentWatch = harness.watchedTargets[1];
    if (!parentWatch) throw new Error("missing parent watcher");
    harness.taskFiles.set(
      "/project/openspec/changes/first-change/tasks.md",
      "## Work\n- [x] First task",
    );

    parentWatch.handlers.change("other.md");
    parentWatch.handlers.change("tasks.md");
    parentWatch.handlers.change("tasks.md");
    await vi.advanceTimersByTimeAsync(10);

    expect(harness.statusGateway.resolve).toHaveBeenCalledTimes(2);
    expect(harness.coordinator.getState()).toMatchObject({
      status: "ready",
      snapshot: { progress: { completed: 1, total: 1 } },
    });
  });

  it("periodically reconciles content when no watch event arrives", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    await harness.coordinator.start();
    harness.taskFiles.set(
      "/project/openspec/changes/first-change/tasks.md",
      "## Work\n- [x] First task",
    );

    await vi.advanceTimersByTimeAsync(1_000);

    expect(harness.coordinator.getState()).toMatchObject({
      status: "ready",
      snapshot: { progress: { completed: 1, total: 1 } },
    });
  });

  it("retains a stale snapshot through temporary failures and clears health on recovery", async () => {
    const harness = createHarness();
    await harness.coordinator.start();
    const original = snapshotOf(harness.coordinator.getState());
    harness.setStatusResult({
      status: "temporary-failure",
      reason: "timeout",
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

    harness.setStatusResult(resolved("first-change"));
    harness.taskFiles.set(
      "/project/openspec/changes/first-change/tasks.md",
      "## Work\n- [x] First task",
    );
    await harness.coordinator.reconcile();

    expect(harness.coordinator.getState()).toMatchObject({
      status: "ready",
      snapshot: { progress: { completed: 1, total: 1 } },
      health: { status: "fresh" },
    });
  });

  it("uses idle when a temporary failure occurs before any valid snapshot", async () => {
    const harness = createHarness();
    harness.setStatusResult({
      status: "temporary-failure",
      reason: "command",
    });

    await harness.coordinator.start();

    expect(harness.coordinator.getState()).toEqual({ status: "idle" });
  });

  it("surfaces concise stale health for read, parse, and watch failures", async () => {
    const harness = createHarness();
    await harness.coordinator.start();
    harness.taskFiles.delete(
      "/project/openspec/changes/first-change/tasks.md",
    );
    await harness.coordinator.reconcile();
    expect(staleReason(harness.coordinator.getState())).toBe(
      "Task file unreadable",
    );

    harness.taskFiles.set(
      "/project/openspec/changes/first-change/tasks.md",
      "## Work\n- [ ] First task",
    );
    const throwingParser = vi.fn(() => {
      throw new Error("parse failed");
    });
    const parseHarness = createHarness({ parseTasks: throwingParser });
    await parseHarness.coordinator.start();
    expect(parseHarness.coordinator.getState()).toEqual({ status: "idle" });

    const activeWatch = harness.watchedTargets[0];
    if (!activeWatch) throw new Error("missing file watcher");
    activeWatch.handlers.error(new Error("watch failed"));
    expect(staleReason(harness.coordinator.getState())).toBe(
      "Task watch unavailable",
    );
  });

  it("keeps reconciliation single-flight and coalesces concurrent follow-up work", async () => {
    const harness = createHarness();
    await harness.coordinator.start();
    const deferredResolutions: Array<() => void> = [];
    let active = 0;
    let maximumActive = 0;
    vi.mocked(harness.statusGateway.resolve).mockImplementation(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => deferredResolutions.push(resolve));
      active -= 1;
      return resolved("first-change");
    });

    const first = harness.coordinator.reconcile();
    const second = harness.coordinator.reconcile();
    const third = harness.coordinator.reconcile();
    expect(harness.statusGateway.resolve).toHaveBeenCalledTimes(2);

    deferredResolutions.shift()?.();
    await waitForRefresh();
    expect(harness.statusGateway.resolve).toHaveBeenCalledTimes(3);
    deferredResolutions.shift()?.();
    await Promise.all([first, second, third]);

    expect(maximumActive).toBe(1);
  });

  it("disposes subscriptions, watchers, timers, debounce work, and queued refreshes once", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    await harness.coordinator.start();
    const watched = [...harness.watchedTargets];
    watched[0]?.handlers.change("tasks.md");

    harness.coordinator.dispose();
    harness.coordinator.dispose();
    await vi.runAllTimersAsync();

    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(watched.every((target) => target.close.mock.calls.length === 1)).toBe(
      true,
    );
    expect(vi.getTimerCount()).toBe(0);
    expect(harness.statusGateway.resolve).toHaveBeenCalledTimes(1);
  });
});

function messageFor(changeName: string): SessionMessageLike {
  return {
    sessionID: CURRENT_SESSION_ID,
    text: `openspec status --change ${changeName} --json`,
  };
}

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
