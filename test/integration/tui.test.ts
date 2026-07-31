import type {
  TuiPluginApi,
  TuiSlotPlugin,
  TuiSlotContext,
  TuiThemeCurrent,
} from "@opencode-ai/plugin/tui";
import {
  type BoxRenderable,
  RGBA,
  type KeyEvent,
  type MouseEvent,
  type TextRenderable,
} from "@opentui/core";
import { createElement, insert, spread, testRender } from "@opentui/solid";
import { describe, expect, it, vi } from "vitest";

import {
  selectOpenSpecCandidate,
  type OpenSpecListGateway,
} from "../../src/openspec-list.js";
import type { OpenSpecStatusGateway } from "../../src/openspec-status.js";
import type {
  WatchFactory,
  WatchHandlers,
} from "../../src/refresh-coordinator.js";
import type {
  OpenSpecTaskTuiDependencies,
  SidebarRuntime,
  SidebarView,
} from "../../src/tui.js";
import {
  loadOpenSpecFixture,
  type OpenSpecListChangeFixture,
} from "../helpers/openspec-fixtures.js";

const IS_BUN = "Bun" in globalThis;
const tuiModule = IS_BUN ? "../../dist/tui.js" : "../../src/tui.js";
const {
  SIDEBAR_SLOT_ORDER,
  activateSectionFromKey,
  activateSectionFromMouse,
  createOpenSpecTaskTui,
  createSidebarRuntime,
  measureTaskTooltipHeight,
} = (await import(tuiModule)) as typeof import("../../src/tui.js");

const PROJECT_DIRECTORY = "/workspace/project";
const CHANGES_DIRECTORY = `${PROJECT_DIRECTORY}/openspec/changes`;
const TEST_COLOR = RGBA.fromHex("#ffffff");
const TEST_THEME = {
  text: TEST_COLOR,
  textMuted: TEST_COLOR,
  success: TEST_COLOR,
  warning: TEST_COLOR,
  backgroundMenu: TEST_COLOR,
} as TuiThemeCurrent;

interface WatchSubscription {
  readonly targetPath: string;
  readonly handlers: WatchHandlers;
  readonly closeSpy: ReturnType<typeof vi.fn<() => void>>;
  closed: boolean;
  close(): void;
}

interface Harness {
  readonly api: TuiPluginApi;
  readonly registered: () => TuiSlotPlugin;
  readonly markdownByChange: Map<string, string>;
  readonly dependencies: OpenSpecTaskTuiDependencies;
  readonly listCalls: string[];
  readonly statusCalls: { changeName: string; projectDirectory: string }[];
  readonly eventSubscriptions: ReturnType<typeof vi.fn>;
  readonly watchSubscriptions: WatchSubscription[];
  readonly setCandidates: (changes: readonly OpenSpecListChangeFixture[]) => void;
  readonly setListFailure: (failed: boolean) => void;
  readonly emitInventoryChange: () => void;
  readonly disposeLifecycle: () => Promise<void>;
}

async function createHarness(): Promise<Harness> {
  const markdownByChange = new Map<string, string>();
  const kvValues = new Map<string, unknown>();
  const listCalls: string[] = [];
  const statusCalls: { changeName: string; projectDirectory: string }[] = [];
  const watchSubscriptions: WatchSubscription[] = [];
  const lifecycleHandlers = new Set<() => void | Promise<void>>();
  const eventSubscriptions = vi.fn(() => {
    throw new Error("The sidebar must not subscribe to session events");
  });
  let candidates: readonly OpenSpecListChangeFixture[] = [];
  let listFailure = false;
  let slotPlugin: TuiSlotPlugin | undefined;
  const listFixture = loadOpenSpecFixture("openspec-list.json");

  const listGateway: OpenSpecListGateway = {
    async resolve(projectDirectory) {
      listCalls.push(projectDirectory);
      if (listFailure) {
        return { status: "temporary-failure", reason: "command" };
      }

      const selection = selectOpenSpecCandidate(
        { ...listFixture, changes: candidates },
      );
      return selection.status === "invalid-list"
        ? { status: "temporary-failure", reason: "invalid-list" }
        : selection;
    },
  };

  const statusGateway: OpenSpecStatusGateway = {
    async resolve(changeName, projectDirectory) {
      statusCalls.push({ changeName, projectDirectory });
      if (!markdownByChange.has(changeName)) {
        return { status: "authoritative-failure", reason: "missing-change" };
      }
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
    },
  };

  const watch: WatchFactory = (targetPath, handlers) => {
    const closeSpy = vi.fn<() => void>();
    const subscription: WatchSubscription = {
      targetPath,
      handlers,
      closeSpy,
      closed: false,
      close() {
        subscription.closed = true;
        closeSpy();
      },
    };
    watchSubscriptions.push(subscription);
    return subscription;
  };

  const dependencies: OpenSpecTaskTuiDependencies = {
    listGateway,
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
    debounceMs: 0,
    reconcileIntervalMs: 60_000,
  };

  const api = {
    route: { current: { name: "home" } },
    state: {
      path: {
        directory: PROJECT_DIRECTORY,
        worktree: PROJECT_DIRECTORY,
        state: "/state",
        config: "/config",
      },
    },
    kv: {
      ready: true,
      get: <Value,>(key: string, fallback?: Value): Value =>
        (kvValues.has(key) ? kvValues.get(key) : fallback) as Value,
      set: (key: string, value: unknown): void => {
        kvValues.set(key, value);
      },
    },
    event: { on: eventSubscriptions },
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
    markdownByChange,
    dependencies,
    listCalls,
    statusCalls,
    eventSubscriptions,
    watchSubscriptions,
    setCandidates(changes) {
      candidates = changes;
    },
    setListFailure(failed) {
      listFailure = failed;
    },
    emitInventoryChange() {
      for (const subscription of [...watchSubscriptions]) {
        if (!subscription.closed && subscription.targetPath === CHANGES_DIRECTORY) {
          subscription.handlers.change();
        }
      }
    },
    async disposeLifecycle() {
      for (const handler of [...lifecycleHandlers]) await handler();
    },
  };
}

