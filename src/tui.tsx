import type { KeyEvent, MouseEvent } from "@opentui/core";
import type {
  TuiPlugin,
  TuiPluginApi,
  TuiPluginModule,
  TuiThemeCurrent,
} from "@opencode-ai/plugin/tui";
import { For, Show, batch, createRoot, createSignal, onCleanup, onMount } from "solid-js";

import {
  createAccordionPreferenceAdapter,
  type AccordionPreferenceAdapter,
} from "./accordion-preferences.js";
import type { PresentationState } from "./domain.js";
import {
  createOpenSpecListGateway,
  type OpenSpecListGateway,
} from "./openspec-list.js";
import {
  createOpenSpecStatusGateway,
  type OpenSpecStatusGateway,
} from "./openspec-status.js";
import {
  createRefreshCoordinator,
  type RefreshCoordinatorOptions,
  type WatchFactory,
} from "./refresh-coordinator.js";

export const TUI_PLUGIN_ID = "openspec-task-progress";
export const SIDEBAR_SLOT_ORDER = 350;

export interface OpenSpecTaskTuiDependencies {
  readonly listGateway?: OpenSpecListGateway;
  readonly statusGateway?: OpenSpecStatusGateway;
  readonly readTaskFile?: RefreshCoordinatorOptions["readTaskFile"];
  readonly watch?: WatchFactory;
  readonly debounceMs?: number;
  readonly reconcileIntervalMs?: number;
}

export interface ProjectContext {
  readonly directory: string;
  readonly identity: string;
}

interface SidebarProps {
  readonly api: TuiPluginApi;
  readonly project: ProjectContext;
  readonly theme: TuiThemeCurrent;
  readonly dependencies: Required<
    Pick<OpenSpecTaskTuiDependencies, "listGateway" | "statusGateway">
  > &
    Omit<OpenSpecTaskTuiDependencies, "listGateway" | "statusGateway">;
  readonly registerCleanup: (cleanup: () => void) => () => void;
}

interface SectionProps {
  readonly section: SidebarSectionView;
  readonly sectionIndex: number;
  readonly collapsed: boolean;
  readonly theme: TuiThemeCurrent;
  readonly onToggle: () => void;
}

export interface SidebarTaskRowView {
  readonly text: string;
  readonly completed: boolean;
}

export interface SidebarSectionView {
  readonly id: string;
  readonly header: string;
  readonly collapsed: boolean;
  readonly tasks: readonly SidebarTaskRowView[];
}

export type SidebarView =
  | { readonly status: "idle"; readonly emptyText: string }
  | {
      readonly status: "ready" | "stale";
      readonly title: string;
      readonly staleWarning?: string;
      readonly sections: readonly SidebarSectionView[];
    };

export interface SidebarRuntime {
  start(): Promise<void>;
  getView(): SidebarView;
  subscribe(listener: (view: SidebarView) => void): () => void;
  toggleSection(sectionID: string): void;
  dispose(): void;
}

export function activateSectionFromKey(
  event: KeyEvent,
  activate: () => void,
): boolean {
  if (event.name !== "return" && event.name !== "space") return false;
  event.preventDefault();
  event.stopPropagation();
  activate();
  return true;
}

export function activateSectionFromMouse(
  event: MouseEvent,
  activate: () => void,
): boolean {
  if (event.button !== 0) return false;
  event.preventDefault();
  event.stopPropagation();
  event.target?.focus();
  activate();
  return true;
}

export function resolveProjectContext(api: TuiPluginApi): ProjectContext {
  const directory =
    nonEmptyString(api.state.path.directory) ??
    nonEmptyString(api.state.path.worktree) ??
    process.cwd();
  return {
    directory,
    identity: nonEmptyString(api.state.path.worktree) ?? directory,
  };
}

