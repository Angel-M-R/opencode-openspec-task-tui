import { describe, expect, it } from "vitest";

import {
  accordionPreferenceKey,
  createAccordionPreferenceAdapter,
  type PreferenceKeyValueStore,
} from "../../src/accordion-preferences.js";
import { parseTaskDocument } from "../../src/task-parser.js";

class MemoryPreferenceStore implements PreferenceKeyValueStore {
  readonly values = new Map<string, unknown>();

  get<Value = unknown>(key: string, fallback?: Value): Value {
    return (this.values.has(key) ? this.values.get(key) : fallback) as Value;
  }

  set(key: string, value: unknown): void {
    this.values.set(key, value);
  }
}

const PROJECT_A = "/workspace/project-a";
const PROJECT_B = "/workspace/project-b";
const CHANGE_A = "add-sidebar";
const CHANGE_B = "fix-parser";

describe("accordion preferences", () => {
  it("isolates collapsed sections between stable project identities", () => {
    const store = new MemoryPreferenceStore();
    const projectA = createAccordionPreferenceAdapter(
      store,
      PROJECT_A,
      CHANGE_A,
    );
    const projectB = createAccordionPreferenceAdapter(
      store,
      PROJECT_B,
      CHANGE_A,
    );

    projectA.reconcileAfterSuccessfulRefresh(["implementation:1"]);
    projectA.setCollapsed("implementation:1", true);
    projectB.reconcileAfterSuccessfulRefresh(["implementation:1"]);

    expect(projectA.isCollapsed("implementation:1")).toBe(true);
    expect(projectB.isCollapsed("implementation:1")).toBe(false);
  });

  it("isolates collapsed sections between validated changes", () => {
    const store = new MemoryPreferenceStore();
    const changeA = createAccordionPreferenceAdapter(
      store,
      PROJECT_A,
      CHANGE_A,
    );
    const changeB = createAccordionPreferenceAdapter(
      store,
      PROJECT_A,
      CHANGE_B,
    );

    changeA.setCollapsed("implementation:1", true);

    expect(changeB.isCollapsed("implementation:1")).toBe(false);
  });

  it("restores collapsed sections when a project and change are revisited", () => {
    const store = new MemoryPreferenceStore();
    const firstVisit = createAccordionPreferenceAdapter(
      store,
      PROJECT_A,
      CHANGE_A,
    );
    firstVisit.setCollapsed("implementation:1", true);

    const revisit = createAccordionPreferenceAdapter(
      store,
      PROJECT_A,
      CHANGE_A,
    );
    const restored = revisit.reconcileAfterSuccessfulRefresh([
      "implementation:1",
      "validation:1",
    ]);

    expect(restored).toEqual(["implementation:1"]);
    expect(revisit.isCollapsed("validation:1")).toBe(false);
  });

  it("addresses duplicate headings independently by occurrence identity", () => {
    const store = new MemoryPreferenceStore();
    const preferences = createAccordionPreferenceAdapter(
      store,
      PROJECT_A,
      CHANGE_A,
    );
    const document = parseTaskDocument([
      "## Implementation",
      "- [ ] First",
      "## Implementation",
      "- [ ] Second",
    ].join("\n"));
    const sectionIds = document.sections.map((section) => section.id);

    preferences.reconcileAfterSuccessfulRefresh(sectionIds);
    preferences.setCollapsed(sectionIds[0], true);

    expect(sectionIds).toEqual(["implementation:1", "implementation:2"]);
    expect(preferences.isCollapsed(sectionIds[0])).toBe(true);
    expect(preferences.isCollapsed(sectionIds[1])).toBe(false);
  });

  it("leaves newly added sections open", () => {
    const store = new MemoryPreferenceStore();
    const preferences = createAccordionPreferenceAdapter(
      store,
      PROJECT_A,
      CHANGE_A,
    );
    preferences.reconcileAfterSuccessfulRefresh(["implementation:1"]);
    preferences.setCollapsed("implementation:1", true);

    preferences.reconcileAfterSuccessfulRefresh([
      "implementation:1",
      "validation:1",
    ]);

    expect(preferences.isCollapsed("implementation:1")).toBe(true);
    expect(preferences.isCollapsed("validation:1")).toBe(false);
  });

  it("opens renamed sections and prunes their removed identities", () => {
    const store = new MemoryPreferenceStore();
    const preferences = createAccordionPreferenceAdapter(
      store,
      PROJECT_A,
      CHANGE_A,
    );
    preferences.setCollapsed("implementation:1", true);

    preferences.reconcileAfterSuccessfulRefresh(["delivery:1"]);

    expect(preferences.isCollapsed("delivery:1")).toBe(false);
    expect(store.values.get(accordionPreferenceKey(PROJECT_A, CHANGE_A))).toEqual(
      [],
    );
  });

  it.each([
    null,
    "implementation:1",
    { collapsed: ["implementation:1"] },
    ["implementation:1", 2],
  ])("defaults open and repairs malformed stored data %#", (stored) => {
    const store = new MemoryPreferenceStore();
    const key = accordionPreferenceKey(PROJECT_A, CHANGE_A);
    store.values.set(key, stored);

    const preferences = createAccordionPreferenceAdapter(
      store,
      PROJECT_A,
      CHANGE_A,
    );
    preferences.reconcileAfterSuccessfulRefresh(["implementation:1"]);

    expect(preferences.isCollapsed("implementation:1")).toBe(false);
    expect(store.values.get(key)).toEqual([]);
  });
});
