import type {
  TuiPluginApi,
  TuiSlotPlugin,
} from "@opencode-ai/plugin/tui";
import type { KeyEvent, MouseEvent } from "@opentui/core";
import { describe, expect, it, vi } from "vitest";

import type { SessionMessageLike } from "../../src/change-reference.js";
import type { OpenSpecStatusGateway } from "../../src/openspec-status.js";
import type { WatchFactory } from "../../src/refresh-coordinator.js";
import {
  SIDEBAR_SLOT_ORDER,
  activateSectionFromKey,
  activateSectionFromMouse,
  createOpenSpecTaskTui,
  createSidebarRuntime,
  resolveCurrentSessionID,
  type OpenSpecTaskTuiDependencies,
  type SidebarRuntime,
  type SidebarView,
} from "../../src/tui.js";

const CURRENT_SESSION_ID = "session-current";
const OTHER_SESSION_ID = "session-other";
const PROJECT_DIRECTORY = "/workspace/project";

interface Harness {
  readonly api: TuiPluginApi;
  readonly registered: () => TuiSlotPlugin;
  readonly messages: SessionMessageLike[];
  readonly markdownByChange: Map<string, string>;
  readonly temporaryChanges: Set<string>;
  readonly dependencies: OpenSpecTaskTuiDependencies;
  readonly watchClosers: ReturnType<typeof vi.fn>[];
  readonly statusCalls: { changeName: string; projectDirectory: string }[];
  readonly emitSessionChange: (sessionID?: string) => void;
  readonly disposeLifecycle: () => Promise<void>;
  readonly unsubscribedEventCount: () => number;
}

async function createHarness(): Promise<Harness> {
  const messages: SessionMessageLike[] = [];
  const markdownByChange = new Map<string, string>();
  const temporaryChanges = new Set<string>();
  const kvValues = new Map<string, unknown>();
  const statusCalls: { changeName: string; projectDirectory: string }[] = [];
  const watchClosers: ReturnType<typeof vi.fn>[] = [];
  const lifecycleHandlers = new Set<() => void | Promise<void>>();
  const eventHandlers = new Map<string, Set<(event: unknown) => void>>();
  let unsubscribedEvents = 0;
  let slotPlugin: TuiSlotPlugin | undefined;

  const statusGateway: OpenSpecStatusGateway = {
    async resolve(changeName, projectDirectory) {
      statusCalls.push({ changeName, projectDirectory });
      if (temporaryChanges.has(changeName)) {
        return { status: "temporary-failure", reason: "command" };
      }
      if (!markdownByChange.has(changeName)) {
        return { status: "authoritative-failure", reason: "missing-change" };
      }
      const rootPath = `${PROJECT_DIRECTORY}/openspec/changes/${changeName}`;
      return {
        status: "resolved",
        change: {
          name: changeName,
          rootPath,
          taskFilePath: `${rootPath}/tasks.md`,
        },
      };
    },
  };

  const watch: WatchFactory = () => {
    const close = vi.fn();
    watchClosers.push(close);
    return { close };
  };

  const dependencies: OpenSpecTaskTuiDependencies = {
    statusGateway,
    watch,
    readTaskFile: async (taskFilePath) => {
      const changeName = taskFilePath.split("/").at(-2);
      const markdown = changeName
        ? markdownByChange.get(changeName)
        : undefined;
      if (markdown === undefined) throw new Error("Missing task fixture");
      return markdown;
    },
    reconcileIntervalMs: 60_000,
  };

  const api = {
    route: {
      current: {
        name: "session",
        params: { sessionID: CURRENT_SESSION_ID },
      },
    },
    state: {
      path: {
        directory: PROJECT_DIRECTORY,
        worktree: PROJECT_DIRECTORY,
        state: "/state",
        config: "/config",
      },
      session: {
        messages: () => messages,
      },
      part: () => [],
    },
    kv: {
      ready: true,
      get: <Value,>(key: string, fallback?: Value): Value =>
        (kvValues.has(key) ? kvValues.get(key) : fallback) as Value,
      set: (key: string, value: unknown): void => {
        kvValues.set(key, value);
      },
    },
    event: {
      on: (type: string, handler: (event: unknown) => void) => {
        const handlers = eventHandlers.get(type) ?? new Set();
        handlers.add(handler);
        eventHandlers.set(type, handlers);
        let subscribed = true;
        return () => {
          if (!subscribed) return;
          subscribed = false;
          handlers.delete(handler);
          unsubscribedEvents += 1;
        };
      },
    },
    lifecycle: {
      signal: new AbortController().signal,
      onDispose: (handler: () => void | Promise<void>) => {
        lifecycleHandlers.add(handler);
        return () => lifecycleHandlers.delete(handler);
      },
    },
    slots: {
      register: (plugin: TuiSlotPlugin) => {
        slotPlugin = plugin;
        return "openspec-slot";
      },
    },
  } as unknown as TuiPluginApi;

  const module = createOpenSpecTaskTui(dependencies);
  await (module.tui as unknown as (api: TuiPluginApi) => Promise<void>)(api);

  return {
    api,
    registered: () => {
      if (!slotPlugin) throw new Error("Sidebar slot was not registered");
      return slotPlugin;
    },
    messages,
    markdownByChange,
    temporaryChanges,
    dependencies,
    watchClosers,
    statusCalls,
    emitSessionChange(sessionID = CURRENT_SESSION_ID) {
      const event = {
        type: "message.updated",
        properties: { info: { sessionID } },
      };
      for (const handler of eventHandlers.get(event.type) ?? []) handler(event);
    },
    async disposeLifecycle() {
      for (const handler of [...lifecycleHandlers]) await handler();
    },
    unsubscribedEventCount: () => unsubscribedEvents,
  };
}

