import { describe, expect, it } from "vitest";

import { parseTaskDocument } from "../../src/task-parser.js";

describe("parseTaskDocument", () => {
  it("parses both task syntaxes in source order and ignores unsupported Markdown", () => {
    const document = parseTaskDocument(`
# Delivery

Introductory prose with - [x] an inline marker.
- [ ] List unchecked
- [X] List checked uppercase
### [x] Heading checked lowercase
### [X] Heading checked uppercase
* [x] Unsupported list marker
#### [x] Unsupported heading level

\`\`\`md
- [x] Fenced list task
### [ ] Fenced heading task
\`\`\`
    - [x] Indented code task
`);

    expect(document.sections).toHaveLength(1);
    expect(document.sections[0]?.tasks).toEqual([
      { label: "List unchecked", completed: false },
      { label: "List checked uppercase", completed: true },
      { label: "Heading checked lowercase", completed: true },
      { label: "Heading checked uppercase", completed: true },
    ]);
  });

  it("groups sections in order with a fallback and indexed normalized duplicate identities", () => {
    const document = parseTaskDocument(`
- [ ] Before any heading
## Tasks
- [x] Explicit tasks section
## Build Phase
- [ ] Compile
##  build   PHASE  
### [x] Package
`);

    expect(
      document.sections.map(({ id, label, tasks }) => ({ id, label, tasks })),
    ).toEqual([
      {
        id: "tasks:1",
        label: "Tasks",
        tasks: [{ label: "Before any heading", completed: false }],
      },
      {
        id: "tasks:2",
        label: "Tasks",
        tasks: [{ label: "Explicit tasks section", completed: true }],
      },
      {
        id: "build phase:1",
        label: "Build Phase",
        tasks: [{ label: "Compile", completed: false }],
      },
      {
        id: "build phase:2",
        label: "build   PHASE",
        tasks: [{ label: "Package", completed: true }],
      },
    ]);
  });

  it("derives section and global progress from one mixed-completion snapshot", () => {
    const document = parseTaskDocument(`
## First
- [x] Done
- [ ] Pending
## Second
### [X] Also done
`);

    expect(document.sections.map((section) => section.progress)).toEqual([
      { completed: 1, total: 2 },
      { completed: 1, total: 1 },
    ]);
    expect(document.progress).toEqual({ completed: 2, total: 3 });
  });

  it("returns zero-of-zero progress for an empty task document", () => {
    const document = parseTaskDocument(`
# Notes
Prose only.

\`\`\`
- [x] Not a task
\`\`\`
`);

    expect(document).toEqual({
      sections: [],
      progress: { completed: 0, total: 0 },
    });
  });
});
