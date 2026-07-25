export const CHANGE_NAME_MAX_LENGTH = 100;

const CHANGE_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REFERENCE_MARKER_PATTERN = /--change(?:\s*=\s*|\s+)|openspec\/changes\//gi;

export interface SessionMessageLike {
  readonly id?: unknown;
  readonly sessionID?: unknown;
  readonly text?: unknown;
  readonly content?: unknown;
  readonly parts?: unknown;
}

export interface ChangeReferenceSource {
  readonly currentSessionID: string;
  readonly messages: readonly SessionMessageLike[];
  readonly partsForMessage?: (messageID: string) => readonly unknown[];
}

export type ChangeReferenceResult =
  | { readonly status: "none" }
  | { readonly status: "valid"; readonly name: string }
  | { readonly status: "invalid"; readonly token: string };

interface ReferenceMarker {
  readonly index: number;
  readonly tokenStart: number;
}

export function isValidChangeName(value: string): boolean {
  return (
    value.length <= CHANGE_NAME_MAX_LENGTH && CHANGE_NAME_PATTERN.test(value)
  );
}

export function extractNewestChangeReference(
  source: ChangeReferenceSource,
): ChangeReferenceResult {
  for (let index = source.messages.length - 1; index >= 0; index -= 1) {
    const message = source.messages[index];
    if (!message || message.sessionID !== source.currentSessionID) continue;

    const texts = messageTextsNewestFirst(message, source.partsForMessage);
    for (const text of texts) {
      const result = extractNewestReferenceFromText(text);
      if (result.status !== "none") return result;
    }
  }

  return { status: "none" };
}

function messageTextsNewestFirst(
  message: SessionMessageLike,
  partsForMessage?: (messageID: string) => readonly unknown[],
): string[] {
  const embeddedParts = Array.isArray(message.parts) ? message.parts : [];
  const messageID = typeof message.id === "string" ? message.id : undefined;
  const resolvedParts =
    messageID && partsForMessage ? partsForMessage(messageID) : embeddedParts;
  const texts: string[] = [];

  for (let index = resolvedParts.length - 1; index >= 0; index -= 1) {
    const text = textualPartContent(resolvedParts[index]);
    if (text !== undefined) texts.push(text);
  }

  const directText = textualContent(message);
  if (directText !== undefined) texts.push(directText);
  return texts;
}

function textualPartContent(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;
  if (typeof value.type === "string" && value.type !== "text") return undefined;
  return textualContent(value);
}

function textualContent(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.text === "string") return value.text;
  if (typeof value.content === "string") return value.content;
  return undefined;
}

function extractNewestReferenceFromText(text: string): ChangeReferenceResult {
  const markers: ReferenceMarker[] = [];
  REFERENCE_MARKER_PATTERN.lastIndex = 0;

  for (const match of text.matchAll(REFERENCE_MARKER_PATTERN)) {
    const index = match.index;
    if (index === undefined || !hasReferenceBoundary(text, index)) continue;
    markers.push({ index, tokenStart: index + match[0].length });
  }

  for (let index = markers.length - 1; index >= 0; index -= 1) {
    const marker = markers[index];
    if (!marker) continue;
    const token = readToken(text, marker.tokenStart);
    return isValidChangeName(token)
      ? { status: "valid", name: token }
      : { status: "invalid", token };
  }

  return { status: "none" };
}

function hasReferenceBoundary(text: string, markerIndex: number): boolean {
  if (markerIndex === 0) return true;
  return !/[a-zA-Z0-9_/-]/.test(text[markerIndex - 1] ?? "");
}

function readToken(text: string, start: number): string {
  const first = text[start];
  if (first === '"' || first === "'") {
    const end = text.indexOf(first, start + 1);
    return end === -1 ? text.slice(start + 1) : text.slice(start + 1, end);
  }

  let end = start;
  while (end < text.length && !/[\s`"'<>()[\]{}]/.test(text[end] ?? "")) {
    end += 1;
  }
  return text.slice(start, end);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
