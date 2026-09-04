import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  cleanFilename,
  cleanMarkdown,
  cleanTitle,
  DEFAULT_TITLE,
  parsePositiveInteger,
  parseUrl,
  UsageError,
} from "./helpers.ts";

describe("parsePositiveInteger", () => {
  test("accepts positive integers", () => {
    assert.equal(parsePositiveInteger("42", "--timeout"), 42);
  });

  test("rejects zero and negatives", () => {
    assert.throws(() => parsePositiveInteger("0", "--timeout"), UsageError);
    assert.throws(() => parsePositiveInteger("-5", "--timeout"), UsageError);
  });

  test("rejects non-integer and non-numeric input", () => {
    assert.throws(() => parsePositiveInteger("1.5", "--timeout"), UsageError);
    assert.throws(() => parsePositiveInteger("abc", "--timeout"), UsageError);
  });

  test("mentions the offending option in the error", () => {
    assert.throws(() => parsePositiveInteger("abc", "--timeout"), /--timeout/);
  });
});

describe("parseUrl", () => {
  test("accepts http and https URLs", () => {
    assert.equal(parseUrl("https://grok.com/share/abc").protocol, "https:");
    assert.equal(parseUrl("http://example.com").protocol, "http:");
  });

  test("rejects malformed URLs", () => {
    assert.throws(() => parseUrl("not a url"), UsageError);
  });

  test("rejects unsupported protocols", () => {
    assert.throws(() => parseUrl("file:///etc/passwd"), /Unsupported URL protocol/);
  });
});

describe("cleanTitle", () => {
  test("strips the shared-conversation suffix", () => {
    assert.equal(cleanTitle("AI Insights | Shared Grok Conversation"), "AI Insights");
  });

  test("collapses internal whitespace", () => {
    assert.equal(cleanTitle("  Spacey\n  Title  "), "Spacey Title");
  });

  test("falls back to the default title", () => {
    assert.equal(cleanTitle("   "), DEFAULT_TITLE);
    assert.equal(cleanTitle(undefined), DEFAULT_TITLE);
  });
});

describe("cleanFilename", () => {
  test("replaces whitespace and normalizes separators", () => {
    assert.equal(cleanFilename("My Conversation"), "My_Conversation");
  });

  test("removes reserved filesystem characters", () => {
    assert.equal(cleanFilename('a<:>"?*'), "a");
  });

  test("trims leading and trailing dots/spaces", () => {
    assert.equal(cleanFilename(" .hidden. "), "hidden");
  });

  test("falls back when nothing remains", () => {
    assert.equal(cleanFilename(":::"), "grok_conversation");
  });
});

describe("cleanMarkdown", () => {
  test("drops known UI noise outside code fences", () => {
    assert.equal(cleanMarkdown("Hello\nCopy\nRegenerate\nWorld", "User"), "Hello\nWorld");
  });

  test("preserves noise-like lines inside code fences", () => {
    assert.equal(cleanMarkdown("```\nCopy\n```\nAfter", "Grok"), "```\nCopy\n```\nAfter");
  });

  test("removes a leading role label", () => {
    assert.equal(cleanMarkdown("User:\nQuestion here", "User"), "Question here");
  });

  test("collapses excess blank lines", () => {
    assert.equal(cleanMarkdown("a\n\n\n\n\nb", "User"), "a\n\nb");
  });
});
