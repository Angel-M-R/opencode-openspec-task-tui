import type { KeyEvent, MouseEvent } from "@opentui/core";
import type { BoxProps } from "@opentui/solid";
import type {
  TuiHostSlotMap,
  TuiPluginApi,
  TuiSlotPlugin,
} from "@opencode-ai/plugin/tui";
import { describe, expect, expectTypeOf, it } from "vitest";

type SidebarContentProps = TuiHostSlotMap["sidebar_content"];
type SectionInputProps = Pick<BoxProps, "onKeyDown" | "onMouseDown">;

// Compatibility contract: slot props are the primary current-session source;
// the route is retained as a fallback for setup work outside a slot render.
function resolveCurrentSessionID(
  api: TuiPluginApi,
  props?: SidebarContentProps,
): string | undefined {
  if (props?.session_id) return props.session_id;

  // The installed route union has an open-ended route whose params are optional,
  // so a runtime string check is required even when the route name is "session".
  const route = api.route.current;
  const sessionID = "params" in route ? route.params?.sessionID : undefined;
  return route.name === "session" && typeof sessionID === "string"
    ? sessionID
    : undefined;
}

const sidebarPlugin: TuiSlotPlugin = {
  order: 100,
  slots: {
    sidebar_content: (_context, props) => {
      expectTypeOf(props.session_id).toEqualTypeOf<string>();
      return null;
    },
  },
  dispose: () => undefined,
};

const sectionInputProps: SectionInputProps = {
  onKeyDown: (event: KeyEvent) => {
    void event.name;
    event.preventDefault();
  },
  onMouseDown: (event: MouseEvent) => {
    void event.button;
    event.stopPropagation();
  },
};

function verifyInstalledApi(api: TuiPluginApi): void {
  api.slots.register(sidebarPlugin);
  api.state.session.messages("session-id");
  api.state.part("message-id");
  api.kv.get<readonly string[]>("collapsed-sections", []);
  api.kv.set("collapsed-sections", []);
  api.lifecycle.onDispose(() => undefined);
  void api.lifecycle.signal;
}

describe("installed OpenCode TUI type contracts", () => {
  it("exposes current-session, slot, persistence, lifecycle, and input contracts", () => {
    expectTypeOf(resolveCurrentSessionID).toBeFunction();
    expectTypeOf(verifyInstalledApi).toBeFunction();
    expectTypeOf(sectionInputProps.onKeyDown).toEqualTypeOf<
      ((event: KeyEvent) => void) | undefined
    >();
    expectTypeOf(sectionInputProps.onMouseDown).toEqualTypeOf<
      BoxProps["onMouseDown"]
    >();
    expect(sidebarPlugin.order).toBe(100);
  });
});
