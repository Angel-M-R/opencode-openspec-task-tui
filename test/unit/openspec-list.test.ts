import { describe, expect, it, vi } from "vitest";

import {
  createOpenSpecListGateway,
  selectOpenSpecCandidate,
} from "../../src/openspec-list.js";
import {
  PROCESS_MAX_OUTPUT_BYTES,
  PROCESS_TIMEOUT_MS,
  type ProcessExecutor,
} from "../../src/openspec-process.js";
import {
  loadOpenSpecFixture,
  type OpenSpecListFixture,
} from "../helpers/openspec-fixtures.js";

describe("selectOpenSpecCandidate", () => {
  it("prefers an in-progress candidate over a newer complete candidate", () => {
    const captured = loadOpenSpecFixture("openspec-list.json");
    const fixture: OpenSpecListFixture = {
      ...captured,
      changes: captured.changes.filter((change) =>
        ["fixture-complete-change", "fixture-active-change"].includes(change.name)
      ),
    };

    expect(selectOpenSpecCandidate(fixture)).toEqual({
      status: "selected",
      changeName: "fixture-active-change",
    });
  });

  it("chooses the newest valid timestamp within the winning status", () => {
    const fixture: OpenSpecListFixture = {
      ...loadOpenSpecFixture("openspec-list.json"),
      changes: [
        {
          name: "older",
          completedTasks: 0,
          totalTasks: 1,
          lastModified: "2026-07-25T12:00:00.000Z",
          status: "in-progress",
        },
        {
          name: "newer",
          completedTasks: 0,
          totalTasks: 1,
          lastModified: "2026-07-25T13:00:00.000Z",
          status: "in-progress",
        },
      ],
    };

    expect(selectOpenSpecCandidate(fixture)).toEqual({
      status: "selected",
      changeName: "newer",
    });
  });

  it("excludes no-tasks, unsupported, malformed, and unsafe-name entries", () => {
    const fixture: OpenSpecListFixture = {
      ...loadOpenSpecFixture("openspec-list.json"),
      changes: [
        {
          name: "fixture-no-tasks",
          completedTasks: 0,
          totalTasks: 0,
          lastModified: "2026-07-25T16:00:00.000Z",
          status: "no-tasks",
        },
        {
          name: "unsupported",
          completedTasks: 0,
          totalTasks: 1,
          lastModified: "2026-07-25T17:00:00.000Z",
          status: "paused",
        },
        {
          name: "../unsafe",
          completedTasks: 0,
          totalTasks: 1,
          lastModified: "2026-07-25T18:00:00.000Z",
          status: "in-progress",
        },
        {
          name: "bad-time",
          completedTasks: 0,
          totalTasks: 1,
          lastModified: "not-a-timestamp",
          status: "complete",
        },
      ],
    };

    expect(selectOpenSpecCandidate(fixture)).toEqual({
      status: "no-candidate",
    });
  });

  it("returns no candidate for an empty inventory", () => {
    const fixture: OpenSpecListFixture = {
      ...loadOpenSpecFixture("openspec-list.json"),
      changes: [],
    };
    expect(
      selectOpenSpecCandidate(fixture),
    ).toEqual({ status: "no-candidate" });
  });
});

describe("createOpenSpecListGateway", () => {
  it("executes exactly openspec list --json with the shared process bounds", async () => {
    const fixture = loadOpenSpecFixture("openspec-list.json");
    const executor = vi.fn<ProcessExecutor>(async () => ({
      stdout: JSON.stringify(fixture),
      stderr: "",
    }));
    const gateway = createOpenSpecListGateway(executor);

    await expect(gateway.resolve("/project")).resolves.toEqual({
      status: "selected",
      changeName: "fixture-active-change",
    });
    expect(executor).toHaveBeenCalledWith({
      command: "openspec",
      args: ["list", "--json"],
      cwd: "/project",
      timeoutMs: PROCESS_TIMEOUT_MS,
      maxOutputBytes: PROCESS_MAX_OUTPUT_BYTES,
    });
  });

  it.each([
    [{ failure: { kind: "spawn" as const } }, "command"],
    [{ failure: { kind: "timeout" as const } }, "timeout"],
    [{ failure: { kind: "output" as const } }, "output"],
  ])("classifies process failure %# as temporary", async (result, reason) => {
    const gateway = createOpenSpecListGateway(async () => ({
      stdout: "",
      stderr: "",
      ...result,
    }));

    await expect(gateway.resolve("/project")).resolves.toEqual({
      status: "temporary-failure",
      reason,
    });
  });

  it("enforces the output cap when an injected executor ignores it", async () => {
    const gateway = createOpenSpecListGateway(async () => ({
      stdout: "x".repeat(PROCESS_MAX_OUTPUT_BYTES + 1),
      stderr: "",
    }));

    await expect(gateway.resolve("/project")).resolves.toEqual({
      status: "temporary-failure",
      reason: "output",
    });
  });

  it.each([
    ["not json", "malformed-json"],
    [JSON.stringify({ changes: "not-an-array" }), "invalid-list"],
  ])("classifies malformed output as %s", async (stdout, reason) => {
    const gateway = createOpenSpecListGateway(async () => ({
      stdout,
      stderr: "",
    }));

    await expect(gateway.resolve("/project")).resolves.toEqual({
      status: "temporary-failure",
      reason,
    });
  });
});
