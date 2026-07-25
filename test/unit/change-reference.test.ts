import { describe, expect, it } from "vitest";

import {
  extractNewestChangeReference,
  isValidChangeName,
  type SessionMessageLike,
} from "../../src/change-reference.js";

function extract(
  messages: readonly SessionMessageLike[],
  parts: Readonly<Record<string, readonly unknown[]>> = {},
) {
  return extractNewestChangeReference({
    currentSessionID: "current",
    messages,
    partsForMessage: (messageID) => parts[messageID] ?? [],
  });
}

describe("extractNewestChangeReference", () => {
  it("ignores newer references from other sessions", () => {
    expect(
      extract([
        {
          id: "current-message",
          sessionID: "current",
          text: "openspec/changes/current-change",
        },
        {
          id: "other-message",
          sessionID: "other",
          text: "--change other-change",
        },
      ]),
    ).toEqual({ status: "valid", name: "current-change" });
  });

  it("selects the newest textual part from the newest current-session message", () => {
    expect(
      extract(
        [
          {
            id: "older-message",
            sessionID: "current",
            text: "--change older-change",
          },
          { id: "newer-message", sessionID: "current" },
        ],
        {
          "newer-message": [
            { type: "text", text: "--change earlier-part" },
            { type: "tool", text: "--change ignored-tool-part" },
            { type: "text", text: "openspec/changes/newest-change" },
          ],
        },
      ),
    ).toEqual({ status: "valid", name: "newest-change" });
  });

  it.each([
    ["--change spaced-change", "spaced-change"],
    ["--change=equals-change", "equals-change"],
    ['--change "quoted-change"', "quoted-change"],
    ["openspec/changes/path-change", "path-change"],
  ])("supports the explicit reference in %s", (text, name) => {
    expect(
      extract([{ id: "message", sessionID: "current", content: text }]),
    ).toEqual({ status: "valid", name });
  });

  it.each([
    "../escape",
    "UPPERCASE",
    "two_words",
    "change;rm",
    "-leading-hyphen",
    "trailing-hyphen-",
  ])("rejects the unsafe change token %s", (token) => {
    expect(isValidChangeName(token)).toBe(false);
    expect(
      extract([
        {
          id: "message",
          sessionID: "current",
          text: `--change ${token}`,
        },
      ]),
    ).toEqual({ status: "invalid", token });
  });

  it("does not fall back when the newest explicit reference is unsafe", () => {
    expect(
      extract([
        {
          id: "older-message",
          sessionID: "current",
          text: "--change older-valid-change",
        },
        {
          id: "newer-message",
          sessionID: "current",
          text: "openspec/changes/../unsafe",
        },
      ]),
    ).toEqual({ status: "invalid", token: "../unsafe" });
  });

  it("returns none when the current session has no explicit reference", () => {
    expect(
      extract([
        {
          id: "message",
          sessionID: "current",
          text: "We should work on a change next.",
        },
      ]),
    ).toEqual({ status: "none" });
  });
});
