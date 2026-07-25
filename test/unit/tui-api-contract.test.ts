import type { KeyEvent, MouseEvent } from "@opentui/core";
import type { BoxProps } from "@opentui/solid";
import type {
  TuiPluginApi,
  TuiSlotPlugin,
} from "@opencode-ai/plugin/tui";
import { describe, expect, expectTypeOf, it } from "vitest";

type SectionInputProps = Pick<BoxProps, "onKeyDown" | "onMouseDown">;

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
  api.kv.get<readonly string[]>("collapsed-sections", []);
  api.kv.set("collapsed-sections", []);
  api.lifecycle.onDispose(() => undefined);
  void api.lifecycle.signal;
}

describe("installed OpenCode TUI type contracts", () => {
  it("preserves host slot, persistence, lifecycle, and input contracts", () => {
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
