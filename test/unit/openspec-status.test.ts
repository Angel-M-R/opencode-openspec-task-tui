import { describe, expect, it, vi } from "vitest";

import {
  createOpenSpecStatusGateway,
  STATUS_MAX_OUTPUT_BYTES,
  STATUS_TIMEOUT_MS,
  type ProcessExecutionResult,
  type ProcessExecutor,
} from "../../src/openspec-status.js";

const CHANGE_NAME = "active-change";
const CHANGE_ROOT = "/project/openspec/changes/active-change";
const TASK_FILE = `${CHANGE_ROOT}/tasks.md`;

function statusJson(
  overrides: Record<string, unknown> = {},
): ProcessExecutionResult {
  return {
    stdout: JSON.stringify({
      changeName: CHANGE_NAME,
      changeRoot: CHANGE_ROOT,
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
    const executor = vi.fn<ProcessExecutor>(async () => statusJson());
    const gateway = createOpenSpecStatusGateway(executor);

    await expect(gateway.resolve(CHANGE_NAME, "/project")).resolves.toEqual({
      status: "resolved",
      change: {
        name: CHANGE_NAME,
        rootPath: CHANGE_ROOT,
        taskFilePath: TASK_FILE,
      },
    });
    expect(executor).toHaveBeenCalledWith({
      command: "openspec",
      args: ["status", "--change", CHANGE_NAME, "--json"],
      cwd: "/project",
      timeoutMs: STATUS_TIMEOUT_MS,
      maxOutputBytes: STATUS_MAX_OUTPUT_BYTES,
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
      stdout: "x".repeat(STATUS_MAX_OUTPUT_BYTES + 1),
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
});