function message(
  id: string,
  sessionID: string,
  text: string,
): SessionMessageLike {
  return { id, sessionID, text };
}

async function startRuntime(harness: Harness): Promise<SidebarRuntime> {
  const runtime = createSidebarRuntime({
    api: harness.api,
    sessionID: CURRENT_SESSION_ID,
    dependencies: harness.dependencies,
  });
  await runtime.start();
  return runtime;
}

async function waitForView(
  runtime: SidebarRuntime,
  predicate: (view: SidebarView) => boolean,
): Promise<SidebarView> {
  for (let attempts = 0; attempts < 50; attempts += 1) {
    const view = runtime.getView();
    if (predicate(view)) return view;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for sidebar view");
}

describe("OpenCode TUI integration", () => {
  it("registers only the ordered sidebar slot and isolates the current session", async () => {
    const harness = await createHarness();
    harness.messages.push(
      message("current", CURRENT_SESSION_ID, "openspec status --change alpha --json"),
      message("other", OTHER_SESSION_ID, "openspec status --change beta --json"),
    );
    harness.markdownByChange.set(
      "alpha",
      "## Plan\n- [ ] A deliberately long task label kept on one row\n- [x] Done",
    );
    harness.markdownByChange.set("beta", "## Wrong\n- [ ] Other session");

    const registered = harness.registered();
    expect(registered.order).toBe(SIDEBAR_SLOT_ORDER);
    expect(Object.keys(registered.slots)).toEqual(["sidebar_content"]);
    expect(
      resolveCurrentSessionID(harness.api, { session_id: "slot-session" }),
    ).toBe("slot-session");
    expect(resolveCurrentSessionID(harness.api, {})).toBe(CURRENT_SESSION_ID);

    const runtime = await startRuntime(harness);
    const view = runtime.getView();
    expect(view.status).toBe("ready");
    if (view.status === "idle") throw new Error("Expected active view");
    expect(view.title).toBe("OpenSpec: alpha 1/2");
    expect(view.sections[0]?.header).toBe("▼ Plan 1/2");
    expect(view.sections[0]?.tasks.map((task) => task.text)).toEqual([
      "  ☐ A deliberately long task label kept on one row",
      "  ✓ Done",
    ]);
    expect(view.sections[0]?.tasks[0]?.text).not.toContain("\n");
    expect(harness.statusCalls).toEqual([
      { changeName: "alpha", projectDirectory: PROJECT_DIRECTORY },
    ]);

    runtime.dispose();
    await harness.disposeLifecycle();
  });

  it("toggles sections independently by mouse/keyboard activation and restores collapse state", async () => {
    const harness = await createHarness();
    harness.messages.push(
      message("current", CURRENT_SESSION_ID, "--change accordion-change"),
    );
    harness.markdownByChange.set(
      "accordion-change",
      [
        "## First",
        "- [ ] First task",
        "## Second",
        "- [ ] Second task",
      ].join("\n"),
    );

    const runtime = await startRuntime(harness);
    let view = runtime.getView();
    if (view.status === "idle") throw new Error("Expected active view");
    expect(view.sections.map((section) => section.header)).toEqual([
      "▼ First 0/1",
      "▼ Second 0/1",
    ]);

    const mouseEvent = {
      button: 0,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: { focus: vi.fn() },
    } as unknown as MouseEvent;
    activateSectionFromMouse(mouseEvent, () =>
      runtime.toggleSection(view.status === "idle" ? "" : view.sections[0]!.id),
    );
    expect(mouseEvent.preventDefault).toHaveBeenCalledOnce();
    expect(mouseEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(mouseEvent.target?.focus).toHaveBeenCalledOnce();
    view = runtime.getView();
    if (view.status === "idle") throw new Error("Expected active view");
    expect(view.sections[0]?.header).toBe("▶ First 0/1");
    expect(view.sections[0]?.tasks).toEqual([]);
    expect(view.sections[1]?.tasks[0]?.text).toContain("Second task");

    const enterEvent = {
      name: "return",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyEvent;
    activateSectionFromKey(enterEvent, () =>
      runtime.toggleSection(view.status === "idle" ? "" : view.sections[1]!.id),
    );
    expect(enterEvent.preventDefault).toHaveBeenCalledOnce();
    expect(enterEvent.stopPropagation).toHaveBeenCalledOnce();
    view = runtime.getView();
    if (view.status === "idle") throw new Error("Expected active view");
    expect(view.sections.map((section) => section.collapsed)).toEqual([true, true]);
    const spaceEvent = {
      name: "space",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyEvent;
    const secondSectionID = view.sections[1]!.id;
    activateSectionFromKey(spaceEvent, () =>
      runtime.toggleSection(secondSectionID),
    );
    const expandedView = runtime.getView();
    expect(
      expandedView.status === "idle"
        ? []
        : expandedView.sections.map((section) => section.collapsed),
    ).toEqual([true, false]);

    runtime.dispose();
    const restored = await startRuntime(harness);
    const restoredView = restored.getView();
    if (restoredView.status === "idle") throw new Error("Expected active view");
    expect(restoredView.sections[0]?.collapsed).toBe(true);
    expect(restoredView.sections[1]?.collapsed).toBe(false);

    restored.dispose();
    await harness.disposeLifecycle();
  });

  it("replaces the active change, refreshes counts, retains stale data, and cleans up", async () => {
    const harness = await createHarness();
    harness.messages.push(
      message("alpha", CURRENT_SESSION_ID, "--change alpha-change"),
    );
    harness.markdownByChange.set(
      "alpha-change",
      "## Work\n- [ ] One\n- [ ] Two",
    );

    const runtime = await startRuntime(harness);
    expect(runtime.getView()).toMatchObject({
      status: "ready",
      title: "OpenSpec: alpha-change 0/2",
    });

    harness.markdownByChange.set(
      "alpha-change",
      "## Work\n- [x] One\n- [ ] Two",
    );
    harness.emitSessionChange();
    let view = await waitForView(
      runtime,
      (candidate) =>
        candidate.status !== "idle" && candidate.title.endsWith("1/2"),
    );
    if (view.status === "idle") throw new Error("Expected active view");
    expect(view.sections[0]?.header).toBe("▼ Work 1/2");
    expect(view.sections[0]?.tasks[0]?.text).toBe("  ✓ One");

    harness.messages.push(
      message("beta", CURRENT_SESSION_ID, "openspec/changes/beta-change"),
    );
    harness.markdownByChange.set("beta-change", "## New\n- [x] Replacement");
    harness.emitSessionChange();
    view = await waitForView(
      runtime,
      (candidate) =>
        candidate.status !== "idle" && candidate.title.includes("beta-change"),
    );
    if (view.status === "idle") throw new Error("Expected active view");
    expect(view.title).toBe("OpenSpec: beta-change 1/1");
    expect(view.sections[0]?.tasks[0]?.text).toContain("Replacement");

    harness.temporaryChanges.add("beta-change");
    harness.emitSessionChange();
    view = await waitForView(runtime, (candidate) => candidate.status === "stale");
    if (view.status !== "stale") throw new Error("Expected stale view");
    expect(view.title).toBe("OpenSpec: beta-change 1/1");
    expect(view.staleWarning).toBe("Stale · OpenSpec validation unavailable");
    expect(view.sections[0]?.tasks[0]?.text).toContain("Replacement");

    runtime.dispose();
    expect(harness.unsubscribedEventCount()).toBe(4);
    expect(harness.watchClosers.length).toBeGreaterThanOrEqual(4);
    expect(harness.watchClosers.every((close) => close.mock.calls.length === 1)).toBe(
      true,
    );
    await harness.disposeLifecycle();
  });

  it("renders a discreet empty state without mutation or selection controls", async () => {
    const harness = await createHarness();
    harness.messages.push(message("plain", CURRENT_SESSION_ID, "No change here"));

    const runtime = await startRuntime(harness);
    expect(runtime.getView()).toEqual({
      status: "idle",
      emptyText: "No active OpenSpec change",
    });
    expect(JSON.stringify(runtime.getView())).not.toMatch(
      /select|apply|verify|archive|edit/i,
    );
    expect(harness.statusCalls).toHaveLength(0);

    runtime.dispose();
    await harness.disposeLifecycle();
  });
});