export function createOpenSpecTaskTui(
  dependencies: OpenSpecTaskTuiDependencies = {},
): TuiPluginModule {
  const resolvedDependencies: SidebarProps["dependencies"] = {
    ...dependencies,
    listGateway: dependencies.listGateway ?? createOpenSpecListGateway(),
    statusGateway:
      dependencies.statusGateway ?? createOpenSpecStatusGateway(),
  };

  const tui: TuiPlugin = async (api) => {
    createRoot((disposeRoot) => {
      let disposed = false;
      const sidebarCleanups = new Set<() => void>();
      const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        for (const cleanup of sidebarCleanups) cleanup();
        sidebarCleanups.clear();
        disposeRoot();
      };

      const removeLifecycleHandler = api.lifecycle.onDispose(dispose);
      onCleanup(removeLifecycleHandler);

      api.slots.register({
        order: SIDEBAR_SLOT_ORDER,
        slots: {
          sidebar_content(context, _props) {
            return (
              <OpenSpecSidebar
                api={api}
                project={resolveProjectContext(api)}
                theme={context.theme.current}
                dependencies={resolvedDependencies}
                registerCleanup={(cleanup) => {
                  sidebarCleanups.add(cleanup);
                  return () => sidebarCleanups.delete(cleanup);
                }}
              />
            );
          },
        },
      });
    });
  };

  return {
    id: TUI_PLUGIN_ID,
    tui,
  };
}

export function createSidebarRuntime(input: {
  readonly api: TuiPluginApi;
  readonly project?: ProjectContext;
  readonly dependencies?: OpenSpecTaskTuiDependencies;
}): SidebarRuntime {
  const project = input.project ?? resolveProjectContext(input.api);
  const dependencies = input.dependencies ?? {};
  const listGateway = dependencies.listGateway ?? createOpenSpecListGateway();
  const statusGateway =
    dependencies.statusGateway ?? createOpenSpecStatusGateway();
  const listeners = new Set<(view: SidebarView) => void>();
  let state: PresentationState = { status: "idle" };
  let view: SidebarView = { status: "idle", emptyText: "No active OpenSpec change" };
  let preferenceChangeName: string | undefined;
  let preferences: AccordionPreferenceAdapter | undefined;
  let collapsedSectionIds = new Set<string>();
  let disposed = false;

  const coordinator = createRefreshCoordinator({
    projectDirectory: project.directory,
    listGateway,
    statusGateway,
    readTaskFile: dependencies.readTaskFile,
    watch: dependencies.watch,
    debounceMs: dependencies.debounceMs,
    reconcileIntervalMs: dependencies.reconcileIntervalMs,
  });

  const publishView = (): void => {
    view = toSidebarView(state, collapsedSectionIds);
    for (const listener of listeners) listener(view);
  };

  const applyState = (next: PresentationState): void => {
    state = next;
    if (next.status === "idle") {
      publishView();
      return;
    }

    const changeName = next.snapshot.change.name;
    if (!preferences || preferenceChangeName !== changeName) {
      preferences = createAccordionPreferenceAdapter(
        input.api.kv,
        project.identity,
        changeName,
      );
      preferenceChangeName = changeName;
    }

    if (next.status === "ready") {
      preferences.reconcileAfterSuccessfulRefresh(
        next.snapshot.sections.map((section) => section.id),
      );
    }
    collapsedSectionIds = new Set(preferences.collapsedSectionIds());
    publishView();
  };

  const unsubscribeCoordinator = coordinator.subscribe(applyState);

  return {
    start: () => coordinator.start(),

    getView: () => view,

    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    toggleSection(sectionID) {
      if (disposed || !preferences) return;
      preferences.setCollapsed(sectionID, !preferences.isCollapsed(sectionID));
      collapsedSectionIds = new Set(preferences.collapsedSectionIds());
      publishView();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      unsubscribeCoordinator();
      coordinator.dispose();
    },
  };
}

