import { describe, expect, it, vi } from "vitest";

import {
  PROCESS_MAX_OUTPUT_BYTES,
  PROCESS_TIMEOUT_MS,
  type ProcessExecutionResult,
  type ProcessExecutor,
} from "../../src/openspec-process.js";
import { createOpenSpecStatusGateway } from "../../src/openspec-status.js";
import { loadOpenSpecFixture } from "../helpers/openspec-fixtures.js";

const CHANGE_NAME = "active-change";
const CHANGE_ROOT = "/project/openspec/changes/active-change";
const TASK_FILE = `${CHANGE_ROOT}/tasks.md`;
const CHANGES_DIRECTORY = "/project/openspec/changes";

function statusJson(
  overrides: Record<string, unknown> = {},
): ProcessExecutionResult {
  return {
    stdout: JSON.stringify({
      changeName: CHANGE_NAME,
      changeRoot: CHANGE_ROOT,
      planningHome: {
        root: "/project",
        changesDir: CHANGES_DIRECTORY,
      },
      artifactPaths: {
        tasks: { resolvedOutputPath: TASK_FILE },
      },
      ...overrides,
    }),
    stderr: "",
  };
}

describe("createOpenSpecStatusGateway", () => {
  it("executes status with bounded argument-array options and resolves validated paths", async () => {
    const fixture = loadOpenSpecFixture("openspec-status.json");
    const executor = vi.fn<ProcessExecutor>(async () => ({
      stdout: JSON.stringify(fixture),
      stderr: "",
    }));
    const gateway = createOpenSpecStatusGateway(executor);

    await expect(
      gateway.resolve(fixture.changeName, fixture.planningHome.root),
    ).resolves.toEqual({
      status: "resolved",
      change: {
        name: fixture.changeName,
        rootPath: fixture.changeRoot,
        taskFilePath: fixture.artifactPaths.tasks.resolvedOutputPath,
        changesDirectoryPath: fixture.planningHome.changesDir,
      },
    });
    expect(executor).toHaveBeenCalledWith({
      command: "openspec",
      args: ["status", "--change", fixture.changeName, "--json"],
      cwd: fixture.planningHome.root,
      timeoutMs: PROCESS_TIMEOUT_MS,
      maxOutputBytes: PROCESS_MAX_OUTPUT_BYTES,
    });
  });

  it("classifies malformed JSON as a temporary output failure", async () => {
    const gateway = createOpenSpecStatusGateway(async () => ({
      stdout: "not json",
      stderr: "",
    }));

    await expect(gateway.resolve(CHANGE_NAME, "/project")).resolves.toEqual({
      status: "temporary-failure",
      reason: "malformed-json",
    });
  });

  it("rejects status JSON that identifies another change", async () => {
    const gateway = createOpenSpecStatusGateway(async () =>
      statusJson({ changeName: "different-change" }),
    );

    await expect(gateway.resolve(CHANGE_NAME, "/project")).resolves.toEqual({
      status: "temporary-failure",
      reason: "mismatched-change",
    });
  });

  it.each([
    ["Change 'active-change' not found.", "missing-change"],
    ["Change 'active-change' is invalid.", "invalid-change"],
  ] as const)(
    "classifies the authoritative change error %s",
    async (message, reason) => {
      const gateway = createOpenSpecStatusGateway(async () => ({
        stdout: JSON.stringify({
          status: [{ severity: "error", code: "change_error", message }],
        }),
        stderr: "",
      }));

      await expect(gateway.resolve(CHANGE_NAME, "/project")).resolves.toEqual({
        status: "authoritative-failure",
        reason,
      });
    },
  );

  it("rejects an invalid change name without invoking the command", async () => {
    const executor = vi.fn<ProcessExecutor>(async () => statusJson());
    const gateway = createOpenSpecStatusGateway(executor);

    await expect(gateway.resolve("../unsafe", "/project")).resolves.toEqual({
      status: "authoritative-failure",
      reason: "invalid-change",
    });
    expect(executor).not.toHaveBeenCalled();
  });

  it("classifies a timeout as temporary", async () => {
    const gateway = createOpenSpecStatusGateway(async () => ({
      stdout: "",
      stderr: "",
      failure: { kind: "timeout" },
    }));

    await expect(gateway.resolve(CHANGE_NAME, "/project")).resolves.toEqual({
      status: "temporary-failure",
      reason: "timeout",
    });
  });

  it("classifies a command failure as temporary", async () => {
    const gateway = createOpenSpecStatusGateway(async () => ({
      stdout: "",
      stderr: "openspec unavailable",
      failure: { kind: "spawn" },
    }));

    await expect(gateway.resolve(CHANGE_NAME, "/project")).resolves.toEqual({
      status: "temporary-failure",
      reason: "command",
    });
  });

  it("bounds output even when an injected executor ignores the request limit", async () => {
    const gateway = createOpenSpecStatusGateway(async () => ({
      stdout: "x".repeat(PROCESS_MAX_OUTPUT_BYTES + 1),
      stderr: "",
    }));

    await expect(gateway.resolve(CHANGE_NAME, "/project")).resolves.toEqual({
      status: "temporary-failure",
      reason: "output",
    });
  });

  it("rejects a task artifact path outside the validated change root", async () => {
    const gateway = createOpenSpecStatusGateway(async () =>
      statusJson({
        artifactPaths: {
          tasks: {
            resolvedOutputPath:
              "/project/openspec/changes/other-change/tasks.md",
          },
        },
      }),
    );

    await expect(gateway.resolve(CHANGE_NAME, "/project")).resolves.toEqual({
      status: "temporary-failure",
      reason: "unsafe-path",
    });
  });

  it("normalizes the status-derived planning changes directory", async () => {
    const captured = loadOpenSpecFixture("openspec-status.json");
    const fixture = {
      ...captured,
      planningHome: {
        ...captured.planningHome,
        changesDir:
          "/workspace/openspec-opencode-statusline/openspec/nested/../changes",
      },
    };
    const gateway = createOpenSpecStatusGateway(async () => ({
      stdout: JSON.stringify(fixture),
      stderr: "",
    }));

    await expect(
      gateway.resolve(fixture.changeName, fixture.planningHome.root),
    ).resolves.toMatchObject({
      status: "resolved",
      change: {
        changesDirectoryPath:
          "/workspace/openspec-opencode-statusline/openspec/changes",
      },
    });
  });

  it("rejects a planning changes directory outside its status planning root", async () => {
    const captured = loadOpenSpecFixture("openspec-status.json");
    const fixture = {
      ...captured,
      planningHome: {
        ...captured.planningHome,
        changesDir: "/workspace/other/changes",
      },
    };
    const gateway = createOpenSpecStatusGateway(async () => ({
      stdout: JSON.stringify(fixture),
      stderr: "",
    }));

    await expect(
      gateway.resolve(fixture.changeName, fixture.planningHome.root),
    ).resolves.toEqual({
      status: "temporary-failure",
      reason: "unsafe-path",
    });
  });
});
