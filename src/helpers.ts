/** The role of a message author in a Grok conversation. */
export type Role = "User" | "Grok";

/** Default title used when no conversation title is detected. */
export const DEFAULT_TITLE = "Grok Conversation";

/** Regex pattern for Grok branding suffixes to strip from conversation titles. */
export const TITLE_SUFFIX = /\s*(?:\||-)\s*Shared Grok Conversation\s*$/i;

/** Set of UI button/label text to filter out from Markdown content. */
export const UI_NOISE: Set<string> = new Set(
  [
    "copy",
    "copied",
    "edit",
    "regenerate",
    "retry",
    "share",
    "grok",
    "like",
    "dislike",
    "good response",
    "bad response",
  ].map((value) => value.toLowerCase()),
);

/** Error thrown for invalid command-line usage or input. */
export class UsageError extends Error {
  override readonly name = "UsageError";
}

/** Converts an unknown error value to a string message. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parses a string as a positive integer, throwing UsageError if invalid. */
export function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new UsageError(
      `${option} must be a positive integer; received ${JSON.stringify(value)}.`,
    );
  }

  return parsed;
}

/** Parses and validates a Grok conversation URL, throwing UsageError if invalid. */
export function parseUrl(value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new UsageError(`Invalid URL: ${JSON.stringify(value)}.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UsageError(`Unsupported URL protocol ${JSON.stringify(url.protocol)}.`);
  }

  return url;
}

/** Cleans a conversation title by removing Grok branding suffixes and normalizing whitespace. */
export function cleanTitle(title: string | undefined): string {
  const cleaned = title?.replace(TITLE_SUFFIX, "").replace(/\s+/g, " ").trim();

  return cleaned || DEFAULT_TITLE;
}

/** Converts a conversation title into a safe filename by removing invalid characters. */
export function cleanFilename(title: string): string {
  const filename = title
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*]|[^\x20-\x7e]/g, "")
    .replace(/\s+/g, "_")
    .replace(/^[._\s]+|[._\s]+$/g, "")
    .slice(0, 100);

  return filename || "grok_conversation";
}

/** Cleans Markdown content by removing UI noise and normalizing whitespace. */
export function cleanMarkdown(markdown: string, role: Role): string {
  const output: string[] = [];

  let openFence:
    | {
        character: "`" | "~";
        length: number;
      }
    | undefined;

  for (const originalLine of markdown
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .split("\n")) {
    const line = originalLine.replace(/[ \t]+$/g, "");
    const trimmed = line.trim();

    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);

    if (fenceMatch?.[1]) {
      const marker = fenceMatch[1];
      const character = marker[0] as "`" | "~";

      if (openFence === undefined) {
        openFence = {
          character,
          length: marker.length,
        };
      } else if (character === openFence.character && marker.length >= openFence.length) {
        openFence = undefined;
      }

      output.push(line);
      continue;
    }

    if (openFence === undefined && UI_NOISE.has(trimmed.toLowerCase())) {
      continue;
    }

    output.push(line);
  }

  const collapsed = output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = collapsed.split("\n");
  const firstContentLine = lines.findIndex((line) => line.trim().length > 0);

  if (firstContentLine !== -1) {
    const possibleRoleLabel = lines[firstContentLine]
      ?.trim()
      .replace(/^#{1,6}\s*/, "")
      .replace(/:$/, "")
      .toLowerCase();

    const expectedLabels =
      role === "User" ? new Set(["user", "you"]) : new Set(["grok", "assistant"]);

    if (possibleRoleLabel !== undefined && expectedLabels.has(possibleRoleLabel)) {
      lines.splice(firstContentLine, 1);
    }
  }

  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