function OpenSpecSidebar(props: SidebarProps) {
  const runtime = createSidebarRuntime({
    api: props.api,
    project: props.project,
    dependencies: props.dependencies,
  });
  const [view, setView] = createSignal(runtime.getView());
  const unsubscribe = runtime.subscribe((next) => batch(() => setView(next)));
  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    unsubscribe();
    runtime.dispose();
  };
  const unregisterCleanup = props.registerCleanup(cleanup);
  onMount(() => {
    void runtime.start();
  });
  onCleanup(() => {
    unregisterCleanup();
    cleanup();
  });

  return (
    <box flexDirection="column" width="100%">
      <Show when={view().status !== "idle"} fallback={<EmptyState theme={props.theme} />}>
        {(() => {
          const current = view();
          if (current.status === "idle") return null;
          return (
            <>
              <CompactText fg={props.theme.text}>
                {current.title}
              </CompactText>
              <Show when={current.status === "stale"}>
                <CompactText fg={props.theme.warning} opacity={0.75}>
                  {current.staleWarning ?? ""}
                </CompactText>
              </Show>
              <For each={current.sections}>
                {(section, sectionIndex) => (
                  <TaskSectionView
                    section={section}
                    sectionIndex={sectionIndex()}
                    collapsed={section.collapsed}
                    theme={props.theme}
                    onToggle={() => runtime.toggleSection(section.id)}
                  />
                )}
              </For>
            </>
          );
        })()}
      </Show>
    </box>
  );
}

function TaskSectionView(props: SectionProps) {
  const activate = (): void => props.onToggle();
  const handleKeyDown = (event: KeyEvent): void => {
    activateSectionFromKey(event, activate);
  };
  const handleMouseDown = (event: MouseEvent): void => {
    activateSectionFromMouse(event, activate);
  };

  return (
    <box flexDirection="column" width="100%">
      <box
        id={`openspec-section-${props.sectionIndex}`}
        width="100%"
        height={1}
        focusable
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
      >
        <CompactText fg={props.theme.text}>
          {props.section.header}
        </CompactText>
      </box>
      <Show when={!props.collapsed}>
        <For each={props.section.tasks}>
          {(task) => (
            <CompactText fg={task.completed ? props.theme.success : props.theme.textMuted}>
              {task.text}
            </CompactText>
          )}
        </For>
      </Show>
    </box>
  );
}

function EmptyState(props: { readonly theme: TuiThemeCurrent }) {
  return (
    <CompactText fg={props.theme.textMuted} opacity={0.7}>
      No active OpenSpec change
    </CompactText>
  );
}

function CompactText(props: {
  readonly children: string;
  readonly fg: TuiThemeCurrent["text"];
  readonly opacity?: number;
}) {
  return (
    <text
      width="100%"
      height={1}
      wrapMode="none"
      truncate
      selectable={false}
      fg={props.fg}
      opacity={props.opacity}
    >
      {props.children}
    </text>
  );
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function toSidebarView(
  state: PresentationState,
  collapsedSectionIds: ReadonlySet<string>,
): SidebarView {
  if (state.status === "idle") {
    return { status: "idle", emptyText: "No active OpenSpec change" };
  }

  return {
    status: state.status,
    title: `OpenSpec: ${state.snapshot.change.name} ${state.snapshot.progress.completed}/${state.snapshot.progress.total}`,
    staleWarning:
      state.status === "stale" ? `Stale · ${state.health.reason}` : undefined,
    sections: state.snapshot.sections.map((section) => {
      const collapsed = collapsedSectionIds.has(section.id);
      return {
        id: section.id,
        header: `${collapsed ? "▶" : "▼"} ${section.label} ${section.progress.completed}/${section.progress.total}`,
        collapsed,
        tasks: collapsed
          ? []
          : section.tasks.map((task) => ({
              text: `  ${task.completed ? "✓" : "☐"} ${task.label}`,
              completed: task.completed,
            })),
      };
    }),
  };
}

export default createOpenSpecTaskTui();
