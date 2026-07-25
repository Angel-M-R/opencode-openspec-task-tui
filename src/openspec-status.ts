import { execFile } from "node:child_process";
import path from "node:path";

import { isValidChangeName } from "./change-reference.js";
import type { ActiveChange } from "./domain.js";

export const STATUS_TIMEOUT_MS = 5_000;
export const STATUS_MAX_OUTPUT_BYTES = 256 * 1024;

export interface ProcessRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}

export type ProcessFailureKind = "timeout" | "output" | "exit" | "spawn";

export interface ProcessExecutionResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly failure?: {
    readonly kind: ProcessFailureKind;
    readonly exitCode?: number;
  };
}

export type ProcessExecutor = (
  request: ProcessRequest,
) => Promise<ProcessExecutionResult>;

export interface OpenSpecStatusCommandGateway {
  run(
    changeName: string,
    projectDirectory: string,
  ): Promise<ProcessExecutionResult>;
}

export type OpenSpecStatusResult =
  | { readonly status: "resolved"; readonly change: ActiveChange }
  | {
      readonly status: "authoritative-failure";
      readonly reason: "missing-change" | "invalid-change";
    }
  | {
      readonly status: "temporary-failure";
      readonly reason:
        | "command"
        | "timeout"
        | "output"
        | "malformed-json"
        | "mismatched-change"
        | "invalid-status"
        | "unsafe-path";
    };

export interface OpenSpecStatusGateway {
  resolve(
    changeName: string,
    projectDirectory: string,
  ): Promise<OpenSpecStatusResult>;
}

export function createOpenSpecStatusCommandGateway(
  executor: ProcessExecutor = executeFile,
): OpenSpecStatusCommandGateway {
  return {
    async run(changeName, projectDirectory) {
      let result: ProcessExecutionResult;
      try {
        result = await executor({
          command: "openspec",
          args: ["status", "--change", changeName, "--json"],
          cwd: projectDirectory,
          timeoutMs: STATUS_TIMEOUT_MS,
          maxOutputBytes: STATUS_MAX_OUTPUT_BYTES,
        });
      } catch {
        return {
          stdout: "",
          stderr: "",
          failure: { kind: "spawn" },
        };
      }

      if (
        Buffer.byteLength(result.stdout, "utf8") > STATUS_MAX_OUTPUT_BYTES ||
        Buffer.byteLength(result.stderr, "utf8") > STATUS_MAX_OUTPUT_BYTES
      ) {
        return {
          stdout: "",
          stderr: "",
          failure: { kind: "output" },
        };
      }

      return result;
    },
  };
}

export function createOpenSpecStatusGateway(
  executor?: ProcessExecutor,
): OpenSpecStatusGateway {
  const commands = createOpenSpecStatusCommandGateway(executor);

  return {
    async resolve(changeName, projectDirectory) {
      if (!isValidChangeName(changeName)) {
        return { status: "authoritative-failure", reason: "invalid-change" };
      }

      const command = await commands.run(changeName, projectDirectory);
      const parsed = parseStatusOutput(command.stdout);
      if (parsed.status === "malformed") {
        return commandFailure(command.failure, "malformed-json");
      }

      const authoritativeFailure = readAuthoritativeFailure(parsed.value);
      if (authoritativeFailure) return authoritativeFailure;
      if (command.failure) return commandFailure(command.failure);

      return validateResolvedStatus(parsed.value, changeName);
    },
  };
}

const executeFile: ProcessExecutor = (request) =>
  new Promise((resolve) => {
    execFile(
      request.command,
      [...request.args],
      {
        cwd: request.cwd,
        encoding: "utf8",
        maxBuffer: request.maxOutputBytes,
        timeout: request.timeoutMs,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        resolve({
          stdout,
          stderr,
          ...(error ? { failure: processFailure(error) } : {}),
        });
      },
    );
  });

function processFailure(error: Error): ProcessExecutionResult["failure"] {
  const details = error as Error & {
    readonly code?: string | number;
    readonly killed?: boolean;
  };

  if (details.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return { kind: "output" };
  }
  if (details.code === "ETIMEDOUT" || details.killed) {
    return { kind: "timeout" };
  }
  if (typeof details.code === "number") {
    return { kind: "exit", exitCode: details.code };
  }
  return { kind: "spawn" };
}

function parseStatusOutput(
  stdout: string,
): { readonly status: "parsed"; readonly value: unknown } | {
  readonly status: "malformed";
} {
  try {
    return { status: "parsed", value: JSON.parse(stdout) as unknown };
  } catch {
    return { status: "malformed" };
  }
}

function readAuthoritativeFailure(
  value: unknown,
): Extract<OpenSpecStatusResult, { status: "authoritative-failure" }> | undefined {
  if (!isRecord(value) || !Array.isArray(value.status)) return undefined;

  const issue = value.status.find(
    (entry) =>
      isRecord(entry) &&
      entry.severity === "error" &&
      entry.code === "change_error" &&
      typeof entry.message === "string",
  );
  if (!isRecord(issue) || typeof issue.message !== "string") return undefined;

  return {
    status: "authoritative-failure",
    reason: /\bnot found\b/i.test(issue.message)
      ? "missing-change"
      : "invalid-change",
  };
}

function validateResolvedStatus(
  value: unknown,
  requestedChange: string,
): OpenSpecStatusResult {
  if (!isRecord(value)) return temporaryFailure("invalid-status");
  if (value.changeName !== requestedChange) {
    return temporaryFailure("mismatched-change");
  }

  const tasks = isRecord(value.artifactPaths)
    ? value.artifactPaths.tasks
    : undefined;
  if (
    typeof value.changeRoot !== "string" ||
    !isRecord(tasks) ||
    typeof tasks.resolvedOutputPath !== "string"
  ) {
    return temporaryFailure("invalid-status");
  }

  const changeRoot = normalizeAbsolutePath(value.changeRoot);
  const taskFilePath = normalizeAbsolutePath(tasks.resolvedOutputPath);
  if (
    !changeRoot ||
    !taskFilePath ||
    !isStrictlyWithin(taskFilePath, changeRoot)
  ) {
    return temporaryFailure("unsafe-path");
  }

  return {
    status: "resolved",
    change: {
      name: requestedChange,
      rootPath: changeRoot,
      taskFilePath,
    },
  };
}

function normalizeAbsolutePath(value: string): string | undefined {
  if (!path.isAbsolute(value) || value.includes("\0")) return undefined;
  return path.resolve(value);
}

function isStrictlyWithin(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative.length > 0 &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function commandFailure(
  failure: ProcessExecutionResult["failure"],
  outputReason: "malformed-json" = "malformed-json",
): Extract<OpenSpecStatusResult, { status: "temporary-failure" }> {
  if (failure?.kind === "timeout") return temporaryFailure("timeout");
  if (failure?.kind === "output") return temporaryFailure("output");
  if (failure) return temporaryFailure("command");
  return temporaryFailure(outputReason);
}

function temporaryFailure(
  reason: Extract<
    OpenSpecStatusResult,
    { status: "temporary-failure" }
  >["reason"],
): Extract<OpenSpecStatusResult, { status: "temporary-failure" }> {
  return { status: "temporary-failure", reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
