import { describe, expect, it } from "vitest";

import { resolveTaskTooltip } from "../../src/tui.js";

const baseInput = {
  description: "A task description that is too long",
  descriptionHeight: 2,
  textWidth: 39,
  rowWidth: 20,
  rowLeft: 4,
  rowTop: 3,
  viewportWidth: 80,
  viewportHeight: 24,
} as const;

describe("task tooltip", () => {
  it("activates only when rendered text overflows the row", () => {
    expect(resolveTaskTooltip(baseInput)?.description).toBe(
      baseInput.description,
    );
    expect(
      resolveTaskTooltip({ ...baseInput, textWidth: 5, rowWidth: 5 }),
    ).toBeUndefined();
  });

  it("anchors to the full row width instead of following the pointer", () => {
    const initial = resolveTaskTooltip(baseInput);

    expect(initial).toEqual({
      description: baseInput.description,
      left: 4,
      top: 4,
      width: 20,
      height: 2,
    });
  });

  it("moves the complete wrapped tooltip above when it does not fit below", () => {
    const tooltip = resolveTaskTooltip({
      ...baseInput,
      descriptionHeight: 3,
      rowLeft: 2,
      rowTop: 5,
      viewportWidth: 30,
      viewportHeight: 6,
    });

    expect(tooltip).toEqual({
      description: baseInput.description,
      left: 2,
      top: 2,
      width: 20,
      height: 3,
    });
    expect(tooltip!.left + tooltip!.width).toBeLessThanOrEqual(30);
    expect(tooltip!.top + tooltip!.height).toBeLessThanOrEqual(6);

    expect(
      resolveTaskTooltip({
        ...baseInput,
        descriptionHeight: 1_000,
        rowLeft: 0,
        rowTop: 3,
        rowWidth: 10,
        viewportWidth: 10,
        viewportHeight: 4,
      }),
    ).toMatchObject({ width: 10, height: 4 });
  });
});