function candidate(
  name: string,
  status: "in-progress" | "complete",
  lastModified: string,
  completedTasks = 99,
  totalTasks = 100,
): OpenSpecListChangeFixture {
  return { name, status, lastModified, completedTasks, totalTasks };
}

async function startRuntime(harness: Harness): Promise<SidebarRuntime> {
  const runtime = createSidebarRuntime({
    api: harness.api,
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
  const realOpenTuiTest = IS_BUN ? it : it.skip;

  realOpenTuiTest(
    "renders the full truncated task description after a real mouse move",
    async () => {
      const harness = await createHarness();
      const description =
        "1.2 Verify a completed task whose description intentionally continues far beyond a narrow sidebar width is truncated while preserving the full sentence for tooltip inspection.";
      expect(measureTaskTooltipHeight(description, 36, "unicode")).toBe(6);
      harness.setCandidates([
        candidate(
          "tooltip-change",
          "in-progress",
          "2026-07-25T14:00:00.000Z",
        ),
      ]);
      harness.markdownByChange.set(
        "tooltip-change",
        `## Plan\n- [ ] ${description}`,
      );

      const sidebarContent = harness.registered().slots.sidebar_content;
      if (!sidebarContent) throw new Error("Expected sidebar content slot");
      const context = {
        theme: { current: TEST_THEME },
      } as TuiSlotContext;
      const rendered = await testRender(
        () => {
          const host = createElement("box") as BoxRenderable;
          spread(host, { width: "100%", height: "100%" });
          const sidebar = createElement("box") as BoxRenderable;
          spread(sidebar, {
            position: "absolute",
            right: 0,
            top: 0,
            width: 36,
            height: "100%",
          });
          insert(
            sidebar,
            () => sidebarContent(context, { session_id: "test-session" }),
          );
          host.add(sidebar);
          return host;
        },
        { width: 80, height: 12 },
      );

      try {
        const initialFrame = await rendered.waitForFrame(async (frame) => {
          await new Promise((resolve) => setTimeout(resolve, 0));
          return frame.includes("Plan 0/1");
        });
        expect(initialFrame.replace(/\s+/g, " ")).not.toContain(description);
        const titleRow =
          rendered.renderer.root.findDescendantById("openspec-title");
        const titleText = titleRow?.getChildren()[0] as
          | TextRenderable
          | undefined;
        expect(titleText?.scrollWidth).toBeLessThanOrEqual(titleRow?.width ?? 0);

        await rendered.mockMouse.moveTo(49, 0);
        await rendered.flush();
        expect(rendered.captureCharFrame()).toContain("▼ Plan 0/1");

        await rendered.mockMouse.moveTo(49, 2);
        const tooltipFrame = await rendered.waitForFrame((frame) =>
          frame.replace(/\s+/g, " ").includes(description),
        );

        expect(tooltipFrame.replace(/\s+/g, " ")).toContain(description);
      } finally {
        rendered.renderer.destroy();
        await harness.disposeLifecycle();
      }
    },
  );

  realOpenTuiTest(
    "shows only the full title for a truncated section header after a real mouse move",
    async () => {
      const harness = await createHarness();
      const changeName = "section-tooltip-change-with-a-deliberately-long-name";
      const fullMainTitle = `OpenSpec: ${changeName} 0/2`;
      const compactMainTitle = fullMainTitle.replace(/\s+/g, "");
      const title = "Section title fits without metadata";
      harness.setCandidates([
        candidate(
          changeName,
          "in-progress",
          "2026-07-25T14:00:00.000Z",
        ),
      ]);
      harness.markdownByChange.set(
        changeName,
        [`## ${title}`, "- [ ] Child task", "## Short", "- [ ] Other task"].join(
          "\n",
        ),
      );

      const sidebarContent = harness.registered().slots.sidebar_content;
      if (!sidebarContent) throw new Error("Expected sidebar content slot");
      const context = {
        theme: { current: TEST_THEME },
      } as TuiSlotContext;
      const rendered = await testRender(
        () => {
          const host = createElement("box") as BoxRenderable;
          spread(host, { width: "100%", height: "100%" });
          const sidebar = createElement("box") as BoxRenderable;
          spread(sidebar, {
            position: "absolute",
            right: 0,
            top: 0,
            width: 36,
            height: "100%",
          });
          insert(
            sidebar,
            () => sidebarContent(context, { session_id: "test-session" }),
          );
          host.add(sidebar);
          return host;
        },
        { width: 80, height: 12 },
      );

      try {
        const initialFrame = await rendered.waitForFrame(
          (frame) =>
            frame.includes("▼ Section title") && frame.includes("Child task"),
        );
        expect(initialFrame).not.toContain(title);
        expect(initialFrame.replace(/\s+/g, "")).not.toContain(compactMainTitle);
        const mainTitleRow = rendered.renderer.root.findDescendantById(
          "openspec-title",
        );
        const mainTitleText = mainTitleRow?.getChildren()[0] as
          | TextRenderable
          | undefined;
        expect(mainTitleText?.scrollWidth).toBeGreaterThan(
          mainTitleRow?.width ?? 0,
        );

        await rendered.mockMouse.moveTo(49, 0);
        const mainTitleTooltipFrame = await rendered.waitForFrame((frame) =>
          frame.replace(/\s+/g, "").includes(compactMainTitle),
        );
        expect(mainTitleTooltipFrame.replace(/\s+/g, "")).toContain(
          compactMainTitle,
        );

        await rendered.mockMouse.moveTo(0, 11);
        await rendered.waitForFrame(
          (frame) => !frame.replace(/\s+/g, "").includes(compactMainTitle),
        );
        const sectionHeader = rendered.renderer.root.findDescendantById(
          "openspec-section-0",
        );
        const sectionText = sectionHeader?.getChildren()[0] as
          | TextRenderable
          | undefined;
        expect(sectionText?.scrollWidth).toBeGreaterThan(
          sectionHeader?.width ?? 0,
        );

        await rendered.mockMouse.moveTo(49, 1);
        const expandedTooltipFrame = await rendered.waitForFrame((frame) =>
          frame.includes(title),
        );
        expect(
          expandedTooltipFrame
            .split("\n")
            .find((line) => line.includes(title))
            ?.trim(),
        ).toBe(title);

        await rendered.mockMouse.click(49, 1);
        await rendered.waitForFrame(
          (frame) =>
            frame.includes("▶ Section title") && !frame.includes("Child task"),
        );

        await rendered.mockMouse.moveTo(48, 0);
        await rendered.mockMouse.moveTo(49, 1);
        const collapsedTooltipFrame = await rendered.waitForFrame((frame) =>
          frame.includes(title),
        );
        expect(
          collapsedTooltipFrame
            .split("\n")
            .find((line) => line.includes(title))
            ?.trim(),
        ).toBe(title);

        await rendered.mockMouse.moveTo(0, 11);
        await rendered.waitForFrame((frame) => !frame.includes(title));
        await rendered.mockMouse.moveTo(49, 2);
        await rendered.flush();
        expect(
          rendered
            .captureCharFrame()
            .split("\n")
            .some((line) => line.trim() === "Short"),
        ).toBe(false);
      } finally {
        rendered.renderer.destroy();
        await harness.disposeLifecycle();
      }
    },
  );

  it("resolves a project candidate without a session and renders tasks.md progress", async () => {
    const harness = await createHarness();
    harness.setCandidates([
      candidate(
        "project-change",
        "in-progress",
        "2026-07-25T14:00:00.000Z",
      ),
    ]);
    harness.markdownByChange.set(
      "project-change",
      "## Plan\n- [ ] A deliberately long task label kept on one row\n- [x] Done",
    );

    const registered = harness.registered();
    expect(registered.order).toBe(SIDEBAR_SLOT_ORDER);
    expect(Object.keys(registered.slots)).toEqual(["sidebar_content"]);
    const runtime = await startRuntime(harness);
    const view = runtime.getView();
    expect(view.status).toBe("ready");
    if (view.status === "idle") throw new Error("Expected active view");
    expect(view.title).toBe("OpenSpec: project-change 1/2");
    expect(view.title).not.toContain("99/100");
    expect(view.sections[0]?.header).toBe("▼ Plan 1/2");
    expect(view.sections[0]?.tasks.map((task) => task.text)).toEqual([
      "  ☐ A deliberately long task label kept on one row",
      "  ✓ Done",
    ]);
    expect(view.sections[0]?.tasks[0]?.text).not.toContain("\n");
    expect(harness.listCalls).toEqual([PROJECT_DIRECTORY]);
    expect(harness.statusCalls).toEqual([
      { changeName: "project-change", projectDirectory: PROJECT_DIRECTORY },
    ]);
    expect(harness.eventSubscriptions).not.toHaveBeenCalled();

    runtime.dispose();
    await harness.disposeLifecycle();
  });

  it("toggles sections independently and restores collapse state", async () => {
    const harness = await createHarness();
    harness.setCandidates([
      candidate(
        "accordion-change",
        "in-progress",
        "2026-07-25T14:00:00.000Z",
      ),
    ]);
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

    const enterEvent = {
      name: "return",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyEvent;
    activateSectionFromKey(enterEvent, () =>
      runtime.toggleSection(view.sections[1]!.id),
    );
    expect(enterEvent.preventDefault).toHaveBeenCalledOnce();
    expect(enterEvent.stopPropagation).toHaveBeenCalledOnce();

    runtime.dispose();
    const restored = await startRuntime(harness);
    const restoredView = restored.getView();
    if (restoredView.status === "idle") throw new Error("Expected active view");
    expect(restoredView.sections.map((section) => section.collapsed)).toEqual([
      true,
      true,
    ]);

    restored.dispose();
    await harness.disposeLifecycle();
  });

  it("switches by list precedence and retains stale rendering on list failure", async () => {
    const harness = await createHarness();
    harness.setCandidates([
      candidate(
        "complete-change",
        "complete",
        "2026-07-25T18:00:00.000Z",
      ),
    ]);
    harness.markdownByChange.set("complete-change", "## Done\n- [x] Complete");
    harness.markdownByChange.set("active-change", "## Work\n- [ ] Active");

    const runtime = await startRuntime(harness);
    expect(runtime.getView()).toMatchObject({
      status: "ready",
      title: "OpenSpec: complete-change 1/1",
    });

    harness.setCandidates([
      candidate(
        "complete-change",
        "complete",
        "2026-07-25T18:00:00.000Z",
      ),
      candidate(
        "active-change",
        "in-progress",
        "2026-07-25T10:00:00.000Z",
      ),
    ]);
    harness.emitInventoryChange();
    let view = await waitForView(
      runtime,
      (current) =>
        current.status !== "idle" && current.title.includes("active-change"),
    );
    expect(view).toMatchObject({
      status: "ready",
      title: "OpenSpec: active-change 0/1",
    });

    harness.setListFailure(true);
    harness.emitInventoryChange();
    view = await waitForView(runtime, (current) => current.status === "stale");
    expect(view).toMatchObject({
      status: "stale",
      title: "OpenSpec: active-change 0/1",
      staleWarning: "Stale · OpenSpec list unavailable",
    });

    runtime.dispose();
    expect(
      harness.watchSubscriptions.every(
        (subscription) => subscription.closeSpy.mock.calls.length === 1,
      ),
    ).toBe(true);
    await harness.disposeLifecycle();
  });

  it("clears to the empty state when the project has no candidate", async () => {
    const harness = await createHarness();
    harness.setCandidates([
      candidate(
        "archived-change",
        "in-progress",
        "2026-07-25T14:00:00.000Z",
      ),
    ]);
    harness.markdownByChange.set("archived-change", "## Work\n- [ ] Pending");

    const runtime = await startRuntime(harness);
    expect(runtime.getView().status).toBe("ready");

    harness.setCandidates([]);
    harness.emitInventoryChange();
    const view = await waitForView(runtime, (current) => current.status === "idle");
    expect(view).toEqual({
      status: "idle",
      emptyText: "No active OpenSpec change",
    });
    expect(JSON.stringify(view)).not.toMatch(/select|apply|verify|archive|edit/i);
    expect(harness.statusCalls).toHaveLength(1);

    runtime.dispose();
    await harness.disposeLifecycle();
  });
});
