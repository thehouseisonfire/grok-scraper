import { describe, expect, test } from "bun:test";

import {
  cleanFilename,
  cleanMarkdown,
  cleanTitle,
  DEFAULT_TITLE,
  parsePositiveInteger,
  parseUrl,
  UsageError,
} from "./helpers";

describe("parsePositiveInteger", () => {
  test("accepts positive integers", () => {
    expect(parsePositiveInteger("42", "--timeout")).toBe(42);
  });

  test("rejects zero and negatives", () => {
    expect(() => parsePositiveInteger("0", "--timeout")).toThrow(UsageError);
    expect(() => parsePositiveInteger("-5", "--timeout")).toThrow(UsageError);
  });

  test("rejects non-integer and non-numeric input", () => {
    expect(() => parsePositiveInteger("1.5", "--timeout")).toThrow(UsageError);
    expect(() => parsePositiveInteger("abc", "--timeout")).toThrow(UsageError);
  });

  test("mentions the offending option in the error", () => {
    expect(() => parsePositiveInteger("abc", "--timeout")).toThrow(/--timeout/);
  });
});

describe("parseUrl", () => {
  test("accepts http and https URLs", () => {
    expect(parseUrl("https://grok.com/share/abc").protocol).toBe("https:");
    expect(parseUrl("http://example.com").protocol).toBe("http:");
  });

  test("rejects malformed URLs", () => {
    expect(() => parseUrl("not a url")).toThrow(UsageError);
  });

  test("rejects unsupported protocols", () => {
    expect(() => parseUrl("file:///etc/passwd")).toThrow(/Unsupported URL protocol/);
  });
});

describe("cleanTitle", () => {
  test("strips the shared-conversation suffix", () => {
    expect(cleanTitle("AI Insights | Shared Grok Conversation")).toBe("AI Insights");
  });

  test("collapses internal whitespace", () => {
    expect(cleanTitle("  Spacey\n  Title  ")).toBe("Spacey Title");
  });

  test("falls back to the default title", () => {
    expect(cleanTitle("   ")).toBe(DEFAULT_TITLE);
    expect(cleanTitle(undefined)).toBe(DEFAULT_TITLE);
  });
});

describe("cleanFilename", () => {
  test("replaces whitespace and normalizes separators", () => {
    expect(cleanFilename("My Conversation")).toBe("My_Conversation");
  });

  test("removes reserved filesystem characters", () => {
    expect(cleanFilename('a<:>"?*')).toBe("a");
  });

  test("trims leading and trailing dots/spaces", () => {
    expect(cleanFilename(" .hidden. ")).toBe("hidden");
  });

  test("falls back when nothing remains", () => {
    expect(cleanFilename(":::")).toBe("grok_conversation");
  });
});

describe("cleanMarkdown", () => {
  test("drops known UI noise outside code fences", () => {
    const cleaned = cleanMarkdown("Hello\nCopy\nRegenerate\nWorld", "User");
    expect(cleaned).toBe("Hello\nWorld");
  });

  test("preserves noise-like lines inside code fences", () => {
    const cleaned = cleanMarkdown("```\nCopy\n```\nAfter", "Grok");
    expect(cleaned).toBe("```\nCopy\n```\nAfter");
  });

  test("removes a leading role label", () => {
    expect(cleanMarkdown("User:\nQuestion here", "User")).toBe("Question here");
  });

  test("collapses excess blank lines", () => {
    expect(cleanMarkdown("a\n\n\n\n\nb", "User")).toBe("a\n\nb");
  });
});
